import type { GateTier, ShrineTier } from "../economy/terms";
import { BOSS_FLOORS, bandForFloor, type EventKind } from "./content";
import { Rng } from "./rng";
import type { Vec } from "./math";

export const TILE = 32;
export const T = { Void: 0, Floor: 1, Wall: 2, Door: 3, Corridor: 4 } as const;
export type T = typeof T[keyof typeof T];

export type RoomType = "start" | "combat" | "elite" | "treasure" | "shrine" | "merchant" | "event" | "bonus" | "secret" | "boss" | "exit" | "arena";
export type Rect = { x: number; y: number; w: number; h: number };
export type DecorKind = "bones" | "skull" | "candles" | "chains" | "terminal" | "cables" | "runeCircle" | "rubble" | "banner" | "crystal"
  | "coffin" | "gravestone" | "serverRack" | "pipe" | "screen" | "tendril" | "fleshPool" | "ribcage" | "eyeball" | "voidShard" | "glitch";
export type Decor = { x: number; y: number; kind: DecorKind; seed: number };

export type Room = {
  id: number; type: RoomType; cell: Vec;
  /** Interior floor rectangle, in tiles. */
  x: number; y: number; w: number; h: number;
  main: boolean;
  visited: boolean; known: boolean; cleared: boolean; revealed: boolean;
  shrine?: ShrineTier; event?: EventKind; bonus?: GateTier;
  pillars: Rect[]; decor: Decor[]; torches: Vec[];
  connections: number[];
};

export type Connection = {
  id: number; a: number; b: number;
  kind: "open" | "gate" | "secret";
  tier?: GateTier;
  /** Gates start closed until paid for; secret walls until broken. */
  open: boolean;
  /** Door openings (world-pixel rectangles) on each room's wall. */
  doorA: Rect; doorB: Rect;
  /** Pixel center of each door, for placing gates and prompts. */
  centerA: Vec; centerB: Vec;
  secretHits: number;
};

export type Floor = {
  depth: number; seed: number; width: number; height: number; tiles: Uint8Array;
  rooms: Room[]; connections: Connection[]; start: Vec;
  band: ReturnType<typeof bandForFloor>;
  bossRoom?: number; exitRoom?: number; secretRoom?: number;
  isArena: boolean;
  /** Layout grid in cells; deeper floors use a bigger grid. */
  gridW: number; gridH: number;
};

export const CELL_W = 42, CELL_H = 30;
/** Deeper floors sprawl: 7×7 cells near the surface, up to 9×9 in the deep. */
export const gridSizeFor = (depth: number) => (depth <= 3 ? 7 : depth <= 6 ? 8 : 9);
const DIRS: readonly Vec[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

type PlanIn = Omit<Plan, "depth">;
type Plan = { depth: number; type: RoomType; main: boolean; shrine?: ShrineTier; event?: EventKind; bonus?: GateTier; gate?: GateTier; secret?: boolean; parent?: number };

function roomSize(rng: Rng, plan: Plan): [number, number] {
  switch (plan.type) {
    case "start": return [16, 12];
    case "combat": return [Math.min(36, rng.int(22, 32) + Math.min(4, Math.floor(plan.depth / 2))), Math.min(24, rng.int(15, 20) + Math.min(4, Math.floor(plan.depth / 3)))];
    case "elite": return [Math.min(34, 24 + Math.min(8, plan.depth)), Math.min(24, 18 + Math.floor(plan.depth / 2))];
    case "boss": return [34, 24];
    case "exit": return [14, 11];
    case "secret": return [13, 10];
    case "arena": return [30, 22];
    case "bonus": return plan.bonus === "abyssal" ? [30, 22] : plan.bonus === "cursed" ? [22, 16] : [24, 17];
    default: return [rng.int(15, 18), rng.int(11, 13)];
  }
}

function shrineTier(rng: Rng, depth: number): ShrineTier {
  return rng.weighted<ShrineTier>([["greed", 55], ["fate", 32], ["void", depth >= 2 ? 16 : 0]]);
}
function gateTier(rng: Rng, depth: number): GateTier {
  if (depth === 1) return "blood";
  return rng.weighted<GateTier>([["blood", 48], ["cursed", 36], ["abyssal", depth >= 2 ? 16 : 0]]);
}
function eventKind(rng: Rng, depth: number): EventKind {
  return rng.weighted<EventKind>([
    ["well", 18], ["stranger", 14], ["blackDoor", depth >= 2 ? 9 : 0], ["mirror", 10], ["gambler", 14],
    ["corpse", 16], ["goldenDoor", 11], ["lostFriend", 5],
  ]);
}

/** Main path and side rooms for a depth. Floor 1 is authored for a strong first minute. */
function planFloor(rng: Rng, depth: number): { main: PlanIn[]; branches: PlanIn[] } {
  const boss = BOSS_FLOORS(depth);
  if (depth === 1) {
    return {
      main: [
        { type: "start", main: true }, { type: "combat", main: true }, { type: "shrine", main: true, shrine: "greed" },
        { type: "combat", main: true }, { type: "combat", main: true }, { type: "exit", main: true },
      ],
      branches: [
        { type: "treasure", main: false },
        { type: "bonus", main: false, bonus: "blood", gate: "blood" },
        { type: "event", main: false, event: rng.pick<EventKind>(["corpse", "well", "gambler"]) },
      ],
    };
  }
  // Main paths lengthen with depth, and deep floors hide elites mid-path.
  const combatCount = Math.min(10, 3 + Math.floor(depth * 0.75));
  const main: PlanIn[] = [{ type: "start", main: true }];
  for (let i = 0; i < combatCount; i++) {
    const last = i === combatCount - 1, middle = i === Math.floor(combatCount / 2);
    main.push({ type: (last && !boss && rng.chance(0.45)) || (middle && depth >= 5 && rng.chance(0.5)) ? "elite" : "combat", main: true });
  }
  main.push(boss ? { type: "boss", main: true } : { type: "exit", main: true });
  const branches: PlanIn[] = [];
  // Depth 2 always offers the Shrine of the Void: the signature 25 RF decision.
  branches.push({ type: "shrine", main: false, shrine: depth === 2 ? "void" : shrineTier(rng, depth) });
  if (rng.chance(0.55)) branches.push({ type: "shrine", main: false, shrine: rng.chance(0.6) ? "greed" : "fate" });
  if (depth === 2 || rng.chance(0.6)) branches.push({ type: "merchant", main: false });
  branches.push({ type: "event", main: false, event: eventKind(rng, depth) });
  if (rng.chance(0.45)) branches.push({ type: "event", main: false, event: eventKind(rng, depth) });
  if (rng.chance(0.65)) branches.push({ type: "treasure", main: false });
  const tier = gateTier(rng, depth);
  branches.push({ type: "bonus", main: false, bonus: tier, gate: tier });
  if (rng.chance(0.55)) branches.push({ type: "secret", main: false, secret: true });
  // Optional side wings: extra fights, and on deep floors extra shrines and events.
  for (let i = 0; i < Math.min(4, Math.floor((depth - 1) / 2)); i++) branches.push({ type: "combat", main: false });
  if (depth >= 5 && rng.chance(0.6)) branches.push({ type: "event", main: false, event: eventKind(rng, depth) });
  if (depth >= 6 && rng.chance(0.5)) branches.push({ type: "shrine", main: false, shrine: shrineTier(rng, depth) });
  return { main, branches };
}

export function generateFloor(depth: number, seed: number): Floor {
  for (let attempt = 0; attempt < 40; attempt++) {
    const floor = tryGenerate(depth, seed + attempt * 7919);
    if (floor) return floor;
  }
  throw new Error("Could not generate a dungeon floor.");
}

function tryGenerate(depth: number, seed: number): Floor | null {
  const rng = new Rng(seed);
  const raw = planFloor(rng, depth);
  const plan = { main: raw.main.map(p => ({ ...p, depth })), branches: raw.branches.map(p => ({ ...p, depth })) };
  const GRID_W = gridSizeFor(depth), GRID_H = GRID_W;
  const occupied = new Map<string, number>();
  const key = (v: Vec) => `${v.x},${v.y}`;
  const cells: Vec[] = [];
  const plans: Plan[] = [];
  const links: [number, number, Plan][] = [];
  let cursor: Vec = { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) };
  let heading = rng.pick(DIRS);
  for (let i = 0; i < plan.main.length; i++) {
    if (i > 0) {
      const options = rng.shuffle([...DIRS]).sort((a, b) => Number(b === heading) - Number(a === heading) || 0)
        .map(dir => ({ x: cursor.x + dir.x, y: cursor.y + dir.y, dir }))
        .filter(cell => cell.x >= 0 && cell.y >= 0 && cell.x < GRID_W && cell.y < GRID_H && !occupied.has(key(cell)));
      if (!options.length) return null;
      const next = rng.chance(0.55) ? options[0] : rng.pick(options);
      heading = next.dir;
      cursor = { x: next.x, y: next.y };
      links.push([i - 1, i, plan.main[i]]);
    }
    occupied.set(key(cursor), i);
    cells.push({ ...cursor });
    plans.push(plan.main[i]);
  }
  for (const branch of plan.branches) {
    // Branch from the middle of the main path, never from the start, boss or exit rooms.
    // Deep floors let wings branch off other wings.
    const parents = rng.shuffle(plans.map((_, index) => index).filter(index => {
      const type = plans[index].type;
      if (!plans[index].main && depth < 4) return false;
      return type !== "boss" && type !== "exit" && type !== "secret" && type !== "bonus" && (type !== "start" || branch.type === "treasure");
    }));
    let placed = false;
    for (const parent of parents) {
      const free = rng.shuffle([...DIRS]).map(dir => ({ x: cells[parent].x + dir.x, y: cells[parent].y + dir.y }))
        .filter(cell => cell.x >= 0 && cell.y >= 0 && cell.x < GRID_W && cell.y < GRID_H && !occupied.has(key(cell)));
      if (!free.length) continue;
      const index = plans.length;
      occupied.set(key(free[0]), index);
      cells.push(free[0]);
      plans.push({ ...branch, parent });
      links.push([parent, index, branch]);
      placed = true;
      break;
    }
    if (!placed && branch.type !== "secret" && branch.type !== "event" && branch.type !== "combat" && branch.type !== "shrine") return null;
  }

  // Loops: deeper floors connect neighbouring rooms, so there is more than one route.
  const loopable = (i: number) => ["start", "combat", "elite", "event", "shrine", "merchant", "treasure"].includes(plans[i].type);
  const linked = new Set(links.map(([a, b]) => `${Math.min(a, b)}:${Math.max(a, b)}`));
  const loopChance = Math.min(0.5, 0.08 * (depth - 1));
  for (let i = 0; i < cells.length; i++) for (const dir of [DIRS[0], DIRS[2]]) {
    const j = occupied.get(key({ x: cells[i].x + dir.x, y: cells[i].y + dir.y }));
    if (j === undefined || !loopable(i) || !loopable(j) || linked.has(`${Math.min(i, j)}:${Math.max(i, j)}`) || !rng.chance(loopChance)) continue;
    linked.add(`${Math.min(i, j)}:${Math.max(i, j)}`);
    links.push([i, j, { depth, type: plans[j].type, main: false }]);
  }

  const width = GRID_W * CELL_W, height = GRID_H * CELL_H;
  const tiles = new Uint8Array(width * height);
  const set = (x: number, y: number, value: T) => { if (x >= 0 && y >= 0 && x < width && y < height) tiles[y * width + x] = value; };
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < width && y < height ? tiles[y * width + x] : T.Void);

  const rooms: Room[] = plans.map((p, id) => {
    const [w, h] = roomSize(rng, p);
    const cell = cells[id];
    const jx = rng.int(-2, 2), jy = rng.int(-1, 1);
    const x = Math.max(cell.x * CELL_W + 3, Math.min(cell.x * CELL_W + CELL_W - 3 - w, cell.x * CELL_W + Math.floor((CELL_W - w) / 2) + jx));
    const y = Math.max(cell.y * CELL_H + 3, Math.min(cell.y * CELL_H + CELL_H - 3 - h, cell.y * CELL_H + Math.floor((CELL_H - h) / 2) + jy));
    return {
      id, type: p.type, cell, x, y, w, h, main: p.main, visited: false, known: false, cleared: false, revealed: false,
      shrine: p.shrine, event: p.event, bonus: p.bonus, pillars: [], decor: [], torches: [], connections: [],
    };
  });
  for (const room of rooms) for (let ty = room.y; ty < room.y + room.h; ty++) for (let tx = room.x; tx < room.x + room.w; tx++) set(tx, ty, T.Floor);

  const connections: Connection[] = [];
  for (const [ai, bi, p] of links) {
    const a = rooms[ai], b = rooms[bi];
    const conn = carveCorridor(a, b, set, get);
    const connection: Connection = {
      id: connections.length, a: ai, b: bi, kind: p.gate ? "gate" : p.secret ? "secret" : "open", tier: p.gate,
      open: !p.gate && !p.secret, secretHits: 0, ...conn,
    };
    connections.push(connection);
    a.connections.push(connection.id);
    b.connections.push(connection.id);
  }

  // Interior architecture: deeper rooms get colonnades, dividing walls, inner rings and crosses.
  // Every layout keeps the centre 3×3 and the door lanes open, so rooms stay connected.
  const wall = (x: number, y: number) => set(x, y, T.Wall);
  const shaped = new Set<number>();
  for (const room of rooms) {
    if (!["combat", "elite", "bonus"].includes(room.type) || room.w < 22 || !rng.chance(Math.min(0.85, 0.1 + 0.1 * depth))) continue;
    const cx = room.x + Math.floor(room.w / 2), cy = room.y + Math.floor(room.h / 2);
    const nearCentre = (x: number, y: number) => Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2;
    const nearDoorLane = (x: number, y: number) => Math.abs(y - cy) <= 2 && (x <= room.x + 2 || x >= room.x + room.w - 3) || Math.abs(x - cx) <= 2 && (y <= room.y + 2 || y >= room.y + room.h - 3);
    shaped.add(room.id);
    const layout = rng.weighted<string>([["colonnade", 3], ["divider", depth >= 3 ? 3 : 1], ["ring", depth >= 4 && room.w >= 26 && room.h >= 18 ? 3 : 0], ["cross", depth >= 5 ? 2.5 : 0]]);
    const place = (x: number, y: number) => { if (!nearCentre(x, y) && !nearDoorLane(x, y)) wall(x, y); };
    if (layout === "colonnade") {
      for (const fy of [0.28, 0.72]) for (let x = room.x + 3; x < room.x + room.w - 3; x += 4) place(x, room.y + Math.round(room.h * fy));
    } else if (layout === "divider") {
      for (const fx of room.w >= 28 ? [0.33, 0.67] : [0.33]) {
        const x = room.x + Math.round(room.w * fx);
        for (let y = room.y + 2; y < room.y + room.h - 2; y++) if (Math.abs(y - cy) > 1 && Math.abs(y - (room.y + 3 + ((x * 7) % 3))) > 0) place(x, y);
      }
    } else if (layout === "ring") {
      const ix = room.x + 5, iy = room.y + 4, iw = room.w - 10, ih = room.h - 8;
      for (let x = ix; x < ix + iw; x++) for (const y of [iy, iy + ih - 1]) if (Math.abs(x - cx) > 1) place(x, y);
      for (let y = iy; y < iy + ih; y++) for (const x of [ix, ix + iw - 1]) if (Math.abs(y - cy) > 1) place(x, y);
    } else {
      for (let x = room.x + 4; x < room.x + room.w - 4; x++) if (Math.abs(x - cx) > 2) place(x, cy - 3);
      for (let y = room.y + 3; y < room.y + room.h - 3; y++) if (Math.abs(y - cy) > 2) place(cx + 4, y);
    }
  }

  // Pillars break up the bigger combat rooms without cutting off doors.
  for (const room of rooms) {
    if (!["combat", "elite", "bonus", "boss"].includes(room.type) || shaped.has(room.id) || room.w < 24 || rng.chance(0.3)) continue;
    const layouts: Vec[][] = [
      [{ x: 0.25, y: 0.3 }, { x: 0.75, y: 0.3 }, { x: 0.25, y: 0.7 }, { x: 0.75, y: 0.7 }],
      [{ x: 0.33, y: 0.5 }, { x: 0.67, y: 0.5 }],
      [{ x: 0.2, y: 0.5 }, { x: 0.5, y: 0.28 }, { x: 0.5, y: 0.72 }, { x: 0.8, y: 0.5 }],
    ];
    for (const spot of rng.pick(layouts)) {
      const px = room.x + Math.round(room.w * spot.x) - 1, py = room.y + Math.round(room.h * spot.y) - 1;
      const pillar = { x: px, y: py, w: 2, h: 2 };
      room.pillars.push(pillar);
      for (let ty = py; ty < py + 2; ty++) for (let tx = px; tx < px + 2; tx++) set(tx, ty, T.Wall);
    }
  }

  // Walls wrap every walkable tile.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (get(x, y) !== T.Void) continue;
    for (let dy = -1; dy <= 1 && get(x, y) === T.Void; dy++) for (let dx = -1; dx <= 1; dx++) {
      const n = get(x + dx, y + dy);
      if (n === T.Floor || n === T.Door || n === T.Corridor) { set(x, y, T.Wall); break; }
    }
  }

  const theme = bandForFloor(depth);
  for (const room of rooms) decorate(rng, room, get, theme.decor);

  const start = rooms[0];
  start.visited = true;
  start.known = true;
  start.cleared = true;
  for (const id of start.connections) {
    const c = connections[id];
    const other = rooms[c.a === start.id ? c.b : c.a];
    if (c.kind !== "secret") other.known = true;
  }
  return {
    depth, seed, width, height, tiles, rooms, connections,
    start: { x: (start.x + start.w / 2) * TILE, y: (start.y + start.h / 2 + 1) * TILE },
    band: bandForFloor(depth),
    bossRoom: rooms.find(r => r.type === "boss")?.id,
    exitRoom: rooms.find(r => r.type === "exit")?.id,
    secretRoom: rooms.find(r => r.type === "secret")?.id,
    isArena: false, gridW: GRID_W, gridH: GRID_H,
  };
}

function carveCorridor(a: Room, b: Room, set: (x: number, y: number, v: T) => void, get: (x: number, y: number) => number) {
  const horizontal = a.cell.y === b.cell.y;
  const [first, second] = horizontal ? (a.cell.x < b.cell.x ? [a, b] : [b, a]) : (a.cell.y < b.cell.y ? [a, b] : [b, a]);
  const carve = (x: number, y: number) => { if (get(x, y) !== T.Floor) set(x, y, T.Corridor); };
  let doorFirst: Rect, doorSecond: Rect;
  if (horizontal) {
    const y1 = first.y + Math.floor(first.h / 2), y2 = second.y + Math.floor(second.h / 2);
    const x1 = first.x + first.w, x2 = second.x - 1;
    const mid = Math.floor((x1 + x2) / 2);
    for (let x = x1; x <= mid + 1; x++) for (let d = -1; d <= 1; d++) carve(x, y1 + d);
    for (let y = Math.min(y1, y2) - 1; y <= Math.max(y1, y2) + 1; y++) for (let d = -1; d <= 1; d++) carve(mid + d, y);
    for (let x = mid - 1; x <= x2; x++) for (let d = -1; d <= 1; d++) carve(x, y2 + d);
    for (let d = -1; d <= 1; d++) { set(x1, y1 + d, T.Door); set(x2, y2 + d, T.Door); }
    doorFirst = { x: x1 * TILE, y: (y1 - 1) * TILE, w: TILE, h: TILE * 3 };
    doorSecond = { x: x2 * TILE, y: (y2 - 1) * TILE, w: TILE, h: TILE * 3 };
  } else {
    const x1 = first.x + Math.floor(first.w / 2), x2 = second.x + Math.floor(second.w / 2);
    const y1 = first.y + first.h, y2 = second.y - 1;
    const mid = Math.floor((y1 + y2) / 2);
    for (let y = y1; y <= mid + 1; y++) for (let d = -1; d <= 1; d++) carve(x1 + d, y);
    for (let x = Math.min(x1, x2) - 1; x <= Math.max(x1, x2) + 1; x++) for (let d = -1; d <= 1; d++) carve(x, mid + d);
    for (let y = mid - 1; y <= y2; y++) for (let d = -1; d <= 1; d++) carve(x2 + d, y);
    for (let d = -1; d <= 1; d++) { set(x1 + d, y1, T.Door); set(x2 + d, y2, T.Door); }
    doorFirst = { x: (x1 - 1) * TILE, y: y1 * TILE, w: TILE * 3, h: TILE };
    doorSecond = { x: (x2 - 1) * TILE, y: y2 * TILE, w: TILE * 3, h: TILE };
  }
  const centre = (r: Rect): Vec => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const [doorA, doorB] = first === a ? [doorFirst, doorSecond] : [doorSecond, doorFirst];
  return { doorA, doorB, centerA: centre(doorA), centerB: centre(doorB) };
}

function decorate(rng: Rng, room: Room, get: (x: number, y: number) => number, decor: readonly (readonly [string, number])[]) {
  const pickKind = (): DecorKind => rng.weighted(decor as readonly (readonly [DecorKind, number])[]);
  const count = Math.round(room.w * room.h / 42);
  for (let i = 0; i < count; i++) {
    const x = room.x + 1 + rng.next() * (room.w - 2), y = room.y + 1 + rng.next() * (room.h - 2);
    if (get(Math.floor(x), Math.floor(y)) !== T.Floor) continue;
    // Keep the middle of the room readable.
    if (Math.abs(x - (room.x + room.w / 2)) < 3 && Math.abs(y - (room.y + room.h / 2)) < 3) continue;
    room.decor.push({ x: x * TILE, y: y * TILE, kind: pickKind(), seed: rng.int(0, 1e6) });
  }
  for (let x = room.x + 2; x < room.x + room.w - 1; x += rng.int(5, 7)) {
    if (get(x, room.y - 1) === T.Wall) room.torches.push({ x: x * TILE + TILE / 2, y: (room.y - 1) * TILE + TILE * 0.55 });
  }
}

/** A single-room pocket dimension for secret bosses and cursed dungeons. */
export function generateArena(depth: number, seed: number, w = 30, h = 22): Floor {
  const rng = new Rng(seed);
  const width = w + 12, height = h + 12;
  const tiles = new Uint8Array(width * height);
  const room: Room = {
    id: 0, type: "arena", cell: { x: 0, y: 0 }, x: 6, y: 6, w, h, main: true, visited: true, known: true, cleared: false, revealed: true,
    pillars: [], decor: [], torches: [], connections: [],
  };
  for (let y = room.y; y < room.y + h; y++) for (let x = room.x; x < room.x + w; x++) tiles[y * width + x] = T.Floor;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (tiles[y * width + x] !== T.Void) continue;
    let near = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && tiles[ny * width + nx] === T.Floor) near = true;
    }
    if (near) tiles[y * width + x] = T.Wall;
  }
  decorate(rng, room, (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? tiles[y * width + x] : T.Void), bandForFloor(99).decor);
  return {
    depth, seed, width, height, tiles, rooms: [room], connections: [],
    start: { x: (room.x + w / 2) * TILE, y: (room.y + h - 3) * TILE }, band: { ...bandForFloor(99) }, isArena: true, gridW: 1, gridH: 1,
  };
}

export const roomCenter = (room: Room): Vec => ({ x: (room.x + room.w / 2) * TILE, y: (room.y + room.h / 2) * TILE });
export const roomRectPx = (room: Room): Rect => ({ x: room.x * TILE, y: room.y * TILE, w: room.w * TILE, h: room.h * TILE });
export function roomAt(floor: Floor, p: Vec): Room | undefined {
  const tx = p.x / TILE, ty = p.y / TILE;
  return floor.rooms.find(room => tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h);
}
export function tileAt(floor: Floor, tx: number, ty: number): number {
  return tx >= 0 && ty >= 0 && tx < floor.width && ty < floor.height ? floor.tiles[ty * floor.width + tx] : T.Void;
}
