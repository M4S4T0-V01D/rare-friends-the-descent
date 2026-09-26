/**
 * Boss pixel art. Each boss body is drawn as a left half and mirrored, so it stays symmetric and
 * readable at large scales. Eyes, cores, chains and tendrils are animated on top by the renderer.
 */
import type { Mask, Palette } from "./sprites";

/** Mirror a left half into a full, symmetric mask. */
export function mirror(half: readonly string[]): Mask {
  return half.map(row => row + [...row].reverse().join(""));
}

/** The Dungeon Warden: a horned, armored jailer with a burning core. Legs are separate so they can step. */
export const WARDEN_BODY: Mask = mirror([
  "....h...........",
  "....hh..........",
  ".....hh.........",
  ".....hhh........",
  "......hhh...dddd",
  ".......hhhdd####",
  ".........d#lllll",
  ".........d######",
  ".........dxxxxxx",
  ".........dxxxeex",
  ".........dxxxxxx",
  ".........dd#####",
  "...s.....dgggggg",
  "..ss...dd#######",
  ".dlsld.d#l######",
  "dllllldd#l##kkkk",
  "d#####dd#l#kcccc",
  "d#####dd#l#kcccc",
  "dd###dd.d#l#kkkk",
  ".dd#dd.rd#l#####",
  ".d###d.rd#l#####",
  ".d###d.rdggggggg",
  ".d###d.rd#######",
  ".dkkkd.rd#d#d#d#",
  "dkkkkkdrrd#d#d#d",
  "dkkkkkdrr.d#d#d#",
  ".dkkkd.rr.......",
  ".......rr.......",
]);

export const WARDEN_LEG: Mask = [
  "dddddd",
  "d####d",
  "d#ll#d",
  "d####d",
  "dd##dd",
  "kkkkkk",
];

export function wardenPalette(deep: boolean, flash: boolean): Palette {
  if (flash) return { "#": "#ffffff", d: "#ffffff", l: "#ffffff", h: "#ffffff", x: "#ffffff", e: "#ffffff", c: "#ffffff", g: "#ffffff", k: "#ffffff", r: "#ffffff", s: "#ffffff" };
  return deep
    ? { "#": "#3b5566", d: "#1c2a36", l: "#8fb8cc", h: "#d7e7ef", x: "#05080c", e: "#8fe3ff", c: "#8fe3ff", g: "#3ef0ff", k: "#26323d", r: "#1f3c52", s: "#d7e7ef" }
    : { "#": "#4d4260", d: "#261f33", l: "#8a7fa3", h: "#e6dcc5", x: "#07050b", e: "#ff2e4d", c: "#ff5a3c", g: "#c9a14a", k: "#2e2838", r: "#6b1426", s: "#e6dcc5" };
}

/** The Rare Beast: a crowned, many-eyed maw. Eyes are drawn by the renderer so they can track the Friend. */
export const BEAST_BODY: Mask = mirror([
  "...................c",
  "..........c.......cc",
  ".....c....cc......cc",
  ".....cc...cc..c..ccc",
  "......ccccccccccccccc".slice(0, 20),
  ".......ddddddddddddd",
  ".....dd#############",
  "....d###lll#########",
  "...d##lll###########",
  "..d##ll#############",
  "..d#l###############",
  ".d##l###########v###",
  ".d#l#######v####v###",
  "d##l########v##v####",
  "d#l##########vv#####",
  "d#l##############ddd",
  "d##l##########ddmmmm",
  "d###########ddmmtmtm",
  ".d#########dmmmmmmmm",
  ".d########dmmmmmmmmm",
  ".d#######dmmmmmmmmmm",
  "..d######dmtmtmtmtmt",
  "..d#######dddddddddd",
  "...d################",
  "..dd#d##########d###",
  ".d#d.dd##d###d##d.d#",
  "d#d...d#d.d#d.d#d..d",
  "dd....d#d.d#d..dd...",
  "......dd..dd........",
]);

export function beastPalette(phase: number, flash: boolean): Palette {
  if (flash) return { "#": "#ffffff", d: "#ffffff", l: "#ffffff", c: "#ffffff", v: "#ffffff", m: "#ffffff", t: "#ffffff" };
  return {
    "#": phase >= 3 ? "#2a1230" : "#1f1630", d: "#0e0916", l: phase >= 2 ? "#4a2a5c" : "#3a2d52",
    c: "#ccff00", v: phase >= 2 ? "#ff3d7f" : "#7a2c5c", m: "#3d0714", t: "#efe6d2",
  };
}

/** Eye sockets on the Beast's face, in body pixels from the mask's top-left. Later phases open more. */
export const BEAST_EYES: readonly (readonly [number, number, number])[] = [
  [20, 10, 1], [13, 12, 1], [27, 12, 1], [8, 9, 2], [32, 9, 2], [17, 7, 3], [23, 7, 3],
];
