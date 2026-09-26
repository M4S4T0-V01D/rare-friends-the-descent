// End-to-end checks against the real FriendSDK runtime in headless Chromium.
// The SDK harness supplies a mock wallet, mock Robinhood RPC and sample artwork for Friend #7730.
// Game state is read through window.__descent, which exists only in automated browsers (navigator.webdriver).
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { cleanup, testSite } from "./harness.mjs";

const OUT = "artifacts/test";
await mkdir(OUT, { recursive: true });
const results = [];
const step = async (name, fn) => {
  const started = Date.now();
  try { await fn(); results.push(`PASS ${name} (${Date.now() - started}ms)`); console.log(`PASS ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${error.message}`); console.log(`FAIL ${name}: ${error.stack}`); if (globalThis.__consoleErrors?.length) console.log("Browser errors:", globalThis.__consoleErrors.join("\n")); throw error; }
};

async function harness({ page }) {
  const consoleErrors = [];
  globalThis.__consoleErrors = consoleErrors;
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => consoleErrors.push(error.message));
  const child = () => {
    const frame = page.frames().find(f => f.url().includes("game.html"));
    if (!frame) throw new Error("Game frame is not mounted");
    return frame;
  };
  const st = () => child().evaluate(() => window.__descent.debugState());
  const call = (source, arg) => child().evaluate(({ source, arg }) => new Function("g", "arg", source)(window.__descent, arg), { source, arg });
  const shot = name => page.screenshot({ path: `${OUT}/${name}.png` });
  const press = async (key, wait = 250) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };
  const waitFor = async (predicate, label, timeout = 8000) => {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) { last = await st(); if (predicate(last)) return last; await page.waitForTimeout(100); }
    throw new Error(`Timed out waiting for ${label}; last state ${JSON.stringify({ screen: last?.screen, modal: last?.modal, balance: last?.balance, room: last?.room })}`);
  };
  const teleport = (x, y) => call("g.debugTeleport(arg[0], arg[1])", [x, y]);
  const lastTx = async () => (await st()).history.at(-1);
  const focusGame = () => page.locator("iframe").click({ position: { x: 480, y: 420 } });
  const clearRoom = async () => {
    for (let i = 0; i < 160; i++) {
      const s = await st();
      if (s.modal === "levelUp") { await press("1"); continue; }
      if (!s.foes.length && s.locked === null) return s;
      const foe = s.foes.find(f => !f.spawning);
      if (foe) await teleport(foe.x - 28, foe.y);
      await press("j", 130);
    }
    throw new Error("Could not clear the room");
  };
  return { consoleErrors, child, st, call, shot, press, waitFor, teleport, lastTx, focusGame, clearRoom };
}

await testSite({
  width: 1100, height: 780, timeout: 30000,
  picker: async ({ page }) => {
    await step("picker shows each Friend's canonical artwork and family", async () => {
      const card = page.getByRole("button", { name: /^Friend #7730\b/ });
      await page.getByText("Hoverer", { exact: true }).waitFor();
      const inked = await card.locator("canvas").evaluate(canvas => {
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let dark = 0; for (let i = 0; i < data.length; i += 4) if (data[i] < 40) dark++;
        return dark;
      });
      assert(inked > 50, `thumbnail drew the Friend's pixels (${inked} dark pixels)`);
      await page.screenshot({ path: `${OUT}/00-picker.png` });
    });
  },
  check: async ({ page, game }) => {
    const h = await harness({ page, game });
    const { st, call, shot, press, waitFor, teleport, lastTx, focusGame, clearRoom } = h;

    await step("title shows the verified Friend and the simulated label", async () => {
      await game.getByRole("heading", { name: "The Descent" }).waitFor();
      await game.getByText(/verified hardwired Generations NFT/).waitFor();
      await game.getByText(/All RF in this game is simulated/).waitFor();
      await shot("01-title");
    });

    await step("the chosen Friend is locked in: the runtime toolbar offers no Friend switch", async () => {
      assert.equal(await page.getByRole("button", { name: "Choose Friend" }).count(), 0);
      assert.equal(await page.getByRole("button", { name: /^Friend #/ }).count(), 0, "no Friend picker button while playing");
      await page.locator(".rf-frame-selected-friend", { hasText: "Friend #7730" }).waitFor();
    });

    await step("the camp is walkable: the Friend walks up the great stairs and descends", async () => {
      await page.keyboard.press("Enter");
      await game.getByRole("button", { name: "Descend ▾" }).waitFor();
      const camp = await waitFor(s => s.screen === "camp" && s.interactables.some(it => it.kind === "station"), "walkable camp");
      assert.equal(camp.interactables.filter(it => it.kind === "prop" && it.label === "").length > 5, true, "camp props present");
      await page.waitForTimeout(600);
      await shot("02-camp");
      await game.getByRole("button", { name: "Camp menu" }).click();
      await game.getByText(/Family trait/).waitFor();
      await shot("02b-camp-menu");
      await page.keyboard.press("Escape");
      await waitFor(s => s.screen === "camp", "menu closed");
      await focusGame();
      const stairs = (await st()).interactables.find(it => it.label === "THE DESCENT");
      const start = (await st()).pos;
      await page.keyboard.down("w"); await page.waitForTimeout(1500); await page.keyboard.up("w");
      const walked = await st();
      assert(walked.pos.y < start.y - 150, `walked north toward the stairs (${start.y} -> ${walked.pos.y})`);
      await teleport(stairs.x, stairs.y + 20);
      await page.waitForTimeout(200);
      await press("e", 400);
      await game.getByRole("button", { name: "Begin the Descent" }).waitFor();
      await shot("02c-stairs");
      await game.getByRole("button", { name: "Begin the Descent" }).click();
      const s = await waitFor(s => s.screen === "run" && s.depth === 1, "run start");
      assert.equal(s.balance, 25, "starts with 25 RF");
      assert.equal(s.history[0].reason, "Starting balance (simulated)");
    });

    await step("WASD and arrow keys move the Friend", async () => {
      await focusGame();
      const a = (await st()).pos;
      await page.keyboard.down("d"); await page.waitForTimeout(500); await page.keyboard.up("d");
      await page.keyboard.down("ArrowDown"); await page.waitForTimeout(300); await page.keyboard.up("ArrowDown");
      const b = (await st()).pos;
      assert(b.x > a.x + 40, `moved right (${a.x} -> ${b.x})`);
      assert(b.y > a.y + 20, `moved down (${a.y} -> ${b.y})`);
    });

    await step("first combat room locks, fights with J, clears and drops loot", async () => {
      const room = (await st()).rooms.find(r => r.type === "combat");
      await teleport(room.x, room.y);
      const s = await waitFor(s => s.locked !== null && s.foes.length === 3, "room lock and 3 Cursed Friends");
      assert(s.foes.every(f => f.kind === "cursed"));
      await page.waitForTimeout(700);
      await shot("03-combat");
      const cleared = await clearRoom();
      assert.equal(cleared.locked, null, "doors unlock");
      assert((await st()).drops.some(d => d.kind === "item"), "the first fight drops loot");
      await page.waitForTimeout(700);
      for (let i = 0; i < 6; i++) {
        const loot = (await st()).drops.find(d => d.kind === "item");
        if (!loot) break;
        await teleport(loot.x, loot.y);
        await page.waitForTimeout(400);
      }
      await waitFor(s => s.equipment[0] !== "Rune Claw", "the guaranteed weapon upgrade is equipped");
      await shot("04-loot");
    });

    await step("level up offers three boons and applies one", async () => {
      await call("g.debugXp(60)");
      const s = await waitFor(s => s.modal === "levelUp", "level-up modal");
      await shot("05-levelup");
      await press("2", 400);
      const after = await waitFor(s => s.modal === "none", "boon chosen");
      assert(after.level >= 2 && s.level >= 2);
    });

    await step("5 RF: the Shrine of Greed spends through the economy", async () => {
      const shrine = (await st()).interactables.find(it => it.kind === "shrine");
      await teleport(shrine.x, shrine.y + 50);
      await press("e", 400);
      assert.equal((await st()).modal, "shrine");
      await shot("06-shrine-greed");
      const b0 = (await st()).balance;
      await press("Enter", 1500);
      const s = await waitFor(s => s.modal === "reveal", "shrine reveal");
      assert.equal(s.balance, b0 - 5);
      const tx = await lastTx();
      assert.deepEqual([tx.kind, tx.amount, tx.reason, tx.category], ["spend", 5, "Shrine of Greed", "shrine"]);
      await press("Enter", 300);
      await press("e", 300);
      assert.notEqual((await st()).modal, "shrine", "a used shrine cannot be paid twice");
      if ((await st()).modal !== "none") await press("Escape", 300);
      await waitFor(s => s.roomSong === "shrine", "the shrine's own tune while inside the shrine room");
      const start = (await st()).rooms.find(r => r.type === "start");
      await teleport(start.x, start.y);
      await waitFor(s => s.roomSong === null, "the shrine tune fading out after leaving");
    });

    await step("treasure room pays +3 RF; rerolls escalate 5 → 10 → 25 and stop", async () => {
      const chest = (await st()).interactables.find(it => it.kind === "chest" && it.label === "TREASURE CHEST");
      const before = (await st()).balance;
      await teleport(chest.x, chest.y + 40);
      await press("e", 500);
      let s = await waitFor(s => s.modal === "loot", "loot choice");
      assert.equal(s.balance, before + 3, "+3 RF treasure reward");
      assert.equal((await st()).history.at(-1).reason, "Treasure room");
      await shot("07-loot-choice");
      if (s.balance < 40) await call("return g.debugGrant(40)");
      const b0 = (await st()).balance;
      await press("r", 400);
      assert.equal((await st()).balance, b0 - 5, "first reroll costs 5");
      await press("r", 400);
      assert.equal((await st()).balance, b0 - 15, "second reroll costs 10");
      await press("r", 400);
      assert.equal((await st()).balance, b0 - 40, "third reroll costs 25");
      await press("r", 400);
      assert.equal((await st()).balance, b0 - 40, "no fourth reroll");
      const reasons = (await st()).history.slice(-3).map(t => `${t.reason}:${t.amount}`);
      assert.deepEqual(reasons, ["Loot reroll #1:5", "Loot reroll #2:10", "Loot reroll #3:25"]);
      await shot("08-rerolled");
      await press("1", 400);
      s = await st();
      assert.equal(s.modal, "none");
      assert(s.interactables.find(it => it.id === chest.id).used, "chest is spent");
    });

    await step("5 RF: the Blood Gate opens an optional room", async () => {
      const gate = (await st()).interactables.find(it => it.kind === "gate");
      if ((await st()).balance < 5) await call("return g.debugGrant(10)");
      await teleport(gate.x, gate.y);
      await press("e", 400);
      assert.equal((await st()).modal, "gate");
      await shot("09-gate");
      await press("Enter", 500);
      const tx = await lastTx();
      assert.deepEqual([tx.amount, tx.reason, tx.category], [5, "Blood Gate", "gate"]);
      assert((await st()).interactables.find(it => it.id === gate.id).used);
    });

    await step("event room resolves with displayed odds", async () => {
      const event = (await st()).interactables.find(it => it.kind === "event");
      if ((await st()).balance < 25) await call("return g.debugGrant(25)");
      await teleport(event.x, event.y + 50);
      await press("e", 400);
      assert.equal((await st()).modal, "event");
      await shot("10-event");
      await press("Enter", 1500);
      let s = await waitFor(s => s.modal === "reveal" || s.modal === "none" || s.modal === "shells" || s.locked !== null, "event outcome");
      // Floor 1 can roll a mini-game: finish it so the run carries on.
      if (s.modal === "shells") { await waitFor(s => s.modal === "shells", "shells", 1000); await page.waitForTimeout(9000); await press("1", 600); await press("Enter", 400); s = await st(); }
      if (s.miniGame) { await call("g.miniGame.until = g.time"); s = await waitFor(s => s.modal === "reveal", "mini-game result"); await page.waitForTimeout(600); }
      if (s.modal === "reveal") { await shot("11-event-reveal"); await press("Enter", 400); }
      if ((await st()).locked !== null) await clearRoom();
    });

    await step("10 RF: death offers Revive and restores 40% HP", async () => {
      if ((await st()).balance < 10) await call("return g.debugGrant(10)");
      const b0 = (await st()).balance;
      await call("g.debugDamagePlayer(99999)");
      await waitFor(s => s.modal === "death", "death modal", 5000);
      await shot("12-death");
      await press("1", 500);
      const s = await waitFor(s => s.modal === "none" && !s.dead, "revived");
      // Coins still flying from the last fight may land at any moment, so check the ledger entry itself.
      const spend = s.history.filter(t => t.kind === "spend").at(-1);
      assert.deepEqual([spend.reason, spend.amount, spend.category], ["Revive", 10, "revive"]);
      assert(s.balance <= b0 - 10 + 3, "balance dropped by the revive");
      assert(Math.abs(s.hp - Math.round(s.maxHp * 0.4)) <= 1, `hp ${s.hp} ~ 40% of ${s.maxHp}`);
    });

    await step("25 RF: Full Revival restores full HP", async () => {
      if ((await st()).balance < 25) await call("return g.debugGrant(25)");
      const b0 = (await st()).balance;
      await page.waitForTimeout(2200);
      await call("g.debugDamagePlayer(99999)");
      await waitFor(s => s.modal === "death", "death modal", 5000);
      await press("2", 500);
      const s = await waitFor(s => s.modal === "none" && !s.dead, "fully revived");
      const spend = s.history.filter(t => t.kind === "spend").at(-1);
      assert.deepEqual([spend.reason, spend.amount, spend.category], ["Full revival", 25, "revive"]);
      assert(s.balance <= b0 - 25 + 3, "balance dropped by the full revival");
      assert.equal(s.hp, s.maxHp);
    });

    await step("25 RF: depth 2 always holds the Shrine of the Void", async () => {
      await call("g.debugNextFloor()");
      let s = await waitFor(s => s.depth === 2, "depth 2");
      const shrine = s.interactables.find(it => it.kind === "shrine" && it.label === "SHRINE OF THE VOID");
      assert(shrine, "void shrine present");
      if (s.balance < 25) await call("return g.debugGrant(25 - arg)", s.balance);
      await teleport(shrine.x, shrine.y + 60);
      await page.waitForTimeout(500);
      await shot("13-void-room");
      await press("e", 500);
      assert.equal((await st()).modal, "shrine");
      await shot("14-void-modal");
      const b0 = (await st()).balance;
      await press("Enter", 600);
      await shot("15-void-suspense");
      s = await waitFor(s => s.modal === "reveal", "void reveal", 6000);
      await page.waitForTimeout(2600);
      await shot("16-void-reveal");
      assert.equal(s.balance, b0 - 25);
      assert.deepEqual([s.history.at(-1).reason, s.history.at(-1).amount], ["Shrine of the Void", 25]);
      await press("Enter", 800);
      s = await st();
      if (s.boss) {
        await page.waitForTimeout(800);
        await shot("17-secret-boss");
        await call("g.debugKillRoom()");
        s = await waitFor(s => !s.boss, "secret boss defeated");
        assert(s.history.some(t => t.reason === "Secret boss: The Unminted" && t.amount === 25), "+25 RF secret boss");
        const rift = s.interactables.find(it => it.label === "RETURN THROUGH THE RIFT");
        await teleport(rift.x, rift.y + 30);
        await press("e", 600);
      }
      if ((await st()).locked !== null) await clearRoom();
    });

    await step("merchant sells a 5 RF potion and a 10 RF relic", async () => {
      const merchant = (await st()).interactables.find(it => it.kind === "merchant");
      assert(merchant, "depth 2 always has a merchant");
      await call("return g.debugGrant(20)");
      await call("g.player.potions = 0");
      await teleport(merchant.x, merchant.y + 60);
      await press("e", 400);
      assert.equal((await st()).modal, "merchant");
      await shot("18-merchant");
      const b0 = (await st()).balance;
      await press("1", 400);
      let s = await st();
      assert.equal(s.balance, b0 - 5);
      assert.equal(s.potions, 1);
      await press("2", 600);
      s = await waitFor(s => s.modal === "reveal", "relic reveal");
      assert.equal(s.balance, b0 - 15);
      assert.equal(s.history.at(-1).reason, "Merchant: Random Relic");
      await press("Enter", 400);
      assert.equal((await st()).modal, "merchant", "returns to the merchant");
      await press("Escape", 300);
    });

    await step("potion heals with F", async () => {
      await call("g.player.hp = 30");
      await focusGame();
      await press("f", 300);
      const s = await st();
      assert(s.hp > 30 && s.potions === 0);
    });

    await step("pause menu toggles reduced motion; M mutes", async () => {
      await press("Escape", 400);
      assert.equal((await st()).modal, "pause");
      await shot("19-pause");
      const before = (await st()).settings.reducedMotion;
      await h.child().getByLabel("Reduced motion").click();
      assert.equal((await st()).settings.reducedMotion, !before);
      await h.child().getByLabel("Reduced motion").click();
      await press("Escape", 300);
      assert.equal((await st()).modal, "none");
      await focusGame();
      await press("m", 200);
      assert.equal((await st()).settings.sound, false, "muted");
      await press("m", 200);
      assert.equal((await st()).settings.sound, true, "unmuted");
    });

    await step("bestiary: seen creatures unlock pages, opened with B", async () => {
      let s = await st();
      assert(s.bestiary.includes("cursed"), "the first room's Cursed Friends are recorded");
      await focusGame();
      await press("b", 500);
      assert.equal((await st()).modal, "bestiary");
      await game.getByRole("option", { name: "Cursed Friend" }).click();
      await game.getByText(/still remembers how to run/).waitFor();
      await game.getByRole("option", { name: "Unknown creature" }).first().waitFor();
      await shot("19b-bestiary");
      await press("Escape", 300);
      s = await st();
      assert.equal(s.modal, "none");
      // Meeting several new creatures at once reads as one toast, never a wall of them over the fight.
      const fresh = ["mite", "spitter", "eyestalk"].filter(k => !s.bestiary.includes(k));
      const ids = await call("return arg.map(k => g.debugSpawn(k))", fresh);
      await waitFor(s => fresh.every(k => s.bestiary.includes(k)), "new creatures recorded");
      const toasts = await call("return g.ui.toasts.map(t => t.text)");
      assert.equal(toasts.filter(t => t.startsWith("BESTIARY")).length, 1, `one combined bestiary toast (${toasts.join(" | ")})`);
      assert(toasts.length <= 3, "at most three toasts at once");
      await call("g.enemies = g.enemies.filter(e => !arg.includes(e.id))", ids);
    });

    await step("guardian: a titled mini-boss guards the stairs and pays +3 RF", async () => {
      let s = await st();
      const room = s.rooms.find(r => r.type === "guardian");
      assert(room, "depth 2 ends its main path at a guardian room");
      await call("g.player.iframes = 99; g.player.hp = g.stats.maxHp");
      await teleport(room.x, room.y + 90);
      s = await waitFor(s => s.boss && s.locked !== null, "guardian awakens");
      const title = s.boss.name;
      await page.waitForTimeout(1800);
      await shot("19c-guardian");
      await call("g.debugKillRoom()");
      s = await waitFor(s => !s.boss && s.locked === null, "guardian slain");
      assert(s.history.some(t => t.reason.startsWith("Guardian:") && t.amount === 3), `+3 RF for ${title}`);
      while ((await st()).modal === "levelUp") await press("1", 400);
      await call("g.player.iframes = 0");
    });

    await step("mini-games: 5 RF Shell Game pays 15 RF for the right cup; 5 RF Rune Gallery pays by runes", async () => {
      if ((await st()).balance < 20) await call("return g.debugGrant(20)");
      const setUp = event => call(`const it = g.interactables.find(i => i.kind === "event"); it.event = "${event}"; it.used = false; g.setModal({ kind: "event", id: it.id, event: "${event}" }); return it.id;`);
      await setUp("shells");
      await game.getByText(/Pick the right cup/).waitFor();
      let b0 = (await st()).balance;
      await press("Enter", 600);
      assert.equal((await st()).modal, "shells");
      assert.equal((await st()).balance, b0 - 5);
      const slot = await call("const sg = g.shellGame; let order = [0, 1, 2]; for (const [a, b] of sg.swaps) order = order.map(s => s === a ? b : s === b ? a : s); return order[sg.ball];");
      await waitFor(s => s.modal === "shells", "shells", 500);
      await game.getByText(/Which cup\?/).waitFor({ timeout: 15000 });
      await press(String(slot + 1), 700);
      await game.getByText(/Found it!/).waitFor();
      await shot("19d-shells");
      let s = await st();
      assert.equal(s.balance, b0 + 10, "paid 5, won 15");
      assert.equal(s.history.at(-1).reason, "The Shell Game: found the rune");
      await press("Enter", 400);
      await setUp("gallery");
      b0 = (await st()).balance;
      await press("Enter", 600);
      await waitFor(s => s.miniGame && s.foes.some(f => f.kind === "target"), "runes appear");
      await shot("19e-gallery");
      await call("g.miniGame.score = 14; g.miniGame.until = g.time");
      s = await waitFor(s => s.modal === "reveal", "gallery result");
      assert.equal(s.balance, b0 - 5 + 15, "14 runes pay 15 RF");
      await page.waitForTimeout(600);
      await press("Enter", 400);
      await waitFor(s => s.modal === "none", "back to the dungeon");
    });

    await step("depth 3 boss fight: +5 RF, waystone secures loot, escape shows the summary", async () => {
      await call("g.debugNextFloor()");
      let s = await waitFor(s => s.depth === 3, "depth 3");
      const room = s.rooms.find(r => r.type === "boss");
      await teleport(room.x, room.y + 120);
      s = await waitFor(s => s.boss, "boss spawned");
      assert.equal(s.boss.name, "DUNGEON WARDEN");
      await page.waitForTimeout(2600);
      await shot("20-boss");
      await call("g.debugKillRoom()");
      s = await waitFor(s => !s.boss && s.locked === null, "boss defeated");
      assert(s.history.some(t => t.reason === "Mini-boss: Dungeon Warden" && t.amount === 5), "+5 RF mini-boss");
      while ((await st()).modal === "levelUp") await press("1", 400);
      const waystone = s.interactables.find(it => it.kind === "waystone");
      await teleport(waystone.x, waystone.y + 40);
      await press("e", 400);
      assert.equal((await st()).modal, "waystone");
      await shot("21-waystone");
      await press("x", 800);
      s = await waitFor(s => s.screen === "summary", "summary");
      await game.getByText("RF started").waitFor();
      await game.getByText("RF remaining").waitFor();
      await game.getByText("Escaped with the loot", { exact: true }).waitFor();
      await game.getByLabel(/^Score [\d,]+$/).waitFor();
      await page.waitForTimeout(1600);
      await shot("22-summary");
      assert(s.stash > 0, "escaped loot reaches the stash");
      // Share: the trusted host copies the scoreboard image and opens X's composer for the sandboxed game.
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.context().route("https://x.com/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "<title>X</title>" }));
      await game.getByRole("button", { name: "Copy image" }).click();
      await game.getByText("Scoreboard image copied. Paste it anywhere!").waitFor();
      const copied = await page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        const blob = await items[0].getType("image/png");
        const bitmap = await createImageBitmap(blob);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
        return { types: items[0].types, w: bitmap.width, h: bitmap.height, png: btoa(binary) };
      });
      await writeFile(`${OUT}/22b-scoreboard-card.png`, Buffer.from(copied.png, "base64"));
      assert.deepEqual([copied.types.includes("image/png"), copied.w, copied.h], [true, 1200, 675], "a 1200×675 PNG scoreboard is on the clipboard");
      const popup = page.waitForEvent("popup");
      await game.getByRole("button", { name: /Post on X/ }).click();
      const x = await popup;
      await x.waitForLoadState();
      const intent = new URL(x.url());
      assert.equal(`${intent.origin}${intent.pathname}`, "https://x.com/intent/post");
      assert.match(intent.searchParams.get("text"), /^My Rare Friend .+ escaped The Descent from depth 3: [\d,]+ points/);
      assert.ok(intent.searchParams.get("url").startsWith("http://127.0.0.1:"), "links back to the game page");
      await x.close();
      await game.getByText(/The image is on your clipboard/).waitFor();
      await page.context().unroute("https://x.com/**");
      assert(s.lifetimeScore > 0, "the run's score is added to the lifetime total");
    });

    await step("descend again restarts; death and End Run keep secured loot only", async () => {
      const before = (await st()).balance;
      await game.getByRole("button", { name: "Descend Again" }).click();
      const s = await waitFor(s => s.screen === "run" && s.depth === 1, "new run");
      assert.equal(s.balance, before, "no free RF: you descend with exactly what you had");
      assert(!s.history.some(t => t.reason.includes("stipend")), "no stipend in the ledger");
      await call("g.debugDamagePlayer(99999)");
      await waitFor(s => s.modal === "death", "death");
      await press("3", 800);
      await waitFor(s => s.screen === "summary", "fallen summary");
      await game.getByRole("heading", { name: "Your Friend Has Fallen" }).waitFor();
      await game.getByRole("button", { name: "Return to Camp" }).click();
      await waitFor(s => s.screen === "camp", "camp");
      await game.getByRole("button", { name: "Camp menu" }).click();
      await game.getByRole("tab", { name: /Stash/ }).click();
      await shot("23-stash");
    });

    await step("wardrobe: RF buys the Corrupted skin and a glow, which the Friend then wears", async () => {
      if ((await st()).balance < 20) await call("return g.debugGrant(20)");
      await game.getByRole("tab", { name: "Wardrobe" }).click();
      const b0 = (await st()).balance;
      await game.getByRole("button", { name: /Corrupted/ }).click();
      let s = await waitFor(s => s.worn.skin === "skin-corrupted", "corrupted skin worn");
      assert.equal(s.balance, b0 - 10);
      assert.deepEqual([(await lastTx()).reason, (await lastTx()).category], ["Dye Altar: Corrupted", "cosmetic"]);
      await game.getByRole("button", { name: /Blood Moon/ }).click();
      s = await waitFor(s => s.worn.glow === "glow-crimson", "crimson glow worn");
      assert.equal(s.balance, b0 - 15);
      await game.getByRole("button", { name: /Canonical/ }).click();
      s = await waitFor(s => s.worn.skin === "skin-hero", "owned looks can be swapped for free");
      assert.equal(s.balance, b0 - 15);
      await game.getByRole("button", { name: /Corrupted/ }).click();
      await shot("23b-wardrobe");
      await game.getByRole("button", { name: "Close camp menu" }).click();
      await page.waitForTimeout(400);
      await shot("23c-camp-corrupted");
    });

    await step("audio: every place has its own mood and every family its own voice", async () => {
      const result = await call(`
        const a = g.audio;
        return a.unlock().then(running => {
          const songs = [];
          for (const mode of ["camp", "crypt", "tech", "flesh", "void", "boss"]) { a.setMusicMode(mode); songs.push(Boolean(a.place && a.place.player.playing)); }
          const rooms = [];
          for (const song of ["shrine", "voidShrine", "corpse", "lostFriend", "mystery", "merchant", "gambler", "treasure", "secret"]) {
            a.setRoomSong(song); rooms.push(Boolean(a.room && a.room.player.playing) && a.currentRoomSong === song);
          }
          a.setRoomSong(null);
          for (const family of ["Skeleton", "Mask", "Family", "Cellular", "Asymmetry", "Hoverer", "Colossus", "Sparkling", "Hollow"]) {
            a.setVoice(family, 7730); a.lastPlayed.clear(); a.friendVoice("signature");
          }
          a.setVoice(g.friend.family, g.kit.seed);
          a.setMusicMode("crypt");
          return { running, state: a.ctx && a.ctx.state, songs, rooms };
        });
      `);
      assert.equal(result.state, "running", "audio context runs after a gesture");
      assert.deepEqual(result.songs, [true, true, true, true, true, true], "every place has a tune");
      assert.deepEqual(result.rooms, Array(9).fill(true), "every special room has a tune");
      await page.waitForTimeout(1500);
    });

    await step("no console errors during play", async () => {
      assert.deepEqual(h.consoleErrors, []);
    });

    await step("artwork failure shows an error with retry", async () => {
      await page.route("https://rpc.mainnet.chain.robinhood.com/**", route => route.abort("failed"));
      await h.child().evaluate(() => location.reload());
      await page.waitForTimeout(500);
      const frame = page.frameLocator("iframe");
      await frame.getByRole("button", { name: "Retry" }).waitFor({ timeout: 20000 });
      await frame.getByText(/could not be read from Robinhood Chain/).waitFor();
      await shot("24-error");
      await page.unroute("https://rpc.mainnet.chain.robinhood.com/**");
      await frame.getByRole("button", { name: "Retry" }).click();
      await frame.getByRole("button", { name: /Begin/ }).waitFor({ timeout: 20000 });
      h.consoleErrors.length = 0;
    });

    await step("switching the wallet off Robinhood unmounts the game; switching back rechecks", async () => {
      await page.evaluate(() => window.__friendWalletTest.chain("0x1"));
      await page.getByRole("button", { name: /Switch to Robinhood/ }).waitFor({ timeout: 10000 });
      await shot("25-wrong-network");
      assert.equal(await page.locator("iframe").count(), 0, "game unmounted on the wrong network");
      await page.getByRole("button", { name: /Switch to Robinhood/ }).click();
      await page.waitForTimeout(1500);
      await shot("25b-after-switch");
      const friend = page.getByRole("button", { name: /^Friend #7730\b/ });
      await Promise.race([friend.waitFor({ timeout: 10000 }), page.locator("iframe").waitFor({ timeout: 10000 })]);
      if (await page.locator("iframe").count() === 0) await friend.click();
      await page.locator("iframe").waitFor({ timeout: 10000 });
    });

    await step("browser refresh starts a fresh session behind the ownership gate", async () => {
      await page.reload();
      await page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
      await page.getByRole("button", { name: /^Friend #7730\b/ }).click();
      const frame = page.frameLocator("iframe");
      await frame.getByRole("button", { name: /Begin/ }).waitFor({ timeout: 20000 });
      const s = await st();
      assert.equal(s.balance, 25);
      assert.equal(s.stash, 0, "session state resets on reload (SDK sandbox has no storage)");
    });
  },
});

// A phone-sized pass exercises the touch controls.
await testSite({
  width: 480, height: 700, timeout: 30000,
  check: async ({ page, game }) => {
    const h = await harness({ page, game });
    await step("touch: joystick moves and the attack button swings", async () => {
      await game.getByRole("button", { name: /Begin/ }).click();
      await game.getByRole("button", { name: /Descend/ }).click();
      await h.waitFor(s => s.screen === "run", "run");
      await h.call("g.setTouch(true)");
      await game.getByRole("button", { name: "ATTACK" }).waitFor();
      const zone = game.locator(".dx-stick-zone");
      const box = await zone.boundingBox();
      const a = (await h.st()).pos;
      await zone.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch", clientX: box.x + 60, clientY: box.y + 80, isPrimary: true });
      await zone.dispatchEvent("pointermove", { pointerId: 7, pointerType: "touch", clientX: box.x + 110, clientY: box.y + 80, isPrimary: true });
      await page.waitForTimeout(500);
      await zone.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", clientX: box.x + 110, clientY: box.y + 80, isPrimary: true });
      const b = (await h.st()).pos;
      assert(b.x > a.x + 30, `touch joystick moved right (${a.x} -> ${b.x})`);
      await game.getByRole("button", { name: "ATTACK" }).dispatchEvent("pointerdown", { pointerType: "touch" });
      await page.waitForTimeout(100);
      await game.getByRole("button", { name: "ATTACK" }).dispatchEvent("pointerup", { pointerType: "touch" });
      assert(await h.call("return g.player.swing !== null || g.player.attackCd > 0"), "attack triggered");
      await h.shot("26-touch");
      assert.deepEqual(h.consoleErrors, []);
    });
  },
});

await cleanup();
console.log(`\n${results.join("\n")}\n${results.filter(r => r.startsWith("PASS")).length}/${results.length} passed`);
