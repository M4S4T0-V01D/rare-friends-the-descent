import { COIN_DASH, GALLERY_PAYOUTS, GALLERY_SECONDS, RF_COSTS, SHELL_GAME, type GateTier, type MerchantOffer, type ShrineTier } from "../economy/terms";

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

export type EventKind = "well" | "stranger" | "blackDoor" | "mirror" | "gambler" | "corpse" | "goldenDoor" | "lostFriend"
  | "gallery" | "shells" | "coinDash";
export type EventOutcome =
  | "heal" | "blessing" | "curse" | "smallLoot" | "nothing"
  | "revealSecret" | "disappear" | "relic" | "summonElite"
  | "secretBoss" | "mythicChest" | "cursedDungeon" | "horde"
  | "duplicate" | "destroy"
  | "loot" | "ambush" | "rf"
  | "epicPlus" | "gift";

export const EVENTS: Readonly<Record<EventKind, {
  name: string; cost: number; prompt: string; action: string; rare?: boolean; outcomes: readonly OutcomeRow<EventOutcome>[];
  /** Mini-games explain their rules instead of an odds table. */
  rules?: readonly string[];
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
  gallery: {
    name: "THE RUNE GALLERY", cost: RF_COSTS.event.gallery, prompt: "A carnival of floating runes. Shatter as many as you can.", action: "Play for 5 RF",
    outcomes: [],
    rules: [
      `Runes appear one after another for ${GALLERY_SECONDS} seconds. Hit them with any attack before they fade.`,
      ...GALLERY_PAYOUTS.map(row => `${row.hits}+ runes: win ${row.payout} RF`), "Fewer than 7: the gallery keeps your 5 RF.",
    ],
  },
  shells: {
    name: "THE SHELL GAME", cost: RF_COSTS.event.shells, prompt: "“Watch the rune. Keep your eyes on the cup.” A grinning Friend shuffles three bone cups.", action: "Play for 5 RF",
    outcomes: [],
    rules: [`A rune hides under one of ${SHELL_GAME.cups} cups. The cups shuffle, faster on deeper floors.`, `Pick the right cup: win ${SHELL_GAME.payout} RF.`, "Pick wrong: lose your 5 RF."],
  },
  coinDash: {
    name: "THE COIN DASH", cost: RF_COSTS.event.coinDash, prompt: "The floor fills with spilled RF, and something up above starts dropping rocks.", action: "Play for 10 RF",
    outcomes: [],
    rules: [`For ${COIN_DASH.seconds} seconds, coins scatter across the room while rocks rain down.`, `Every coin you grab pays ${COIN_DASH.perCoin} RF (up to ${COIN_DASH.coins}).`, "Rocks hurt. Grab 11+ to come out ahead."],
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
  potion: { name: "HEALTH POTION", cost: RF_COSTS.merchant.potion, text: "Restores 30% HP. Carried in your belt.", stock: 2 },
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

/** Every floor has its own scenery, palette and enemy roster. Depths 10+ are the endless void. */
export type FloorStyle = "crypt" | "tech" | "flesh" | "void";
export type RosterKind = "cursed" | "crawler" | "wisp" | "gunner" | "drone" | "turret" | "mite" | "spitter" | "eyestalk" | "bloodling" | "shade"
  | "bomber" | "lancer" | "hexer" | "sniper" | "brute" | "hive" | "wraith" | "prism";
export type FloorTheme = Readonly<{
  name: string; area: string; style: FloorStyle;
  floor: string; floorAlt: string; wall: string; wallTop: string; accent: string; torch: string; bullet: string;
  decor: readonly (readonly [string, number])[];
  roster: readonly (readonly [RosterKind, number])[];
}>;

const CRYPT_DECOR = [["bones", 3], ["skull", 3], ["candles", 3], ["chains", 2], ["banner", 2], ["rubble", 2], ["coffin", 2], ["gravestone", 3], ["runeCircle", 1]] as const;
const TECH_DECOR = [["terminal", 3], ["cables", 3], ["serverRack", 3], ["pipe", 2], ["screen", 2], ["crystal", 1], ["rubble", 1]] as const;
const FLESH_DECOR = [["tendril", 3], ["fleshPool", 2], ["ribcage", 2], ["eyeball", 2], ["skull", 1], ["bones", 1], ["candles", 1]] as const;
const VOID_DECOR = [["voidShard", 3], ["glitch", 3], ["runeCircle", 2], ["crystal", 2], ["terminal", 1], ["tendril", 1]] as const;

export const FLOOR_THEMES: readonly FloorTheme[] = [
  { name: "THE UPPER CRYPTS", area: "Ossuary", style: "crypt", floor: "#1a1622", floorAlt: "#1f1a29", wall: "#2c2440", wallTop: "#3d3357", accent: "#8f6fd8", torch: "#ff9a3c", bullet: "#c9b8ff",
    decor: CRYPT_DECOR, roster: [["cursed", 5], ["crawler", 1.2], ["wisp", 1.5], ["bomber", 1.2]] },
  { name: "THE UPPER CRYPTS", area: "Candle Nave", style: "crypt", floor: "#1d1719", floorAlt: "#231b1f", wall: "#382a2c", wallTop: "#4d3a3a", accent: "#ffb347", torch: "#ffb347", bullet: "#ffd9a0",
    decor: [["candles", 6], ...CRYPT_DECOR], roster: [["cursed", 3.5], ["crawler", 1.5], ["wisp", 2], ["gunner", 2], ["lancer", 2], ["bomber", 1]] },
  { name: "THE UPPER CRYPTS", area: "Warden's Vault", style: "crypt", floor: "#171520", floorAlt: "#1c1928", wall: "#262036", wallTop: "#352d4d", accent: "#c2283f", torch: "#ff5a3c", bullet: "#ff8fa3",
    decor: [["chains", 5], ["coffin", 4], ...CRYPT_DECOR], roster: [["cursed", 2.5], ["crawler", 1.5], ["wisp", 1.5], ["gunner", 2.5], ["lancer", 2], ["wraith", 2], ["hexer", 1.5]] },
  { name: "THE SIGNAL VAULTS", area: "Relay Halls", style: "tech", floor: "#121a1f", floorAlt: "#152028", wall: "#1f3340", wallTop: "#2b4a5c", accent: "#3ef0ff", torch: "#3ef0ff", bullet: "#3ef0ff",
    decor: TECH_DECOR, roster: [["drone", 3], ["mite", 2.5], ["cursed", 1.5], ["crawler", 1], ["sniper", 2], ["bomber", 1.5]] },
  { name: "THE SIGNAL VAULTS", area: "Server Tombs", style: "tech", floor: "#101818", floorAlt: "#132020", wall: "#1c3434", wallTop: "#274848", accent: "#6ee07a", torch: "#6ee07a", bullet: "#b9ff6b",
    decor: [["serverRack", 6], ...TECH_DECOR], roster: [["drone", 3], ["turret", 2], ["mite", 2], ["gunner", 1], ["sniper", 2], ["hive", 1.5]] },
  { name: "THE SIGNAL VAULTS", area: "Signal Core", style: "tech", floor: "#14131f", floorAlt: "#191828", wall: "#252340", wallTop: "#343157", accent: "#ccff00", torch: "#ccff00", bullet: "#ccff00",
    decor: [["screen", 4], ["pipe", 4], ...TECH_DECOR], roster: [["drone", 2.5], ["turret", 2], ["mite", 2], ["wisp", 1], ["sniper", 2], ["hive", 1.5], ["hexer", 1.5]] },
  { name: "THE HOLLOW DEEP", area: "Red Gullet", style: "flesh", floor: "#1d1215", floorAlt: "#24161a", wall: "#3d1c26", wallTop: "#562636", accent: "#ff3d5a", torch: "#ff5a3c", bullet: "#ff4d6d",
    decor: FLESH_DECOR, roster: [["bloodling", 3.5], ["spitter", 2.5], ["cursed", 1], ["crawler", 1], ["brute", 2]] },
  { name: "THE HOLLOW DEEP", area: "Vein Galleries", style: "flesh", floor: "#1a1016", floorAlt: "#21131c", wall: "#3a1830", wallTop: "#522243", accent: "#ff8fb3", torch: "#ff3d7f", bullet: "#ff8fb3",
    decor: [["eyeball", 5], ...FLESH_DECOR], roster: [["bloodling", 3], ["spitter", 2], ["eyestalk", 2], ["gunner", 1], ["brute", 2], ["hive", 1.5], ["wraith", 1.5]] },
  { name: "THE HOLLOW DEEP", area: "The Beast's Heart", style: "flesh", floor: "#1f0f10", floorAlt: "#271315", wall: "#451a1c", wallTop: "#62262a", accent: "#ccff00", torch: "#ff5a3c", bullet: "#ff9a3c",
    decor: [["tendril", 6], ["ribcage", 4], ...FLESH_DECOR], roster: [["bloodling", 3], ["spitter", 2.5], ["eyestalk", 2], ["drone", 1], ["brute", 2.5], ["hexer", 1.5], ["bomber", 1.5]] },
];

export const VOID_THEME: FloorTheme = {
  name: "THE ENDLESS VOID", area: "Stratum", style: "void", floor: "#0f0d17", floorAlt: "#141021", wall: "#261b3b", wallTop: "#35264f", accent: "#ccff00", torch: "#ff3d7f", bullet: "#ff3d7f",
  decor: VOID_DECOR, roster: [["shade", 3], ["prism", 2.5], ["drone", 1.5], ["turret", 1.2], ["spitter", 1.5], ["eyestalk", 1.2], ["bloodling", 1.5], ["wisp", 1.5],
    ["gunner", 1.5], ["mite", 1], ["bomber", 1.2], ["lancer", 1.2], ["hexer", 1.2], ["sniper", 1.2], ["brute", 1.5], ["hive", 1], ["wraith", 1.5]],
};

export function bandForFloor(depth: number): FloorTheme {
  if (depth <= FLOOR_THEMES.length) return FLOOR_THEMES[Math.max(0, depth - 1)];
  return { ...VOID_THEME, area: `Stratum ${depth - FLOOR_THEMES.length}` };
}

export const BOSS_FLOORS = (floor: number) => floor % 3 === 0;
export const FINAL_FLOOR = 9;

/**
 * Wardrobe cosmetics, bought with (simulated) RF at the camp's Dye Altar. They only recolor your
 * Friend's canonical pixels and add light: the on-chain artwork's shape is never altered.
 */
export type CosmeticSlot = "glow" | "skin" | "trail";
export type Cosmetic = Readonly<{ id: string; slot: CosmeticSlot; name: string; text: string; cost: number; color: string; look?: FriendLookId }>;
/** Mirrors FriendLook in the renderer, kept here so game code does not import rendering. */
export type FriendLookId = "hero" | "corrupted" | "void" | "ghost" | "stone" | "gold" | "frost" | "shadow" | "ember";

const C = RF_COSTS.cosmetic;
export const COSMETICS: readonly Cosmetic[] = [
  { id: "glow-lime", slot: "glow", name: "Signal Lime", text: "The glow every Friend is born with.", cost: 0, color: "#ccff00" },
  { id: "glow-crimson", slot: "glow", name: "Blood Moon", text: "A deep crimson halo.", cost: C.common, color: "#ff2e4d" },
  { id: "glow-cyan", slot: "glow", name: "Relay Cyan", text: "Cold light from the Signal Vaults.", cost: C.common, color: "#3ef0ff" },
  { id: "glow-violet", slot: "glow", name: "Crypt Violet", text: "The color of old rune-light.", cost: C.common, color: "#bb66ff" },
  { id: "glow-gold", slot: "glow", name: "Hoard Gold", text: "Shines like a Legendary drop.", cost: C.rare, color: "#ffb02e" },
  { id: "glow-rose", slot: "glow", name: "Void Rose", text: "The Shrine of the Void's own pink.", cost: C.rare, color: "#ff3d7f" },
  { id: "glow-frost", slot: "glow", name: "Frostlight", text: "A pale, frozen shimmer.", cost: C.rare, color: "#8fe3ff" },
  { id: "glow-prism", slot: "glow", name: "Prismatic", text: "Cycles through every color. Very rare, very loud.", cost: C.legendary, color: "prism" },
  { id: "glow-null", slot: "glow", name: "Null Halo", text: "A halo of darkness with a burning rim.", cost: C.legendary, color: "null" },
  { id: "skin-hero", slot: "skin", name: "Canonical", text: "Your Friend as it was minted, lit for the dark.", cost: 0, color: "#f3eeff", look: "hero" },
  { id: "skin-stone", slot: "skin", name: "Statue Stone", text: "Carved like the camp's guardians.", cost: C.common, color: "#8d8577", look: "stone" },
  { id: "skin-corrupted", slot: "skin", name: "Corrupted", text: "Wear the crimson of the Corrupted Friends.", cost: C.rare, color: "#ff2e4d", look: "corrupted" },
  { id: "skin-ghost", slot: "skin", name: "Lost Light", text: "The lime ghost-glow of a Lost Friend.", cost: C.rare, color: "#ccff00", look: "ghost" },
  { id: "skin-frost", slot: "skin", name: "Frostbitten", text: "Pale ice-blue pixels.", cost: C.rare, color: "#8fe3ff", look: "frost" },
  { id: "skin-ember", slot: "skin", name: "Cinder", text: "Burning orange, like Cinderheart.", cost: C.rare, color: "#ff9a3c", look: "ember" },
  { id: "skin-shadow", slot: "skin", name: "Shadow", text: "A violet shade of yourself.", cost: C.rare, color: "#6b4fa0", look: "shadow" },
  { id: "skin-gold", slot: "skin", name: "Gilded", text: "Solid gold. Every Friend should be so lucky.", cost: C.legendary, color: "#ffd23c", look: "gold" },
  { id: "skin-void", slot: "skin", name: "Unminted Void", text: "Black as The Unminted, outlined in pink.", cost: C.legendary, color: "#ff3d7f", look: "void" },
  { id: "trail-none", slot: "trail", name: "No Trail", text: "Walk quietly.", cost: 0, color: "#6d6780" },
  { id: "trail-embers", slot: "trail", name: "Embers", text: "Sparks drift from your steps.", cost: C.common, color: "#ff9a3c" },
  { id: "trail-sparkles", slot: "trail", name: "Sparkles", text: "Glittering motes in your glow's color.", cost: C.rare, color: "#ffffff" },
  { id: "trail-void", slot: "trail", name: "Void Motes", text: "Tiny black holes, pink at the edges.", cost: C.rare, color: "#ff3d7f" },
  { id: "trail-runes", slot: "trail", name: "Rune Steps", text: "Every step leaves a glowing rune.", cost: C.legendary, color: "#ccff00" },
];
export const cosmetic = (id: string) => COSMETICS.find(c => c.id === id);
export const DEFAULT_COSMETICS: Readonly<Record<CosmeticSlot, string>> = { glow: "glow-lime", skin: "skin-hero", trail: "trail-none" };
