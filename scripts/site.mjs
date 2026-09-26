// Builds the static site: the FriendSDK CLI builds the sandboxed game, then The Descent's trusted host
// page (host/main.tsx: SDK wallet session, discovery and ConnectedGameHost with a richer picker)
// replaces the default runtime bundle. Output file names are unchanged, so the SDK server serves it.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGame } from "@rarefriends/friendsdk/build";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function buildSite(outdir = path.join(root, "site")) {
  const game = await buildGame(root, { outdir });
  await game.close();
  await build({
    absWorkingDir: root, entryPoints: { runtime: path.join(root, "host/main.tsx") }, outdir: game.outdir,
    bundle: true, format: "iife", platform: "browser", target: "es2022", jsx: "automatic", minify: true, logLevel: "warning",
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".woff2": "file", ".json": "json" }, assetNames: "assets/[name]-[hash]",
  });
  return game.outdir;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const outdir = await buildSite(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(`Built ${outdir}`);
}
