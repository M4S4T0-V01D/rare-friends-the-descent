import assert from "node:assert/strict";
import { test } from "node:test";
import { bandForFloor, FLOOR_THEMES, CURSED_BOX, EVENTS, GATES, GOLDEN_DOOR_RARITIES, LEGENDARY_GAMBLE, MERCHANT, SHRINES } from "../../src/game/content.ts";
import { generateArena, generateFloor, T, TILE } from "../../src/game/dungeon.ts";
import { generateItem, itemScore, RARITIES, rollRarity, SLOTS } from "../../src/game/items.ts";
import { Rng } from "../../src/game/rng.ts";
import { BASE_ATK, BASE_HP, BOONS, computeStats, FAMILY_TRAITS, HP_PER_LEVEL, xpForLevel } from "../../src/game/stats.ts";
import { COIN_DASH, GALLERY_PAYOUTS, RF_COSTS, RF_DENOMINATIONS, SHELL_GAME } from "../../src/economy/terms.ts";
import { BESTIARY_ORDER, LORE } from "../../src/game/lore.ts";
import { COSMETICS, DEFAULT_COSMETICS } from "../../src/game/content.ts";
import { dmgScale, GUARDIAN_TITLES } from "../../src/game/enemies.ts";
import { OUTCOME_MULTIPLIER, RARITY_POINTS, scoreRun } from "../../src/game/score.ts";

const sum = (rows: readonly { chanceBps: number }[]) => rows.reduce((total, row) => total + row.chanceBps, 0);

test("every displayed odds table sums to 100%", () => {
  for (const [tier, shrine] of Object.entries(SHRINES)) assert.equal(sum(shrine.outcomes), 10_000, `shrine ${tier}`);
  for (const [kind, event] of Object.entries(EVENTS)) if (event.outcomes.length) assert.equal(sum(event.outcomes), 10_000, `event ${kind}`);
  for (const table of [GOLDEN_DOOR_RARITIES, LEGENDARY_GAMBLE, CURSED_BOX]) assert.equal(sum(table), 10_000);
});

test("shrine, gate, merchant and event prices come from the economy terms", () => {
  assert.equal(SHRINES.greed.cost, RF_COSTS.shrine.greed);
  assert.equal(SHRINES.fate.cost, RF_COSTS.shrine.fate);
  assert.equal(SHRINES.void.cost, RF_COSTS.shrine.void);
  for (const tier of ["blood", "cursed", "abyssal"] as const) assert.equal(GATES[tier].cost, RF_COSTS.gate[tier]);
  for (const offer of Object.keys(MERCHANT) as (keyof typeof MERCHANT)[]) assert.equal(MERCHANT[offer].cost, RF_COSTS.merchant[offer]);
  assert.equal(EVENTS.blackDoor.cost, 25);
});

test("floors are deterministic per seed and every room is reachable", () => {
  const a = generateFloor(4, 1234), b = generateFloor(4, 1234);
  assert.deepEqual(a.rooms.map(r => [r.type, r.x, r.y]), b.rooms.map(r => [r.type, r.x, r.y]));
  for (let depth = 1; depth <= 12; depth++) for (let seed = 1; seed <= 25; seed++) {
    const floor = generateFloor(depth, seed * 7919 + depth);
    const w = floor.width, seen = new Uint8Array(floor.tiles.length);
    const start = Math.floor(floor.start.y / TILE) * w + Math.floor(floor.start.x / TILE);
    const queue = [start]; seen[start] = 1;
    while (queue.length) {
      const i = queue.pop()!, x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * w + x + dx, tile = floor.tiles[j];
        if (!seen[j] && (tile === T.Floor || tile === T.Door || tile === T.Corridor)) { seen[j] = 1; queue.push(j); }
      }
    }
    for (const room of floor.rooms) assert.ok(seen[(room.y + Math.floor(room.h / 2)) * w + room.x + 1], `depth ${depth} seed ${seed}: ${room.type} unreachable`);
    if (depth % 3 === 0) assert.notEqual(floor.bossRoom, undefined); else assert.notEqual(floor.exitRoom, undefined);
    if (depth === 2) assert.ok(floor.rooms.some(r => r.shrine === "void"), "depth 2 always offers the Shrine of the Void");
  }
});

test("floor 1 is authored for the first minute: fight, then the 5 RF Shrine of Greed", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const main = generateFloor(1, seed).rooms.filter(r => r.main).map(r => r.type + (r.shrine ? `:${r.shrine}` : ""));
    assert.deepEqual(main.slice(0, 3), ["start", "combat", "shrine:greed"]);
  }
});

test("deeper floors are larger and more complex, with every tile still reachable", () => {
  const measure = (depth: number) => {
    let rooms = 0, area = 0, loops = 0, walls = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const floor = generateFloor(depth, seed * 104729 + depth);
      rooms += floor.rooms.length; area += floor.rooms.reduce((a, r) => a + r.w * r.h, 0); loops += floor.connections.length - (floor.rooms.length - 1);
      const w = floor.width, seen = new Uint8Array(floor.tiles.length);
      const start = Math.floor(floor.start.y / TILE) * w + Math.floor(floor.start.x / TILE);
      const queue = [start]; seen[start] = 1;
      while (queue.length) {
        const i = queue.pop()!, x = i % w, y = (i - x) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = (y + dy) * w + x + dx, tile = floor.tiles[j];
          if (!seen[j] && (tile === T.Floor || tile === T.Door || tile === T.Corridor)) { seen[j] = 1; queue.push(j); }
        }
      }
      for (const r of floor.rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        if (floor.tiles[y * w + x] === T.Wall) walls++;
        else assert.ok(seen[y * w + x], `depth ${depth} seed ${seed}: sealed tile in ${r.type}`);
      }
    }
    return { rooms, area, loops, walls };
  };
  const shallow = measure(1), mid = measure(5), deep = measure(9);
  assert.ok(deep.rooms > mid.rooms && mid.rooms > shallow.rooms, "more rooms deeper down");
  assert.ok(deep.area > shallow.area * 2.5, "floors grow much larger");
  assert.ok(deep.loops > mid.loops && shallow.loops === 0, "deep floors loop; the first floor is linear");
  assert.ok(deep.walls > shallow.walls * 5, "deep rooms have interior architecture");
  assert.equal(generateFloor(9, 1).gridW, 9);
});

test("every floor has its own scenery and enemy roster", () => {
  const areas = new Set(FLOOR_THEMES.map(t => t.area));
  assert.equal(areas.size, 9, "nine distinct floors before the endless void");
  assert.deepEqual([...new Set(FLOOR_THEMES.map(t => t.style))], ["crypt", "tech", "flesh"]);
  assert.equal(bandForFloor(12).style, "void");
  assert.equal(bandForFloor(12).area, "Stratum 3");
  const seen = new Set<string>();
  for (let depth = 1; depth <= 10; depth++) for (const [kind] of bandForFloor(depth).roster) seen.add(kind);
  for (const kind of ["wisp", "gunner", "drone", "turret", "mite", "spitter", "eyestalk", "bloodling", "shade", "bomber", "lancer", "hexer", "sniper", "brute", "hive", "wraith", "prism"]) {
    assert.ok(seen.has(kind), `${kind} appears on some floor`);
  }
  // New enemy types are introduced as you descend, not all at once.
  assert.ok(!bandForFloor(1).roster.some(([kind]) => kind === "drone" || kind === "spitter"));
  assert.ok(bandForFloor(4).roster.some(([kind]) => kind === "drone"));
  assert.ok(bandForFloor(7).roster.some(([kind]) => kind === "spitter"));
});

test("arenas are single closed rooms", () => {
  const arena = generateArena(5, 99);
  assert.equal(arena.rooms.length, 1);
  assert.ok(arena.isArena);
});

test("items respect rarity budgets and slots", () => {
  const rng = new Rng(42);
  for (let i = 0; i < 400; i++) {
    const item = generateItem(rng, 1 + (i % 10));
    assert.ok(SLOTS.includes(item.slot));
    assert.ok(RARITIES.includes(item.rarity));
    assert.ok(item.affixes.length >= 1);
    if (item.rarity === "legendary" || item.rarity === "mythic") assert.ok(item.power, "legendary and mythic items carry a power");
  }
  const cursed = generateItem(rng, 3, { rarity: "rare", cursed: true });
  assert.ok(cursed.cursed && cursed.affixes.some(a => a.value < 0 || a.stat === "damageTakenPct"), "cursed items have a downside");
  assert.ok(itemScore(generateItem(rng, 1, { rarity: "mythic" })) > itemScore(generateItem(rng, 9, { rarity: "rare" })));
});

test("rarity rolls respect a floor and luck pushes them upward", () => {
  const rng = new Rng(7);
  for (let i = 0; i < 200; i++) assert.notEqual(rollRarity(rng, 0, "rare"), "common");
  const rank = (boost: number) => { const r = new Rng(9); let total = 0; for (let i = 0; i < 2000; i++) total += RARITIES.indexOf(rollRarity(r, boost)); return total; };
  assert.ok(rank(1.5) > rank(0) * 1.4);
});

test("stats combine level, family trait, boons, items and buffs", () => {
  const base = computeStats(1, {}, new Map(), [], []);
  assert.equal(base.maxHp, BASE_HP);
  assert.equal(base.atk, BASE_ATK);
  const leveled = computeStats(4, FAMILY_TRAITS.Colossus.mods, new Map([["might", 1]]), [], [{ id: "x", name: "x", kind: "blessing", mods: { dmgPct: 20 }, rooms: 2, color: "#fff", icon: "x" }]);
  assert.equal(leveled.maxHp, Math.round((BASE_HP + 3 * HP_PER_LEVEL) * 1.2));
  assert.ok(leveled.atk > base.atk);
  assert.ok(Math.abs(leveled.dmgMult - 1.2) < 1e-9);
  assert.ok(Object.keys(BOONS).length >= 12);
  assert.ok(xpForLevel(2) > xpForLevel(1));
});

test("the player is mortal: modest base stats and enemies that scale with depth", () => {
  const lvl10 = computeStats(10, {}, new Map(), [], []);
  assert.ok(lvl10.maxHp <= 160, "ten levels do not make the Friend a tank");
  assert.ok(lvl10.atk <= 30);
  assert.ok(dmgScale(1) >= 1.2, "enemies hit hard from the first floor");
  assert.ok(dmgScale(9) > 3.5, "and much harder deep down");
  const d = computeStats(20, {}, new Map([["siphon", 3]]), [], []);
  assert.ok(d.lifesteal <= 12 && d.evasion <= 20 && d.critChance <= 60, "defensive stats are capped");
});

test("scores reward depth, kills, loot and escaping; falling costs you", () => {
  const rng = new Rng(3);
  const items = [generateItem(rng, 5, { rarity: "legendary" }), generateItem(rng, 5, { rarity: "rare" })];
  const base = { depth: 6, kills: 120, elites: 4, bosses: ["DUNGEON WARDEN", "WARDEN OF THE DEEP"], level: 9, items, rfEarned: 30 };
  const escaped = scoreRun({ ...base, outcome: "escaped" }), fallen = scoreRun({ ...base, outcome: "fallen" });
  assert.equal(escaped.subtotal, fallen.subtotal);
  assert.ok(escaped.total > fallen.total, "escaping beats dying");
  assert.equal(escaped.total, Math.round(escaped.subtotal * OUTCOME_MULTIPLIER.escaped));
  assert.equal(scoreRun({ ...base, outcome: "conquered" }).total, escaped.subtotal * 2);
  const loot = escaped.lines.find(line => line.id === "loot")!;
  assert.equal(loot.points, RARITY_POINTS.legendary + RARITY_POINTS.rare);
  const deeper = scoreRun({ ...base, depth: 9, outcome: "escaped" });
  assert.ok(deeper.total > escaped.total);
  const moreKills = scoreRun({ ...base, kills: 200, outcome: "escaped" });
  assert.ok(moreKills.total > escaped.total);
  assert.equal(scoreRun({ ...base, items: [], outcome: "escaped" }).lines.find(line => line.id === "loot")!.points, 0);
});

test("cosmetics are priced in the RF denominations and every slot has a free default", () => {
  for (const c of COSMETICS) if (c.cost) assert.ok(RF_DENOMINATIONS.includes(c.cost as never), `${c.id} costs ${c.cost}`);
  for (const [slot, id] of Object.entries(DEFAULT_COSMETICS)) {
    const item = COSMETICS.find(c => c.id === id)!;
    assert.equal(item.slot, slot); assert.equal(item.cost, 0);
  }
  assert.ok(COSMETICS.some(c => c.look === "corrupted"), "you can wear the Corrupted Friends' crimson");
  assert.equal(new Set(COSMETICS.map(c => c.id)).size, COSMETICS.length);
});

test("every floor without a boss ends its main path at a guardian, from depth 2", () => {
  for (let depth = 1; depth <= 12; depth++) for (let seed = 1; seed <= 10; seed++) {
    const main = generateFloor(depth, seed * 31 + depth).rooms.filter(r => r.main).map(r => r.type);
    const guardians = main.filter(type => type === "guardian").length;
    if (depth === 1 || depth % 3 === 0) assert.equal(guardians, 0, `depth ${depth}`);
    else { assert.equal(guardians, 1, `depth ${depth}`); assert.equal(main[main.length - 2], "guardian", "right before the stairs"); }
  }
  for (const kind of Object.keys(GUARDIAN_TITLES)) assert.ok(kind !== "mite");
});

test("the bestiary has a page, lore and attacks for every creature", () => {
  const kinds = ["cursed", "crawler", "goblin", "corrupted", "warden", "beast", "unminted", "wisp", "gunner", "drone", "turret", "mite", "spitter", "eyestalk", "bloodling", "shade",
    "bomber", "lancer", "hexer", "sniper", "brute", "hive", "wraith", "prism"];
  assert.deepEqual([...BESTIARY_ORDER].sort(), [...kinds].sort());
  for (const kind of BESTIARY_ORDER) { assert.ok(LORE[kind].lore.length > 20); assert.ok(LORE[kind].attacks.length >= 1); }
});

test("mini-games cost 5 or 10 RF and a skilled player comes out ahead", () => {
  assert.deepEqual([EVENTS.gallery.cost, EVENTS.shells.cost, EVENTS.coinDash.cost], [5, 5, 10]);
  for (const kind of ["gallery", "shells", "coinDash"] as const) assert.ok(EVENTS[kind].rules?.length, `${kind} explains its rules`);
  assert.ok(GALLERY_PAYOUTS[0].payout > EVENTS.gallery.cost && SHELL_GAME.payout > EVENTS.shells.cost && COIN_DASH.coins * COIN_DASH.perCoin > EVENTS.coinDash.cost);
  for (let i = 1; i < GALLERY_PAYOUTS.length; i++) assert.ok(GALLERY_PAYOUTS[i].hits < GALLERY_PAYOUTS[i - 1].hits && GALLERY_PAYOUTS[i].payout < GALLERY_PAYOUTS[i - 1].payout);
  for (const row of GALLERY_PAYOUTS) assert.ok(RF_DENOMINATIONS.includes(row.payout as never) || row.payout === 5, `${row.payout}`);
});
