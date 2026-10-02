import test from "node:test";
import assert from "node:assert/strict";

import { baseCommandFields, command } from "../src/contracts/commands.js";
import { contractVolumeMwh } from "../src/contracts/delivery.js";
import type { WorldState } from "../src/contracts/world.js";
import { validateWorldState } from "../src/contracts/validation.js";
import { valmorneDeliveryContract, valmorneWorld } from "../src/content/valmorne.js";
import { DeterministicEngine } from "../src/sim/engine.js";
import {
  forecastPriceAt,
  replacementEnergyCostCents
} from "../src/sim/economy.js";

function withUnitProducing(world: WorldState, powerMw: number): WorldState {
  const asset = world.assets["unit-valmorne-1"]!;
  const unit = asset.productionUnit!;
  return {
    ...world,
    assets: {
      ...world.assets,
      "unit-valmorne-1": {
        ...asset,
        productionUnit: {
          ...unit,
          operatingState: "producing",
          plannedNetPowerMw: powerMw,
          realizedNetPowerMw: powerMw
        }
      }
    }
  };
}

function replacement(
  id: string,
  powerMw: number,
  maxPriceEurPerMwh: number,
  worldTimeSec = 0
) {
  return command({
    ...baseCommandFields(id, "player-1", "connection-valmorne", worldTimeSec),
    type: "BuyReplacementEnergy",
    payload: {
      contractId: valmorneDeliveryContract.id,
      deliveryStartSec: 3600,
      deliveryEndSec: 7200,
      powerMw,
      maxPriceEurPerMwh
    }
  });
}

test("reference replacement example 800 MWh x 120 EUR/MWh equals 96,000 EUR", () => {
  assert.equal(replacementEnergyCostCents(200, 0, 4 * 3600, 120), 9_600_000);
});

test("market forecast is deterministic, imperfect and carries explicit uncertainty", () => {
  const first = forecastPriceAt(valmorneWorld, 7200);
  const second = forecastPriceAt(valmorneWorld, 7200);
  assert.deepEqual(first, second);
  assert.equal(first.expectedEurPerMwh, -17.5);
  assert.equal(first.uncertaintyEurPerMwh, 15);
  assert.notEqual(first.expectedEurPerMwh, -25);
});

test("negative market price keeps its accounting sign and increases cash on purchase", () => {
  const world: WorldState = {
    ...valmorneWorld,
    economy: {
      ...valmorneWorld.economy,
      marketPriceCurve: [{ atSec: 0, priceEurPerMwh: -25 }]
    }
  };
  const engine = new DeterministicEngine(world, 401);
  const before = engine.worldState().cashCents;
  const result = engine.submit(replacement("cmd-negative-price", 100, -20));
  assert.equal(result.status, "accepted");
  const after = engine.worldState();
  assert.equal(after.economy.replacementPurchases["cmd-negative-price"]?.costCents, -250_000);
  assert.equal(after.cashCents, before + 250_000);
  assert.equal(after.transactions.at(-1)?.amountCents, 250_000);
});

test("replacement purchase is bounded by explicit market liquidity", () => {
  const engine = new DeterministicEngine(valmorneWorld, 402);
  const result = engine.submit(replacement("cmd-too-large", 1001, 200));
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.code, "COMMAND_MARKET_LIQUIDITY_LIMIT");
  }
});

test("delivery invoice is settled exactly once", () => {
  const engine = new DeterministicEngine(valmorneWorld, 403);
  assert.equal(engine.submit(replacement("cmd-full-replacement", 800, 120)).status, "accepted");

  engine.advanceUntil(10800, { stopOnImportantEvent: false });
  let world = engine.worldState();
  const ledger = world.economy.deliveryLedgers[valmorneDeliveryContract.id]!;
  assert.equal(ledger.settled, true);
  assert.equal(ledger.settlement?.contractedMwh, 800);
  assert.equal(ledger.settlement?.replacementAppliedMwh, 800);
  assert.equal(ledger.settlement?.shortfallMwh, 0);
  assert.equal(ledger.settlement?.surplusMwh, 0);

  const settlementTx = world.transactions.filter((tx) => tx.referenceId === valmorneDeliveryContract.id);
  assert.equal(settlementTx.length, 2);
  const cashAfterSettlement = world.cashCents;

  engine.advanceUntil(20000, { stopOnImportantEvent: false });
  world = engine.worldState();
  assert.equal(
    world.transactions.filter((tx) => tx.referenceId === valmorneDeliveryContract.id).length,
    2
  );
  assert.equal(world.cashCents, cashAfterSettlement);
});

test("physical production reconciles contract allocation and surplus without double selling", () => {
  const engine = new DeterministicEngine(withUnitProducing(valmorneWorld, 900), 404);
  engine.advanceUntil(10800, { stopOnImportantEvent: false });
  const settlement = engine.worldState().economy.deliveryLedgers[valmorneDeliveryContract.id]?.settlement;
  assert.ok(settlement);
  assert.equal(settlement.contractedMwh, 800);
  assert.equal(settlement.physicalGenerationMwh, 900);
  assert.equal(settlement.physicalAllocatedMwh, 800);
  assert.equal(settlement.replacementAppliedMwh, 0);
  assert.equal(settlement.shortfallMwh, 0);
  assert.equal(settlement.surplusMwh, 100);
  assert.equal(
    settlement.physicalAllocatedMwh + settlement.surplusMwh,
    settlement.physicalGenerationMwh
  );
});

test("replacement energy cannot create a resold surplus", () => {
  const engine = new DeterministicEngine(withUnitProducing(valmorneWorld, 100), 405);
  assert.equal(engine.submit(replacement("cmd-overhedge", 800, 120)).status, "accepted");
  engine.advanceUntil(10800, { stopOnImportantEvent: false });
  const settlement = engine.worldState().economy.deliveryLedgers[valmorneDeliveryContract.id]?.settlement;
  assert.ok(settlement);
  assert.equal(settlement.physicalGenerationMwh, 100);
  assert.equal(settlement.replacementPurchasedMwh, 800);
  assert.equal(settlement.replacementAppliedMwh, 700);
  assert.equal(settlement.unusedReplacementMwh, 100);
  assert.equal(settlement.surplusMwh, 0);
  assert.equal(settlement.deliveredMwh, 800);
});

test("cash is exactly explainable from opening cash and immutable journal entries", () => {
  const engine = new DeterministicEngine(valmorneWorld, 406);
  assert.equal(engine.submit(replacement("cmd-cash-trace", 800, 120)).status, "accepted");
  engine.advanceUntil(10800, { stopOnImportantEvent: false });
  const world = engine.worldState();
  const transactionTotal = world.transactions.reduce((sum, tx) => sum + tx.amountCents, 0);
  assert.equal(world.cashCents, world.economy.openingCashCents + transactionTotal);

  const observation = engine.observation();
  assert.equal(observation.economy.kpis.operatingResultCents.value, transactionTotal);
  assert.equal(observation.economy.kpis.cashCents.value, world.cashCents);
  assert.deepEqual(
    new Set(observation.economy.kpis.cashCents.references),
    new Set(world.transactions.map((tx) => tx.id))
  );
});

test("overlapping delivery contracts are rejected to prevent physical MWh double allocation", () => {
  const second = {
    ...valmorneDeliveryContract,
    id: "delivery-overlap",
    deliveryStartSec: 4000,
    deliveryEndSec: 6000
  };
  const world: WorldState = {
    ...valmorneWorld,
    economy: {
      ...valmorneWorld.economy,
      deliveryContracts: {
        ...valmorneWorld.economy.deliveryContracts,
        [second.id]: second
      },
      deliveryLedgers: {
        ...valmorneWorld.economy.deliveryLedgers,
        [second.id]: {
          contractId: second.id,
          physicalGenerationMwh: 0,
          settled: false,
          settlement: null
        }
      }
    }
  };
  const result = validateWorldState(world);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => issue.code === "WORLD_DELIVERY_OVERLAP_DOUBLE_SALE"));
  }
});

test("maintenance exposes a traceable economic impact estimate", () => {
  const engine = new DeterministicEngine(withUnitProducing(valmorneWorld, 400), 407);
  const schedule = command({
    ...baseCommandFields("cmd-maintenance-economy", "player-1", "unit-valmorne-1", 0),
    type: "ScheduleMaintenance",
    payload: {
      taskId: "maintenance-economy",
      kind: "inspection",
      targetGroup: "turbine",
      startsAtSec: 3600,
      expectedDurationSec: 3600
    }
  });
  assert.equal(engine.submit(schedule).status, "accepted");
  const impact = engine.observation().economy.maintenanceImpacts["maintenance-economy"];
  assert.ok(impact);
  assert.equal(impact.estimatedLostGenerationMwh, 400);
  assert.ok(Number.isSafeInteger(impact.estimatedReplacementCostCents));
  assert.deepEqual(impact.references, ["maintenance-economy"]);
});

test("prototype contract keeps explicit MW to MWh conversion", () => {
  assert.equal(contractVolumeMwh(valmorneDeliveryContract), 800);
});
