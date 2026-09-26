import assert from "node:assert/strict";
import { test } from "node:test";
import { SimulatedTokenEconomy } from "../../src/economy/SimulatedTokenEconomy.ts";
import { InsufficientRfError, rf, RF_UNIT, wholeRf, type RfTransaction } from "../../src/economy/TokenEconomy.ts";
import { allCosts, GAMBLER_PAYOUTS, RF_COSTS, RF_DENOMINATIONS, RF_REWARDS, RF_STARTING_BALANCE } from "../../src/economy/terms.ts";

test("RF uses 18-decimal bigint base units, like the FriendSDK", () => {
  assert.equal(RF_UNIT, 10n ** 18n);
  assert.equal(rf(25), 25n * 10n ** 18n);
  assert.equal(wholeRf(rf(10)), 10);
  assert.throws(() => rf(2.5), RangeError);
  assert.throws(() => rf(-5), RangeError);
});

test("spend, reward, canAfford and history behave like a ledger", async () => {
  let clock = 1000;
  const economy = new SimulatedTokenEconomy(rf(25), () => clock);
  const seen: RfTransaction[] = [];
  economy.subscribe(tx => seen.push(tx));
  assert.equal(economy.mode, "simulated");
  assert.ok(economy.canAfford(rf(25)));
  assert.ok(!economy.canAfford(rf(30)));
  clock = 1500;
  const receipt = await economy.spend(rf(5), "Shrine of Greed", "shrine");
  assert.equal(receipt.transaction.kind, "spend");
  assert.equal(receipt.transaction.balanceAfter, rf(20));
  assert.equal(receipt.transaction.at, 500);
  assert.equal(receipt.transaction.simulated, true);
  await economy.reward(rf(3), "Treasure room", "treasure");
  assert.equal(economy.getBalance(), rf(23));
  assert.deepEqual(economy.getHistory().map(tx => [tx.kind, wholeRf(tx.amount), tx.reason]), [["spend", 5, "Shrine of Greed"], ["reward", 3, "Treasure room"]]);
  assert.equal(seen.length, 2);
  assert.deepEqual(economy.getHistory().map(tx => tx.id), [1, 2]);
});

test("an unaffordable spend is rejected and changes nothing", async () => {
  const economy = new SimulatedTokenEconomy(rf(20));
  await assert.rejects(economy.spend(rf(25), "Shrine of the Void", "shrine"), InsufficientRfError);
  assert.equal(economy.getBalance(), rf(20));
  assert.equal(economy.getHistory().length, 0);
  await assert.rejects(economy.spend(0n, "nothing", "shrine"), RangeError);
  await assert.rejects(economy.reward(-1n, "negative", "enemy"), RangeError);
});

test("every price stays inside the small 5 / 10 / 25 family", () => {
  for (const { label, amount } of allCosts()) {
    assert.ok((RF_DENOMINATIONS as readonly number[]).includes(amount), `${label} costs ${amount} RF`);
  }
  assert.deepEqual(RF_COSTS.reroll, [5, 10, 25], "rerolls escalate 5 → 10 → 25 and stop");
  assert.deepEqual(Object.values(RF_COSTS.shrine), [5, 10, 25]);
  assert.deepEqual(Object.values(RF_COSTS.gate), [5, 10, 25]);
  assert.deepEqual(RF_COSTS.revive, { partial: 10, full: 25 });
  assert.equal(RF_STARTING_BALANCE, 25);
});

test("rewards stay small", () => {
  // Everything the dungeon pays is small (1 to 25 RF); the one big payday is conquering the Descent.
  for (const [name, amount] of Object.entries(RF_REWARDS)) if (name !== "finalBoss") assert.ok(amount >= 1 && amount <= 25, `${name}: ${amount}`);
  assert.equal(RF_REWARDS.finalBoss, 100, "beating The First Friend pays 100 RF");
  assert.equal(RF_REWARDS.secretBoss, 25);
  assert.equal(RF_REWARDS.boss, 10);
});

test("the Gambler's table sums to 10,000 bps and pays in the 5 / 10 / 25 family", () => {
  assert.equal(GAMBLER_PAYOUTS.reduce((sum, row) => sum + row.chanceBps, 0), 10_000);
  for (const row of GAMBLER_PAYOUTS) assert.ok([0, 5, 10, 25].includes(row.payout));
  const expected = GAMBLER_PAYOUTS.reduce((sum, row) => sum + row.payout * row.chanceBps, 0) / 10_000;
  assert.ok(expected > 4 && expected < 6, `expected payout ${expected} is close to the 5 RF stake`);
});
