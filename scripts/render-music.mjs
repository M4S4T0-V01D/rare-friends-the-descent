// Renders each place and special-room tune to artifacts/music/<place>.wav (plus a spectrogram) for listening and review.
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { cleanup, testSite } from "./harness.mjs";

await mkdir("artifacts/music", { recursive: true });
await testSite({ check: async ({ page, game: frame }) => {
  await frame.getByRole("button", { name: /Begin/ }).waitFor();
  const game = page.frames().find(f => f.url().includes("game.html"));
  for (const id of ["camp", "crypt", "tech", "flesh", "void", "boss", "shrine", "voidShrine", "corpse", "lostFriend", "mystery", "merchant", "gambler", "treasure", "secret"]) {
    const bytes = await game.evaluate(async id => Array.from(await window.__renderSong(id, 24)), id);
    await writeFile(`artifacts/music/${id}.wav`, Buffer.from(bytes));
    try { execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `artifacts/music/${id}.wav`, "-lavfi", "showspectrumpic=s=900x300:legend=0:scale=log:fscale=log:stop=4000", `artifacts/music/${id}.png`]); } catch { /* spectrograms need ffmpeg */ }
    console.log(`rendered ${id}`);
  }
} });
await cleanup();
