import { InsufficientRfError, type RfAmount, type RfCategory, type RfReceipt, type RfTransaction, type TokenEconomy } from "./TokenEconomy";

/**
 * SIMULATED $RAREFRIENDS. No real money, no token transfers, no purchases.
 * Session-local: the FriendSDK sandbox has no storage, so reloading starts a new ledger.
 */
export class SimulatedTokenEconomy implements TokenEconomy {
  readonly mode = "simulated" as const;
  private balance: RfAmount;
  private readonly history: RfTransaction[] = [];
  private readonly listeners = new Set<(transaction: RfTransaction) => void>();
  private readonly started: number;
  private nextId = 1;

  constructor(startingBalance: RfAmount, private readonly clock: () => number = () => performance.now()) {
    if (startingBalance < 0n) throw new RangeError("Starting balance cannot be negative.");
    this.balance = startingBalance;
    this.started = clock();
  }

  getBalance(): RfAmount { return this.balance; }

  canAfford(amount: RfAmount): boolean { return amount >= 0n && amount <= this.balance; }

  async spend(amount: RfAmount, reason: string, category: RfCategory): Promise<RfReceipt> {
    if (amount <= 0n) throw new RangeError("Spend amount must be positive.");
    if (!this.canAfford(amount)) throw new InsufficientRfError(amount, this.balance);
    this.balance -= amount;
    return { transaction: this.record("spend", amount, reason, category) };
  }

  async reward(amount: RfAmount, reason: string, category: RfCategory): Promise<RfReceipt> {
    if (amount <= 0n) throw new RangeError("Reward amount must be positive.");
    this.balance += amount;
    return { transaction: this.record("reward", amount, reason, category) };
  }

  getHistory(): readonly RfTransaction[] { return this.history; }

  subscribe(listener: (transaction: RfTransaction) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private record(kind: RfTransaction["kind"], amount: RfAmount, reason: string, category: RfCategory): RfTransaction {
    const transaction: RfTransaction = Object.freeze({
      id: this.nextId++, kind, amount, reason, category, balanceAfter: this.balance,
      at: Math.max(0, Math.round(this.clock() - this.started)), simulated: true,
    });
    this.history.push(transaction);
    for (const listener of this.listeners) listener(transaction);
    return transaction;
  }
}
