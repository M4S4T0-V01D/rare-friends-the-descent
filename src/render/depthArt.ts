/**
 * Pixel art for the lower acts: thirteen creatures (16×16, two frames where they move) and seven bosses
 * (32 wide). Like the Warden, each is drawn as a left half and mirrored so it stays symmetric at any scale.
 */
import { mirror } from "./bossArt";
import type { Mask } from "./sprites";

const m = (...frames: string[][]): Mask[] => frames.map(half => mirror(half));

export const DEPTH_MASKS: Readonly<Record<string, readonly Mask[]>> = {
  frostmoth: m([
    "........", "..##....", ".#ll#...", "#llll#..", "#lllll#.", "#lllll#e", ".#llll#x", "..#lll#x",
    "...###xx", "....#l#x", "...#ll#x", "...#l#.x", "....#..x", "........", "........", "........",
  ], [
    "........", "........", "........", "........", "..####..", ".#llll#e", "#lllll#x", "#llllll#",
    ".#lll##x", "..###.xx", "....#l#x", "...#ll#x", "...#l#.x", "....#..x", "........", "........",
  ]),
  rimeknight: m([
    ".....###", "....#lll", "....#lxe", "....#lll", ".....###", "...#####", "..#ll###", ".#ll####",
    ".#l#####", ".#l#####", "..######", "...#####", "...##..#", "...##..#", "..###..#", "........",
  ], [
    ".....###", "....#lll", "....#lxe", "....#lll", ".....###", "...#####", "..#ll###", ".#ll####",
    ".#l#####", ".#l#####", "..######", "...#####", "....##.#", "...##..#", "...##..#", "........",
  ]),
  cinderimp: m([
    "........", "...s....", "...ss...", "....s...", "...#####", "..######", "..##e###", "..#ee###",
    "..######", "...##xx#", "...#####", "..##.###", "..#...##", "........", "........", "........",
  ], [
    "....s...", "...ss...", "....s...", "...#####", "..######", "..##e###", "..#ee###", "..######",
    "...##xx#", "...#####", "...#####", "...##..#", "..##...#", "........", "........", "........",
  ]),
  slaggolem: m([
    "...#####", "..######", ".##e####", ".#ee####", ".#######", "#####sss", "##s#ssss", "#s#sssss",
    "##s#ssss", ".##sssss", ".###ssss", "..######", "..###..#", ".####..#", ".####...", "........",
  ], [
    "...#####", "..######", ".##e####", ".#ee####", ".#######", "#####sss", "##s#ssss", "#s#sssss",
    "##s#ssss", ".##sssss", ".###ssss", "..######", "...##..#", "..###..#", "..####..", "........",
  ]),
  sporeling: m([
    "....llll", "..llllll", ".lllslll", "lllllsll", "llslllll", ".lllllll", "...#####", "...#e#e#",
    "...#####", "....####", "....#xx#", "...##xx#", "...#.##.", "........", "........", "........",
  ], [
    "....llll", "..llllll", ".lllslll", "lllllsll", "llslllll", ".lllllll", "...#####", "...#e#e#",
    "...#####", "....####", "....#xx#", "....#xx#", "....##.#", "........", "........", "........",
  ]),
  thorn: m([
    "........", "...s....", "..ss..s.", "...s.ss.", ".s..s.s.", ".ss.####", "..s#####", "..##e###",
    ".#######", "#s######", "#.######", ".#.##.##", "..#.#..#", "........", "........", "........",
  ]),
  belldiver: m([
    "........", ".....###", "....#lll", "...#llll", "...#llll", "..#lllll", "..#lllll", "..#l#l#l",
    ".#lllll#", ".#######", "....#e#e", "....####", ".....#x#", "....#..#", "....#...", "........",
  ]),
  eel: m([
    "......##", ".....#ll", "....#lle", "....#lll", ".....##l", "......#l", ".....#l#", "....#l#.",
    "....#l#.", ".....#l#", "......#l", ".....#l#", "....#l#.", "....##..", "........", "........",
  ], [
    "......##", ".....#ll", "....#lle", "....#lll", ".....##l", "....#l#.", "...#l#..", "...#l#..",
    "....#l#.", ".....#l#", ".....#l#", "....#l#.", "....##..", "........", "........", "........",
  ]),
  cog: m([
    "......##", "...##.##", "...#####", "....####", ".#######", "######xx", ".####xee", "..###xee",
    "..###xee", ".####xee", "######xx", ".#######", "....####", "...#####", "...##.##", "......##",
  ]),
  pendulum: m([
    "......##", ".....#ll", ".....#le", "......##", "....####", "...#####", "..######", "..##l###",
    "..#.l###", "....####", "....####", "....##.#", "....#..#", "...##..#", "........", "........",
  ], [
    "......##", ".....#ll", ".....#le", "......##", "....####", "...#####", "..######", "..###l##",
    "..####l#", "....####", "....####", ".....#.#", "....##.#", "....#...", "........", "........",
  ]),
  shardling: m([
    ".......l", "......ll", ".....l#l", "....l##l", "...l###e", "..l#####", ".l######", "l#######",
    ".l######", "..l#####", "...l####", "....l###", ".....l##", "......l#", ".......l", "........",
  ]),
  mirror: m([
    "....####", "...#llll", "..#lllll", "..#lllll", "..#llssl", "..#lslll", "..#lllll", "..#lllll",
    "..#lllll", "..#lllll", "...#llll", "....####", ".....##e", "....####", "...#####", "........",
  ]),
  seraph: m([
    "#.......", "##......", "#l#.....", "#ll#..##", ".#ll##ll", ".#lll#le", "..#lll#l", "...#ll##",
    "...#l###", "....####", "....#x##", ".....#x#", ".....#.#", "......#.", "........", "........",
  ], [
    "........", "........", "##......", "#l#...##", "#ll###ll", ".#lll#le", "..#lll#l", "...#ll##",
    "...#l###", "....####", "....#x##", ".....#x#", ".....#.#", "......#.", "........", "........",
  ]),
};

/** Colors for each creature: [body, light, eye, dark, secondary]. Champions swap in their modifier color. */
export const DEPTH_PALETTE: Readonly<Record<string, { "#": string; l?: string; e: string; x?: string; s?: string; scale: number }>> = {
  frostmoth: { "#": "#2a4a6a", l: "#bfe8ff", e: "#e9f6ff", x: "#16263a", scale: 3 },
  rimeknight: { "#": "#34496a", l: "#8fe3ff", e: "#e9f6ff", x: "#101826", scale: 3 },
  cinderimp: { "#": "#5a2412", e: "#ffd23c", x: "#ff5a3c", s: "#ff9a3c", scale: 3 },
  slaggolem: { "#": "#3a2418", e: "#ffd23c", s: "#ff5a3c", scale: 4 },
  sporeling: { "#": "#2c4a2a", l: "#b9ff6b", e: "#ffd23c", x: "#16240f", s: "#ff8fb3", scale: 3 },
  thorn: { "#": "#2c3a1f", e: "#ff3d5a", s: "#6ee07a", scale: 3 },
  belldiver: { "#": "#1a2d40", l: "#7fd4ff", e: "#e9f6ff", x: "#0b1420", scale: 3 },
  eel: { "#": "#1a3a4a", l: "#3ef0ff", e: "#e9f6ff", scale: 3 },
  cog: { "#": "#4a3b24", e: "#ffd23c", x: "#2a2014", scale: 3 },
  pendulum: { "#": "#4a3b24", l: "#e8c07a", e: "#ffd23c", scale: 3 },
  shardling: { "#": "#9a93c9", l: "#f3eeff", e: "#ff8fb3", scale: 3 },
  mirror: { "#": "#3d3c4e", l: "#e9e4ff", e: "#ff8fb3", s: "#ffffff", scale: 3 },
  seraph: { "#": "#140f20", l: "#e9e4ff", e: "#ff3d7f", x: "#35264f", scale: 3 },
};

// ─── Bosses (left halves, 16 wide → 32 wide) ────────────────────────────────

/** The Archivist: a tall, stooped librarian in a frost-rimed robe, with a lantern eye. */
export const ARCHIVIST_BODY: Mask = mirror([
  "..........######", ".........#llllll", "........#lllllll", "........#ll#####", "........#l#eeeee", "........#l#eexee",
  "........#l######", ".........#######", "......##########", ".....###########", "....#ll#########", "...#lll#########",
  "..#lll##########", "..#ll###sss#####", "..#l####sss#####", "...#####sss#####", "....############", "....############",
  "....#l##########", "....#l##########", "....#l##########", "...#ll##########", "...#l###########", "..#ll###########",
  "..##############", "...#####....####",
]);
/** The Forgemaster: broad shoulders, a leather apron and a molten chest. */
export const FORGEMASTER_BODY: Mask = mirror([
  "..........######", ".........#######", "........##e#####", "........#ee#####", "........########", ".........#######",
  "....############", "..##############", ".###############", "####l###########", "###ll######ccccc", "##l########ccccc",
  "##l#######cccccc", "##l########ccccc", "##l##sssssssssss", ".#l##sssssssssss", "..###sssssssssss", "....#sssssssssss",
  "....#sssssssssss", "....####....####", "....###......###", "...####......###", "..#####.....####",
]);
/** The Mother Bloom: a vast flower head over a bulb of roots. Petals are drawn around it by the renderer. */
export const BLOOM_BODY: Mask = mirror([
  ".........lllllll", ".......lllllllll", "......llllllllll", ".....llllll#####", ".....lllll#ccccc", "....llllll#ccccc",
  "....lllll#cccccc", "....lllll#ccceec", "....lllll#cccccc", "....llllll#ccccc", ".....lllll#ccccc", ".....llllll#####",
  "......llllllllll", ".......lllllllll", ".........#######", "..........######", "........########", "......##########",
  "....#####s##s###", "...##s####s####s", "..#s##s#s####s##", ".#s#s#s#s#s#s#s#",
]);
/** The Drowned Cantor: a hooded choirmaster, waterlogged, arms raised to conduct. */
export const CANTOR_BODY: Mask = mirror([
  "..........######", ".........#llllll", "........#lllllll", "........#ll#####", "........#l#xxxxx", "........#l#xexxx",
  "........#l#xxxxx", "#.......#ll#####", "##.....#########", ".##...##########", "..##.###########", "...#############",
  "....############", "....####sss#####", "....###sssss####", "....####sss#####", "....############", "...#############",
  "...##l##########", "..##l###########", "..#l############", ".##l############", ".###############", "..#.#.#.#.#.#.#.",
]);
/** The Hour Engine: a great round clock-housing on brass legs. Its face and hands are drawn by the renderer. */
export const HOURENGINE_BODY: Mask = mirror([
  "..........######", ".......#########", ".....###########", "....###lllllllll", "...##lllllllllll", "..##llllllllllll",
  "..#lllllllllllll", ".##lllllllllllll", ".#llllllllllllll", ".#llllllllllllll", ".#llllllllllllll", ".#llllllllllllll",
  ".##lllllllllllll", "..#lllllllllllll", "..##llllllllllll", "...##lllllllllll", "....###lllllllll", ".....###########",
  ".......#########", "......##..##..##", ".....##...##...#", "....##....##....", "...###...###....",
]);
/** The First Friend: a crowned, robed Friend-shape with a burning heart. */
export const FIRSTFRIEND_BODY: Mask = mirror([
  "........g...g..g", "........gg.ggg.g", "........gggggggg", ".........#######", "........#lllllll", ".......#llllllll",
  ".......#ll#lllll", ".......#l#e#llll", ".......#ll#lllll", ".......#llllllll", "........#lllllll", "......##########",
  "....###lllllllll", "...#llllllllllll", "..#lllllllllllcc", "..#llllllllllccc", "..#lllllllllllcc", "..#lllllllllllll",
  "..#lllllllllllll", "..#l#lllllllllll", "..#l#lllllllllll", "...##lllllllllll", "....#lllll#lllll", "....#llll#.#llll",
  "....####..#..###",
]);

export const BOSS_PALETTES: Readonly<Record<string, Record<string, string>>> = {
  archivist: { "#": "#1f2e40", l: "#8fe3ff", e: "#e9f6ff", x: "#07101a", s: "#bfe8ff" },
  forgemaster: { "#": "#3a2418", l: "#8a6a4a", e: "#ffd23c", c: "#ff5a3c", s: "#553321" },
  bloom: { "#": "#2c4a2a", l: "#ff8fb3", e: "#ffd23c", c: "#b9ff6b", s: "#6ee07a" },
  cantor: { "#": "#1a2d40", l: "#7fd4ff", e: "#e9f6ff", x: "#07101a", s: "#c9b8ff" },
  hourengine: { "#": "#4a3b24", l: "#e8d8a8", e: "#ffd23c" },
  firstfriend: { "#": "#6d6780", l: "#f3eeff", e: "#07050b", c: "#ffd23c", g: "#ffd23c" },
};
