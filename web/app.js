import {
  RealTimeController,
  formatSimulationClock,
  normalizeTimeSpeed
} from "/time-controller.js";

import {
  AUTOSAVE_DEBOUNCE_MS,
  downloadSave,
  loadCurrentSave,
  persistSave,
  persistenceErrorCode,
  readSaveFile
} from "/persistence.js";

let state = null;
let selectedAssetId = "unit-valmorne-1";
let pendingPurchase = null;
let soundEnabled = false;
let autosaveTimer = null;
let tutorialAcknowledged = false;
let realtimeDirty = false;
let realtimeController = null;
let mutationQueue = Promise.resolve();
const acknowledged = new Set();
const soundedEvents = new Set();

const sessionId = (() => {
  const key = "nukegrid-session-id";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
})();

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[char]));

function ngIcon(name, className = "") {
  return `<svg class="ng-icon ${className}" aria-hidden="true"><use href="#ng-${name}"></use></svg>`;
}

function reactorVisual(className = "reactor-thumb") {
  return `<svg class="${className}" viewBox="0 0 72 72" aria-hidden="true">
    <defs>
      <linearGradient id="towerGlow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff2d7"/>
        <stop offset=".54" stop-color="#d9a765"/>
        <stop offset="1" stop-color="#8a542b"/>
      </linearGradient>
    </defs>
    <ellipse cx="36" cy="59" rx="26" ry="7" fill="#ffb134" opacity=".16"/>
    <path d="M23 15h26c-4 12-3 24 2 38H21c5-14 6-26 2-38Z" fill="url(#towerGlow)" stroke="#ffd365" stroke-width="1.4"/>
    <path d="M22 15h28" stroke="#fff1c6" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M18 56c12 5 24 5 36 0" fill="none" stroke="#ffb134" stroke-width="2" stroke-linecap="round"/>
    <path d="M33 11c-4-6 3-7 1-12m10 11c-3-5 2-6 1-10" fill="none" stroke="#f4e8d7" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

function clock(sec, withSeconds = false) {
  return formatSimulationClock(sec, withSeconds);
}
function money(cents) {
  return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(cents/100);
}
function fmt(value, digits=0) {
  return new Intl.NumberFormat("fr-FR",{maximumFractionDigits:digits}).format(value);
}
function nextState(current) {
  return ({
    "stopped":"start-preparation",
    "start-preparation":"producing",
    "producing":"planned-shutdown",
    "limited":"producing",
    "planned-shutdown":"stopped",
    "forced-outage":"return-tests",
    "return-tests":"producing"
  })[current] || "stopped";
}
function stateLabel(value) {
  return ({
    "stopped":"arrêtée","start-preparation":"préparation démarrage","producing":"en production",
    "limited":"limitée","planned-shutdown":"arrêt programmé","forced-outage":"indisponibilité forcée",
    "return-tests":"essais de retour"
  })[value] || value;
}


const UI_LABELS = Object.freeze({
  "mechanical":"mécanique",
  "resource":"ressources",
  "program-price":"programme et prix",
  "pending":"en attente",
  "signaled":"signalé",
  "consequence":"conséquence",
  "avoided":"évité",
  "revealed":"cause révélée",
  "inspection":"inspection",
  "repair":"réparation",
  "scheduled":"planifiée",
  "blocked":"bloquée",
  "in-progress":"en cours",
  "awaiting-return-check":"contrôle de retour requis",
  "completed":"terminée",
  "cancelled":"annulée",
  "nuclear-island":"îlot nucléaire",
  "turbine":"turbine",
  "generator":"alternateur",
  "grid-connection":"raccordement réseau",
  "signal":"signal",
  "command":"décision",
  "finance":"finances",
  "reveal":"explication"
});
function uiLabel(value) {
  return UI_LABELS[value] || String(value ?? "").replaceAll("-", " ");
}

function missionModel(obs) {
  const sim = obs.simTimeSec;
  const units = Object.values(obs.visibleAssets).map(asset => asset.productionUnit).filter(Boolean);
  const totalMw = units.reduce((sum, unit) => sum + unit.realizedNetPowerMw.value, 0);
  const activeIncident = obs.scenario.incidentCards.find(card =>
    !acknowledged.has(card.id) && ["signaled","consequence"].includes(card.status)
  );
  const tasks = Object.values(obs.maintenance.tasks);
  const blockedTask = tasks.find(task => ["blocked","awaiting-return-check"].includes(task.status));
  const activeCommitment = obs.economy.commitments.find(c =>
    !c.settled && sim >= c.deliveryStartSec && sim < c.deliveryEndSec
  );
  const nextCommitment = obs.economy.commitments
    .filter(c => !c.settled && c.deliveryStartSec > sim)
    .sort((a,b)=>a.deliveryStartSec-b.deliveryStartSec)[0];
  const futureIncident = obs.scenario.incidentCards
    .filter(card => card.signalAtSec > sim)
    .sort((a,b)=>a.signalAtSec-b.signalAtSec)[0];

  const candidates = [];
  if (nextCommitment) candidates.push({at:nextCommitment.deliveryStartSec,label:"début du prochain engagement"});
  if (futureIncident) candidates.push({at:futureIncident.signalAtSec,label:"prochain point de vigilance"});
  const nextEvent = candidates.sort((a,b)=>a.at-b.at)[0];

  if (activeIncident) {
    return {
      tone:"critical",
      state:"Décision requise",
      objective:`Traiter l’alerte ${uiLabel(activeIncident.family)}`,
      why:activeIncident.signalText || "Une anomalie observable demande une décision.",
      deadline:activeIncident.consequenceAtSec > sim ? clock(activeIncident.consequenceAtSec) : "Dès maintenant",
      risk:activeIncident.consequenceText || "Une dégradation peut se produire si rien n’est fait.",
      action:activeIncident.possibleDecision || "Examiner la tranche concernée et choisir une action adaptée."
    };
  }

  if (activeCommitment && activeCommitment.remainingExposureMwh > 0.1) {
    const gapMw = Math.max(0, activeCommitment.committedPowerMw - totalMw);
    return {
      tone:gapMw > 0 ? "warn" : "good",
      state:gapMw > 0 ? "À corriger" : "Sous contrôle",
      objective:"Tenir l’engagement de livraison en cours",
      why:`La centrale doit fournir ${fmt(activeCommitment.committedPowerMw)} MW jusqu’à ${clock(activeCommitment.deliveryEndSec)}.`,
      deadline:clock(activeCommitment.deliveryEndSec),
      risk:gapMw > 0
        ? `Déficit de ${fmt(gapMw)} MW · ${fmt(activeCommitment.remainingExposureMwh,1)} MWh encore exposés`
        : `${fmt(activeCommitment.remainingExposureMwh,1)} MWh restent à sécuriser`,
      action:gapMw > 0
        ? "Augmenter la production d’une tranche ou acheter de l’énergie de remplacement."
        : "Maintenir la production et surveiller l’exposition restante."
    };
  }

  if (blockedTask) {
    return {
      tone:"warn",
      state:"Intervention bloquée",
      objective:`Débloquer la ${uiLabel(blockedTask.kind)} sur ${uiLabel(blockedTask.targetGroup)}`,
      why:blockedTask.blockedReason || "Une intervention planifiée attend une action ou une ressource.",
      deadline:blockedTask.completesAtSec ? clock(blockedTask.completesAtSec) : "À traiter avant la prochaine contrainte",
      risk:"Une indisponibilité prolongée peut réduire la production disponible.",
      action:blockedTask.status === "awaiting-return-check"
        ? "Valider le contrôle de retour depuis le panneau Interventions prévues."
        : "Vérifier l’équipe affectée et les contraintes de l’intervention."
    };
  }

  if (nextCommitment) {
    return {
      tone:"calm",
      state:"Préparation",
      objective:"Préparer le prochain engagement de livraison",
      why:`Le prochain engagement commence à ${clock(nextCommitment.deliveryStartSec)} pour ${fmt(nextCommitment.committedPowerMw)} MW.`,
      deadline:clock(nextCommitment.deliveryStartSec),
      risk:"Aucune urgence immédiate si la capacité disponible reste suffisante.",
      action:"Vérifier les tranches disponibles puis laisser le temps avancer si aucune maintenance n’est nécessaire."
    };
  }

  return {
    tone:"calm",
    state:"Période calme",
    objective:obs.scenario.objectives[0]?.label || "Maintenir la centrale dans un état maîtrisé",
    why:"La simulation continue, mais aucune décision urgente n’est actuellement requise.",
    deadline:nextEvent ? clock(nextEvent.at) : "Aucune échéance immédiate",
    risk:"Aucune alerte active ni engagement critique détecté.",
    action:nextEvent
      ? `Aucune action urgente. Surveillez la situation jusqu’au ${nextEvent.label} à ${clock(nextEvent.at)}.`
      : "Aucune action urgente. Laissez le temps avancer ou consultez le débrief."
  };
}

function renderMission(obs) {
  const mission = missionModel(obs);
  const stateNode = $("mission-state");
  stateNode.className = `mission-state ${mission.tone}`;
  stateNode.textContent = mission.state;
  $("mission-objective").textContent = mission.objective;
  $("mission-why").textContent = mission.why;
  $("mission-deadline").textContent = mission.deadline;
  $("mission-risk").textContent = mission.risk;
  $("mission-action").textContent = mission.action;
  $("mission-objectives").innerHTML = obs.scenario.objectives.length
    ? obs.scenario.objectives.map((objective,index) =>
        `<div class="mission-objective-item"><span>${index+1}</span><strong>${esc(objective.label)}</strong></div>`
      ).join("")
    : '<span class="hint">Aucun objectif de scénario déclaré.</span>';
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("x-nukegrid-session", sessionId);
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function refresh() {
  try {
    state = await api("/api/state");
    render();
  } catch (error) {
    $("action-feedback").className = "feedback bad";
    $("action-feedback").textContent = `Interface indisponible : ${error.message}`;
  }
}
function enqueueIntent(intent, { autosave = true, quiet = false } = {}) {
  const task = mutationQueue.then(async () => {
    const previousFeedback = state?.feedback ?? null;
    const next = await api("/api/action",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(intent)
    });

    if (quiet) next.feedback = previousFeedback;
    state = next;
    render();

    if (autosave) scheduleAutosave();
    else realtimeDirty = true;

    return state;
  });

  mutationQueue = task.catch(() => undefined);
  return task;
}

async function act(intent) {
  try {
    return await enqueueIntent(intent);
  } catch (error) {
    $("action-feedback").className = "feedback bad";
    $("action-feedback").textContent = `Action non transmise : ${error.message}`;
    return null;
  }
}

async function toggleRealtimePlayback() {
  if (!realtimeController) return;

  const { playing } = realtimeController.snapshot();
  if (playing) {
    try {
      await realtimeController.pauseAndFlush();
      renderTimeControls();
      if (realtimeDirty) {
        await saveNow("manual");
        realtimeDirty = false;
      }
    } catch (error) {
      renderTimeControls();
      $("action-feedback").className = "feedback bad";
      $("action-feedback").textContent = `Pause sécurisée : avance en cours non confirmée (${error.message}).`;
    }
    return;
  }

  realtimeController.setPlaying(true);
  renderTimeControls();
}

async function advanceRealtime(seconds) {
  if (!state) return;

  try {
    await enqueueIntent(
      {type:"advance", seconds:Math.max(1, Math.floor(seconds))},
      {autosave:false, quiet:true}
    );
  } catch (error) {
    realtimeController?.setPlaying(false);
    $("action-feedback").className = "feedback bad";
    $("action-feedback").textContent = `Horloge temps réel suspendue : ${error.message}`;
    throw error;
  }
}

function renderHeader(obs) {
  const totalMw = Object.values(obs.visibleAssets)
    .reduce((sum, asset) => sum + (asset.productionUnit?.realizedNetPowerMw.value || 0), 0);
  const metrics = [
    ["treasury", "Trésorerie", money(obs.economy.kpis.cashCents.value)],
    ["bolt", "Production", `${fmt(totalMw)} MW`],
    ["chart", "Exposition", `${fmt(obs.economy.kpis.imbalanceExposureMwh.value,1)} MWh`],
    ["gauge", "Marché", `${fmt(obs.economy.currentMarketPriceEurPerMwh.value,1)} €/MWh`]
  ];
  $("status-kpis").innerHTML = metrics.map(([icon, label, value]) => `
    <div class="kpi">
      <div class="kpi-head">${ngIcon(icon)}<span>${label}</span></div>
      <strong>${value}</strong>
    </div>`
  ).join("");
}

function renderAssets(obs) {
  const assets = Object.entries(obs.visibleAssets).filter(([,asset])=>asset.productionUnit);
  $("asset-list").innerHTML = assets.length ? assets.map(([id,asset], index) => {
    const unit = asset.productionUnit;
    const status = unit.diagnostic.status === "ready" ? "good" :
      unit.diagnostic.status === "unavailable" ? "critical" : "warn";
    return `<button class="asset-card" type="button" data-select="${esc(id)}" aria-current="${id===selectedAssetId}">
      <span class="asset-number">${index + 1}</span>
      ${reactorVisual()}
      <span class="asset-copy">
        <strong>${esc(asset.label)}</strong>
        <span class="badge ${status}">${esc(stateLabel(unit.operatingState.value))}</span>
      </span>
      <span class="asset-power">${fmt(unit.realizedNetPowerMw.value)} / ${fmt(unit.availableNetPowerMw.value)} MW</span>
      ${ngIcon("chevron","chevron")}
    </button>`;
  }).join("") : '<p class="empty">Aucun actif de production observable.</p>';
}

function renderSite(obs) {
  const units = ["unit-valmorne-1","unit-valmorne-2"].map(id => [id,obs.visibleAssets[id]]).filter(([,a])=>a?.productionUnit);
  const hour = Math.floor(obs.simTimeSec / 3600) % 24;
  const night = hour < 6 || hour >= 20;
  $("site-canvas").classList.toggle("night",night);
  $("site-environment").textContent = `${night ? "Nuit" : "Jour"} · météo non modélisée`;

  const blocks = units.map(([id,asset],index) => {
    const unit = asset.productionUnit;
    const baseX = 58 + index * 355;
    const selected = id === selectedAssetId ? " selected" : "";
    const attention = ["limited","unavailable"].includes(unit.diagnostic.status) ? " attention" : "";
    const active = unit.realizedNetPowerMw.value > 1 && ["producing","limited"].includes(unit.operatingState.value);
    const statusClass = unit.diagnostic.status === "ready" ? "good" :
      unit.diagnostic.status === "unavailable" ? "critical" : "warn";
    return `
      <g class="site-unit${selected}${attention}" tabindex="0" role="button"
         aria-label="${esc(asset.label)}, ${esc(stateLabel(unit.operatingState.value))}, ${fmt(unit.realizedNetPowerMw.value)} MW"
         data-svg-select="${esc(id)}">
        <rect class="site-unit-pad" x="${baseX}" y="88" width="304" height="196" rx="24"></rect>
        <path class="site-cooling-tower" d="M ${baseX+28} 222 C ${baseX+48} 179 ${baseX+50} 131 ${baseX+40} 103 H ${baseX+121} C ${baseX+111} 131 ${baseX+113} 179 ${baseX+133} 222 Z"></path>
        <path class="site-cooling-rim" d="M ${baseX+40} 103 H ${baseX+121}"></path>
        <path class="site-steam" d="M ${baseX+63} 95 C ${baseX+45} 75 ${baseX+83} 69 ${baseX+66} 47 M ${baseX+98} 94 C ${baseX+84} 77 ${baseX+116} 68 ${baseX+103} 49"></path>
        <path class="site-reactor-building" d="M ${baseX+150} 206 V 151 C ${baseX+150} 116 ${baseX+214} 116 ${baseX+214} 151 V 206 Z"></path>
        <path class="site-reactor-dome" d="M ${baseX+150} 151 C ${baseX+158} 112 ${baseX+206} 112 ${baseX+214} 151"></path>
        <rect class="site-turbine-hall" x="${baseX+220}" y="157" width="70" height="49" rx="8"></rect>
        <path class="site-flow ${active ? "active" : ""}" d="M ${baseX+184} 181 H ${baseX+255}"></path>
        <circle class="site-status-dot ${statusClass}" cx="${baseX+284}" cy="111" r="7"></circle>
        <text class="site-unit-title" x="${baseX+150}" y="242">Tranche ${index+1}</text>
        <text class="site-unit-meta" x="${baseX+150}" y="263">${fmt(unit.realizedNetPowerMw.value)} MW · ${esc(stateLabel(unit.operatingState.value))}</text>
      </g>`;
  }).join("");

  $("site-canvas").innerHTML = `<svg class="site-svg" viewBox="0 0 780 350" aria-hidden="true">
    <defs>
      <linearGradient id="siteSky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${night ? "#2a1d18" : "#6d4022"}"></stop>
        <stop offset=".55" stop-color="${night ? "#3a261d" : "#9c5b2c"}"></stop>
        <stop offset="1" stop-color="#2d1c13"></stop>
      </linearGradient>
      <linearGradient id="siteGround" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4d3321"></stop>
        <stop offset="1" stop-color="#2c1c13"></stop>
      </linearGradient>
      <radialGradient id="siteGlow">
        <stop offset="0" stop-color="#ffd365" stop-opacity=".42"></stop>
        <stop offset="1" stop-color="#ffb134" stop-opacity="0"></stop>
      </radialGradient>
    </defs>
    <rect width="780" height="350" fill="url(#siteSky)"></rect>
    <circle cx="610" cy="76" r="145" fill="url(#siteGlow)"></circle>
    <path d="M0 268 C130 245 210 271 328 254 C454 236 594 263 780 238 V350 H0 Z" fill="url(#siteGround)"></path>
    <path class="site-horizon" d="M0 272 H780"></path>
    ${blocks}
    <g class="site-grid-yard">
      <path d="M370 111 V249 M350 142 H390 M344 177 H396 M338 214 H402"></path>
      <path d="M370 111 L348 144 M370 111 L392 144 M370 249 L342 214 M370 249 L398 214"></path>
      <text class="site-grid-label" x="334" y="296">Poste réseau</text>
    </g>
    <path class="site-network-flow" d="M345 178 H435"></path>
  </svg>`;

  $("site-table").innerHTML = `<table><caption>État des tranches</caption><tbody>${units.map(([,asset])=>`<tr><th>${esc(asset.label)}</th><td>${esc(stateLabel(asset.productionUnit.operatingState.value))}</td><td>${fmt(asset.productionUnit.realizedNetPowerMw.value)} MW</td></tr>`).join("")}</tbody></table>`;
}

function renderInspector(obs) {
  const asset = obs.visibleAssets[selectedAssetId];
  if (!asset?.productionUnit) {
    $("inspector-content").innerHTML = '<p class="empty">Sélectionnez une tranche.</p>';
    return;
  }
  const u = asset.productionUnit;
  const targetState = nextState(u.operatingState.value);
  const status = u.diagnostic.status === "ready" ? "good" :
    u.diagnostic.status === "unavailable" ? "critical" : "warn";
  const groups = Object.entries(u.groups).map(([,group]) =>
    `<li><span>${esc(group.label)}</span><span class="badge ${group.available.value ? "good" : "critical"}">${group.available.value ? "disponible" : "indisponible"}</span></li>`
  ).join("");
  $("inspector-content").innerHTML = `<div class="inspector-body">
    <div class="unit-inspector-head">
      ${reactorVisual("inspector-reactor")}
      <div>
        <h3>${esc(asset.label)}</h3>
        <span class="badge ${status}">${esc(stateLabel(u.operatingState.value))}</span>
      </div>
    </div>
    <div class="metric-stack">
      <div class="metric-row"><span class="metric-label">${ngIcon("bolt")}Puissance réelle</span><strong>${fmt(u.realizedNetPowerMw.value)} MW</strong></div>
      <div class="metric-row"><span class="metric-label">${ngIcon("chart")}Puissance planifiée</span><strong>${fmt(u.plannedNetPowerMw.value)} MW</strong></div>
      <div class="metric-row"><span class="metric-label">${ngIcon("gauge")}Capacité disponible</span><strong>${fmt(u.availableNetPowerMw.value)} MW</strong></div>
    </div>
    <div class="control-grid">
      <button class="primary-command" type="button" data-unit-state="${esc(targetState)}">${ngIcon("play")} ${esc(stateLabel(targetState))}</button>
      <button type="button" data-power="0">Consigne 0 MW</button>
      <button type="button" data-power="${Math.round(u.availableNetPowerMw.value/2)}">Consigne 50 %</button>
      <button type="button" data-power="${Math.round(u.availableNetPowerMw.value)}">Consigne max</button>
      <button type="button" aria-label="Paramètres de tranche">${ngIcon("settings")} Réglages</button>
    </div>
    <h4>Groupes fonctionnels</h4>
    <ul class="group-list">${groups}</ul>
    <h4>Maintenance</h4>
    <div class="control-grid">
      <button type="button" data-maintenance="inspection" data-group="turbine">${ngIcon("wrench")} Inspecter turbine</button>
      <button type="button" data-maintenance="repair" data-group="turbine">Réparer turbine</button>
      <button type="button" data-maintenance="inspection" data-group="generator">${ngIcon("wrench")} Inspecter alternateur</button>
      <button type="button" data-maintenance="repair" data-group="generator">Réparer alternateur</button>
    </div>
  </div>`;
}

function beep() {
  if (!soundEnabled) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 660;
  gain.gain.value = .035;
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + .09);
}

function renderAlerts(obs) {
  const cards = obs.scenario.incidentCards.filter(card => !acknowledged.has(card.id));
  $("alerts-content").innerHTML = cards.length ? cards.map(card => `<article class="incident">
    <strong>${esc(uiLabel(card.family))} · ${esc(uiLabel(card.status))}</strong>
    <p>${esc(card.signalText || card.consequenceText || "Signal sans texte observable.")}</p>
    ${card.possibleDecision ? `<p class="hint">${esc(card.possibleDecision)}</p>` : ""}
    <div class="incident-actions"><button type="button" data-ack="${esc(card.id)}">Acquitter</button></div>
  </article>`).join("") : '<p class="empty">Aucune alerte active.</p>';

  for (const event of obs.recentEvents) {
    if ((event.severity === "warning" || event.severity === "critical") && !soundedEvents.has(event.id)) {
      soundedEvents.add(event.id); beep();
    }
  }
}

function renderForecast(obs) {
  const forecasts = obs.economy.forecasts;
  const values = [obs.economy.currentMarketPriceEurPerMwh.value, ...forecasts.flatMap(f=>[f.expectedEurPerMwh-f.uncertaintyEurPerMwh,f.expectedEurPerMwh+f.uncertaintyEurPerMwh])];
  const min = Math.min(...values)-10, max=Math.max(...values)+10, span=Math.max(1,max-min);
  const y = value => 125 - ((value-min)/span)*95;
  const band = forecasts.map((f,i)=>{
    const x=105+i*105, top=y(f.expectedEurPerMwh+f.uncertaintyEurPerMwh), bottom=y(f.expectedEurPerMwh-f.uncertaintyEurPerMwh);
    return `<rect class="forecast-band" x="${x-22}" y="${top}" width="44" height="${Math.max(3,bottom-top)}" rx="4"></rect><circle class="forecast-dot" cx="${x}" cy="${y(f.expectedEurPerMwh)}" r="4"></circle><text class="chart-label" x="${x-18}" y="144">+${i+1}h</text>`;
  }).join("");
  $("forecast-chart").innerHTML = `<div class="forecast"><svg viewBox="0 0 440 155" role="img" aria-label="Prix observé et plages de prévision sur trois heures">
    <line x1="45" y1="125" x2="410" y2="125" stroke="#42535f"></line>
    <circle class="observed-dot" cx="55" cy="${y(obs.economy.currentMarketPriceEurPerMwh.value)}" r="5"></circle>
    <text class="chart-label" x="42" y="144">maint.</text>
    ${band}
  </svg></div>`;
}

function renderCommitments(obs) {
  $("commitments").innerHTML = obs.economy.commitments.map(c => `<article class="commitment">
    <strong>${esc(c.id)}</strong>
    <div class="metric-row"><span>Fenêtre</span><span>${clock(c.deliveryStartSec)} → ${clock(c.deliveryEndSec)}</span></div>
    <div class="metric-row"><span>Engagé</span><span>${fmt(c.committedPowerMw)} MW · ${fmt(c.contractedMwh)} MWh</span></div>
    <div class="metric-row"><span>Exposition restante</span><span>${fmt(c.remainingExposureMwh,1)} MWh</span></div>
    <div class="commitment-actions">
      <button type="button" data-buy="${esc(c.id)}" data-buy-power="${Math.min(c.committedPowerMw,400)}" ${c.settled || obs.simTimeSec>=c.deliveryEndSec ? "disabled" : ""}>Couvrir ${Math.min(c.committedPowerMw,400)} MW</button>
    </div>
  </article>`).join("");
}

function renderPlanning(obs) {
  const tasks = Object.values(obs.maintenance.tasks);
  const teams = Object.entries(obs.visibleAssets).filter(([,a])=>a.maintenanceTeam);
  $("planning-content").innerHTML = tasks.length ? tasks.map(task => `<article class="task">
    <strong>${esc(uiLabel(task.kind))} · ${esc(uiLabel(task.targetGroup))}</strong>
    <div class="metric-row"><span>Statut</span><span>${esc(uiLabel(task.status))}</span></div>
    <div class="metric-row"><span>Coût engagé</span><span>${money(task.committedCostCents.value)}</span></div>
    <div class="task-actions">
      ${task.assignedTeamId ? "" : teams.map(([id,a])=>`<button type="button" data-assign-team="${esc(id)}" data-task="${esc(task.id)}">${esc(a.label)}</button>`).join("")}
      ${task.status === "awaiting-return-check" ? `<button type="button" data-return-task="${esc(task.id)}" data-return-unit="${esc(task.targetUnitId)}">Valider retour</button>` : ""}
      ${["scheduled","blocked"].includes(task.status) ? `<button type="button" data-cancel-task="${esc(task.id)}" data-cancel-unit="${esc(task.targetUnitId)}">Annuler</button>` : ""}
    </div>
  </article>`).join("") : '<p class="empty">Aucune tâche planifiée.</p>';
}

function renderDebrief(obs) {
  const d = obs.scenario.debrief;
  $("debrief-content").innerHTML = d ? d.timeline.slice(-12).map(row => `<div class="debrief-row"><strong>${clock(row.atSec)} · ${esc(uiLabel(row.kind))}</strong><div>${esc(row.summary)}</div></div>`).join("") :
    '<p class="empty">Le bilan causal J1 se débloque après les premières 24 h, sans arrêter la simulation.</p>';
}


function renderTutorial(obs) {
  const units = Object.values(obs.visibleAssets)
    .map(asset => asset.productionUnit)
    .filter(Boolean);
  const started = units.some(unit => unit.operatingState.value !== "stopped");
  const generated = units.some(unit => unit.generatedMwh.value > 0);
  const commitmentVisible = obs.economy.commitments.length > 0;
  const completed = [commitmentVisible, started, generated, tutorialAcknowledged];
  const count = completed.filter(Boolean).length;
  $("tutorial-progress").textContent = `${count} / 4`;
  const status = $("tutorial-status");
  if (count === 4) {
    status.className = "hint tutorial-complete";
    status.textContent = "Tutoriel terminé : MW = instant, MWh = durée cumulée, engagement = puissance × fenêtre.";
  } else {
    status.className = "hint";
    status.textContent = [
      commitmentVisible ? "Engagement visible." : "Lire l’engagement.",
      started ? "Tranche pilotée." : "Démarrer une tranche.",
      generated ? "Énergie produite." : "Faire progresser le temps pour produire des MWh.",
      tutorialAcknowledged ? "Notion d’engagement acquittée." : "Confirmer la compréhension de l’engagement."
    ].join(" ");
  }
}

function renderTimeControls() {
  if (!realtimeController) return;
  const { playing, speed } = realtimeController.snapshot();
  const toggle = $("time-toggle");

  toggle.setAttribute("aria-pressed", String(!playing));
  toggle.setAttribute("aria-label", playing ? "Mettre en pause" : "Reprendre");
  toggle.classList.toggle("is-paused", !playing);

  document.querySelectorAll("[data-time-speed]").forEach((button) => {
    const active = Number(button.dataset.timeSpeed) === speed;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("active", active);
  });
}

function renderFeedback(feedback) {
  const node = $("action-feedback");
  if (!feedback) { node.textContent=""; node.className="feedback"; return; }
  node.className = `feedback ${feedback.status==="accepted"||feedback.status==="adjusted" ? "ok" : feedback.status==="confirmation-required" ? "pending" : "bad"}`;
  node.title = feedback.code || "";
  node.textContent = feedback.message;
}

function render() {
  const obs = state.observation;
  renderHeader(obs); renderMission(obs); renderAssets(obs); renderSite(obs); renderInspector(obs);
  renderAlerts(obs); renderForecast(obs); renderCommitments(obs); renderPlanning(obs); renderDebrief(obs);
  renderTutorial(obs);
  $("sim-clock").textContent = clock(obs.simTimeSec, true);
  renderTimeControls();
  renderFeedback(state.feedback);
}


function persistenceMessage(text, kind="") {
  const node = $("persistence-feedback");
  node.className = `persistence-feedback ${kind}`;
  node.textContent = text;
}

async function saveNow(reason="manual") {
  try {
    const envelope = await api("/api/save");
    await persistSave(envelope.save);
    persistenceMessage(
      `${reason === "auto" ? "Sauvegarde automatique" : "Sauvegarde"} locale · ${envelope.metrics.bytes} octets · t=${clock(envelope.save.payload.simTimeSec, true)}`,
      "ok"
    );
    return envelope;
  } catch (error) {
    persistenceMessage(`${persistenceErrorCode(error)} — sauvegarde locale non écrite.`, "bad");
    return null;
  }
}

function scheduleAutosave() {
  if (autosaveTimer !== null) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    void saveNow("auto");
  }, AUTOSAVE_DEBOUNCE_MS);
}

async function restoreRemote(save, source) {
  const response = await fetch("/api/load",{
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-nukegrid-session":sessionId
    },
    body:JSON.stringify({save})
  });
  const payload = await response.json();
  if (!response.ok) {
    state = payload.state;
    render();
    const codes = (payload.issues || []).map(item => item.code).join(", ") || payload.error;
    persistenceMessage(`${source} refusé : ${codes}. Partie active conservée.`, "bad");
    return false;
  }
  state = payload.state;
  render();
  persistenceMessage(`${source} restauré · aucune progression hors ligne.`, "ok");
  return true;
}

async function bootstrap() {
  try {
    const local = await loadCurrentSave();
    if (local && await restoreRemote(local, "Autosave")) return;
  } catch (error) {
    persistenceMessage(`${persistenceErrorCode(error)} — démarrage sans sauvegarde locale.`, "bad");
  }
  await refresh();
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button,[data-svg-select]");
  if (!target) return;

  if (target.id === "time-toggle") {
    await toggleRealtimePlayback();
    return;
  }

  if (target.dataset.timeSpeed) {
    const speed = normalizeTimeSpeed(target.dataset.timeSpeed);
    localStorage.setItem("nukegrid-time-speed", String(speed));
    realtimeController?.setSpeed(speed);
    if (!realtimeController?.snapshot().playing) realtimeController?.setPlaying(true);
    renderTimeControls();
    return;
  }
  if (target.dataset.select || target.dataset.svgSelect) {
    selectedAssetId = target.dataset.select || target.dataset.svgSelect; render(); return;
  }
  if (target.dataset.advance) return act({type:"advance",seconds:Number(target.dataset.advance)});
  if (target.dataset.unitState) return act({type:"request-unit-state",unitId:selectedAssetId,state:target.dataset.unitState});
  if (target.dataset.power) return act({type:"set-power",unitId:selectedAssetId,powerMw:Number(target.dataset.power)});
  if (target.dataset.maintenance) return act({type:"schedule-maintenance",unitId:selectedAssetId,group:target.dataset.group,kind:target.dataset.maintenance,durationSec:3600});
  if (target.dataset.assignTeam) return act({type:"assign-team",teamId:target.dataset.assignTeam,taskId:target.dataset.task});
  if (target.dataset.returnTask) return act({type:"return-check",unitId:target.dataset.returnUnit,taskId:target.dataset.returnTask});
  if (target.dataset.cancelTask) return act({type:"cancel-maintenance",unitId:target.dataset.cancelUnit,taskId:target.dataset.cancelTask});
  if (target.dataset.ack) { acknowledged.add(target.dataset.ack); render(); return; }
  if (target.dataset.buy) {
    pendingPurchase = {
      type:"buy-replacement",
      contractId:target.dataset.buy,
      powerMw:Number(target.dataset.buyPower),
      maxPriceEurPerMwh:state.observation.economy.currentMarketPriceEurPerMwh.value + 60
    };
    const preview = await api("/api/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(pendingPurchase)});
    state = preview; render();
    const p = preview.feedback?.parameters;
    $("confirm-copy").textContent = p ? `Couverture ${p.powerMw} MW · coût estimé ${money(p.estimatedCostCents)}. Le moteur peut encore refuser selon prix, liquidité ou trésorerie.` : "Confirmer cet achat ?";
    $("confirm-dialog").showModal();
  }
});

$("confirm-cancel").addEventListener("click",()=>{$("confirm-dialog").close();pendingPurchase=null;});
$("confirm-accept").addEventListener("click",async()=>{
  if (!pendingPurchase) return;
  $("confirm-dialog").close();
  await act({...pendingPurchase,confirmed:true});
  pendingPurchase=null;
});
$("tutorial-understood").addEventListener("click",()=>{
  tutorialAcknowledged = true;
  if (state) renderTutorial(state.observation);
});
$("save-manual").addEventListener("click",()=>{ void saveNow("manual"); });
$("export-save").addEventListener("click",async()=>{
  const envelope = await api("/api/save");
  downloadSave(envelope.save);
  persistenceMessage(`Export JSON · ${envelope.metrics.bytes} octets.`, "ok");
});
$("import-save").addEventListener("click",()=>$("import-file").click());
$("import-file").addEventListener("change",async(event)=>{
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const candidate = await readSaveFile(file);
    if (await restoreRemote(candidate, "Import")) await saveNow("manual");
  } catch {
    persistenceMessage("Import invalide — fichier refusé, partie active conservée.", "bad");
  } finally {
    event.target.value = "";
  }
});
document.addEventListener("visibilitychange",()=>{
  realtimeController?.resetFrameClock();

  if (document.visibilityState === "hidden") {
    void (async () => {
      try {
        await realtimeController?.flushNow();
      } finally {
        await saveNow("suspension");
        realtimeDirty = false;
      }
    })();
  }
});

$("sound-toggle").addEventListener("click",(event)=>{
  soundEnabled=!soundEnabled;
  event.currentTarget.setAttribute("aria-pressed",String(soundEnabled));
  event.currentTarget.textContent=`Son alarmes : ${soundEnabled ? "oui" : "non"}`;
});

document.addEventListener("keydown",(event)=>{
  if (event.key==="1") { selectedAssetId="unit-valmorne-1"; render(); }
  if (event.key==="2") { selectedAssetId="unit-valmorne-2"; render(); }
  if (event.code === "Space" && !event.target.closest("input,button,select,textarea")) {
    event.preventDefault();
    void toggleRealtimePlayback();
  }
  if (event.key==="Escape" && $("confirm-dialog").open) $("confirm-dialog").close();
});

async function startRealtime() {
  await bootstrap();

  const initialSpeed = normalizeTimeSpeed(localStorage.getItem("nukegrid-time-speed") || 1);
  realtimeController = new RealTimeController({
    initialSpeed,
    advance: advanceRealtime,
    preview: (pendingSeconds) => {
      if (!state) return;
      const previewSec =
        state.observation.simTimeSec + Math.max(0, pendingSeconds);
      $("sim-clock").textContent = clock(previewSec, true);
    },
    onStateChange: renderTimeControls
  });
  realtimeController.start();

  window.setInterval(() => {
    if (!realtimeDirty || document.visibilityState !== "visible") return;
    void saveNow("auto").then(() => {
      realtimeDirty = false;
    });
  }, 30000);
}

startRealtime();
