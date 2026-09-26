/**
 * The boundary between gameplay and $RAREFRIENDS.
 *
 * Gameplay never edits a balance directly. It asks the economy to spend or reward and waits for a
 * receipt before granting anything. The MVP ships SimulatedTokenEconomy; a future adapter can
 * implement this same interface against real RF infrastructure (wallet confirmation, canonical
 * Friend wallet transfers, verified receipts) without touching combat, loot or UI code.
 */

/** RF uses 18 decimals, matching the FriendSDK's bigint base units (1 RF = 10n ** 18n). */
export const RF_DECIMALS = 18;
export const RF_UNIT = 10n ** 18n;

export type RfAmount = bigint;

/** Convert a whole-RF game price (5, 10, 25…) into base units. */
export function rf(whole: number): RfAmount {
  if (!Number.isSafeInteger(whole) || whole < 0) throw new RangeError(`RF amounts must be whole, non-negative numbers (got ${whole}).`);
  return BigInt(whole) * RF_UNIT;
}

/** Whole RF for display. Amounts in this game are always whole RF. */
export function wholeRf(amount: RfAmount): number {
  return Number(amount / RF_UNIT);
}

export type RfCategory =
  | "shrine" | "gate" | "reroll" | "merchant" | "revive" | "event"
  | "enemy" | "elite" | "treasure" | "boss" | "secret-boss" | "event-reward" | "stipend";

export type RfTransaction = Readonly<{
  id: number;
  kind: "spend" | "reward";
  amount: RfAmount;
  reason: string;
  category: RfCategory;
  balanceAfter: RfAmount;
  /** Milliseconds since the economy session started. */
  at: number;
  /** Always true for the MVP; a live adapter would carry a verified receipt reference instead. */
  simulated: boolean;
}>;

export type RfReceipt = Readonly<{ transaction: RfTransaction }>;

export class InsufficientRfError extends Error {
  constructor(readonly needed: RfAmount, readonly balance: RfAmount) {
    super(`Not enough $RAREFRIENDS: need ${wholeRf(needed)} RF, have ${wholeRf(balance)} RF.`);
    this.name = "InsufficientRfError";
  }
}

export interface TokenEconomy {
  /** "simulated" for the MVP. A live adapter would report "live". */
  readonly mode: "simulated" | "live";
  getBalance(): RfAmount;
  canAfford(amount: RfAmount): boolean;
  /** Resolves only once the spend is final. Rejects with InsufficientRfError when unaffordable. */
  spend(amount: RfAmount, reason: string, category: RfCategory): Promise<RfReceipt>;
  reward(amount: RfAmount, reason: string, category: RfCategory): Promise<RfReceipt>;
  getHistory(): readonly RfTransaction[];
  subscribe(listener: (transaction: RfTransaction) => void): () => void;
}
