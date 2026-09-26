// Records the showcase media for /live-preview: a gameplay trailer with the game's own sound, and one short clip
// per Generations family casting its signature ability. The bot from bot-core.mjs plays the real engine in real
// time on the shipped site, using the FriendSDK's mock wallet fixture and its sample Friend #7730.
// Usage: node scripts/trailer.mjs [outdir]   (default docs/showcase; needs ffmpeg)
//        KEEP=1 keeps the raw recording; REUSE=<that dir> re-cuts it without recording again;
//        ONLY=clips records just the family clips and leaves the trailer as it is.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installBot } from "./bot-core.mjs";
import { cleanup, testSite } from "./harness.mjs";

const OUT = process.argv[2] ?? "docs/showcase";
const REEL = process.env.ONLY !== "clips";
const FAMILIES = ["Skeleton", "Mask", "Family", "Cellular", "Asymmetry", "Hoverer", "Colossus", "Sparkling", "Hollow"];
const W = 1100, H = 780;
const work = process.env.REUSE ?? await mkdtemp(join(tmpdir(), "descent-trailer-"));
await mkdir(join(OUT, "families"), { recursive: true });

let trailer = [];              // { start, end } in ms from page creation
let clips = [];                // { family, start, end }
let videoPath = null, box = null, flashMs = 0;

if (!process.env.REUSE) {

  await testSite({
    width: W, height: H, timeout: 60000, video: { dir: work }, reducedMotion: "no-preference",
    check: async ({ page, game, pageCreatedAt }) => {
      const frame = () => page.frames().find(f => f.url().includes("game.html"));
      const st = () => frame().evaluate(() => window.__descent.debugState());
      const call = (source, arg) => frame().evaluate(({ source, arg }) => new Function("g", "arg", source)(window.__descent, arg), { source, arg });
      const now = () => Date.now() - pageCreatedAt;
      const wait = ms => page.waitForTimeout(ms);
      const waitFor = async (predicate, timeout = 15000) => {
        const end = Date.now() + timeout;
        while (Date.now() < end) { const s = await st(); if (predicate(s)) return s; await wait(100); }
        return null;
      };
      const record = async (ms, list = trailer, extra = {}) => { const start = now(); await wait(ms); list.push({ ...extra, start, end: now() }); };
      const bot = on => call("window.__botOn = arg; if (!arg) { g.input.held.clear(); g.input.flush(); }", on);
      const nextFloor = async () => { const d = (await st()).depth; await call("g.debugNextFloor()"); await waitFor(s => s.depth > d && s.modal === "none"); };
      /** Record while a locked room is being fought, up to `max` ms. */
      const fight = async (max, list = trailer) => {
        if (!(await waitFor(s => s.locked !== null && s.foes.some(f => !f.spawning), 20000))) return;
        const start = now();
        await waitFor(s => s.locked === null, max);
        list.push({ start, end: now() });
      };
      const toCombat = async () => {
        const room = (await st()).rooms.find(r => r.type === "combat" && !r.cleared);
        if (room) await call("g.debugTeleport(arg[0], arg[1])", [room.x, room.y + 40]);
      };

      videoPath = await page.video().path();
      await page.addStyleTag({ content: ".rf-frame-toolbar { display: none !important; }" });
      box = await page.locator("iframe").boundingBox();
      await game.getByRole("heading", { name: "The Descent" }).waitFor();
      await frame().waitForFunction(() => window.__descent);
      await call("g.patch({ settings: { ...g.settings, reducedMotion: false, crt: false, screenShake: true } })");
      await page.locator("iframe").click({ position: { x: 480, y: 600 } });

      // Capture the game's own mix (music + effects) and mark one sync point: a white flash and a click together.
      await call(`return g.audio.unlock().then(() => {
        const a = g.audio, dest = a.ctx.createMediaStreamDestination();
        a.master.connect(dest); a.setMusic(false);
        const rec = new MediaRecorder(dest.stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 160000 });
        const chunks = []; rec.ondataavailable = e => chunks.push(e.data); rec.start(250);
        window.__rec = { rec, chunks };
      })`);
      await wait(1200);
      await page.evaluate(() => { const d = document.createElement("div"); d.id = "sync"; d.style.cssText = "position:fixed;inset:0;background:#fff;z-index:99999"; document.body.append(d); });
      await call("g.audio.play('coin')");
      flashMs = now();
      await wait(250);
      await page.evaluate(() => document.getElementById("sync").remove());
      await call("g.audio.setMusic(true)");
      await wait(1200);

      // Title → camp → the great stairs.
      if (REEL) await record(2600);
      await game.getByRole("button", { name: /^Begin/ }).click();
      if (!(await waitFor(s => s.screen === "camp"))) throw new Error("the camp did not open");
      await page.locator("iframe").click({ position: { x: 480, y: 420 } });
      await wait(600);
      const campStart = now();
      if (REEL) {
        await page.keyboard.down("w"); await wait(2300); await page.keyboard.up("w");
        await wait(500);
        trailer.push({ start: campStart, end: now() });
      }
      const camp = await st();
      const stairs = camp.interactables.find(it => it.label === "THE DESCENT");
      if (!stairs) throw new Error(`no stairs: ${JSON.stringify({ screen: camp.screen, modal: camp.modal, labels: camp.interactables.map(it => it.label) })}`);
      await call("g.debugTeleport(arg[0], arg[1])", [stairs.x, stairs.y + 20]);
      await page.keyboard.press("e");
      await game.getByRole("button", { name: "Begin the Descent" }).click();
      await waitFor(s => s.screen === "run" && s.depth === 1);

      // The bot plays in real time; the Friend is kept above half health so the reel keeps moving.
      await frame().evaluate(installBot, { smart: true, revive: true });
      // For the reel, the Friend takes 30% damage: no deaths, no revives, and no RF spent that the player did not choose.
      await call("const hurt = g.hurtPlayer.bind(g); g.hurtPlayer = (amount, source, options) => hurt(amount * 0.3, source, options)");
      await call(`window.__botOn = true; setInterval(() => {
        if (!window.__botOn) return;
        const p = g.player; if (p.hp < g.stats.maxHp * 0.55) p.hp = g.stats.maxHp * 0.55;
        window.__bot.step();
      }, 16)`);
      if (REEL) {
        await record(3000);                // floor banner and the first steps
        await fight(9000);
        await fight(8000);
        await bot(false);

        // Depth 2: the 25 RF Shrine of the Void.
        await nextFloor();
        await wait(2500);
        const shrine = (await st()).interactables.find(it => it.label === "SHRINE OF THE VOID");
        if (shrine) {
          await call("g.debugTeleport(arg[0], arg[1])", [shrine.x, shrine.y + 50]);
          await wait(400);
          const start = now();
          await wait(900);
          await page.keyboard.press("e");
          if (!(await waitFor(s => s.modal === "shrine", 3000))) throw new Error("the Void shrine dialog did not open");
          await wait(1600);
          await page.keyboard.press("Enter");
          await waitFor(s => s.modal === "reveal", 6000);
          await wait(2600);
          trailer.push({ start, end: now() });
          await page.keyboard.press("Enter"); await wait(300);
          if ((await st()).modal !== "none") await page.keyboard.press("Escape");
        }

        // Depth 3: the Dungeon Warden.
        await nextFloor();
        await wait(2500);
        const boss = (await st()).rooms.find(r => r.type === "boss");
        await call("g.debugTeleport(arg[0], arg[1])", [boss.x, boss.y + 120]);
        await bot(true);
        await waitFor(s => s.boss, 8000);
        await record(10000);
        await bot(false);

        // Deeper floors: two fights each on the tech and flesh floors.
        for (const depth of [5, 8]) {
          while ((await st()).depth < depth) await nextFloor();
          await wait(2800);
          for (let i = 0; i < 2; i++) { await toCombat(); await bot(true); await fight(6500); await bot(false); await wait(300); }
        }
      }

      // One clip per family: its signature ability, cast in a fresh fight. Any level-up waiting from earlier
      // fights is taken first, and fights end by removing the foes (no XP), so no dialog lands in a clip.
      const settle = async () => {
        for (let j = 0; j < 20 && (await st()).modal !== "none"; j++) { await page.keyboard.press((await st()).modal === "levelUp" ? "1" : "Escape"); await wait(300); }
      };
      for (const [i, family] of FAMILIES.entries()) {
        if (i % 3 === 0) { await nextFloor(); await wait(2800); }
        await call("g.debugFamily(arg)", family);
        const room = (await st()).rooms.find(r => r.type === "combat" && !r.cleared) ?? (await st()).rooms.find(r => r.type === "combat");
        await call("g.debugTeleport(arg[0], arg[1])", [room.x, room.y + 40]);
        await wait(1500);
        await settle();
        if (!(await st()).foes.length) for (let j = 0; j < 4; j++) await call("g.debugSpawn('cursed')");
        await call("for (const e of g.enemies) e.hp = e.maxHp * 50; g.player.iframes = 0");
        await wait(900);
        await settle();
        const start = now();
        for (let j = 0; j < 2; j++) {
          await call("g.player.energy = g.stats.energyMax; g.player.novaCd = 0; g.player.hp = g.stats.maxHp; g.input.press('nova')");
          await wait(1500);
        }
        clips.push({ family, start, end: now() });
        await call("g.enemies = []");
        await wait(500);
        await settle();
      }

      const b64 = await call(`return new Promise(done => {
        const r = window.__rec;
        r.rec.onstop = async () => {
          const bytes = new Uint8Array(await new Blob(r.chunks).arrayBuffer());
          let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          done(btoa(s));
        };
        r.rec.stop();
      })`);
      await writeFile(join(work, "audio.webm"), Buffer.from(b64, "base64"));
      await call("window.__botOn = false");
    },
  });
  await cleanup();
  await writeFile(join(work, "cuts.json"), JSON.stringify({ trailer, clips, box, flashMs }));
} else ({ trailer, clips, box, flashMs } = JSON.parse(await readFile(join(work, "cuts.json"), "utf8")));

// ─── Assemble with ffmpeg ─────────────────────────────────────────────────────
const video = videoPath ?? join(work, (await readdir(work)).find(f => f.endsWith(".webm") && f !== "audio.webm"));
const audio = join(work, "audio.webm");
const ff = args => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "pipe", "inherit"] });

// Sync: the white flash (video) and the click (audio) happened at the same page-clock instant, flashMs.
const flashAt = execFileSync("ffprobe", ["-v", "error", "-f", "lavfi", "-i", `movie=${video},signalstats`, "-show_entries", "frame=pts_time:frame_tags=lavfi.signalstats.YAVG", "-of", "csv=p=0"], { encoding: "utf8" })
  .trim().split("\n").map(l => l.split(",").map(Number)).filter(([, y]) => y > 200)
  // The blank page before load is white too; the sync flash is the bright frame nearest its page-clock time.
  .sort((p, q) => Math.abs(p[0] - flashMs / 1000) - Math.abs(q[0] - flashMs / 1000))[0][0];
const silence = execFileSync("sh", ["-c", `ffmpeg -hide_banner -nostats -i "${audio}" -af silencedetect=noise=-45dB:d=0.3 -f null - 2>&1`], { encoding: "utf8" });
const soundAt = Number(/silence_end: ([\d.]+)/.exec(silence)[1]);
const vAt = ms => ms / 1000 - flashMs / 1000 + flashAt, aAt = ms => ms / 1000 - flashMs / 1000 + soundAt;
console.log(`sync: flash at ${flashAt.toFixed(3)}s of video, click at ${soundAt.toFixed(3)}s of audio`);

const crop = `crop=${Math.round(box.width) & ~1}:${Math.round(box.height) & ~1}:${Math.round(box.x)}:${Math.round(box.y)}`;
const vp9 = ["-c:v", "libvpx-vp9", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "3"];
const segs = REEL ? trailer.filter(s => s.end - s.start > 800) : [];
const FADE = 0.25;
const vParts = [], aParts = [];
segs.forEach((s, i) => {
  const a = vAt(s.start), b = vAt(s.end), d = b - a;
  vParts.push(`[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS,${crop},scale=960:640:flags=lanczos,fps=30,fade=t=in:st=0:d=${FADE},fade=t=out:st=${(d - FADE).toFixed(3)}:d=${FADE}[v${i}]`);
  aParts.push(`[1:a]atrim=start=${aAt(s.start).toFixed(3)}:end=${aAt(s.end).toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${FADE},afade=t=out:st=${(d - FADE).toFixed(3)}:d=${FADE}[a${i}]`);
});
// Loudness-normalised for the web (−16 LUFS), like most game trailers.
const concat = segs.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${segs.length}:v=1:a=1[v][raw];[raw]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`;
if (REEL) {
  ff(["-i", video, "-i", audio, "-filter_complex", [...vParts, ...aParts, concat].join(";"), "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", join(OUT, "trailer.mp4")]);
  // WebM (VP9/Opus) for browsers without H.264, such as some Linux builds; the page offers both.
  ff(["-i", join(OUT, "trailer.mp4"), ...vp9, "-crf", "36", "-c:a", "libopus", "-b:a", "112k", join(OUT, "trailer.webm")]);
  // The poster is a moment of the Warden fight rather than the title screen.
  const bossSeg = segs.findIndex(s => s.end - s.start > 9800), bossAt = segs.slice(0, bossSeg).reduce((t, s) => t + (s.end - s.start) / 1000, 0) + 4;
  ff(["-ss", String(bossSeg >= 0 ? bossAt : 2.8), "-i", join(OUT, "trailer.mp4"), "-frames:v", "1", "-q:v", "3", join(OUT, "trailer.jpg")]);
}
console.log(`trailer: ${segs.length} segments, ${(segs.reduce((t, s) => t + s.end - s.start, 0) / 1000).toFixed(1)}s`);

// Family clips: the centre of the stage around the Friend, silent loops.
const cx = box.x + box.width / 2, cy = box.y + box.height * (330 / 640);
const cw = Math.round(box.width / 2) & ~1, ch = Math.round(box.height / 2) & ~1;
for (const c of clips) {
  const a = vAt(c.start), b = vAt(c.end);
  ff(["-ss", a.toFixed(3), "-to", b.toFixed(3), "-i", video, "-vf", `crop=${cw}:${ch}:${Math.round(cx - cw / 2)}:${Math.round(cy - ch / 2)},scale=480:320:flags=lanczos,fps=30`,
    "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(OUT, "families", `${c.family.toLowerCase()}.mp4`)]);
  ff(["-i", join(OUT, "families", `${c.family.toLowerCase()}.mp4`), ...vp9, "-crf", "38", "-an", join(OUT, "families", `${c.family.toLowerCase()}.webm`)]);
  ff(["-ss", "0.6", "-i", join(OUT, "families", `${c.family.toLowerCase()}.mp4`), "-frames:v", "1", "-q:v", "4", join(OUT, "families", `${c.family.toLowerCase()}.jpg`)]);
}
console.log(`family clips: ${clips.map(c => c.family).join(", ")}`);
if (process.env.KEEP || process.env.REUSE) console.log(`raw recording kept in ${work}`); else await rm(work, { recursive: true, force: true });
