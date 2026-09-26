import { hash32 } from "./rng";

/**
 * Every Rare Friend fights differently. The kit is derived deterministically from the Friend's
 * Generations family and its on-chain art seed, so the same Friend always gets the same kit and
 * two Friends almost never share one.
 */
export type AttackStyle = Readonly<{ id: "slash" | "lunge" | "whirl"; name: string; text: string; arc: number; range: number; cd: number; dmg: number; knock: number; step: number }>;
export type BoltStyle = Readonly<{ id: "bolt" | "shards" | "lance"; name: string; text: string; count: number; spread: number; speed: number; dmg: number; life: number; pierce: number; energy: number; cd: number; radius: number; color: string }>;
export type DodgeStyle = Readonly<{ id: "dash" | "double"; name: string; text: string; charges: number; distance: number }>;
export type SignatureId = "boneSpikes" | "masquerade" | "rally" | "mitosis" | "chaosRift" | "phaseBlink" | "earthshatter" | "prismBurst" | "voidPull" | "nova";
export type Signature = Readonly<{ id: SignatureId; name: string; text: string; energy: number; cd: number; color: string }>;
export type BarFrame = "square" | "round" | "diamond" | "notched";

/** Short labels for the action bar and touch buttons. */
export const SHORT: Readonly<Record<string, string>> = {
  slash: "SLASH", lunge: "LUNGE", whirl: "WHIRL", bolt: "BOLT", shards: "SHARDS", lance: "LANCE", dash: "DASH", double: "STEP",
  boneSpikes: "SPIKES", masquerade: "MASK", rally: "RALLY", mitosis: "SPORES", chaosRift: "RIFT", phaseBlink: "BLINK",
  earthshatter: "SHATTER", prismBurst: "PRISM", voidPull: "PULL", nova: "NOVA",
};

export type FriendKit = Readonly<{
  attack: AttackStyle; bolt: BoltStyle; dodge: DodgeStyle; signature: Signature;
  accent: string; frame: BarFrame; seed: number;
}>;

export const ATTACKS: readonly AttackStyle[] = [
  { id: "slash", name: "Rune Slash", text: "Wide three-hit combo arc.", arc: 1.95, range: 76, cd: 0.36, dmg: 1, knock: 80, step: 0 },
  { id: "lunge", name: "Piercing Lunge", text: "Narrow, long-reaching thrust that steps forward.", arc: 0.95, range: 112, cd: 0.4, dmg: 1.2, knock: 110, step: 34 },
  { id: "whirl", name: "Whirl", text: "Spins to hit everything around you.", arc: Math.PI * 2, range: 72, cd: 0.46, dmg: 0.85, knock: 90, step: 0 },
];

export const BOLTS: readonly BoltStyle[] = [
  { id: "bolt", name: "Void Bolt", text: "A fast bolt of void energy.", count: 1, spread: 0.14, speed: 620, dmg: 0.85, life: 0.85, pierce: 0, energy: 16, cd: 0.3, radius: 7, color: "#3ef0ff" },
  { id: "shards", name: "Scatter Shards", text: "A short-range fan of three shards.", count: 3, spread: 0.26, speed: 560, dmg: 0.45, life: 0.5, pierce: 0, energy: 18, cd: 0.34, radius: 6, color: "#ff8fb3" },
  { id: "lance", name: "Piercing Lance", text: "A slow-charging lance that pierces 3 enemies.", count: 1, spread: 0.1, speed: 900, dmg: 1.25, life: 0.7, pierce: 3, energy: 24, cd: 0.55, radius: 8, color: "#ccff00" },
];

export const DODGES: readonly DodgeStyle[] = [
  { id: "dash", name: "Dash", text: "One long dash.", charges: 1, distance: 1 },
  { id: "double", name: "Double Step", text: "Two shorter dashes before recharging.", charges: 2, distance: 0.7 },
];

export const SIGNATURES: Readonly<Record<SignatureId, Signature>> = {
  boneSpikes: { id: "boneSpikes", name: "Bone Spikes", text: "Three spikes erupt in a fan ahead of you.", energy: 35, cd: 3.2, color: "#e9e4ff" },
  masquerade: { id: "masquerade", name: "Masquerade", text: "1.5 s untouchable and +40% crit for 4 s.", energy: 40, cd: 7, color: "#bb66ff" },
  rally: { id: "rally", name: "Rally", text: "Heal 18% HP and shove enemies back.", energy: 45, cd: 8, color: "#6ee07a" },
  mitosis: { id: "mitosis", name: "Mitosis", text: "Eight piercing spores burst outward.", energy: 38, cd: 3.6, color: "#b9ff6b" },
  chaosRift: { id: "chaosRift", name: "Chaos Rift", text: "Four unstable blasts land around your aim.", energy: 40, cd: 4, color: "#ff9a3c" },
  phaseBlink: { id: "phaseBlink", name: "Phase Blink", text: "Teleport ahead, bursting at both ends.", energy: 30, cd: 3, color: "#8fe3ff" },
  earthshatter: { id: "earthshatter", name: "Earthshatter", text: "A huge, slow slam with massive damage.", energy: 50, cd: 5.5, color: "#ffb02e" },
  prismBurst: { id: "prismBurst", name: "Prism Burst", text: "Fires twelve bolts in every direction.", energy: 42, cd: 4, color: "#ff3d7f" },
  voidPull: { id: "voidPull", name: "Void Pull", text: "Drag enemies in, then detonate.", energy: 42, cd: 4.5, color: "#ccff00" },
  nova: { id: "nova", name: "Nova", text: "A burst of force around you.", energy: 40, cd: 3.5, color: "#ccff00" },
};

const FAMILY_SIGNATURE: Readonly<Record<string, SignatureId>> = {
  Skeleton: "boneSpikes", Mask: "masquerade", Family: "rally", Cellular: "mitosis", Asymmetry: "chaosRift",
  Hoverer: "phaseBlink", Colossus: "earthshatter", Sparkling: "prismBurst", Hollow: "voidPull",
};

const ACCENTS = ["#ccff00", "#3ef0ff", "#ff3d7f", "#ffb02e", "#bb66ff", "#6ee07a", "#ff9a3c", "#8fe3ff"] as const;
const FRAMES: readonly BarFrame[] = ["square", "round", "diamond", "notched"];

export function friendKit(family: string, seed: number): FriendKit {
  const h = hash32(seed ^ 0x5eed);
  return {
    attack: ATTACKS[h % 3],
    bolt: BOLTS[(h >>> 4) % 3],
    dodge: DODGES[(h >>> 8) % 2],
    signature: SIGNATURES[FAMILY_SIGNATURE[family] ?? "nova"],
    accent: ACCENTS[(h >>> 12) % ACCENTS.length],
    frame: FRAMES[(h >>> 16) % FRAMES.length],
    seed,
  };
}
