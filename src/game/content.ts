import { RF_COSTS, type GateTier, type MerchantOffer, type ShrineTier } from "../economy/terms";

/** An outcome row. Weights are basis points and every table sums to 10,000 (pinned by tests). */
export type OutcomeRow<Id extends string> = Readonly<{ id: Id; label: string; chanceBps: number }>;

export type ShrineOutcome =
  | "might2" | "heal15" | "swift" | "reveal" | "lootBonus"
  | "might3" | "fullHeal" | "crit" | "rareChest" | "revealSecret" | "lootFrenzy"
  | "legendary" | "mythic" | "voidBlessing" | "eliteHunt" | "voidCurse" | "secretBoss";

export const SHRINES: Readonly<Record<ShrineTier, {
  name: string; cost: number; tagline: string; blurb: string; color: string; outcomes: readonly OutcomeRow<ShrineOutcome>[];
}>> = {
  greed: {
    name: "SHRINE OF GREED", cost: RF_COSTS.shrine.greed, tagline: "Offer a small tribute.", color: "#ccff00",
    blurb: "A small blessing. Cheap, frequent, reliable.",
    outcomes: [
      { id: "might2", label: "+10% damage for 2 rooms", chanceBps: 2500 },
      { id: "heal15", label: "Heal 15% HP", chanceBps: 2000 },
      { id: "swift", label: "+5% movement speed this floor", chanceBps: 2000 },
      { id: "reveal", label: "Reveal the rooms of this floor", chanceBps: 1500 },
      { id: "lootBonus", label: "Small loot bonus", chanceBps: 2000 },
    ],
  },
  fate: {
    name: "SHRINE OF FATE", cost: RF_COSTS.shrine.fate, tagline: "Fate favors the reckless.", color: "#4fb0ff",
    blurb: "A medium-risk blessing, meaningfully stronger.",
    outcomes: [
      { id: "might3", label: "+20% damage for 3 rooms", chanceBps: 2200 },
      { id: "fullHeal", label: "Full heal", chanceBps: 1800 },
      { id: "crit", label: "+8% critical chance for 3 rooms", chanceBps: 1800 },
      { id: "rareChest", label: "Next chest holds guaranteed Rare+ loot", chanceBps: 1700 },
      { id: "revealSecret", label: "Reveal a secret room", chanceBps: 1000 },
      { id: "lootFrenzy", label: "Enemies drop far more loot for 3 rooms", chanceBps: 1500 },
    ],
  },
  void: {
    name: "SHRINE OF THE VOID", cost: RF_COSTS.shrine.void, tagline: "Give everything. Perhaps the Void gives something back.", color: "#ff3d7f",
    blurb: "A major gamble. It may cost almost everything you carry.",
    outcomes: [
      { id: "legendary", label: "Legendary loot", chanceBps: 2800 },
      { id: "mythic", label: "Mythic loot", chanceBps: 1000 },
      { id: "voidBlessing", label: "Void-Touched: a powerful blessing for the whole run", chanceBps: 2000 },
      { id: "eliteHunt", label: "Summon an elite carrying huge rewards", chanceBps: 1700 },
      { id: "voidCurse", label: "A dangerous curse", chanceBps: 1500 },
      { id: "secretBoss", label: "A secret boss answers", chanceBps: 1000 },
    ],
  },
};

export const GATES: Readonly<Record<GateTier, { name: string; cost: number; text: string; color: string }>> = {
  blood: { name: "BLOOD GATE", cost: RF_COSTS.gate.blood, color: "#c2283f", text: "Opens an optional combat room with better loot." },
  cursed: { name: "CURSED GATE", cost: RF_COSTS.gate.cursed, color: "#bb66ff", text: "Opens an elite encounter. Guaranteed higher-tier loot if you survive." },
  abyssal: { name: "ABYSSAL GATE", cost: RF_COSTS.gate.abyssal, color: "#ff3d7f", text: "Opens a dangerous bonus vault of powerful enemies. Mythic loot is possible." },
};

export type EventKind = "well" | "stranger" | "blackDoor" | "mirror" | "gambler" | "corpse" | "goldenDoor" | "lostFriend";
export type EventOutcome =
  | "heal" | "blessing" | "curse" | "smallLoot" | "nothing"
  | "revealSecret" | "disappear" | "relic" | "summonElite"
  | "secretBoss" | "mythicChest" | "cursedDungeon" | "horde"
  | "duplicate" | "destroy"
  | "loot" | "ambush" | "rf"
  | "epicPlus" | "gift";

export const EVENTS: Readonly<Record<EventKind, {
  name: string; cost: number; prompt: string; action: string; rare?: boolean; outcomes: readonly OutcomeRow<EventOutcome>[];
}>> = {
  well: {
    name: "THE WELL", cost: RF_COSTS.event.well, prompt: "Throw 5 RF into the well.", action: "Throw 5 RF",
    outcomes: [
      { id: "heal", label: "Heal", chanceBps: 3000 },
      { id: "blessing", label: "Blessing", chanceBps: 2000 },
      { id: "curse", label: "Curse", chanceBps: 1500 },
      { id: "smallLoot", label: "Small loot", chanceBps: 2000 },
      { id: "nothing", label: "Nothing", chanceBps: 1500 },
    ],
  },
  stranger: {
    name: "THE STRANGER", cost: RF_COSTS.event.stranger, prompt: "“Give 10 RF.” A hooded figure holds out a hand.", action: "Give 10 RF",
    outcomes: [
      { id: "revealSecret", label: "Reveals a secret room", chanceBps: 3000 },
      { id: "disappear", label: "Disappears", chanceBps: 2000 },
      { id: "relic", label: "Gives a relic", chanceBps: 3500 },
      { id: "summonElite", label: "Summons an elite enemy", chanceBps: 1500 },
    ],
  },
  blackDoor: {
    name: "THE BLACK DOOR", cost: RF_COSTS.event.blackDoor, prompt: "Nobody knows what is behind it.", action: "Open for 25 RF",
    outcomes: [
      { id: "secretBoss", label: "A secret boss", chanceBps: 2500 },
      { id: "mythicChest", label: "A Mythic chest", chanceBps: 2000 },
      { id: "cursedDungeon", label: "A cursed dungeon", chanceBps: 2500 },
      { id: "horde", label: "An enormous enemy encounter", chanceBps: 3000 },
    ],
  },
  mirror: {
    name: "THE MIRROR", cost: 0, prompt: "Duplicate your strongest item… or destroy it.", action: "Gaze into the mirror",
    outcomes: [
      { id: "duplicate", label: "Duplicate your strongest item", chanceBps: 5000 },
      { id: "destroy", label: "Destroy your strongest item", chanceBps: 5000 },
    ],
  },
  gambler: {
    name: "THE GAMBLER", cost: RF_COSTS.event.gambler, prompt: "“Spend 5 RF. Double it, or better. Or nothing.”", action: "Stake 5 RF",
    outcomes: [],
  },
  corpse: {
    name: "THE CORPSE", cost: 0, prompt: "A Friend-shaped husk, clutching something.", action: "Search the corpse",
    outcomes: [
      { id: "loot", label: "Loot", chanceBps: 4000 },
      { id: "ambush", label: "An ambush", chanceBps: 2500 },
      { id: "rf", label: "A few RF", chanceBps: 2000 },
      { id: "curse", label: "A curse", chanceBps: 1500 },
    ],
  },
  goldenDoor: {
    name: "THE GOLDEN DOOR", cost: RF_COSTS.event.goldenDoor, prompt: "Behind it: a guaranteed high-quality reward.", action: "Open for 10 RF",
    outcomes: [
      { id: "epicPlus", label: "Epic item", chanceBps: 6500 },
      { id: "epicPlus", label: "Legendary item", chanceBps: 2800 },
      { id: "epicPlus", label: "Mythic item", chanceBps: 700 },
    ],
  },
  lostFriend: {
    name: "A LOST FRIEND", cost: 0, rare: true, prompt: "A faint Friend-shaped light flickers, lost in the dark.", action: "Guide it home",
    outcomes: [{ id: "gift", label: "It leaves a gift of RF and warmth", chanceBps: 10000 }],
  },
};

/** Golden Door rarity split, kept beside the displayed rows above. */
export const GOLDEN_DOOR_RARITIES = [
  { rarity: "epic", chanceBps: 6500 }, { rarity: "legendary", chanceBps: 2800 }, { rarity: "mythic", chanceBps: 700 },
] as const;

export const MERCHANT: Readonly<Record<MerchantOffer, { name: string; cost: number; text: string; stock: number }>> = {
  potion: { name: "HEALTH POTION", cost: RF_COSTS.merchant.potion, text: "Restores 35% HP. Carried in your belt.", stock: 2 },
  relic: { name: "RANDOM RELIC", cost: RF_COSTS.merchant.relic, text: "An Uncommon to Epic relic.", stock: 1 },
  rareItem: { name: "RARE ITEM", cost: RF_COSTS.merchant.rareItem, text: "A guaranteed Rare item.", stock: 1 },
  legendaryGamble: { name: "LEGENDARY GAMBLE", cost: RF_COSTS.merchant.legendaryGamble, text: "Epic 30% · Legendary 58% · Mythic 12%.", stock: 1 },
  cursedBox: { name: "CURSED MYSTERY BOX", cost: RF_COSTS.merchant.cursedBox, text: "Cursed item 55% · 2 potions 20% · a curse 15% · Epic item 10%.", stock: 1 },
};

export const LEGENDARY_GAMBLE = [
  { rarity: "epic", chanceBps: 3000 }, { rarity: "legendary", chanceBps: 5800 }, { rarity: "mythic", chanceBps: 1200 },
] as const;
export const CURSED_BOX = [
  { id: "cursedItem", chanceBps: 5500 }, { id: "potions", chanceBps: 2000 }, { id: "curse", chanceBps: 1500 }, { id: "epic", chanceBps: 1000 },
] as const;

export const FLOOR_BANDS = [
  { name: "THE UPPER CRYPTS", floor: "#1a1622", floorAlt: "#1f1a29", wall: "#2c2440", wallTop: "#3d3357", accent: "#8f6fd8", torch: "#ff9a3c" },
  { name: "THE SIGNAL VAULTS", floor: "#121a1f", floorAlt: "#152028", wall: "#1f3340", wallTop: "#2b4a5c", accent: "#3ef0ff", torch: "#3ef0ff" },
  { name: "THE HOLLOW DEEP", floor: "#1d1215", floorAlt: "#24161a", wall: "#3d1c26", wallTop: "#562636", accent: "#ff3d5a", torch: "#ff5a3c" },
  { name: "THE ENDLESS VOID", floor: "#0f0d17", floorAlt: "#141021", wall: "#261b3b", wallTop: "#35264f", accent: "#ccff00", torch: "#ff3d7f" },
] as const;
export const bandForFloor = (floor: number) => FLOOR_BANDS[Math.min(FLOOR_BANDS.length - 1, Math.floor((floor - 1) / 3))];

export const BOSS_FLOORS = (floor: number) => floor % 3 === 0;
export const FINAL_FLOOR = 9;
