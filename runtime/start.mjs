import { createPlayableServer } from "../src/playable/server.ts";

const port = Number(process.env.NUKEGRID_PORT ?? 4176);
const host = process.env.NUKEGRID_HOST ?? "127.0.0.1";
const server = createPlayableServer();

server.listen(port, host, () => {
  console.log(`NukeGrid playable UI: http://${host}:${port}`);
});
