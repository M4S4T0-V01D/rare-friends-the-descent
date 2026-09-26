import type { FloorTheme } from "./content";
import { T, TILE, type Floor, type Room } from "./dungeon";
import type { Interactable } from "./entities";
import { Rng, tileNoise } from "./rng";
import type { Vec } from "./math";

/** The camp: a ruined sanctuary of the ancient Rare Friends, one cave room above the Descent. It can be restored in three tiers. */
export const CAMP_THEME: FloorTheme = {
  name: "THE CAMP", area: "Ruined Sanctuary", style: "crypt",
  floor: "#231c18", floorAlt: "#2a221d", wall: "#3a2e26", wallTop: "#4e3f33", accent: "#ccff00", torch: "#ffb347", bullet: "#ccff00",
  decor: [["rubble", 3], ["bones", 1], ["candles", 2], ["runeCircle", 2], ["crystal", 1]], roster: [],
};
const CAMP_THEMES: readonly FloorTheme[] = [
  CAMP_THEME,
  { ...CAMP_THEME, area: "Cleared Ruins", floor: "#261f1a", floorAlt: "#2d2520", decor: [["candles", 3], ["runeCircle", 2], ["crystal", 1]] },
  { ...CAMP_THEME, area: "Rebuilt Sanctuary", floor: "#2a221c", floorAlt: "#312822", wall: "#4a3a2c", wallTop: "#62503e", decor: [["candles", 3], ["runeCircle", 2], ["crystal", 2]] },
  { ...CAMP_THEME, area: "Grand Sanctuary", floor: "#2e2620", floorAlt: "#362c24", wall: "#5a4632", wallTop: "#7a6044", accent: "#ffd23c", decor: [["candles", 4], ["runeCircle", 2], ["crystal", 2]] },
];

export type CampStation = "descend" | "friend" | "wardrobe" | "stash" | "codex" | "hall" | "rf" | "blessing" | "sanctuary";
export type CampProp = "statue" | "tent" | "fire" | "lantern" | "pillar" | "crates" | "bedroll" | "banner" | "brazier" | "fountain" | "flowers";

const W = 36, H = 26, OX = 4, OY = 4;

export function generateCamp(tier = 0): { floor: Floor; spawn: Vec; things: Omit<Interactable, "id" | "used" | "t">[] } {
  const theme = CAMP_THEMES[Math.max(0, Math.min(3, tier))];
  const width = W + OX * 2, height = H + OY * 2;
  const tiles = new Uint8Array(width * height);
  const set = (x: number, y: number, v: number) => { if (x >= 0 && y >= 0 && x < width && y < height) tiles[y * width + x] = v; };
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < width && y < height ? tiles[y * width + x] : T.Void);
  // A rough-edged cave: an ellipse with a noisy rim, plus the stair alcove carved into the north wall.
  const cx = W / 2, cy = H / 2 + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / (W / 2 - 1), dy = (y - cy) / (H / 2 - 1);
    const rim = 1 - (tileNoise(x, y, 99) - 0.5) * 0.18;
    if (dx * dx + dy * dy < rim * rim) set(x + OX, y + OY, T.Floor);
  }
  for (let y = 1; y <= 7; y++) for (let x = cx - 4; x <= cx + 3; x++) set(x + OX, y + OY, T.Floor);
  const solid = (x: number, y: number, w = 1, h = 1) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + OX + i, y + OY + j, T.Wall); };
  // Statue pedestals and broken columns are solid.
  solid(cx - 7, 5, 2, 2); solid(cx + 5, 5, 2, 2);
  // The arch's pillars flank the stairs: solid from the top of the alcove down to their bases.
  solid(cx - 4, 1, 1, 5); solid(cx + 3, 1, 1, 5);
  for (const [px, py] of [[6, 10], [29, 10], [8, 19], [27, 20]] as const) solid(px, py, 1, 1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (get(x, y) !== T.Void) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (get(x + dx, y + dy) === T.Floor) { set(x, y, T.Wall); dy = 2; break; }
  }
  const px = (tx: number) => (tx + OX) * TILE + TILE / 2, py = (ty: number) => (ty + OY) * TILE + TILE / 2;
  const room: Room = {
    id: 0, type: "arena", cell: { x: 0, y: 0 }, x: OX, y: OY, w: W, h: H, main: true, visited: true, known: true, cleared: true, revealed: true,
    pillars: [], decor: [], torches: [], connections: [],
  };
  const rng = new Rng(7730);
  for (let i = 0; i < 26; i++) {
    const x = rng.range(3, W - 3), y = rng.range(9, H - 2);
    if (get(Math.floor(x) + OX, Math.floor(y) + OY) !== T.Floor || (Math.abs(x - cx) < 5 && y < 20)) continue;
    room.decor.push({ x: (x + OX) * TILE, y: (y + OY) * TILE, kind: rng.weighted(theme.decor as readonly (readonly ["rubble" | "bones" | "candles" | "runeCircle" | "crystal", number])[]), seed: rng.int(0, 1e6) });
  }
  const floor: Floor = {
    depth: 0, seed: 7730, width, height, tiles, rooms: [room], connections: [], start: { x: px(cx), y: py(16) },
    band: theme, isArena: true, gridW: 1, gridH: 1,
  };
  const station = (s: CampStation, x: number, y: number, label: string, radius = 28) => ({ kind: "station" as const, pos: { x: px(x), y: py(y) }, radius, roomId: 0, station: s, label });
  const prop = (p: CampProp, x: number, y: number) => ({ kind: "prop" as const, pos: { x: px(x), y: py(y) }, radius: 0, roomId: 0, prop: p, label: "" });
  const things: Omit<Interactable, "id" | "used" | "t">[] = [
    station("descend", cx - 0.5, 4, "THE DESCENT", 44),
    prop("statue", cx - 6.5, 6), prop("statue", cx + 5.5, 6),
    prop("fire", cx - 0.5, 15.5),
    station("friend", cx + 7, 16, "STILL POOL", 30),
    station("stash", 7, 15, "YOUR STASH"),
    station("codex", 29, 14, "RUNE TABLET"),
    station("hall", 25, 8.5, "OBELISK OF DESCENTS"),
    station("rf", 11, 8.5, "RF LEDGER"),
    station("wardrobe", cx - 0.5, 22, "THE DYE ALTAR", 30),
    prop("tent", 5, 12), prop("tent", 9, 21), prop("tent", 28, 19),
    prop("bedroll", cx - 4, 18), prop("bedroll", cx + 3, 19),
    prop("lantern", 12, 13), prop("lantern", 24, 13), prop("lantern", cx - 4, 8), prop("lantern", cx + 3, 8),
    prop("crates", 31, 17), prop("crates", 4, 18),
    prop("pillar", 6, 10), prop("pillar", 29, 10), prop("pillar", 8, 19), prop("pillar", 27, 20),
    // At the top of the camp: the Blessing Shrine, and the mason's table for restoring the sanctuary.
    station("blessing", 7, 6.5, "BLESSING SHRINE", 30),
    station("sanctuary", 29.5, 6.5, "MASON'S TABLE", 28),
  ];
  // Restoration: banners and more light, then braziers, then a fountain and flowers.
  if (tier >= 1) things.push(prop("banner", 5, 10.5), prop("banner", 28, 17.5), prop("lantern", 9, 17), prop("lantern", 26, 16));
  if (tier >= 2) things.push(prop("brazier", cx - 3.5, 11), prop("brazier", cx + 2.5, 11), prop("brazier", 12, 20), prop("brazier", 23, 20));
  if (tier >= 3) things.push(prop("fountain", cx - 0.5, 19), prop("flowers", 13, 11), prop("flowers", 22, 11), prop("flowers", 10, 15), prop("flowers", 26, 13), prop("flowers", 17, 23));
  return { floor, spawn: { x: px(cx - 0.5), y: py(11.5) }, things };
}
