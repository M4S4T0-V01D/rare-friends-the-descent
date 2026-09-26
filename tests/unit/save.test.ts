import assert from "node:assert/strict";
import { test } from "node:test";
import { SimulatedTokenEconomy } from "../../src/economy/SimulatedTokenEconomy.ts";
import { rf, wholeRf, type RfTransaction } from "../../src/economy/TokenEconomy.ts";
import { generateItem, reserveItemIds, newItemId } from "../../src/game/items.ts";
import { Rng } from "../../src/game/rng.ts";
import { sanitizeSave, SAVE_VERSION, type SaveData } from "../../src/game/save.ts";

const rng = new Rng(42);
const items = [generateItem(rng, 3, { rarity: "legendary" }), generateItem(rng, 5, { slot: "ring" }), generateItem(rng, 1, { rarity: "mythic" })];

function sample(): SaveData {
  return {
    v: SAVE_VERSION, friendId: "7730", savedAt: 1_700_000_000_000, balance: 42,
    ledger: [
      { id: 1, kind: "reward", amount: 25, reason: "Starting balance (simulated)", category: "stipend", balanceAfter: 25 },
      { id: 2, kind: "reward", amount: 22, reason: "Boss defeated", category: "boss", balanceAfter: 47 },
      { id: 3, kind: "spend", amount: 5, reason: "Shrine of Greed", category: "shrine", balanceAfter: 42 },
    ],
    stash: items, heirloomId: items[1].id, codex: [["Glass Heart|legendary", { name: "Glass Heart", rarity: "legendary", slot: "charm", count: 2 }]],
    hall: [], runsStarted: 4, lifetimeScore: 12_345, bestScore: 8_000,
    bestiary: [["cursed", { kills: 31, guardians: ["The First Husk"] }]],
    owned: ["glow-lime", "skin-canonical", "trail-none", "pet-none", "hat-none", "fin-dissolve", "skin-corrupted", "pet-archivist"],
    worn: { glow: "glow-lime", skin: "skin-corrupted", trail: "trail-none", pet: "pet-archivist", hat: "hat-none", finisher: "fin-dissolve" },
    settings: { music: false, crt: false }, blessing: "might", campTier: 2,
  };
}

test("a save survives the JSON round trip unchanged", () => {
  const save = sample();
  assert.deepEqual(sanitizeSave(JSON.parse(JSON.stringify(save)), "7730"), save);
});

test("a save only loads for its own Friend and version", () => {
  const json = JSON.parse(JSON.stringify(sample()));
  assert.equal(sanitizeSave(json, "1"), null, "another Friend's save is ignored");
  assert.equal(sanitizeSave({ ...json, v: 99 }, "7730"), null, "unknown versions are ignored");
  for (const junk of [null, 7, "save", [], { v: 1 }]) assert.equal(sanitizeSave(junk, "7730"), null);
});

test("damaged or hand-edited saves are cleaned, never trusted", () => {
  const json = JSON.parse(JSON.stringify(sample()));
  json.balance = -50;
  json.stash = [...json.stash, json.stash[0], { id: 9, slot: "boots", rarity: "common" }, { id: "x" }, null];
  json.heirloomId = 123456;
  json.owned = [...json.owned, "glow-made-up"];
  json.worn = { glow: "glow-prismatic", skin: "skin-corrupted", trail: "trail-none" };
  json.ledger.push({ id: 4, kind: "steal", amount: 1, reason: "", category: "shrine", balanceAfter: 0 });
  json.bestiary.push(["dragon", { kills: 1, guardians: [] }]);
  json.settings = { music: "loud", sound: false };
  const save = sanitizeSave(json, "7730")!;
  assert.equal(save.balance, 0, "balances are clamped at zero");
  assert.deepEqual(save.stash.map(i => i.id), items.map(i => i.id), "duplicates and malformed items are dropped");
  assert.equal(save.heirloomId, null, "the heirloom must be in the stash");
  assert(!save.owned.includes("glow-made-up"), "unknown cosmetics are dropped");
  assert.equal(save.worn.glow, "glow-lime", "an unowned look cannot be worn");
  const tampered = sanitizeSave({ ...JSON.parse(JSON.stringify(sample())), blessing: "godmode", campTier: 99 }, "7730")!;
  assert.equal(tampered.blessing, null, "only real blessings load");
  assert.equal(tampered.campTier, 3, "the camp tier is clamped");
  assert.equal(save.ledger.length, 3, "invalid ledger entries are dropped");
  assert.deepEqual(save.bestiary.map(([kind]) => kind), ["cursed"]);
  assert.deepEqual(save.settings, { sound: false });
  const huge = JSON.parse(JSON.stringify(sample()));
  huge.stash = Array.from({ length: 500 }, () => items[0]);
  assert(sanitizeSave(huge, "7730")!.stash.length <= 12, "the stash stays within its limit");
});

test("the simulated economy resumes a saved balance and ledger", () => {
  const save = sample();
  const restored: RfTransaction[] = save.ledger.map(tx => ({ ...tx, amount: rf(tx.amount), balanceAfter: rf(tx.balanceAfter), at: 0, simulated: true }));
  const economy = new SimulatedTokenEconomy(rf(save.balance), undefined, restored);
  assert.equal(wholeRf(economy.getBalance()), 42);
  assert.equal(economy.getHistory().length, 3);
  return economy.spend(rf(10), "Shrine of Fate", "shrine").then(({ transaction }) => {
    assert.equal(transaction.id, 4, "new transactions continue the saved numbering");
    assert.equal(wholeRf(transaction.balanceAfter), 32);
  });
});

test("restored item ids are never reused by new loot", () => {
  const top = Math.max(...items.map(i => i.id)) + 1000;
  reserveItemIds(top);
  assert(newItemId() > top);
});
