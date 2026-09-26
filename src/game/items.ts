import type { Rng } from "./rng";

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const;
export type Rarity = typeof RARITIES[number];
export const rarityRank = (rarity: Rarity) => RARITIES.indexOf(rarity);

export const RARITY_STYLE: Readonly<Record<Rarity, { label: string; color: string; glow: string }>> = {
  common: { label: "COMMON", color: "#b9b3c9", glow: "#6d6780" },
  uncommon: { label: "UNCOMMON", color: "#6ee07a", glow: "#1f7a33" },
  rare: { label: "RARE", color: "#4fb0ff", glow: "#1d4f96" },
  epic: { label: "EPIC", color: "#bb66ff", glow: "#5a1f96" },
  legendary: { label: "LEGENDARY", color: "#ffb02e", glow: "#a24d00" },
  mythic: { label: "MYTHIC", color: "#ff3d7f", glow: "#ccff00" },
};

export const SLOTS = ["weapon", "relic", "charm", "ring", "mask"] as const;
export type Slot = typeof SLOTS[number];
export const SLOT_LABEL: Readonly<Record<Slot, string>> = { weapon: "Weapon", relic: "Relic", charm: "Charm", ring: "Ring", mask: "Mask" };

export type StatKey =
  | "atkPct" | "atkFlat" | "hpFlat" | "hpPct" | "armor" | "critChance" | "critDmg" | "moveSpeed"
  | "healOnKill" | "burnChance" | "extraProjectile" | "luck" | "dodge" | "lowHpDmg" | "lifesteal"
  | "energyRegen" | "rfFind" | "dmgPct" | "damageTakenPct" | "lootDrops";

export type Affix = Readonly<{ stat: StatKey; value: number }>;

export type PowerId =
  | "burningSoul" | "twinBolt" | "vampireCrown" | "glassHeart" | "novaEcho" | "phaseWalker"
  | "runeOrbit" | "lastStand" | "coinEater" | "executioner"
  | "voidHeart" | "rareEdge" | "firstFriend" | "nullSignal";

export type Item = Readonly<{
  id: number;
  name: string;
  slot: Slot;
  rarity: Rarity;
  /** Item level: the depth it dropped on. */
  ilvl: number;
  affixes: readonly Affix[];
  power?: PowerId;
  cursed?: boolean;
  flavor?: string;
}>;

type StatFormat = { label: (v: number) => string; roll: [number, number]; integer?: boolean };
/** Per-stat base rolls, scaled by rarity. Values are percentages unless noted. */
export const STAT_INFO: Readonly<Record<StatKey, StatFormat>> = {
  atkPct: { label: v => `${sign(v)}${v}% attack`, roll: [6, 11], integer: true },
  atkFlat: { label: v => `${sign(v)}${v} attack`, roll: [2, 5], integer: true },
  hpFlat: { label: v => `${sign(v)}${v} max HP`, roll: [8, 16], integer: true },
  hpPct: { label: v => `${sign(v)}${v}% max HP`, roll: [5, 9], integer: true },
  armor: { label: v => `${sign(v)}${v} armor`, roll: [2, 5], integer: true },
  critChance: { label: v => `${sign(v)}${v}% critical chance`, roll: [3, 5], integer: true },
  critDmg: { label: v => `${sign(v)}${v}% critical damage`, roll: [12, 25], integer: true },
  moveSpeed: { label: v => `${sign(v)}${v}% movement speed`, roll: [5, 10], integer: true },
  healOnKill: { label: v => `Heal ${v} HP on kill`, roll: [2, 4], integer: true },
  burnChance: { label: v => `${v}% chance to burn enemies`, roll: [8, 14], integer: true },
  extraProjectile: { label: v => `+${v} extra projectile`, roll: [1, 1], integer: true },
  luck: { label: v => `${sign(v)}${v}% loot chance`, roll: [5, 10], integer: true },
  dodge: { label: v => `${sign(v)}${v}% dodge`, roll: [5, 10], integer: true },
  lowHpDmg: { label: v => `+${v}% damage while below 35% HP`, roll: [15, 30], integer: true },
  lifesteal: { label: v => `${v}% life steal`, roll: [1, 3], integer: true },
  energyRegen: { label: v => `${sign(v)}${v}% energy regeneration`, roll: [10, 20], integer: true },
  rfFind: { label: v => `${sign(v)}${v}% RF find`, roll: [10, 20], integer: true },
  dmgPct: { label: v => `${sign(v)}${v}% damage`, roll: [5, 10], integer: true },
  damageTakenPct: { label: v => `${v > 0 ? `${v}% more` : `${-v}% less`} damage taken`, roll: [5, 10], integer: true },
  lootDrops: { label: v => `${sign(v)}${v}% item drop chance`, roll: [10, 20], integer: true },
};
function sign(v: number) { return v >= 0 ? "+" : ""; }

export const POWERS: Readonly<Record<PowerId, { name: string; text: string; slot: Slot; mythic?: boolean }>> = {
  burningSoul: { name: "Cinderheart", text: "Every hit sets enemies ablaze.", slot: "relic" },
  twinBolt: { name: "The Split Signal", text: "Void Bolt fires 2 extra projectiles.", slot: "weapon" },
  vampireCrown: { name: "Crown of Red Thirst", text: "5% life steal. Heal 3 HP on every kill.", slot: "mask" },
  glassHeart: { name: "Glass Heart", text: "+40% damage, but 15% less max HP.", slot: "charm" },
  novaEcho: { name: "Echo Engine", text: "Nova detonates a second time.", slot: "relic" },
  phaseWalker: { name: "Ghoststep Sigil", text: "Dodge recovers 40% faster and leaves a searing trail.", slot: "charm" },
  runeOrbit: { name: "Orrery of Runes", text: "Three runes orbit you, cutting anything they touch.", slot: "ring" },
  lastStand: { name: "Last Light", text: "+60% damage while below 35% HP.", slot: "ring" },
  coinEater: { name: "Coin-Eater's Maw", text: "Enemies are 50% more likely to drop RF (still +1 RF each).", slot: "mask" },
  executioner: { name: "Headsman's Grin", text: "Double damage to enemies below 25% HP.", slot: "weapon" },
  voidHeart: { name: "VOID HEART", text: "Runes orbit you, and every kill bursts into void flame.", slot: "relic", mythic: true },
  rareEdge: { name: "THE RARE EDGE", text: "Every 4th strike is a guaranteed critical that fires a rune wave.", slot: "weapon", mythic: true },
  firstFriend: { name: "CROWN OF THE FIRST FRIEND", text: "+15% attack, max HP, armor, speed and luck.", slot: "mask", mythic: true },
  nullSignal: { name: "NULL SIGNAL", text: "Dodging releases a Nova and extends invulnerability.", slot: "charm", mythic: true },
};

const BASE_NAMES: Readonly<Record<Slot, readonly string[]>> = {
  weapon: ["Rune Claw", "Void Fang", "Grave Hook", "Neon Sickle", "Bone Scepter", "Glitch Blade", "Hollow Cleaver", "Signal Lance"],
  relic: ["Cracked Circuit", "Pale Idol", "Ember Core", "Void Lantern", "Choir Shard", "Saint's Battery"],
  charm: ["Knot of Teeth", "Moth Wing", "Static Totem", "Candle Stub", "Lucky Bolt", "Wax Seal"],
  ring: ["Ring of Ash", "Iron Loop", "Signal Band", "Coil of Night", "Bone Ring"],
  mask: ["Porcelain Mask", "Glitch Visor", "Plague Veil", "Grin of the Deep", "Faceless Helm", "Moth Mask"],
};
const PREFIX: Partial<Record<StatKey, string>> = {
  atkPct: "Savage", atkFlat: "Honed", critChance: "Keen", critDmg: "Cruel", moveSpeed: "Fleet", healOnKill: "Hungering",
  burnChance: "Smoldering", extraProjectile: "Splitting", luck: "Lucky", dodge: "Phantom", lowHpDmg: "Desperate",
  lifesteal: "Leeching", armor: "Warded", hpFlat: "Stout", hpPct: "Vital", energyRegen: "Humming", rfFind: "Greedy",
  dmgPct: "Wicked", lootDrops: "Scavenger's",
};
const SUFFIXES = ["of the Descent", "of Cinders", "of the Hollow Choir", "of Static", "of Teeth", "of the Night Signal", "of Old Stone", "of the Last Door"];
const FLAVOR: Readonly<Record<Rarity, readonly string[]>> = {
  common: ["Still warm.", "Someone carried this further than you."],
  uncommon: ["It hums when enemies are near.", "Scratched with tally marks."],
  rare: ["The runes rearrange when unobserved.", "Found clutched in a Friend-shaped hollow."],
  epic: ["It remembers every hand that held it.", "The Crypt tried to keep this one."],
  legendary: ["A relic from before the Descent had a bottom.", "The light it gives off is not light."],
  mythic: ["It was here before the dungeon. It will be here after.", "It is not an item. It is an invitation."],
};

/** Stats a slot prefers, so weapons roll offense and masks roll defense more often. */
const SLOT_BIAS: Readonly<Record<Slot, readonly StatKey[]>> = {
  weapon: ["atkPct", "atkFlat", "critChance", "critDmg", "burnChance", "extraProjectile", "lifesteal", "dmgPct"],
  relic: ["dmgPct", "energyRegen", "burnChance", "extraProjectile", "hpFlat", "lowHpDmg", "luck"],
  charm: ["luck", "moveSpeed", "dodge", "healOnKill", "rfFind", "lootDrops", "critChance"],
  ring: ["critChance", "critDmg", "atkPct", "lifesteal", "healOnKill", "lowHpDmg", "armor"],
  mask: ["hpFlat", "hpPct", "armor", "dodge", "healOnKill", "luck", "moveSpeed"],
};
const ALL_STATS = Object.keys(STAT_INFO).filter(key => key !== "damageTakenPct") as StatKey[];

const RARITY_SCALE: Readonly<Record<Rarity, { affixes: number; mult: number }>> = {
  common: { affixes: 1, mult: 1 },
  uncommon: { affixes: 2, mult: 1.15 },
  rare: { affixes: 3, mult: 1.35 },
  epic: { affixes: 3, mult: 1.6 },
  legendary: { affixes: 4, mult: 1.9 },
  mythic: { affixes: 4, mult: 2.3 },
};

let nextItemId = 1;
export const newItemId = () => nextItemId++;
/** Restored items keep their ids; new ones must never collide with them. */
export const reserveItemIds = (maxId: number) => { nextItemId = Math.max(nextItemId, maxId + 1); };

/** Roll a rarity. `boost` shifts the curve upward (luck, depth, shrines); `min` sets a floor. */
export function rollRarity(rng: Rng, boost = 0, min: Rarity = "common"): Rarity {
  const b = Math.max(0, boost);
  const weights: [Rarity, number][] = [
    ["common", Math.max(8, 52 - b * 26)],
    ["uncommon", 30 + b * 4],
    ["rare", 12 + b * 9],
    ["epic", 4.2 + b * 6],
    ["legendary", 1.3 + b * 3],
    ["mythic", 0.18 + b * 0.8],
  ];
  const floor = rarityRank(min);
  return rng.weighted(weights.filter(([rarity]) => rarityRank(rarity) >= floor));
}

function rollAffix(rng: Rng, stat: StatKey, rarity: Rarity, ilvl: number): Affix {
  const info = STAT_INFO[stat];
  const depth = 1 + (ilvl - 1) * 0.03;
  let value = rng.range(info.roll[0], info.roll[1]) * RARITY_SCALE[rarity].mult * (stat === "extraProjectile" ? 1 : depth);
  if (stat === "extraProjectile") value = rarityRank(rarity) >= 4 ? 2 : 1;
  if (stat === "atkFlat" || stat === "hpFlat" || stat === "armor") value *= 1 + (ilvl - 1) * 0.08;
  return { stat, value: Math.max(1, Math.round(value)) };
}

export type ItemOptions = { slot?: Slot; rarity?: Rarity; cursed?: boolean; power?: PowerId };

export function generateItem(rng: Rng, ilvl: number, options: ItemOptions = {}): Item {
  const rarity = options.rarity ?? rollRarity(rng, ilvl * 0.08);
  let power = options.power;
  if (!power && rarity === "mythic") power = rng.pick((Object.keys(POWERS) as PowerId[]).filter(id => POWERS[id].mythic));
  if (!power && rarity === "legendary") power = rng.pick((Object.keys(POWERS) as PowerId[]).filter(id => !POWERS[id].mythic));
  const slot = power ? POWERS[power].slot : options.slot ?? rng.pick(SLOTS);
  const count = RARITY_SCALE[rarity].affixes;
  const chosen = new Set<StatKey>();
  const bias = SLOT_BIAS[slot];
  while (chosen.size < count) {
    const stat = rng.chance(0.7) ? rng.pick(bias) : rng.pick(ALL_STATS);
    // An extra projectile is a big deal; keep it off commons and rare elsewhere.
    if (stat === "extraProjectile" && (rarity === "common" || rng.chance(0.6))) continue;
    chosen.add(stat);
  }
  const affixes: Affix[] = [...chosen].map(stat => rollAffix(rng, stat, rarity, ilvl));
  if (slot === "weapon" && !chosen.has("atkFlat")) affixes.unshift({ stat: "atkFlat", value: Math.round((2 + ilvl * 0.9) * RARITY_SCALE[rarity].mult) });
  const cursed = options.cursed ?? false;
  if (cursed) {
    // A curse pays for itself: a large upside and a real downside.
    const upside = rng.pick<StatKey>(["atkPct", "dmgPct", "critChance", "moveSpeed", "luck"]);
    affixes.push({ stat: upside, value: Math.round(STAT_INFO[upside].roll[1] * 3.2) });
    const downside = rng.pick<Affix>([
      { stat: "hpPct", value: -rng.int(15, 25) },
      { stat: "damageTakenPct", value: rng.int(15, 25) },
      { stat: "armor", value: -rng.int(6, 10) },
      { stat: "moveSpeed", value: -rng.int(8, 14) },
    ]);
    if (downside.stat !== upside) affixes.push(downside);
  }
  const name = power ? POWERS[power].name : itemName(rng, slot, rarity, affixes, cursed);
  return Object.freeze({ id: newItemId(), name, slot, rarity, ilvl, affixes: Object.freeze(affixes), power, cursed: cursed || power === "glassHeart", flavor: rng.pick(FLAVOR[rarity]) });
}

function itemName(rng: Rng, slot: Slot, rarity: Rarity, affixes: readonly Affix[], cursed: boolean): string {
  const base = rng.pick(BASE_NAMES[slot]);
  const main = affixes.find(affix => affix.stat !== "atkFlat" && affix.value > 0) ?? affixes[0];
  const prefix = cursed ? "Cursed" : PREFIX[main.stat] ?? "Strange";
  if (rarityRank(rarity) >= 2) return `${prefix} ${base} ${rng.pick(SUFFIXES)}`;
  return rarity === "common" ? base : `${prefix} ${base}`;
}

export function describeAffix(affix: Affix): string { return STAT_INFO[affix.stat].label(affix.value); }

/** Rough power score used for auto-equip. Rarity dominates; depth and roll size break ties. */
export function itemScore(item: Item): number {
  return rarityRank(item.rarity) * 100 + item.ilvl * 6 + item.affixes.reduce((sum, affix) => sum + Math.sign(affix.value), 0) * 3 - (item.cursed ? 40 : 0);
}
