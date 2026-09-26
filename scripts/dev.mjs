// Builds the site and serves it at http://127.0.0.1:4173. Re-run after editing source files.
import { createGameServer } from "@rarefriends/friendsdk/serve";
import { buildSite } from "./site.mjs";

const outdir = await buildSite();
const port = Number(process.env.PORT ?? 4173);
createGameServer(outdir).listen(port, "127.0.0.1", () => console.log(`The Descent: http://127.0.0.1:${port}`));
