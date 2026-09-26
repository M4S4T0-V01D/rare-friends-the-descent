import type { RfTransaction } from "../economy/TokenEconomy";
import type { GateTier, ShrineTier } from "../economy/terms";
import type { EventKind } from "./content";
import type { Item } from "./items";
import type { RunScore } from "./score";
import type { BoonId } from "./stats";

export type Screen = "title" | "camp" | "run" | "summary";
export type CampTab = "descend" | "friend" | "wardrobe" | "bestiary" | "stash" | "codex" | "hall" | "rf";
export type RevealTone = "good" | "bad" | "neutral" | "legendary" | "mythic" | "void";
export type FollowUp = "arena-unminted" | "arena-cursed" | "merchant" | "loot";

export type Modal =
  | { kind: "none" }
  | { kind: "shrine"; id: number; tier: ShrineTier }
  | { kind: "gate"; id: number; tier: GateTier }
  | { kind: "merchant"; id: number }
  | { kind: "event"; id: number; event: EventKind }
  | { kind: "loot"; id: number }
  | { kind: "levelUp"; options: BoonId[] }
  | { kind: "reveal"; id?: number; title: string; subtitle?: string; lines: string[]; item?: Item; tone: RevealTone; suspense: number;
      rf?: number; followUp?: FollowUp; followId?: number; action?: string }
  | { kind: "waystone" }
  | { kind: "death" }
  | { kind: "character" }
  | { kind: "log" }
  | { kind: "pause" }
  | { kind: "bestiary" }
  | { kind: "shells"; id: number };

export type Settings = {
  sound: boolean; music: boolean; reducedMotion: boolean; screenShake: boolean; damageNumbers: boolean; crt: boolean;
  /** The Rare Friends look: near-black and white, faded color, dithered light. */
  faded: boolean;
};

export type Toast = { id: number; text: string; color: string; until: number };
export type Banner = { id: number; title: string; subtitle?: string; color: string; kind: "floor" | "boss" | "loot" | "clear" | "level" };

export type RunSummary = Readonly<{
  outcome: "fallen" | "escaped" | "conquered" | "abandoned";
  friendLabel: string; family: string; depth: number; kills: number; elites: number; bosses: readonly string[];
  rarest: Item | null; rfStarted: number; rfEarned: number; rfSpent: number; rfRemaining: number;
  timeMs: number; level: number; secured: number; lost: number; seed: number; transactions: readonly RfTransaction[];
  /** The run's score breakdown, and the session's running total after this run. */
  score: RunScore; lifetimeScore: number; best: boolean;
}>;

export type CodexEntry = { name: string; rarity: Item["rarity"]; slot: Item["slot"]; count: number };

export type UiState = Readonly<{
  screen: Screen; modal: Modal; busy: boolean;
  balance: number; rfFlash: { id: number; delta: number } | null; recent: readonly RfTransaction[];
  depth: number; floorName: string;
  toasts: readonly Toast[]; banner: Banner | null;
  settings: Settings; pendingLevels: number; touch: boolean; canInteract: boolean;
  summary: RunSummary | null; version: number;
  /** Camp menu tab open over the walkable camp, if any. */
  campPanel: CampTab | null;
}>;
