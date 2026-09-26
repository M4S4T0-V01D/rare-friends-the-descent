/**
 * Hats for the wardrobe: small pixel masks worn on top of your Friend's head. The renderer finds the top of
 * each animation frame of the Friend's own artwork and sits the hat there, so it fits any Friend.
 */
import { maskSprite, type Mask, type Sprite } from "./sprites";

export const HAT_MASKS: Readonly<Record<string, Mask>> = {
  party: [
    "....d.....", "...###....", "...#l#....", "..#####...", "..#l#l#...", ".#######..", ".#l#l#l#..", "#########.",
  ],
  flower: [
    "..........", ".l.g..l.g.", "lel.lel.le", ".l.#..l.#.", "##########",
  ],
  horns: [
    "l........l", "ll......ll", ".ll....ll.", ".#l....l#.", "..##..##..",
  ],
  top: [
    "..######..", "..######..", "..######..", "..######..", "..gggggg..", "##########",
  ],
  mushroom: [
    "...####...", ".##l##l##.", "#l######l#", "###l##l###", "..dddddd..",
  ],
  wizard: [
    "....#.....", "....##....", "...#l##...", "...####...", "..##l###..", "..######..", ".###l####.", "##########",
  ],
  halo: [
    "..######..", ".#......#.", "..######..",
  ],
  antlers: [
    "l.l....l.l", ".ll....ll.", "l.l....l.l", ".ll....ll.", "..l....l..", "..##..##..",
  ],
  crown: [
    "g..g..g..g", "gg.gg.gg.g", "ggggggggg.", "gegggeggg.", "ggggggggg.",
  ].map(r => r.padEnd(10, ".")),
  genesis: [
    ".g...g...g", ".gg.ggg.gg", "gggggggggg", "glgeglgelg", "gggggggggg", "l.l.l.l.l.",
  ],
};

const HAT_PALETTES: Readonly<Record<string, Record<string, string>>> = {
  party: { "#": "#ff3d7f", l: "#ffd23c", d: "#ccff00" },
  flower: { "#": "#2c4a2a", l: "#ff8fb3", e: "#ffd23c", g: "#ffb3cc" },
  horns: { "#": "#8d8577", l: "#e9e4ff" },
  top: { "#": "#1a1624", g: "#bb66ff" },
  mushroom: { "#": "#ff4d6d", l: "#ffffff", d: "#e8dcc0" },
  wizard: { "#": "#5a3fb0", l: "#ffd23c" },
  halo: { "#": "#ffe38a" },
  antlers: { "#": "#8fe3ff", l: "#e9f6ff" },
  crown: { g: "#ffd23c", e: "#ff3d7f" },
  genesis: { g: "#ffd23c", l: "#ffffff", e: "#3ef0ff" },
};

export function hatSprite(id: string, scale: number): Sprite | null {
  const mask = HAT_MASKS[id], pal = HAT_PALETTES[id];
  return mask && pal ? maskSprite(`hat:${id}:${scale}`, mask, pal, scale) : null;
}
