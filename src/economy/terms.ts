/**
 * Every $RAREFRIENDS price and reward in The Descent, in whole RF.
 * This is the single source of truth: gameplay, UI copy and the README tables all read from here.
 * The economy deliberately stays inside small, memorable denominations: 5, 10 and 25 RF.
 */

/** The denominations a price may use. Tests pin every cost to this list. */
export const RF_DENOMINATIONS = [5, 10, 15, 20, 25, 30, 50] as const;

export const RF_STARTING_BALANCE = 25;

export const RF_COSTS = {
  shrine: { greed: 5, fate: 10, void: 25 },
  gate: { blood: 5, cursed: 10, abyssal: 25 },
  /** Escalating loot rerolls. There is no fourth reroll. */
  reroll: [5, 10, 25],
  revive: { partial: 10, full: 25 },
  merchant: { potion: 5, relic: 10, rareItem: 10, legendaryGamble: 25, cursedBox: 5 },
  event: { well: 5, stranger: 10, blackDoor: 25, gambler: 5, goldenDoor: 10 },
} as const;

export const RF_REWARDS = {
  /** Awarded by chance when a normal enemy dies; see RF_NORMAL_ENEMY_CHANCE. */
  enemy: 1,
  elite: 2,
  treasureRoom: 3,
  rareEvent: 5,
  miniBoss: 5,
  boss: 10,
  secretBoss: 25,
  /** Each coin a fleeing Loot Goblin drops. */
  goblinCoin: 1,
  /** Searching The Corpse can turn up a few RF. */
  corpseFind: 3,
} as const;

/** Base chance that a normal enemy drops +1 RF. Luck and RF-find items raise it. */
export const RF_NORMAL_ENEMY_CHANCE = 0.06;

/** Loot Goblins drop at most this many coins while fleeing. */
export const RF_GOBLIN_MAX_COINS = 3;

/** The Gambler's payout table for a 5 RF stake, in basis points (sums to 10,000). */
export const GAMBLER_PAYOUTS = [
  { payout: 0, chanceBps: 4500 },
  { payout: 5, chanceBps: 3000 },
  { payout: 10, chanceBps: 1700 },
  { payout: 25, chanceBps: 800 },
] as const;

export type ShrineTier = keyof typeof RF_COSTS.shrine;
export type GateTier = keyof typeof RF_COSTS.gate;
export type MerchantOffer = keyof typeof RF_COSTS.merchant;
export type ReviveKind = keyof typeof RF_COSTS.revive;

/** Every fixed price, flattened with a label, for tests and the README. */
export function allCosts(): readonly { label: string; amount: number }[] {
  const rows: { label: string; amount: number }[] = [];
  for (const [group, table] of Object.entries(RF_COSTS)) {
    if (Array.isArray(table)) table.forEach((amount, index) => rows.push({ label: `${group} #${index + 1}`, amount }));
    else for (const [name, amount] of Object.entries(table)) rows.push({ label: `${group}.${name}`, amount: amount as number });
  }
  return rows;
}
