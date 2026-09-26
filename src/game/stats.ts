import type { Item, PowerId, StatKey } from "./items";

export type ModKey = StatKey | "novaPower" | "boltPower" | "potionMax";
export type Mods = Partial<Record<ModKey, number>>;

export type Stats = Readonly<{
  maxHp: number; atk: number; armor: number; critChance: number; critDmg: number; moveSpeed: number;
  energyMax: number; energyRegen: number; luck: number; dodgeCd: number; evasion: number;
  healOnKill: number; burnChance: number; projectiles: number; lowHpDmg: number; lifesteal: number;
  rfFind: number; dmgMult: number; damageTaken: number; lootDrops: number; potionMax: number;
  novaMult: number; boltMult: number; powers: ReadonlySet<PowerId>;
}>;

/** A timed shrine blessing, curse or run-long boon. Room counts tick when entering an unexplored room. */
export type Buff = {
  id: string; name: string; kind: "blessing" | "curse"; mods: Mods;
  rooms?: number; floors?: number; run?: boolean; color: string; icon: string;
};

/** Each Generations family grants its Friend a small passive, so the hero you pick matters. */
export const FAMILY_TRAITS: Readonly<Record<string, { name: string; text: string; mods: Mods }>> = {
  Skeleton: { name: "Hollow Bones", text: "+6 armor", mods: { armor: 6 } },
  Mask: { name: "Many Faces", text: "+5% critical chance", mods: { critChance: 5 } },
  Family: { name: "Kinship", text: "+1 potion capacity", mods: { potionMax: 1 } },
  Cellular: { name: "Mitosis", text: "Heal 2 HP on kill, +10 max HP", mods: { healOnKill: 2, hpFlat: 10 } },
  Asymmetry: { name: "Off-Balance", text: "+25% critical damage", mods: { critDmg: 25 } },
  Hoverer: { name: "Weightless", text: "+10% movement speed, +8% dodge", mods: { moveSpeed: 10, dodge: 8 } },
  Colossus: { name: "Titanic", text: "+20% max HP", mods: { hpPct: 20 } },
  Sparkling: { name: "Glimmer", text: "+10% loot chance, +10% RF find", mods: { luck: 10, rfFind: 10 } },
  Hollow: { name: "Echo Chamber", text: "+25% energy regeneration", mods: { energyRegen: 25 } },
};
export const DEFAULT_TRAIT = { name: "Rare Spirit", text: "+5% damage", mods: { dmgPct: 5 } as Mods };

export type BoonId =
  | "vitality" | "might" | "keenEye" | "cruelty" | "swiftness" | "voidAffinity" | "twinCast" | "resonance"
  | "ironSkin" | "fortune" | "bloodthirst" | "emberTouch" | "evasion" | "lastLight" | "potionBelt" | "siphon";

export const BOONS: Readonly<Record<BoonId, { name: string; text: string; mods: Mods; max?: number }>> = {
  vitality: { name: "Vitality", text: "+20 max HP", mods: { hpFlat: 20 } },
  might: { name: "Might", text: "+10% attack", mods: { atkPct: 10 } },
  keenEye: { name: "Keen Eye", text: "+4% critical chance", mods: { critChance: 4 } },
  cruelty: { name: "Cruelty", text: "+25% critical damage", mods: { critDmg: 25 } },
  swiftness: { name: "Swiftness", text: "+8% movement speed", mods: { moveSpeed: 8 }, max: 4 },
  voidAffinity: { name: "Void Affinity", text: "Void Bolt +25% damage, +15% energy regen", mods: { boltPower: 25, energyRegen: 15 } },
  twinCast: { name: "Twin Cast", text: "Void Bolt fires +1 projectile", mods: { extraProjectile: 1 }, max: 2 },
  resonance: { name: "Resonance", text: "Nova +25% damage and radius", mods: { novaPower: 25 }, max: 4 },
  ironSkin: { name: "Iron Skin", text: "+6 armor", mods: { armor: 6 } },
  fortune: { name: "Fortune", text: "+8% loot chance, +10% RF find", mods: { luck: 8, rfFind: 10 } },
  bloodthirst: { name: "Bloodthirst", text: "Heal 4 HP on kill", mods: { healOnKill: 4 } },
  emberTouch: { name: "Ember Touch", text: "12% chance to burn enemies", mods: { burnChance: 12 } },
  evasion: { name: "Evasion", text: "+15% dodge", mods: { dodge: 15 }, max: 3 },
  lastLight: { name: "Last Light", text: "+30% damage while below 35% HP", mods: { lowHpDmg: 30 } },
  potionBelt: { name: "Potion Belt", text: "+1 potion capacity and a free potion", mods: { potionMax: 1 }, max: 3 },
  siphon: { name: "Siphon", text: "+2% life steal", mods: { lifesteal: 2 }, max: 4 },
};

export function addMods(total: Mods, mods: Mods, times = 1) {
  for (const [key, value] of Object.entries(mods) as [ModKey, number][]) total[key] = (total[key] ?? 0) + value * times;
}

export function computeStats(level: number, trait: Mods, boons: ReadonlyMap<BoonId, number>, items: readonly Item[], buffs: readonly Buff[]): Stats {
  const m: Mods = {};
  addMods(m, trait);
  for (const [id, count] of boons) addMods(m, BOONS[id].mods, count);
  const powers = new Set<PowerId>();
  for (const item of items) {
    for (const affix of item.affixes) addMods(m, { [affix.stat]: affix.value });
    if (item.power) powers.add(item.power);
  }
  for (const buff of buffs) addMods(m, buff.mods);
  const v = (key: ModKey) => m[key] ?? 0;
  const crown = powers.has("firstFriend") ? 1.15 : 1;
  let hpPct = v("hpPct");
  let dmgPct = v("dmgPct");
  if (powers.has("glassHeart")) { hpPct -= 15; dmgPct += 40; }
  const lowHpDmg = v("lowHpDmg") + (powers.has("lastStand") ? 60 : 0);
  const lifesteal = v("lifesteal") + (powers.has("vampireCrown") ? 5 : 0);
  const healOnKill = v("healOnKill") + (powers.has("vampireCrown") ? 3 : 0);
  const dodge = v("dodge");
  return {
    maxHp: Math.max(20, Math.round((110 + 8 * (level - 1) + v("hpFlat")) * (1 + hpPct / 100) * crown)),
    atk: Math.max(1, Math.round((20 + 1.6 * (level - 1) + v("atkFlat")) * (1 + v("atkPct") / 100) * crown)),
    armor: Math.max(0, Math.round((5 + (level - 1) + v("armor")) * crown)),
    critChance: Math.min(75, 5 + v("critChance")),
    critDmg: 150 + v("critDmg"),
    moveSpeed: 200 * Math.min(1.6, Math.max(0.6, 1 + v("moveSpeed") / 100)) * (crown > 1 ? 1.05 : 1),
    energyMax: 100,
    energyRegen: 14 * (1 + v("energyRegen") / 100),
    luck: Math.max(0, v("luck") * crown + (crown > 1 ? 5 : 0)),
    dodgeCd: 1.1 / (1 + Math.max(0, dodge) / 100) * (powers.has("phaseWalker") ? 0.6 : 1),
    evasion: Math.min(30, Math.max(0, dodge * 0.5)),
    healOnKill,
    burnChance: powers.has("burningSoul") ? 100 : Math.min(100, v("burnChance")),
    projectiles: 1 + v("extraProjectile") + (powers.has("twinBolt") ? 2 : 0),
    lowHpDmg,
    lifesteal: Math.min(25, lifesteal),
    rfFind: v("rfFind") + (powers.has("coinEater") ? 50 : 0),
    dmgMult: Math.max(0.2, 1 + dmgPct / 100),
    damageTaken: Math.max(0.3, 1 + v("damageTakenPct") / 100),
    lootDrops: v("lootDrops"),
    potionMax: 3 + v("potionMax"),
    novaMult: 1 + v("novaPower") / 100,
    boltMult: 1 + v("boltPower") / 100,
    powers,
  };
}

/** XP needed to go from `level` to `level + 1`. */
export const xpForLevel = (level: number) => Math.round(40 + 30 * (level - 1) + 8 * (level - 1) ** 2);
