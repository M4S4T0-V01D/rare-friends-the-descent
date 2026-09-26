import { TILE, T, tileAt, type Decor, type Floor } from "../game/dungeon";
import { tileNoise } from "../game/rng";

export const CHUNK = 512;
const CHUNK_TILES = CHUNK / TILE;

type Band = Floor["band"];

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}
export { shade };

const walkable = (t: number) => t === T.Floor || t === T.Door || t === T.Corridor;

/** Paint one static chunk of the floor: stone, walls, runes and props. */
export function paintChunk(ctx: CanvasRenderingContext2D, floor: Floor, cx: number, cy: number) {
  const band = floor.band;
  ctx.fillStyle = "#050308";
  ctx.fillRect(0, 0, CHUNK, CHUNK);
  const tx0 = cx * CHUNK_TILES, ty0 = cy * CHUNK_TILES;
  for (let ty = ty0; ty < ty0 + CHUNK_TILES; ty++) for (let tx = tx0; tx < tx0 + CHUNK_TILES; tx++) {
    const tile = tileAt(floor, tx, ty);
    const x = (tx - tx0) * TILE, y = (ty - ty0) * TILE;
    if (walkable(tile)) paintFloorTile(ctx, floor, band, tile, tx, ty, x, y);
  }
  for (let ty = ty0; ty < ty0 + CHUNK_TILES; ty++) for (let tx = tx0; tx < tx0 + CHUNK_TILES; tx++) {
    if (tileAt(floor, tx, ty) === T.Wall) paintWallTile(ctx, floor, band, tx, ty, (tx - tx0) * TILE, (ty - ty0) * TILE);
  }
  ctx.save();
  ctx.translate(-cx * CHUNK, -cy * CHUNK);
  for (const room of floor.rooms) {
    const rx = room.x * TILE, ry = room.y * TILE, rw = room.w * TILE, rh = room.h * TILE;
    if (rx > (cx + 1) * CHUNK + 64 || ry > (cy + 1) * CHUNK + 64 || rx + rw < cx * CHUNK - 64 || ry + rh < cy * CHUNK - 64) continue;
    if (room.type === "boss" || room.type === "arena") paintArenaSigil(ctx, band, rx + rw / 2, ry + rh / 2, Math.min(rw, rh) * 0.36);
    for (const decor of room.decor) paintDecor(ctx, band, decor);
    for (const torch of room.torches) paintTorchBracket(ctx, torch.x, torch.y);
  }
  ctx.restore();
}

function paintFloorTile(ctx: CanvasRenderingContext2D, floor: Floor, band: Band, tile: number, tx: number, ty: number, x: number, y: number) {
  const n = tileNoise(tx, ty, floor.depth);
  const corridor = tile === T.Corridor;
  const base = (tx + ty) % 2 ? band.floor : band.floorAlt;
  ctx.fillStyle = corridor ? shade(base, -6) : base;
  ctx.fillRect(x, y, TILE, TILE);
  // Slab bevel.
  ctx.fillStyle = shade(base, 10);
  ctx.fillRect(x, y, TILE, 1); ctx.fillRect(x, y, 1, TILE);
  ctx.fillStyle = shade(base, -12);
  ctx.fillRect(x, y + TILE - 1, TILE, 1); ctx.fillRect(x + TILE - 1, y, 1, TILE);
  if (n < 0.14) {
    ctx.fillStyle = shade(base, -18);
    const ox = Math.floor(n * 1000) % 18;
    ctx.fillRect(x + 6 + ox, y + 8, 7, 1); ctx.fillRect(x + 12 + ox, y + 9, 1, 6); ctx.fillRect(x + 13 + ox, y + 14, 5, 1);
  } else if (n > 0.965 && !corridor) {
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = band.accent;
    const g = Math.floor(n * 10000) % 4;
    if (g === 0) { ctx.fillRect(x + 10, y + 8, 12, 2); ctx.fillRect(x + 15, y + 8, 2, 16); ctx.fillRect(x + 10, y + 22, 12, 2); }
    else if (g === 1) { ctx.fillRect(x + 9, y + 9, 14, 2); ctx.fillRect(x + 9, y + 9, 2, 14); ctx.fillRect(x + 21, y + 9, 2, 14); }
    else if (g === 2) { ctx.fillRect(x + 15, y + 7, 2, 18); ctx.fillRect(x + 9, y + 12, 14, 2); ctx.fillRect(x + 9, y + 19, 14, 2); }
    else { ctx.fillRect(x + 8, y + 15, 16, 2); ctx.fillRect(x + 15, y + 8, 2, 16); ctx.fillRect(x + 11, y + 11, 10, 10); ctx.fillStyle = base; ctx.fillRect(x + 13, y + 13, 6, 6); }
    ctx.globalAlpha = 1;
  } else if (n > 0.7 && n < 0.74) {
    ctx.fillStyle = shade(base, 14);
    ctx.fillRect(x + 20, y + 20, 2, 2); ctx.fillRect(x + 7, y + 24, 2, 1);
  }
  if (tile === T.Door) {
    ctx.fillStyle = shade(band.wall, -10);
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = shade(band.wallTop, -20);
    ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
  }
  // Shadow cast by a wall directly above.
  if (tileAt(floor, tx, ty - 1) === T.Wall) {
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(x, y, TILE, 6);
    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(x, y + 6, TILE, 6);
  }
}

function paintWallTile(ctx: CanvasRenderingContext2D, floor: Floor, band: Band, tx: number, ty: number, x: number, y: number) {
  const below = tileAt(floor, tx, ty + 1);
  const n = tileNoise(tx, ty, 7);
  if (walkable(below)) {
    // A front-facing wall: cap on top, bricks below.
    ctx.fillStyle = band.wallTop;
    ctx.fillRect(x, y, TILE, 10);
    ctx.fillStyle = shade(band.wallTop, 18);
    ctx.fillRect(x, y, TILE, 2);
    ctx.fillStyle = band.wall;
    ctx.fillRect(x, y + 10, TILE, TILE - 10);
    ctx.fillStyle = shade(band.wall, -16);
    ctx.fillRect(x, y + 20, TILE, 1);
    ctx.fillRect(x + ((tx % 2) ? 8 : 22), y + 10, 1, 10);
    ctx.fillRect(x + ((tx % 2) ? 20 : 4), y + 21, 1, 11);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x, y + TILE - 3, TILE, 3);
    if (n > 0.9) {
      ctx.globalAlpha = 0.5; ctx.fillStyle = band.accent;
      ctx.fillRect(x + 12, y + 13, 8, 2); ctx.fillRect(x + 15, y + 13, 2, 12);
      ctx.globalAlpha = 1;
    } else if (n < 0.08) {
      // Corrupted machinery vents.
      ctx.fillStyle = shade(band.wall, -26);
      ctx.fillRect(x + 6, y + 14, 20, 10);
      ctx.fillStyle = band.accent; ctx.globalAlpha = 0.35;
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 8, y + 16 + i * 3, 16, 1);
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.fillStyle = shade(band.wallTop, -14);
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = shade(band.wallTop, -4);
    if (n > 0.5) ctx.fillRect(x + 4, y + 4, 10, 10); else ctx.fillRect(x + 16, y + 14, 12, 12);
    // Dark edge against the void.
    const edge = (dx: number, dy: number) => tileAt(floor, tx + dx, ty + dy) === T.Void;
    ctx.fillStyle = "#050308";
    if (edge(0, -1)) ctx.fillRect(x, y, TILE, 3);
    if (edge(-1, 0)) ctx.fillRect(x, y, 3, TILE);
    if (edge(1, 0)) ctx.fillRect(x + TILE - 3, y, 3, TILE);
    if (edge(0, 1)) ctx.fillRect(x, y + TILE - 3, TILE, 3);
  }
}

function paintTorchBracket(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#1a1418";
  ctx.fillRect(x - 3, y - 2, 6, 12);
  ctx.fillStyle = "#3a2f2a";
  ctx.fillRect(x - 6, y - 4, 12, 4);
}

function paintArenaSigil(ctx: CanvasRenderingContext2D, band: Band, x: number, y: number, r: number) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = band.accent;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(a + Math.PI * 0.66) * r, y + Math.sin(a + Math.PI * 0.66) * r); ctx.stroke();
  }
  ctx.restore();
}

export function paintDecor(ctx: CanvasRenderingContext2D, band: Band, d: Decor) {
  const x = Math.round(d.x), y = Math.round(d.y), s = d.seed;
  ctx.save();
  switch (d.kind) {
    case "bones":
      ctx.fillStyle = "#8e8699";
      ctx.fillRect(x - 7, y, 14, 2); ctx.fillRect(x - 8, y - 1, 3, 4); ctx.fillRect(x + 5, y - 1, 3, 4);
      ctx.fillRect(x - 3, y - 5, 2, 10);
      break;
    case "skull":
      ctx.fillStyle = "#a79fb3";
      ctx.fillRect(x - 5, y - 6, 10, 8); ctx.fillRect(x - 3, y + 2, 6, 3);
      ctx.fillStyle = "#120e18";
      ctx.fillRect(x - 3, y - 3, 2, 2); ctx.fillRect(x + 1, y - 3, 2, 2);
      break;
    case "candles":
      for (let i = 0; i < 3; i++) {
        const cx = x - 8 + i * 7 + (s % 3), h = 6 + ((s >> i) % 5);
        ctx.fillStyle = "#d8cfbf"; ctx.fillRect(cx, y - h, 3, h);
        ctx.fillStyle = "#ffb347"; ctx.fillRect(cx, y - h - 3, 3, 3);
      }
      break;
    case "chains":
      ctx.fillStyle = "#4a4452";
      for (let i = 0; i < 5; i++) ctx.fillRect(x - 1 + (i % 2), y - 20 + i * 5, 3, 3);
      break;
    case "terminal":
      ctx.fillStyle = "#15121c"; ctx.fillRect(x - 12, y - 16, 24, 18);
      ctx.fillStyle = "#2a2335"; ctx.fillRect(x - 12, y - 16, 24, 2);
      ctx.fillStyle = band.accent; ctx.globalAlpha = 0.45; ctx.fillRect(x - 9, y - 12, 18, 10);
      ctx.globalAlpha = 1; ctx.fillStyle = "#05030a";
      ctx.fillRect(x - 3, y - 12, 1, 10); ctx.fillRect(x - 3, y - 7, 7, 1);
      ctx.fillStyle = "#0e0b14"; ctx.fillRect(x - 8, y + 2, 16, 3);
      break;
    case "cables":
      ctx.strokeStyle = "#0e0b14"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.bezierCurveTo(x - 8, y + 10, x + 4, y - 10, x + 20, y + 4); ctx.stroke();
      ctx.fillStyle = band.accent; ctx.globalAlpha = 0.6; ctx.fillRect(x + 19, y + 2, 3, 3);
      break;
    case "runeCircle":
      ctx.strokeStyle = band.accent; ctx.globalAlpha = 0.22; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + s; ctx.fillStyle = band.accent; ctx.fillRect(x + Math.cos(a) * 20 - 2, y + Math.sin(a) * 20 - 2, 4, 4); }
      break;
    case "rubble":
      ctx.fillStyle = shade(band.wallTop, -10);
      ctx.fillRect(x - 8, y - 3, 7, 5); ctx.fillRect(x, y - 6, 9, 7); ctx.fillRect(x + 5, y + 1, 5, 4);
      ctx.fillStyle = shade(band.wallTop, 8); ctx.fillRect(x, y - 6, 9, 2);
      break;
    case "banner":
      ctx.fillStyle = "#5c1422"; ctx.fillRect(x - 6, y - 22, 12, 18);
      ctx.fillStyle = "#3d0d17"; ctx.fillRect(x - 6, y - 4, 4, 4); ctx.fillRect(x + 2, y - 4, 4, 5);
      ctx.fillStyle = band.accent; ctx.globalAlpha = 0.5; ctx.fillRect(x - 2, y - 17, 4, 8);
      break;
    case "crystal":
      ctx.fillStyle = band.accent; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 5, y); ctx.lineTo(x - 5, y); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 7, y - 8); ctx.lineTo(x + 10, y); ctx.lineTo(x + 3, y); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.fillRect(x - 1, y - 11, 1, 5);
      break;
  }
  ctx.restore();
}

/** A soft radial sprite reused for every light and glow. */
export function makeGlow(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}

const tinted = new Map<string, HTMLCanvasElement>();
export function tintedGlow(base: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const cached = tinted.get(color);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(base, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  tinted.set(color, canvas);
  return canvas;
}
