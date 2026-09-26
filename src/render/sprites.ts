import type { GenerationSprites, SpriteFacing } from "@rarefriends/friendsdk/sprites";

/**
 * Original enemy art as small palette masks. '.' is transparent; other characters map to a palette.
 * The Rare Friend itself always comes from its canonical on-chain 16×16 artwork (see FriendArt).
 */
export type Mask = readonly string[];
export type Palette = Readonly<Record<string, string>>;

export const MASKS = {
  husk: [
    [
      "................",
      ".....#....#.....",
      "....##....##....",
      "....########....",
      "...##########...",
      "...#ee####ee#...",
      "...##########...",
      "....#xxxxxx#....",
      "....########....",
      "...##########...",
      "..###.####.###..",
      "..##..####..##..",
      "......#..#......",
      ".....##..##.....",
      "....##....##....",
      "................",
    ],
    [
      "................",
      "......#....#....",
      ".....##....##...",
      "....########....",
      "...##########...",
      "...#ee####ee#...",
      "...##########...",
      "....#xxxxxx#....",
      "....########....",
      "..###########...",
      ".###..####..##..",
      "..#...####...#..",
      ".......#..#.....",
      "......##...#....",
      ".....##....##...",
      "................",
    ],
  ],
  crawler: [
    [
      "................",
      "................",
      ".....######.....",
      "...##########...",
      "..####xeex####..",
      ".####xeeeex####.",
      ".####xeeeex####.",
      "..####xeex####..",
      "...##########...",
      "..#.#.#..#.#.#..",
      ".#..#.#..#.#..#.",
      "#..#..#..#..#..#",
      "...#...#..#...#.",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      "................",
      ".....######.....",
      "...##########...",
      "..####xeex####..",
      ".####xeeeex####.",
      ".####xeeeex####.",
      "..####xeex####..",
      "...##########...",
      "...#.#.##.#.#...",
      "..#..#.##.#..#..",
      ".#..#..##..#..#.",
      "#...#..##..#...#",
      "................",
      "................",
      "................",
    ],
  ],
  goblin: [
    [
      "................",
      "................",
      ".......###......",
      "......#e#e#.....",
      "......#####.....",
      ".......#x#..ss..",
      ".....#####.ssss.",
      "....##xxx##ssss.",
      "....#######ssss.",
      "....#.###.#.ss..",
      ".......#.#......",
      "......##.##.....",
      "................",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      ".......###......",
      "......#e#e#.....",
      "......#####.....",
      ".......#x#.ss...",
      ".....#####ssss..",
      "....##xxx#ssss..",
      "....#######ss...",
      "....#.###.#.....",
      "......#...#.....",
      ".....##....#....",
      "..........##....",
      "................",
      "................",
      "................",
      "................",
    ],
  ],
  peddler: [[
    "................",
    "......####......",
    ".....######.....",
    "....##e##e##....",
    "....########....",
    "...##########...",
    "..############..",
    "..##gg####gg##..",
    "..############..",
    "..###xxxxxx###..",
    "..############..",
    "...##########...",
    "...##......##...",
    "................",
    "................",
    "................",
  ]],
  stranger: [[
    "................",
    "......####......",
    ".....######.....",
    "....###xx###....",
    "....##e##e##....",
    "....########....",
    "...##########...",
    "...##########...",
    "..############..",
    "..############..",
    "..############..",
    "..############..",
    "...##########...",
    "................",
    "................",
    "................",
  ]],
} as const satisfies Record<string, readonly Mask[]>;

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
function makeCanvas(w: number, h: number): CanvasLike {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  return canvas;
}
export type Sprite = { canvas: CanvasLike; w: number; h: number };

/** Render a palette mask at an integer scale with a one-pixel outline, cached by key. */
const cache = new Map<string, Sprite>();
export function maskSprite(key: string, mask: Mask, palette: Palette, scale: number, outline = "#07050b"): Sprite {
  const cached = cache.get(key);
  if (cached) return cached;
  const rows = mask.length, cols = mask[0].length;
  const w = (cols + 2) * scale, h = (rows + 2) * scale;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const filled = (x: number, y: number) => y >= 0 && y < rows && x >= 0 && x < cols && mask[y][x] !== ".";
  ctx.fillStyle = outline;
  for (let y = -1; y <= rows; y++) for (let x = -1; x <= cols; x++) {
    if (filled(x, y)) continue;
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const ch = mask[y][x];
    if (ch === ".") continue;
    ctx.fillStyle = palette[ch] ?? palette["#"];
    ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
  }
  const sprite = { canvas, w, h };
  cache.set(key, sprite);
  return sprite;
}

export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, flip = false, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (flip) { ctx.translate(Math.round(x), Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(sprite.canvas as CanvasImageSource, -sprite.w / 2, -sprite.h); }
  else ctx.drawImage(sprite.canvas as CanvasImageSource, Math.round(x - sprite.w / 2), Math.round(y - sprite.h));
  ctx.restore();
}

/** A white silhouette of any sprite, for hit flashes. */
const flashCache = new WeakMap<object, Sprite>();
export function flashSprite(sprite: Sprite, color = "#ffffff"): Sprite {
  const cached = flashCache.get(sprite.canvas);
  if (cached) return cached;
  const canvas = makeCanvas(sprite.w, sprite.h);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.drawImage(sprite.canvas as CanvasImageSource, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, sprite.w, sprite.h);
  const result = { canvas, w: sprite.w, h: sprite.h };
  flashCache.set(sprite.canvas, result);
  return result;
}

export type FriendLook = "hero" | "corrupted" | "canonical" | "void" | "ghost";
const LOOKS: Readonly<Record<FriendLook, { body: string; outline: string; background?: string }>> = {
  hero: { body: "#f3eeff", outline: "#0a0710" },
  corrupted: { body: "#ff2e4d", outline: "#1a0008" },
  canonical: { body: "#000000", outline: "#ffffff", background: "#ffffff" },
  void: { body: "#050308", outline: "#ff3d7f" },
  ghost: { body: "#ccff00", outline: "#1a2600" },
};

/**
 * The selected Rare Friend's canonical 16×16 on-chain artwork. Pixel shapes are never altered:
 * the dungeon look recolors the mask to read against dark stone; the portrait keeps the canonical
 * black mask with its white halo.
 */
export class FriendArt {
  private readonly frames = new Map<string, Sprite>();
  constructor(readonly sprites: GenerationSprites | null) {}

  get familyName(): string { return this.sprites?.familyName ?? "Unknown"; }

  frame(look: FriendLook, scale: number, facing: SpriteFacing, walking: boolean, frame: number, side: "left" | "right"): Sprite {
    const rows = this.rows(facing, walking, frame, side);
    const key = `${look}:${scale}:${rows.join("")}`;
    const cached = this.frames.get(key);
    if (cached) return cached;
    const style = LOOKS[look];
    const size = 16;
    const w = (size + 2) * scale, h = (size + 2) * scale;
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (style.background) { ctx.fillStyle = style.background; ctx.fillRect(0, 0, w, h); }
    const filled = (x: number, y: number) => y >= 0 && y < size && x >= 0 && x < size && rows[y][x] === "#";
    ctx.fillStyle = style.outline;
    for (let y = -1; y <= size; y++) for (let x = -1; x <= size; x++) {
      if (filled(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (filled(x + dx, y + dy)) { near = true; break; }
      if (near) ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
    }
    ctx.fillStyle = style.body;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (filled(x, y)) ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
    const sprite = { canvas, w, h };
    this.frames.set(key, sprite);
    return sprite;
  }

  private rows(facing: SpriteFacing, walking: boolean, frame: number, side: "left" | "right"): readonly string[] {
    if (!this.sprites) return PLACEHOLDER;
    // Colossus has no up/down frames; keep the last horizontal direction, as the SDK reference does.
    const usedFallback = this.sprites.familyId === 6 && (facing === "down" || facing === "up");
    const resolved = usedFallback ? side : facing;
    return this.sprites.clips[walking ? "walk" : "idle"][resolved][frame % 8].rows;
  }
}

/** Shown only if the canonical artwork cannot load and the player chooses to continue anyway. */
const PLACEHOLDER: readonly string[] = [
  "................", "......####......", ".....######.....", "....##.##.##....", "....########....", "....##....##....",
  ".....######.....", "......####......", ".....######.....", "....########....", "....#.####.#....", "......#..#......",
  ".....##..##.....", "................", "................", "................",
];
