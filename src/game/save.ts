/**
 * Saved progress, per Friend.
 *
 * The FriendSDK sandbox has no storage, so the game hands its save to The Descent's trusted host page, which
 * keeps it in that page's localStorage under the Friend's canonical wallet (its Generations token-bound account),
 * and only for the Friend the SDK has just verified. The save lives in that browser only, and everything in
 * it, RF included, is simulated. Anything read back is untrusted: `sanitizeSave` rebuilds it field by field,
 * dropping what does not fit, so a damaged or hand-edited save can never break the game.
 */
import { BLESSINGS, CAMP_TIERS, COSMETICS, DEFAULT_COSMETICS, type CosmeticSlot } from "./content";
import { RARITIES, SLOTS, STAT_INFO, POWERS, type Affix, type Item, type PowerId, type StatKey } from "./items";
import { LORE, type BestiaryKind } from "./lore";
import type { CodexEntry, RunSummary, Settings } from "./types";
import type { RfCategory } from "../economy/TokenEconomy";

export const SAVE_VERSION = 1;
/** The host refuses anything larger; the game stays far below it. */
export const MAX_SAVE_CHARS = 512 * 1024;
const MAX_LEDGER = 200, MAX_STASH = 12, MAX_HALL = 5, MAX_BALANCE = 1_000_000_000;

export type SavedTx = { id: number; kind: "spend" | "reward"; amount: number; reason: string; category: RfCategory; balanceAfter: number };
export type SaveData = {
  v: typeof SAVE_VERSION;
  friendId: string;
  savedAt: number;
  /** Whole simulated RF. */
  balance: number;
  ledger: SavedTx[];
  stash: Item[];
  heirloomId: number | null;
  codex: [string, CodexEntry][];
  hall: RunSummary[];
  runsStarted: number;
  lifetimeScore: number;
  bestScore: number;
  bestiary: [BestiaryKind, { kills: number; guardians: string[] }][];
  owned: string[];
  worn: Record<CosmeticSlot, string>;
  settings: Partial<Settings>;
  /** A blessing bought at the camp's shrine that the next descent will carry. */
  blessing?: string | null;
  /** Camp restoration tier, 0–3. */
  campTier?: number;
};

// ─── Sanitizing ──────────────────────────────────────────────────────────────

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Loose : null);
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const int = (v: unknown, min: number, max: number, fallback = min) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);
const num = (v: unknown, min: number, max: number, fallback = min) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.slice(0, max) : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[]): T | null => (options.includes(v as T) ? v as T : null);

const CATEGORIES: readonly RfCategory[] = ["shrine", "gate", "reroll", "merchant", "revive", "event", "enemy", "elite", "treasure", "boss", "secret-boss", "event-reward", "stipend", "cosmetic"];
const STATS = Object.keys(STAT_INFO) as StatKey[];
const POWER_IDS = Object.keys(POWERS) as PowerId[];
const COSMETIC_IDS = COSMETICS.map(c => c.id);
const OUTCOMES = ["fallen", "escaped", "conquered", "abandoned"] as const;
const SETTINGS: readonly (keyof Settings)[] = ["sound", "music", "reducedMotion", "screenShake", "damageNumbers", "crt", "faded"];

export function sanitizeItem(v: unknown): Item | null {
  const o = obj(v);
  const slot = oneOf(o?.slot, SLOTS), rarity = oneOf(o?.rarity, RARITIES);
  if (!o || !slot || !rarity || typeof o.id !== "number" || !Number.isSafeInteger(o.id) || o.id < 1) return null;
  const affixes: Affix[] = [];
  for (const a of arr(o.affixes, 8)) {
    const affix = obj(a), stat = oneOf(affix?.stat, STATS);
    if (affix && stat) affixes.push(Object.freeze({ stat, value: num(affix.value, -1000, 1000, 0) }));
  }
  const power = oneOf(o.power, POWER_IDS) ?? undefined;
  return Object.freeze({
    id: o.id, name: str(o.name, 60, "Nameless Relic"), slot, rarity, ilvl: int(o.ilvl, 1, 999, 1), affixes: Object.freeze(affixes),
    power, cursed: o.cursed === true, flavor: typeof o.flavor === "string" ? o.flavor.slice(0, 200) : undefined,
  });
}

function sanitizeSummary(v: unknown): RunSummary | null {
  const o = obj(v), score = obj(o?.score), outcome = oneOf(o?.outcome, OUTCOMES);
  if (!o || !score || !outcome) return null;
  const lines = arr(score.lines, 16).map(obj).filter((l): l is Loose => Boolean(l))
    .map(l => Object.freeze({ id: str(l.id, 30), label: str(l.label, 60), detail: str(l.detail, 80), points: int(l.points, -1e9, 1e9, 0) }));
  return Object.freeze({
    outcome, friendLabel: str(o.friendLabel, 60), family: str(o.family, 30), depth: int(o.depth, 1, 999, 1), kills: int(o.kills, 0, 1e6),
    elites: int(o.elites, 0, 1e6), bosses: arr(o.bosses, 20).map(b => str(b, 40)), rarest: sanitizeItem(o.rarest),
    rfStarted: int(o.rfStarted, 0, MAX_BALANCE), rfEarned: int(o.rfEarned, 0, MAX_BALANCE), rfSpent: int(o.rfSpent, 0, MAX_BALANCE),
    rfRemaining: int(o.rfRemaining, 0, MAX_BALANCE), timeMs: num(o.timeMs, 0, 1e9), level: int(o.level, 1, 999, 1),
    secured: int(o.secured, 0, 999), lost: int(o.lost, 0, 999), seed: int(o.seed, 0, 2 ** 32), transactions: [],
    score: Object.freeze({ lines, subtotal: int(score.subtotal, -1e9, 1e9, 0), multiplier: num(score.multiplier, 0, 10, 1), outcome, total: int(score.total, -1e9, 1e9, 0) }),
    lifetimeScore: int(o.lifetimeScore, 0, 1e12), best: o.best === true, guardians: int(o.guardians, 0, 999),
  });
}

/** Rebuild a save from untrusted JSON. Returns null when it is not a save for this Friend. */
export function sanitizeSave(raw: unknown, friendId: string): SaveData | null {
  const o = obj(raw);
  if (!o || o.v !== SAVE_VERSION || o.friendId !== friendId) return null;
  const stash = arr(o.stash, MAX_STASH).map(sanitizeItem).filter((i): i is Item => Boolean(i));
  const ids = new Set<number>();
  const unique = stash.filter(i => !ids.has(i.id) && ids.add(i.id));
  const ledger: SavedTx[] = [];
  for (const t of arr(o.ledger, MAX_LEDGER)) {
    const tx = obj(t), kind = oneOf(tx?.kind, ["spend", "reward"] as const), category = oneOf(tx?.category, CATEGORIES);
    if (tx && kind && category) ledger.push({ id: int(tx.id, 1, 1e9, 1), kind, amount: int(tx.amount, 0, MAX_BALANCE), reason: str(tx.reason, 80), category, balanceAfter: int(tx.balanceAfter, 0, MAX_BALANCE) });
  }
  const codex: [string, CodexEntry][] = [];
  for (const e of arr(o.codex, 500)) {
    const [key, value] = Array.isArray(e) ? e : [];
    const entry = obj(value), slot = oneOf(entry?.slot, SLOTS), rarity = oneOf(entry?.rarity, RARITIES);
    if (typeof key === "string" && entry && slot && rarity) codex.push([key.slice(0, 80), { name: str(entry.name, 60), rarity, slot, count: int(entry.count, 1, 1e6, 1) }]);
  }
  const bestiary: SaveData["bestiary"] = [];
  for (const e of arr(o.bestiary, 64)) {
    const [kind, value] = Array.isArray(e) ? e : [];
    const record = obj(value);
    if (typeof kind === "string" && kind in LORE && record) bestiary.push([kind as BestiaryKind, { kills: int(record.kills, 0, 1e7), guardians: arr(record.guardians, 20).map(g => str(g, 40)) }]);
  }
  const owned = arr(o.owned, 64).filter((id): id is string => COSMETIC_IDS.includes(id as string));
  const wornIn = obj(o.worn) ?? {};
  const worn = { ...DEFAULT_COSMETICS };
  for (const slot of Object.keys(DEFAULT_COSMETICS) as CosmeticSlot[]) {
    const id = wornIn[slot];
    if (typeof id === "string" && owned.includes(id) && COSMETICS.some(c => c.id === id && c.slot === slot)) worn[slot] = id;
  }
  const settingsIn = obj(o.settings) ?? {};
  const settings: Partial<Settings> = {};
  for (const key of SETTINGS) if (typeof settingsIn[key] === "boolean") settings[key] = settingsIn[key] as boolean;
  const heirloom = typeof o.heirloomId === "number" && unique.some(i => i.id === o.heirloomId) ? o.heirloomId : null;
  return {
    v: SAVE_VERSION, friendId, savedAt: num(o.savedAt, 0, 1e14, 0), balance: int(o.balance, 0, MAX_BALANCE), ledger, stash: unique,
    heirloomId: heirloom, codex, hall: arr(o.hall, MAX_HALL).map(sanitizeSummary).filter((s): s is RunSummary => Boolean(s)),
    runsStarted: int(o.runsStarted, 0, 1e7), lifetimeScore: int(o.lifetimeScore, 0, 1e12), bestScore: int(o.bestScore, 0, 1e12),
    bestiary, owned, worn, settings,
    blessing: BLESSINGS.some(b => b.id === o.blessing) ? o.blessing as string : null,
    campTier: int(o.campTier, 0, CAMP_TIERS.length - 1, 0),
  };
}

// ─── The channel to the trusted host page ───────────────────────────────────

/** What the host tells the game about saving: where it saves (public Friend wallet address), and the save. */
export type SaveInfo = { available: boolean; wallet: string | null; data: SaveData | null };

let requestId = 0;
function ask<T>(message: Record<string, unknown>, reply: string, timeoutMs: number): Promise<T | null> {
  const parent = window.parent;
  if (!parent || parent === window) return Promise.resolve(null);
  const id = `${Date.now().toString(36)}-${++requestId}`;
  return new Promise(resolve => {
    const done = (value: T | null) => { window.removeEventListener("message", listen); clearTimeout(timer); resolve(value); };
    const listen = (event: MessageEvent) => {
      if (event.source !== parent || event.data?.type !== reply || event.data.id !== id) return;
      done(event.data as T);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    window.addEventListener("message", listen);
    parent.postMessage({ ...message, id }, "*");
  });
}

/** Ask the host for this Friend's save. Without The Descent's host (e.g. the SDK's own dev runtime), play is session-only. */
export async function loadSave(friendId: string): Promise<SaveInfo> {
  const reply = await ask<{ ok: boolean; wallet?: string; data?: string | null }>({ type: "descent:load" }, "descent:loaded", 1500);
  if (!reply?.ok) return { available: false, wallet: null, data: null };
  let data: SaveData | null;
  try { data = reply.data ? sanitizeSave(JSON.parse(reply.data), friendId) : null; } catch { data = null; }
  return { available: true, wallet: typeof reply.wallet === "string" ? reply.wallet : null, data };
}

export async function writeSave(save: SaveData): Promise<boolean> {
  const data = JSON.stringify(save);
  if (data.length > MAX_SAVE_CHARS) return false;
  const reply = await ask<{ ok: boolean }>({ type: "descent:save", data }, "descent:saved", 3000);
  return Boolean(reply?.ok);
}
