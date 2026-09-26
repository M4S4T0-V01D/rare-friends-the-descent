// Builds the static site: the FriendSDK CLI builds the sandboxed game, then The Descent's trusted host
// page (host/main.tsx: SDK wallet session, discovery and ConnectedGameHost with a richer picker)
// replaces the default runtime bundle. Output file names are unchanged, so the SDK server serves it.
// The no-wallet showcase (trailer, family guide, screenshots) is added at live-preview/.
import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
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
  await buildShowcase(path.join(game.outdir, "live-preview"));
  return game.outdir;
}

/** The showcase page: static HTML, one small script (family guide and voices), and the recorded media. */
export async function buildShowcase(outdir) {
  await mkdir(outdir, { recursive: true });
  await build({
    absWorkingDir: root, entryPoints: [path.join(root, "showcase/main.ts")], outfile: path.join(outdir, "showcase.js"),
    bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true, logLevel: "warning",
  });
  await cp(path.join(root, "showcase/index.html"), path.join(outdir, "index.html"));
  await cp(path.join(root, "showcase/showcase.css"), path.join(outdir, "showcase.css"));
  await cp(path.join(root, "assets/fonts"), path.join(outdir, "fonts"), { recursive: true });
  await cp(path.join(root, "docs/screenshots"), path.join(outdir, "media/screenshots"), { recursive: true });
  await cp(path.join(root, "docs/showcase"), path.join(outdir, "media"), { recursive: true });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const outdir = await buildSite(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(`Built ${outdir}`);
}
