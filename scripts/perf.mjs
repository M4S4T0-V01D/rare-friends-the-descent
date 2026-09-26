// Performance tools for The Descent, run against the shipped site with the SDK's mock wallet fixture.
//
//   node scripts/perf.mjs bench [cpuSlowdown]   Real-time timings per scene: update and render ms per frame (mean, p95)
//                                               and frames per second. cpuSlowdown (e.g. 4) emulates a slower device.
//   node scripts/perf.mjs golden <dir>          A deterministic replay (seeded randomness, virtual clock, fixed 1/60 s steps,
//                                               the playtest bot at the controls) that saves exact frames and state digests.
//   node scripts/perf.mjs compare <a> <b>       Compares two golden runs pixel by pixel. Optimizations must leave them identical.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { installBot } from "./bot-core.mjs";
import { cleanup, testSite } from "./harness.mjs";

const [mode = "bench", ...args] = process.argv.slice(2);

/** Runs in every frame before its scripts: in golden mode the game frame gets seeded randomness and a virtual clock. */
function deterministic() {
  if (!location.pathname.endsWith("game.html")) return;
  let seed = 0x5eed, vt = 0;
  const mulberry = () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const realNow = performance.now.bind(performance);
  let virtual = false;
  Math.random = mulberry;
  performance.now = () => (virtual ? vt : realNow());
  const realFill = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = array => { if (!virtual) return realFill(array); for (let i = 0; i < array.length; i++) array[i] = Math.floor(mulberry() * 2 ** 32) >>> 0; return array; };
  // Page timers (banner and toast lifetimes) follow the virtual clock too, so a faster or slower machine captures the same frame.
  const realSet = window.setTimeout.bind(window), realClear = window.clearTimeout.bind(window);
  let timers = [], nextTimer = 1e6;
  window.setTimeout = (fn, ms = 0, ...rest) => {
    if (!virtual) return realSet(fn, ms, ...rest);
    const id = nextTimer++; timers.push({ id, at: vt + Math.max(0, ms), fn: () => fn(...rest) }); return id;
  };
  window.clearTimeout = id => { timers = timers.filter(t => t.id !== id); realClear(id); };
  window.__golden = {
    start() { virtual = true; vt = 100000; seed = 0x5eed; },
    advance(ms) {
      vt += ms;
      for (;;) {
        const due = timers.filter(t => t.at <= vt).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        timers = timers.filter(t => t !== due); due.fn();
      }
    },
  };
}

async function boot({ page, game }) {
  const frame = () => page.frames().find(f => f.url().includes("game.html"));
  const call = (source, arg) => frame().evaluate(({ source, arg }) => new Function("g", "arg", source)(window.__descent, arg), { source, arg });
  await game.getByRole("heading", { name: "The Descent" }).waitFor();
  await frame().waitForFunction(() => window.__descent);
  await call("g.patch({ settings: { ...g.settings, reducedMotion: false, crt: true, screenShake: true, sound: false } }); g.audio.setMuted(true)");
  return { frame, call };
}

// ─── Golden frames ────────────────────────────────────────────────────────────

async function golden(dir) {
  await mkdir(dir, { recursive: true });
  const digests = [];
  await testSite({
    width: 1100, height: 780, timeout: 120000, reducedMotion: "no-preference", init: { script: deterministic },
    check: async ({ page, game }) => {
      const { frame, call } = await boot({ page, game });
      // Stop the real-time loop; from here the replay drives every frame itself.
      // Audio runs on its own timers (and draws random numbers there), so the replay silences it first.
      await call(`g.audio.setRoomSong(null); g.audio.setMusicMode("none");
        for (const k of ["play", "cue", "friendVoice", "setMusicMode", "setRoomSong", "unlock", "setVoice"]) g.audio[k] = () => {};`);
      await page.waitForTimeout(300);
      await call(`cancelAnimationFrame(g.raf); g.disposed = true; window.__golden.start(); g.renderer.t = 0; g.time = 0;
        g.renderer.embers = []; g.renderer.motes = []; g.renderer.afterimages = []; g.renderer.chunks.clear();
        g.renderer.setScale(1);
        const hurt = g.hurtPlayer.bind(g); g.hurtPlayer = (amount, source, options) => hurt(amount * 0.3, source, options);`);
      await frame().evaluate(installBot, { smart: true, revive: true });
      const step = (n, bot = false) => call(`return (async () => {
        for (let i = 0; i < arg.n; i++) { if (arg.bot) window.__bot.step(); g.tick(1 / 60); window.__golden.advance(1000 / 60); await Promise.resolve(); }
      })()`, { n, bot });
      // Frames are captured as the player sees them: the composited game frame (canvas layers, CSS grade, DOM HUD).
      await frame().addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }" });
      const stage = page.locator("iframe");
      const capture = async name => {
        const state = await call(`const r = (v) => Math.round(v * 1000) / 1000;
          return { screen: g.screen, depth: g.depth, time: r(g.time), p: [r(g.player.pos.x), r(g.player.pos.y), r(g.player.hp)],
            enemies: g.enemies.map(e => [e.kind, r(e.pos.x), r(e.pos.y), r(e.hp)]), projectiles: g.projectiles.length, particles: g.particles.length,
            balance: g.ui.balance, seedCheck: Math.random() };`);
        const png = await stage.screenshot({ animations: "disabled" });
        const entry = { name, pixelHash: createHash("sha256").update(png).digest("hex"), state };
        digests.push(entry);
        await writeFile(join(dir, `${name}.png`), png);
        console.log(`${name}: ${entry.pixelHash.slice(0, 12)} · ${state.enemies.length} foes · ${state.projectiles} bullets · ${state.particles} particles`);
      };

      await step(10); await capture("01-title");
      await call("g.beginFromTitle()"); await step(90); await capture("02-camp");
      await call("g.input.held.add('w')"); await step(70); await call("g.input.held.clear()"); await capture("03-camp-stairs");
      const toCombat = () => call(`const room = g.floor.rooms.find(r => r.type === "combat" && !r.cleared); if (room) g.debugTeleport((room.x + room.w / 2) * 32, (room.y + room.h / 2) * 32 + 40)`);
      await call("g.descend()"); await step(150); await capture("04-depth1-start");
      await toCombat(); await step(240, true); await capture("05-depth1-fight");
      await step(240, true); await capture("06-depth1-later");
      await call("g.debugNextFloor()"); await step(120);
      const shrine = await call("return g.interactables.find(it => it.label === 'SHRINE OF THE VOID')?.pos");
      if (shrine) { await call("g.debugTeleport(arg.x + 150, arg.y + 40)", shrine); await step(60); await capture("07-void-shrine"); }
      for (let d = 2; d < 5; d++) { await call("g.debugNextFloor()"); await step(60); }
      await toCombat(); await step(200, true); await capture("08-depth5-fight");
      await step(200, true); await capture("09-depth5-later");
      for (let d = 5; d < 8; d++) { await call("g.debugNextFloor()"); await step(60); }
      await toCombat(); await step(90, true);
      await call(`for (const k of ["spitter", "eyestalk", "bloodling", "turret", "gunner", "wisp", "mite", "mite", "shade", "drone", "cursed", "cursed"]) g.debugSpawn(k)`);
      await step(180, true); await capture("10-depth8-stress");
      await step(180, true); await capture("11-depth8-stress-later");
      await call("g.debugNextFloor()"); await step(60);
      await call(`const room = g.floor.rooms.find(r => r.type === "boss"); if (room) g.debugTeleport((room.x + room.w / 2) * 32, (room.y + room.h / 2) * 32 + 120)`);
      await step(300, true); await capture("12-depth9-boss");
      await step(300, true); await capture("13-depth9-boss-later");
    },
  });
  await cleanup();
  await writeFile(join(dir, "digests.json"), JSON.stringify(digests, null, 1));
}

/** Pixel difference between two PNGs (uses Python with Pillow, which the dev machine has). */
function pixelDiff(a, b) {
  const out = execFileSync("python3", ["-c", `
import sys
from PIL import Image, ImageChops
a, b = Image.open(sys.argv[1]).convert("RGB"), Image.open(sys.argv[2]).convert("RGB")
if a.size != b.size: print(-1, 255); sys.exit()
d = ImageChops.difference(a, b)
print(sum(1 for p in d.get_flattened_data() if p != (0, 0, 0)), max(max(e) for e in d.getextrema()))`, a, b], { encoding: "utf8" }).trim().split(" ").map(Number);
  return { diff: out[0], maxDelta: out[1] };
}

async function compare(a, b) {
  const da = JSON.parse(await readFile(join(a, "digests.json"), "utf8")), db = JSON.parse(await readFile(join(b, "digests.json"), "utf8"));
  let failures = 0;
  for (const x of da) {
    const y = db.find(e => e.name === x.name);
    if (!y) { console.log(`MISSING ${x.name}`); failures++; continue; }
    const sameState = JSON.stringify(x.state) === JSON.stringify(y.state);
    if (x.pixelHash === y.pixelHash && sameState) { console.log(`SAME    ${x.name}`); continue; }
    failures++;
    let diff = 0, maxDelta = 0;
    if (x.pixelHash !== y.pixelHash) ({ diff, maxDelta } = pixelDiff(join(a, `${x.name}.png`), join(b, `${x.name}.png`)));
    console.log(`DIFFERS ${x.name}: ${diff} pixels differ (largest channel change ${maxDelta})${sameState ? "" : "; simulation state differs"}`);
  }
  console.log(failures ? `${failures} frame(s) differ` : `all ${da.length} frames identical`);
  process.exitCode = failures ? 1 : 0;
}

// ─── Real-time benchmark ─────────────────────────────────────────────────────

async function bench(cpu) {
  const rows = [];
  await testSite({
    width: 1100, height: 780, timeout: 120000, reducedMotion: "no-preference",
    check: async ({ page, game }) => {
      const { frame, call } = await boot({ page, game });
      if (cpu > 1) { const cdp = await page.context().newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu }); }
      await call(`const u = g.update.bind(g), r = g.renderer.render.bind(g.renderer);
        window.__perf = { update: [], render: [], frames: [], peak: { enemies: 0, projectiles: 0, particles: 0 } };
        let pending = 0;
        g.update = dt => { const t = performance.now(); u(dt); pending += performance.now() - t; };
        g.renderer.render = dt => {
          const t = performance.now(); r(dt); const p = window.__perf;
          p.render.push(performance.now() - t); p.update.push(pending); pending = 0; p.frames.push(t);
          p.peak.enemies = Math.max(p.peak.enemies, g.enemies.length); p.peak.projectiles = Math.max(p.peak.projectiles, g.projectiles.length); p.peak.particles = Math.max(p.peak.particles, g.particles.length);
        };
        const hurt = g.hurtPlayer.bind(g); g.hurtPlayer = (amount, source, options) => hurt(amount * 0.3, source, options);`);
      await frame().evaluate(installBot, { smart: true, revive: true });
      await call(`window.__botOn = false; setInterval(() => { if (window.__botOn) window.__bot.step(); }, 16)`);
      const measure = async (scene, ms) => {
        await call("const p = window.__perf; p.update = []; p.render = []; p.frames = []; p.peak = { enemies: 0, projectiles: 0, particles: 0 }");
        await page.waitForTimeout(ms);
        const p = await call("return window.__perf");
        const stat = xs => { const s = [...xs].sort((a, b) => a - b); return { mean: s.reduce((t, x) => t + x, 0) / (s.length || 1), p95: s[Math.floor(s.length * 0.95)] ?? 0 }; };
        const gaps = p.frames.slice(1).map((t, i) => t - p.frames[i]);
        const u = stat(p.update), r = stat(p.render), g = stat(gaps);
        rows.push({ scene, fps: Math.round(1000 / (g.mean || 1)), "frame p95 ms": g.p95.toFixed(1), "update ms": `${u.mean.toFixed(2)} / ${u.p95.toFixed(2)}`, "render ms": `${r.mean.toFixed(2)} / ${r.p95.toFixed(2)}`, ...p.peak });
      };
      await call("g.beginFromTitle()"); await page.waitForTimeout(800);
      await measure("camp", 4000);
      await call("g.descend()"); await page.waitForTimeout(2500);
      await call("window.__botOn = true"); await measure("depth 1 · fighting", 6000);
      for (let d = 1; d < 5; d++) { await call("g.debugNextFloor()"); await page.waitForTimeout(400); }
      await page.waitForTimeout(2500); await measure("depth 5 · fighting", 6000);
      for (let d = 5; d < 8; d++) { await call("g.debugNextFloor()"); await page.waitForTimeout(400); }
      await page.waitForTimeout(1500);
      await call(`const room = g.floor.rooms.find(r => r.type === "combat" && !r.cleared); if (room) g.debugTeleport((room.x + room.w / 2) * 32, (room.y + room.h / 2) * 32 + 40)`);
      await page.waitForTimeout(1500);
      await call(`for (const k of ["spitter", "eyestalk", "bloodling", "turret", "gunner", "wisp", "mite", "mite", "shade", "drone", "cursed", "cursed", "hive", "prism", "spitter", "turret"]) g.debugSpawn(k)`);
      await page.waitForTimeout(1000); await measure("depth 8 · stress (+16 foes)", 7000);
      if (process.env.PHASES) {
        // Time each renderer phase (inclusive), plus the final graded blit, per frame.
        const phases = await call(`const R = g.renderer, names = ["drawRun", "chunk", "drawDoors", "drawHazard", "drawCorpse", "drawInteractable", "drawPickup", "drawEnemy", "drawPlayer", "drawProjectiles",
            "applyLighting", "presentLight", "drawParticles", "drawMotes", "drawWorldOverlays", "drawHud", "drawCrt", "glowAt", "drawStairs"];
          const acc = {}; let frames = 0;
          // RASTER=1 forces each phase to finish drawing before its clock stops (diagnostic: slower, but shows raster cost).
          const flush = arg ? () => R.wctx.getImageData(0, 0, 1, 1) : () => {};
          for (const n of names) { const f = R[n].bind(R); acc[n] = 0; R[n] = (...a) => { flush(); const t = performance.now(); const r = f(...a); flush(); acc[n] += performance.now() - t; return r; }; }
          const ctx = R.base, blit = ctx.drawImage.bind(ctx); acc.finalBlit = 0;
          ctx.drawImage = (...a) => { const t = performance.now(); const r = blit(...a); if (a[0] === R.world) acc.finalBlit += performance.now() - t; return r; };
          const render = R.render.bind(R); acc.total = 0;
          R.render = dt => { const t = performance.now(); render(dt); acc.total += performance.now() - t; frames++; };
          return new Promise(done => setTimeout(() => done(Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, +(v / frames).toFixed(3)]).sort((a, b) => b[1] - a[1]))), 4000));`, Boolean(process.env.RASTER));
        console.log("Renderer phases in the stress room, ms per frame (inclusive):", phases);
      }
      if (process.env.PATCHES) {
        // How often does the React HUD state change (each change re-renders the overlay)?
        const counts = await call(`const counts = {}; const patch = g.patch.bind(g);
          g.patch = p => { for (const k of Object.keys(p)) counts[k] = (counts[k] ?? 0) + 1; counts.__all = (counts.__all ?? 0) + 1; return patch(p); };
          return new Promise(done => setTimeout(() => done(counts), 4000));`);
        console.log("HUD state patches in 4 s of the stress room:", counts);
      }
      if (process.env.PROFILE) {
        // Sample the stress room and list where the time goes, by function (self time).
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start");
        await page.waitForTimeout(5000);
        const { profile } = await cdp.send("Profiler.stop");
        const self = new Map(), dt = profile.timeDeltas, ids = profile.samples, byId = new Map(profile.nodes.map(n => [n.id, n]));
        ids.forEach((id, i) => { const n = byId.get(id), f = n.callFrame, key = `${f.functionName || "(anonymous)"} ${f.url.split("/").pop()}:${f.lineNumber}:${f.columnNumber}`; self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0)); });
        const total = [...self.values()].reduce((t, x) => t + x, 0);
        console.log("Top self time in the stress room:");
        for (const [key, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.PROFILE) || 30)) console.log(`${(100 * us / total).toFixed(1).padStart(5)}%  ${key}`);
      }
      if (process.env.VARIANTS) {
        // Which full-screen effects cost the most? (Diagnostics only; players keep every effect.)
        for (const [label, settings] of [["  no Rare Friends grade", { faded: false }], ["  no CRT", { crt: false }], ["  neither", { faded: false, crt: false }]]) {
          await call("g.patch({ settings: { ...g.settings, faded: true, crt: true, ...arg } })", settings);
          await measure(label, 4000);
        }
        await call("g.patch({ settings: { ...g.settings, faded: true, crt: true } })");
      }
      await call("g.debugNextFloor()"); await page.waitForTimeout(800);
      await call(`const room = g.floor.rooms.find(r => r.type === "boss"); if (room) g.debugTeleport((room.x + room.w / 2) * 32, (room.y + room.h / 2) * 32 + 120)`);
      await page.waitForTimeout(3000); await measure("depth 9 · Rare Beast", 7000);
    },
  });
  await cleanup();
  console.log(`CPU slowdown ×${cpu}. update/render = mean / p95 milliseconds per frame (60 fps needs < 16.7 ms total).`);
  console.table(rows);
}

if (mode === "golden") await golden(args[0] ?? "artifacts/golden");
else if (mode === "compare") await compare(args[0], args[1]);
else if (mode === "bench") await bench(Number(args[0] ?? 1));
else { console.error("usage: perf.mjs bench [cpu] | golden <dir> | compare <a> <b>"); process.exitCode = 2; }
