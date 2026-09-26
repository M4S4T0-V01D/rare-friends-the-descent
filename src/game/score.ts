import type { Item, Rarity } from "./items";

/**
 * Run scoring. A descent is scored on how deep the Friend went, what it killed, how strong it
 * grew, what it was carrying at the end and how much RF it earned. How the run ended then
 * multiplies everything: escaping with the loot pays best, falling in the dark costs you.
 */
export type ScoreOutcome = "fallen" | "escaped" | "conquered" | "abandoned" | "running";

export const RARITY_POINTS: Readonly<Record<Rarity, number>> = {
  common: 10, uncommon: 30, rare: 75, epic: 180, legendary: 450, mythic: 1200,
};

export const OUTCOME_MULTIPLIER: Readonly<Record<ScoreOutcome, number>> = {
  conquered: 2, escaped: 1.5, running: 1, fallen: 0.75, abandoned: 0.5,
};

export const OUTCOME_LABEL: Readonly<Record<ScoreOutcome, string>> = {
  conquered: "Conquered the Descent", escaped: "Escaped with the loot", running: "In the dungeon", fallen: "Fell in the dark", abandoned: "Abandoned the run",
};

export const SCORE_POINTS = {
  depth: 500, depthSquared: 50, kill: 10, elite: 60, guardian: 400, miniBoss: 1000, boss: 3000, secretBoss: 2500, level: 120, rfEarned: 15, cursedBonus: 1.25,
} as const;

/** Each act's boss is worth more than the last; the First Friend most of all. Wardens and unknown names score as mini-bosses. */
export const BOSS_POINTS: Readonly<Record<string, number>> = {
  "THE RARE BEAST": 3000, "THE UNMINTED": 2500, "THE ARCHIVIST": 3500, "THE FORGEMASTER": 4000, "THE MOTHER BLOOM": 4500,
  "THE DROWNED CANTOR": 5000, "THE HOUR ENGINE": 5500, "THE REFLECTION": 6000, "THE FIRST FRIEND": 10000,
};

export type ScoreInput = Readonly<{
  depth: number; kills: number; elites: number; bosses: readonly string[]; level: number;
  /** Guardians (mini-bosses) slain. Optional so older callers still score. */
  guardians?: number;
  items: readonly Item[]; rfEarned: number; outcome: ScoreOutcome;
}>;
export type ScoreLine = Readonly<{ id: string; label: string; detail: string; points: number }>;
export type RunScore = Readonly<{ lines: readonly ScoreLine[]; subtotal: number; multiplier: number; outcome: ScoreOutcome; total: number }>;

export function itemPoints(item: Item): number {
  return Math.round(RARITY_POINTS[item.rarity] * (item.cursed ? SCORE_POINTS.cursedBonus : 1));
}

export function scoreRun(input: ScoreInput): RunScore {
  const P = SCORE_POINTS;
  const bossPoints = input.bosses.reduce((total, name) => total + (BOSS_POINTS[name] ?? P.miniBoss), 0);
  const loot = input.items.reduce((total, item) => total + itemPoints(item), 0);
  const best = [...input.items].sort((a, b) => itemPoints(b) - itemPoints(a))[0];
  const lines: ScoreLine[] = [
    { id: "depth", label: "Depth reached", detail: `depth ${input.depth}`, points: input.depth * P.depth + input.depth ** 2 * P.depthSquared },
    { id: "kills", label: "Enemies slain", detail: `${input.kills} × ${P.kill}`, points: input.kills * P.kill },
    { id: "elites", label: "Elites slain", detail: `${input.elites} × ${P.elite}`, points: input.elites * P.elite },
    { id: "guardians", label: "Guardians slain", detail: `${input.guardians ?? 0} × ${P.guardian}`, points: (input.guardians ?? 0) * P.guardian },
    { id: "bosses", label: "Bosses defeated", detail: input.bosses.length ? `${input.bosses.length} boss${input.bosses.length === 1 ? "" : "es"}` : "none", points: bossPoints },
    { id: "level", label: "Friend level", detail: `level ${input.level}`, points: (input.level - 1) * P.level },
    { id: "loot", label: "Loot on your Friend", detail: input.items.length ? `${input.items.length} item${input.items.length === 1 ? "" : "s"}${best ? `, best ${best.name}` : ""}` : "nothing", points: loot },
    { id: "rf", label: "RF earned", detail: `${input.rfEarned} RF × ${P.rfEarned}`, points: input.rfEarned * P.rfEarned },
  ];
  const subtotal = lines.reduce((total, line) => total + line.points, 0);
  const multiplier = OUTCOME_MULTIPLIER[input.outcome];
  return { lines, subtotal, multiplier, outcome: input.outcome, total: Math.round(subtotal * multiplier) };
}

export function formatScore(points: number): string {
  return Math.round(points).toLocaleString("en-US");
}
