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
    if (room.type === "boss" || (room.type === "arena" && floor.depth > 0)) paintArenaSigil(ctx, band, rx + rw / 2, ry + rh / 2, Math.min(rw, rh) * 0.36);
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
  // Floor-specific surface detail.
  if (!corridor) {
    if (band.style === "tech") {
      ctx.fillStyle = shade(base, -16); ctx.fillRect(x + 15, y, 2, TILE); ctx.fillRect(x, y + 15, TILE, 2);
      ctx.fillStyle = shade(base, 22); for (const [bx, by] of [[3, 3], [27, 3], [3, 27], [27, 27]]) ctx.fillRect(x + bx, y + by, 2, 2);
      if (n > 0.9) { ctx.fillStyle = band.accent; ctx.globalAlpha = 0.28; ctx.fillRect(x + 4, y + 15, 24, 2); ctx.globalAlpha = 1; }
    } else if (band.style === "flesh") {
      if (n > 0.55) {
        ctx.strokeStyle = shade(base, 24); ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(x, y + n * 30); ctx.quadraticCurveTo(x + 16, y + (1 - n) * 32, x + TILE, y + n * 20); ctx.stroke();
      }
      if (n < 0.06) { ctx.fillStyle = "#6a1020"; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(x + 16, y + 16, 9, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    } else if (band.style === "frost") {
      if (n > 0.82) { ctx.fillStyle = "#e9f6ff"; ctx.globalAlpha = 0.5; ctx.fillRect(x + Math.floor(n * 97) % 26 + 3, y + Math.floor(n * 53) % 26 + 3, 2, 2); ctx.globalAlpha = 1; }
      if (n < 0.18) { ctx.strokeStyle = "#bfe8ff"; ctx.globalAlpha = 0.12; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 4, y + 26); ctx.lineTo(x + 26, y + 4); ctx.stroke(); ctx.globalAlpha = 1; }
    } else if (band.style === "ember") {
      if (n > 0.86) { ctx.strokeStyle = band.accent; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 3, y + n * 28); ctx.lineTo(x + 16, y + 16); ctx.lineTo(x + 29, y + (1 - n) * 30); ctx.stroke(); ctx.globalAlpha = 1; }
      if (n < 0.1) { ctx.fillStyle = "#0e0806"; ctx.globalAlpha = 0.5; ctx.fillRect(x + 8, y + 8, 16, 16); ctx.globalAlpha = 1; }
    } else if (band.style === "rot") {
      if (n > 0.58) { ctx.fillStyle = shade(base, 18); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(x + 16, y + 16, 6 + n * 8, 4 + n * 4, n * 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      if (n < 0.05) { ctx.fillStyle = band.accent; ctx.fillRect(x + 14, y + 12, 3, 2); ctx.fillStyle = "#d8cfbf"; ctx.fillRect(x + 15, y + 14, 1, 3); }
    } else if (band.style === "sunken") {
      if (n > 0.72) { ctx.fillStyle = "#3ef0ff"; ctx.globalAlpha = 0.08; ctx.beginPath(); ctx.ellipse(x + 16, y + 16, 14, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      if (n < 0.12) { ctx.strokeStyle = "#a8e6ff"; ctx.globalAlpha = 0.15; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 4, y + 18); ctx.quadraticCurveTo(x + 16, y + 12, x + 28, y + 18); ctx.stroke(); ctx.globalAlpha = 1; }
    } else if (band.style === "clock") {
      ctx.fillStyle = shade(base, 20); for (const [bx, by] of [[2, 2], [28, 2], [2, 28], [28, 28]]) ctx.fillRect(x + bx, y + by, 2, 2);
      if (n > 0.9) { ctx.strokeStyle = band.accent; ctx.globalAlpha = 0.25; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 16, y + 16, 9, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    } else if (band.style === "mirror") {
      if ((tx + ty) % 2 === 0) { ctx.fillStyle = shade(base, 8); ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2); }
      if (n > 0.9) { ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.35; ctx.fillRect(x + 6, y + 6, 1, 6); ctx.fillRect(x + 4, y + 8, 5, 1); ctx.globalAlpha = 1; }
    } else if (band.style === "void") {
      if (n > 0.8) { ctx.fillStyle = n > 0.97 ? band.accent : "#6d6780"; ctx.fillRect(x + Math.floor(n * 97) % 28 + 2, y + Math.floor(n * 53) % 28 + 2, 1, 1); }
      if ((tx + ty * 3) % 11 === 0) { ctx.fillStyle = band.torch; ctx.globalAlpha = 0.12; ctx.fillRect(x, y, TILE, 1); ctx.globalAlpha = 1; }
    }
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
    if (band.style === "flesh" && n > 0.6) { ctx.fillStyle = shade(band.wallTop, 20); ctx.fillRect(x + Math.floor(n * 90) % 26 + 3, y + 10, 2, 6 + Math.floor(n * 10)); }
    if (band.style === "tech" && n > 0.45 && n < 0.6) { ctx.fillStyle = band.accent; ctx.globalAlpha = 0.5; ctx.fillRect(x + 6, y + 22, 3, 3); ctx.fillRect(x + 12, y + 22, 3, 3); ctx.globalAlpha = 1; }
    if (band.style === "frost" && n > 0.35) { ctx.fillStyle = "#bfe8ff"; ctx.globalAlpha = 0.7; for (let i = 0; i < 3; i++) { const ix = x + 4 + i * 10 + Math.floor(n * 7) % 4; ctx.fillRect(ix, y + TILE - 3, 3, 3 + ((i * 7 + Math.floor(n * 50)) % 6)); } ctx.globalAlpha = 1; }
    if (band.style === "ember" && n > 0.55 && n < 0.7) { ctx.fillStyle = band.accent; ctx.globalAlpha = 0.6; ctx.fillRect(x, y + 20, TILE, 1); ctx.globalAlpha = 1; }
    if (band.style === "rot" && n > 0.5) { ctx.fillStyle = "#2c4a2a"; ctx.fillRect(x + Math.floor(n * 90) % 24 + 3, y + 10, 3, 12 + Math.floor(n * 8)); }
    if (band.style === "sunken" && n > 0.4) { ctx.fillStyle = "#3ef0ff"; ctx.globalAlpha = 0.1; ctx.fillRect(x, y + 22, TILE, 10); ctx.globalAlpha = 1; }
    if (band.style === "clock" && n > 0.6 && n < 0.75) { ctx.fillStyle = "#6a5530"; ctx.fillRect(x, y + 15, TILE, 3); ctx.fillStyle = band.accent; ctx.globalAlpha = 0.4; ctx.fillRect(x + 14, y + 14, 4, 5); ctx.globalAlpha = 1; }
    if (band.style === "mirror" && n > 0.72) { ctx.fillStyle = "#c9c2e6"; ctx.globalAlpha = 0.35; ctx.fillRect(x + 8, y + 12, 16, 16); ctx.fillStyle = "#ffffff"; ctx.fillRect(x + 10, y + 14, 2, 8); ctx.globalAlpha = 1; }
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
    case "coffin":
      ctx.fillStyle = "#2a1c14"; ctx.beginPath(); ctx.moveTo(x - 6, y - 16); ctx.lineTo(x + 6, y - 16); ctx.lineTo(x + 9, y - 8); ctx.lineTo(x + 6, y + 14); ctx.lineTo(x - 6, y + 14); ctx.lineTo(x - 9, y - 8); ctx.fill();
      ctx.fillStyle = "#4a3222"; ctx.fillRect(x - 1, y - 10, 2, 16); ctx.fillRect(x - 5, y - 5, 10, 2);
      break;
    case "gravestone":
      ctx.fillStyle = shade(band.wallTop, 6); ctx.beginPath(); ctx.moveTo(x - 8, y + 4); ctx.lineTo(x - 8, y - 10); ctx.arc(x, y - 10, 8, Math.PI, 0); ctx.lineTo(x + 8, y + 4); ctx.fill();
      ctx.fillStyle = shade(band.wallTop, -18); ctx.fillRect(x - 1, y - 12, 2, 10); ctx.fillRect(x - 4, y - 9, 8, 2);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x - 9, y + 4, 18, 3);
      break;
    case "serverRack":
      ctx.fillStyle = "#0e1418"; ctx.fillRect(x - 10, y - 26, 20, 30);
      ctx.fillStyle = "#1f2c33"; for (let i = 0; i < 5; i++) ctx.fillRect(x - 8, y - 24 + i * 6, 16, 4);
      ctx.fillStyle = band.accent; ctx.globalAlpha = 0.8; for (let i = 0; i < 5; i++) if ((s >> i) & 1) ctx.fillRect(x + 4, y - 23 + i * 6, 2, 2);
      break;
    case "pipe":
      ctx.fillStyle = "#1c262c"; ctx.fillRect(x - 24, y - 4, 48, 8);
      ctx.fillStyle = "#2c3a42"; ctx.fillRect(x - 24, y - 4, 48, 2); ctx.fillRect(x - 14, y - 6, 4, 12); ctx.fillRect(x + 10, y - 6, 4, 12);
      ctx.fillStyle = band.accent; ctx.globalAlpha = 0.5; ctx.fillRect(x - 2, y - 1, 4, 2);
      break;
    case "screen":
      ctx.fillStyle = "#0a0f12"; ctx.fillRect(x - 12, y - 18, 24, 16);
      ctx.fillStyle = band.accent; ctx.globalAlpha = 0.35; ctx.fillRect(x - 10, y - 16, 20, 12);
      ctx.globalAlpha = 0.7; for (let i = 0; i < 4; i++) ctx.fillRect(x - 8, y - 14 + i * 3, (s >> i) % 14 + 3, 1);
      ctx.globalAlpha = 1; ctx.fillStyle = "#0a0f12"; ctx.fillRect(x - 2, y - 2, 4, 5);
      break;
    case "tendril":
      ctx.strokeStyle = "#3d0d17"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - 14, y + 6); ctx.bezierCurveTo(x - 4, y - 12, x + 6, y + 10, x + 14, y - 10); ctx.stroke();
      ctx.strokeStyle = "#7a1c30"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = band.accent; ctx.globalAlpha = 0.5; ctx.fillRect(x + 13, y - 12, 3, 3);
      break;
    case "fleshPool":
      ctx.fillStyle = "#4a0c16"; ctx.beginPath(); ctx.ellipse(x, y, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#8a1c2b"; ctx.beginPath(); ctx.ellipse(x - 3, y - 1, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff8fa3"; ctx.globalAlpha = 0.6; ctx.fillRect(x - 8, y - 3, 4, 1);
      break;
    case "ribcage":
      ctx.strokeStyle = "#a79fb3"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y); ctx.stroke();
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(x + i * 6, y, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      break;
    case "eyeball":
      ctx.fillStyle = "#e9e4ff"; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#c2283f"; ctx.beginPath(); ctx.arc(x + ((s % 3) - 1) * 2, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#07050b"; ctx.fillRect(x + ((s % 3) - 1) * 2 - 1, y - 1, 2, 2);
      break;
    case "voidShard":
      ctx.fillStyle = s % 2 ? band.accent : band.torch; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x + 6, y - 4); ctx.lineTo(x, y + 2); ctx.lineTo(x - 5, y - 6); ctx.fill();
      ctx.globalAlpha = 0.4; ctx.fillRect(x + 8, y - 12, 3, 3); ctx.fillRect(x - 10, y - 2, 2, 2);
      break;
    case "glitch":
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? band.accent : band.torch; ctx.globalAlpha = 0.35; ctx.fillRect(x - 14 + ((s >> i) % 10), y - 8 + i * 4, 10 + ((s >> (i + 2)) % 16), 2); }
      break;
    case "icicle":
      ctx.fillStyle = "#bfe8ff"; ctx.globalAlpha = 0.8;
      for (let i = 0; i < 3; i++) { const ix = x - 8 + i * 8, h = 8 + ((s >> i) % 8); ctx.beginPath(); ctx.moveTo(ix - 3, y - h); ctx.lineTo(ix + 3, y - h); ctx.lineTo(ix, y); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.fillStyle = "#ffffff"; ctx.fillRect(x - 8, y - 12, 1, 4);
      break;
    case "frozenFriend":
      // A Friend the Archive kept: a dark shape in a block of ice.
      ctx.fillStyle = "#8fe3ff"; ctx.globalAlpha = 0.35; ctx.fillRect(x - 11, y - 26, 22, 28);
      ctx.globalAlpha = 0.9; ctx.fillStyle = "#16263a";
      ctx.fillRect(x - 5, y - 20, 10, 6); ctx.fillRect(x - 7, y - 14, 14, 8); ctx.fillRect(x - 5, y - 6, 3, 5); ctx.fillRect(x + 2, y - 6, 3, 5);
      ctx.fillStyle = "#e9f6ff"; ctx.globalAlpha = 0.7; ctx.fillRect(x - 11, y - 26, 22, 2); ctx.fillRect(x + 7, y - 22, 1, 10);
      break;
    case "shelf":
      ctx.fillStyle = "#2a2f45"; ctx.fillRect(x - 16, y - 24, 32, 26);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
        ctx.fillStyle = ["#4a5d8a", "#8fa3c9", "#5c4a6a", "#34496a"][(s >> (i + r)) % 4];
        ctx.fillRect(x - 14 + i * 5, y - 22 + r * 8, 4, 6);
      }
      ctx.fillStyle = "#bfe8ff"; ctx.globalAlpha = 0.5; ctx.fillRect(x - 16, y - 24, 32, 2);
      break;
    case "anvil":
      ctx.fillStyle = "#3a3a44"; ctx.fillRect(x - 12, y - 12, 24, 6); ctx.fillRect(x - 5, y - 6, 10, 6); ctx.fillRect(x - 9, y, 18, 3);
      ctx.fillRect(x + 12, y - 11, 5, 3);
      ctx.fillStyle = "#6a6a74"; ctx.fillRect(x - 12, y - 12, 24, 2);
      break;
    case "lavaCrack":
      ctx.strokeStyle = "#ff5a3c"; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x - 16, y + (s % 5)); ctx.lineTo(x - 5, y - 4); ctx.lineTo(x + 3, y + 3); ctx.lineTo(x + 16, y - (s % 4)); ctx.stroke();
      ctx.strokeStyle = "#ffd23c"; ctx.lineWidth = 1; ctx.stroke();
      break;
    case "brazier":
      ctx.fillStyle = "#3a2418"; ctx.fillRect(x - 8, y - 10, 16, 6); ctx.fillRect(x - 2, y - 4, 4, 6); ctx.fillRect(x - 6, y + 2, 12, 2);
      ctx.fillStyle = "#ff9a3c"; ctx.fillRect(x - 6, y - 14, 12, 4); ctx.fillStyle = "#ffd23c"; ctx.fillRect(x - 3, y - 17, 6, 4);
      break;
    case "mushroom":
      for (let i = 0; i < 2 + (s % 2); i++) {
        const mx = x - 8 + i * 8, h = 5 + ((s >> i) % 6), cap = ["#ff8fb3", "#b9ff6b", "#d9c9a8"][(s >> (i + 1)) % 3];
        ctx.fillStyle = "#d8cfbf"; ctx.fillRect(mx - 1, y - h, 3, h);
        ctx.fillStyle = cap; ctx.fillRect(mx - 4, y - h - 3, 9, 4); ctx.fillStyle = "#ffffff"; ctx.fillRect(mx - 2, y - h - 2, 1, 1);
      }
      break;
    case "thornVine":
      ctx.strokeStyle = "#2c4a2a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.bezierCurveTo(x - 6, y - 14, x + 6, y + 10, x + 18, y - 4); ctx.stroke();
      ctx.fillStyle = "#6ee07a"; for (let i = 0; i < 5; i++) ctx.fillRect(x - 14 + i * 7, y - 5 + ((s >> i) % 7) - 3, 2, 2);
      break;
    case "sporePod":
      ctx.fillStyle = "#2c4a2a"; ctx.beginPath(); ctx.ellipse(x, y - 6, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#b9ff6b"; ctx.globalAlpha = 0.8; for (const [px, py] of [[-4, -9], [3, -7], [-1, -3], [5, -2]]) ctx.fillRect(x + px, y + py, 2, 2);
      break;
    case "puddle":
      ctx.fillStyle = "#3ef0ff"; ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.ellipse(x, y, 18 + (s % 8), 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.strokeStyle = "#a8e6ff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x - 3, y - 1, 8, 3, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case "bell":
      ctx.fillStyle = "#6a5a3a"; ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x - 7, y - 16); ctx.lineTo(x + 7, y - 16); ctx.lineTo(x + 10, y); ctx.fill();
      ctx.fillStyle = "#8a7a4a"; ctx.fillRect(x - 7, y - 16, 14, 2); ctx.fillStyle = "#3ef0ff"; ctx.globalAlpha = 0.4; ctx.fillRect(x - 10, y - 2, 20, 2);
      break;
    case "kelp":
      ctx.strokeStyle = "#1f5a4a"; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const kx = x - 6 + i * 6; ctx.beginPath(); ctx.moveTo(kx, y); ctx.quadraticCurveTo(kx + 6 * (i % 2 ? 1 : -1), y - 10, kx, y - 18 - ((s >> i) % 6)); ctx.stroke(); }
      break;
    case "gear": {
      const r = 8 + (s % 5);
      ctx.fillStyle = "#6a5530";
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + s; ctx.fillRect(x + Math.cos(a) * r - 2, y + Math.sin(a) * r * 0.6 - 2, 4, 4); }
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#19160f"; ctx.beginPath(); ctx.ellipse(x, y, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "clockface":
      ctx.fillStyle = "#4a3b24"; ctx.beginPath(); ctx.arc(x, y - 12, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e8d8a8"; ctx.beginPath(); ctx.arc(x, y - 12, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#19160f"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x, y - 18); ctx.moveTo(x, y - 12); ctx.lineTo(x + 5, y - 10); ctx.stroke();
      break;
    case "pendulumClock":
      ctx.fillStyle = "#3a2e1c"; ctx.fillRect(x - 7, y - 30, 14, 32);
      ctx.fillStyle = "#e8d8a8"; ctx.beginPath(); ctx.arc(x, y - 23, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffd23c"; ctx.fillRect(x - 1, y - 16, 2, 10); ctx.beginPath(); ctx.arc(x, y - 5, 3, 0, Math.PI * 2); ctx.fill();
      break;
    case "mirrorPane":
      ctx.fillStyle = "#8a8098"; ctx.fillRect(x - 10, y - 30, 20, 32);
      ctx.fillStyle = "#c9c2e6"; ctx.fillRect(x - 8, y - 28, 16, 28);
      ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.6; ctx.fillRect(x - 6, y - 26, 2, 12); ctx.fillRect(x - 3, y - 26, 1, 6);
      if (s % 3 === 0) { ctx.globalAlpha = 1; ctx.strokeStyle = "#3d3c4e"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 8, y - 20); ctx.lineTo(x + 2, y - 14); ctx.lineTo(x + 8, y - 22); ctx.stroke(); }
      break;
    case "glassShard":
      ctx.fillStyle = "#e9e4ff"; ctx.globalAlpha = 0.7;
      for (let i = 0; i < 3; i++) { const gx = x - 8 + i * 7, gy = y - ((s >> i) % 4); ctx.beginPath(); ctx.moveTo(gx, gy - 6); ctx.lineTo(gx + 3, gy); ctx.lineTo(gx - 3, gy); ctx.fill(); }
      break;
    case "candelabra":
      ctx.fillStyle = "#8a8098"; ctx.fillRect(x - 1, y - 20, 2, 22); ctx.fillRect(x - 10, y - 16, 20, 2); ctx.fillRect(x - 10, y - 20, 2, 4); ctx.fillRect(x + 8, y - 20, 2, 4);
      ctx.fillStyle = "#f3eeff"; for (const cx of [-10, -1, 8]) ctx.fillRect(x + cx, y - 26, 2, 5);
      ctx.fillStyle = "#e9e4ff"; for (const cx of [-10, -1, 8]) ctx.fillRect(x + cx, y - 29, 2, 3);
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
