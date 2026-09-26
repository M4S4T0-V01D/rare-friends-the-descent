import { GATES, SHRINES } from "../game/content";
import { CELL_H, CELL_W, TILE, type Rect } from "../game/dungeon";
import { MODIFIER_INFO } from "../game/enemies";
import type { Enemy, Hazard, Interactable, Pickup } from "../game/entities";
import { titleCase, type Game } from "../game/Game";
import { RARITY_STYLE, rarityRank } from "../game/items";
import { angleTo, clamp, TAU } from "../game/math";
import { SHORT } from "../game/kit";
import { xpForLevel } from "../game/stats";
import { CHUNK, makeGlow, paintChunk, shade, tintedGlow } from "./world";
import { drawSprite, flashSprite, MASKS, maskSprite, type FriendArt, type FriendLook, type Sprite } from "./sprites";
import { BEAST_BODY, BEAST_EYES, beastPalette, WARDEN_BODY, WARDEN_LEG, wardenPalette } from "./bossArt";
import { formatScore } from "../game/score";

const W = 960, H = 640;
/** The lighting mask is drawn at a quarter resolution and upscaled smoothly: soft falloff, a fraction of the fill cost. */
const LIGHT_SCALE = 4, LW = W / LIGHT_SCALE, LH = H / LIGHT_SCALE;
/** The grade that turns the world toward monochrome: muted color, soft blacks, glow and foes still read. */
const FADED_FILTER = "saturate(0.5) contrast(1.06) brightness(1.08)";
/** Screen areas owned by the run HUD: player panel and buffs, the right column, the action bar. */
const HUD_RECTS: readonly (readonly [number, number, number, number])[] = [[10, 10, 336, 140], [734, 10, 216, 322], [426, 540, 342, 98]];
const FONT_UI = "VT323, ui-monospace, monospace";
const FONT_DISPLAY = "'Jacquard 24', VT323, serif";

type Light = { x: number; y: number; r: number; a: number; color?: string };
type Ember = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Mote = { x: number; y: number; vx: number; vy: number; phase: number; size: number };
type Afterimage = { x: number; y: number; sprite: Sprite; life: number; color: string };

/**
 * Three stacked canvases. The world layer receives the finished world each frame; the Rare Friends grade is a CSS
 * filter on that layer, so the browser's compositor applies it (on the GPU where there is one) instead of the game
 * re-filtering every pixel on the main thread. The HUD layer on top keeps its colors, and the CRT scanlines are a
 * static layer drawn once. The composited result is the same picture as grading and blending on one canvas.
 */
export type RenderLayers = { world: HTMLCanvasElement; hud: HTMLCanvasElement; crt: HTMLCanvasElement };

export class Renderer {
  private readonly base: CanvasRenderingContext2D;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly hud: HTMLCanvasElement;
  private readonly crtLayer: HTMLCanvasElement;
  private grade = "";
  private crtShown: boolean | null = null;
  private readonly world = document.createElement("canvas");
  private readonly wctx: CanvasRenderingContext2D;
  private readonly light = document.createElement("canvas");
  private readonly lctx: CanvasRenderingContext2D;
  private readonly glow = makeGlow();
  private chunks = new Map<string, HTMLCanvasElement>();
  private scale = 1;
  private crtDrawn = false;
  private embers: Ember[] = [];
  private lights: Light[] = [];
  /** Drawn after the lighting overlay, in world space, so glows stay bright in the dark. */
  private emissive: (() => void)[] = [];
  private t = 0;
  /** Ambient dust, sparks, spores or stars drifting through the current floor. */
  private motes: Mote[] = [];
  private afterimages: Afterimage[] = [];
  private scoreCache = { at: -1, text: "" };

  constructor(layers: RenderLayers, private readonly game: Game) {
    this.canvas = layers.world; this.hud = layers.hud; this.crtLayer = layers.crt;
    this.base = layers.world.getContext("2d", { alpha: false })!;
    this.ctx = layers.hud.getContext("2d")!;
    this.world.width = W; this.world.height = H;
    this.wctx = this.world.getContext("2d", { alpha: false })!;
    this.light.width = LW; this.light.height = LH;
    this.lctx = this.light.getContext("2d")!;
    this.setScale(1);
  }

  setScale(k: number) {
    this.scale = k;
    for (const layer of [this.canvas, this.hud, this.crtLayer]) { layer.width = W * k; layer.height = H * k; }
    this.crtDrawn = false;
  }

  floorChanged() { this.chunks.clear(); this.motes = []; this.afterimages = []; }

  render(dt: number) {
    this.t += dt;
    const g = this.game, ctx = this.ctx, k = this.scale;
    this.lights = [];
    this.emissive = [];
    const w = this.wctx;
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.imageSmoothingEnabled = false;
    if ((g.screen === "run" || g.screen === "camp") && g.floor) this.drawRun(dt);
    else if (g.screen === "camp") this.drawCamp(dt);
    else if (g.screen === "summary") this.drawSummary(dt);
    else this.drawTitle(dt);
    const base = this.base;
    base.setTransform(1, 0, 0, 1, 0, 0);
    base.imageSmoothingEnabled = false;
    base.drawImage(this.world, 0, 0, W * k, H * k);
    // The Rare Friends look grades the whole world toward black and white; the HUD layer keeps its accents.
    const grade = g.settings.faded ? FADED_FILTER : "none";
    if (grade !== this.grade) { this.grade = grade; this.canvas.style.filter = grade; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W * k, H * k);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if ((g.screen === "run" || g.screen === "camp") && g.floor) this.drawWorldOverlays();
    if (g.screen === "run" && g.floor) this.drawHud();
    this.drawCrt(g.settings.crt);
  }

  // ─── Run ───────────────────────────────────────────────────────────────────

  private cam = { x: 0, y: 0 };

  private drawRun(dt: number) {
    const g = this.game, w = this.wctx, floor = g.floor!;
    const shake = g.shakeAmount > 0 ? g.shakeAmount : 0;
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    this.cam = { x: Math.round(g.camera.x + sx), y: Math.round(g.camera.y + sy) };
    const cam = this.cam;
    w.fillStyle = "#050308";
    w.fillRect(0, 0, W, H);
    w.save();
    w.translate(-cam.x, -cam.y);
    const x0 = Math.floor(cam.x / CHUNK), y0 = Math.floor(cam.y / CHUNK);
    for (let cy = y0; cy <= Math.floor((cam.y + H) / CHUNK); cy++) for (let cx = x0; cx <= Math.floor((cam.x + W) / CHUNK); cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK > floor.width * TILE || cy * CHUNK > floor.height * TILE) continue;
      w.drawImage(this.chunk(cx, cy), cx * CHUNK, cy * CHUNK);
    }
    this.drawDoors();
    // The room you stand in carries a soft ambient light, so a fight reads edge to edge.
    const here = g.screen === "run" && g.currentRoom !== null ? floor.rooms[g.currentRoom] : null;
    if (here) this.lights.push({ x: (here.x + here.w / 2) * TILE, y: (here.y + here.h / 2) * TILE, r: Math.hypot(here.w, here.h) * TILE * 0.62, a: here.cleared ? 0.5 : 0.4 });
    for (const room of floor.rooms) for (const torch of room.torches) {
      if (!this.visible(torch.x, torch.y, 60)) continue;
      this.drawFlame(torch.x, torch.y - 8, 1, floor.band.torch);
      this.lights.push({ x: torch.x, y: torch.y, r: 170, a: 0.85 * this.flicker(torch.x), color: floor.band.torch });
    }
    for (const room of floor.rooms) for (const d of room.decor) {
      if (["candles", "crystal", "terminal", "screen", "serverRack", "voidShard", "eyeball"].includes(d.kind) && this.visible(d.x, d.y, 40)) {
        this.lights.push({ x: d.x, y: d.y, r: d.kind === "candles" ? 70 : 60, a: 0.5, color: d.kind === "candles" ? "#ffb347" : d.kind === "eyeball" ? "#c2283f" : floor.band.accent });
      }
    }
    for (const h of g.hazards) this.drawHazard(h);
    for (const c of g.corpses) if (this.visible(c.e.pos.x, c.e.pos.y, 80)) this.drawCorpse(c.e, c.t);
    this.drawAfterimages(dt);
    const stairs = g.interactables.find(it => it.kind === "station" && it.station === "descend" && this.visible(it.pos.x, it.pos.y, 260));
    if (stairs) this.drawStairs(stairs, "steps");
    const drawables: { y: number; draw: () => void }[] = [];
    if (stairs) for (const side of [-1, 1]) drawables.push({ y: stairs.pos.y + 35, draw: () => this.drawStairs(stairs, side === -1 ? "left" : "right") });
    for (const it of g.interactables) if (this.visible(it.pos.x, it.pos.y, 160)) drawables.push({ y: it.pos.y, draw: () => this.drawInteractable(it) });
    for (const p of g.pickups) if (this.visible(p.pos.x, p.pos.y, 40)) drawables.push({ y: p.pos.y, draw: () => this.drawPickup(p) });
    for (const e of g.enemies) if (this.visible(e.pos.x, e.pos.y, 120)) drawables.push({ y: e.pos.y, draw: () => this.drawEnemy(e) });
    drawables.push({ y: g.player.pos.y, draw: () => this.drawPlayer() });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
    if (stairs) this.drawStairs(stairs, "lintel");
    this.drawProjectiles();
    w.restore();
    this.applyLighting(g.screen === "camp" ? 0.5 : floor.isArena ? 0.62 : 0.55);
    w.save();
    w.translate(-cam.x, -cam.y);
    for (const draw of this.emissive) draw();
    this.drawParticles();
    this.drawMotes(dt, floor.band.style, g.screen === "camp");
    w.restore();
  }

  /** A dying enemy flashes white, pops outward and dissolves instead of vanishing. */
  private drawCorpse(e: Enemy, t: number) {
    const sprite = e.kind === "warden" || e.kind === "beast" ? null : this.enemySprite(e);
    if (!sprite) return;
    const k = Math.min(1, t / 0.4), pop = 1 + (1 - k) * 0.35, size = e.guardian ? 1.9 : 1;
    const w = this.wctx;
    w.save();
    w.globalCompositeOperation = "lighter";
    drawSprite(w, flashSprite(sprite, e.elite ? "#ff2e4d" : "#ffffff"), e.pos.x, e.pos.y + 6, false, k * 0.9, pop * size, (2 - pop) * size);
    w.restore();
  }

  private drawAfterimages(dt: number) {
    const w = this.wctx;
    for (const a of this.afterimages) {
      a.life -= dt;
      if (a.life <= 0) continue;
      w.save(); w.globalCompositeOperation = "lighter";
      drawSprite(w, flashSprite(a.sprite, a.color), a.x, a.y, false, a.life * 2.2);
      w.restore();
    }
    this.afterimages = this.afterimages.filter(a => a.life > 0);
  }

  /** Slow ambient motes give each floor air: crypt dust, tech sparks, flesh spores, void stars. */
  private drawMotes(dt: number, style: string, camp: boolean) {
    if (this.game.reducedMotion) return;
    const w = this.wctx, cam = this.cam;
    const want = camp ? 26 : 38;
    while (this.motes.length < want) {
      this.motes.push({ x: cam.x + Math.random() * W, y: cam.y + Math.random() * H, vx: (Math.random() - 0.5) * 12, vy: style === "tech" ? -18 - Math.random() * 20 : style === "flesh" ? -6 - Math.random() * 8 : (Math.random() - 0.5) * 8,
        phase: Math.random() * TAU, size: 1 + Math.random() * 2 });
    }
    const color = camp ? "#ffb347" : style === "tech" ? this.game.floor!.band.accent : style === "flesh" ? "#ff4d6d" : style === "void" ? "#ffffff" : "#b9a8e0";
    w.save();
    w.globalCompositeOperation = "lighter";
    w.fillStyle = color;
    for (const m of this.motes) {
      m.x += m.vx * dt; m.y += m.vy * dt; m.phase += dt;
      if (m.x < cam.x - 20) m.x += W + 40; else if (m.x > cam.x + W + 20) m.x -= W + 40;
      if (m.y < cam.y - 20) m.y += H + 40; else if (m.y > cam.y + H + 20) m.y -= H + 40;
      w.globalAlpha = (style === "void" ? 0.5 : 0.28) * (0.5 + 0.5 * Math.sin(m.phase * (style === "void" ? 3 : 1.3)));
      w.fillRect(Math.round(m.x), Math.round(m.y), m.size, m.size);
    }
    w.restore();
  }

  private visible(x: number, y: number, margin: number) {
    return x > this.cam.x - margin && x < this.cam.x + W + margin && y > this.cam.y - margin && y < this.cam.y + H + margin * 1.5;
  }
  private flicker(seed: number) {
    return this.game.reducedMotion ? 1 : 0.88 + Math.sin(this.t * 9 + seed) * 0.06 + Math.sin(this.t * 23 + seed * 3) * 0.05;
  }

  private chunk(cx: number, cy: number) {
    const key = `${cx},${cy}`;
    let canvas = this.chunks.get(key);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = canvas.height = CHUNK;
      paintChunk(canvas.getContext("2d")!, this.game.floor!, cx, cy);
      this.chunks.set(key, canvas);
      if (this.chunks.size > 40) this.chunks.delete(this.chunks.keys().next().value!);
    }
    return canvas;
  }

  private drawDoors() {
    const g = this.game, w = this.wctx, floor = g.floor!, band = floor.band;
    const bars = (r: Rect, color: string, alpha: number) => {
      w.save();
      w.globalAlpha = alpha;
      w.fillStyle = color;
      const vertical = r.w < r.h;
      const n = 5;
      for (let i = 0; i < n; i++) {
        if (vertical) w.fillRect(r.x + 4, r.y + 4 + i * (r.h - 8) / (n - 1) - 2, r.w - 8, 4);
        else w.fillRect(r.x + 4 + i * (r.w - 8) / (n - 1) - 2, r.y + 2, 4, r.h - 4);
      }
      w.globalAlpha = alpha * 0.35;
      w.fillRect(r.x, r.y, r.w, r.h);
      w.restore();
      this.lights.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, r: 80, a: 0.5, color });
    };
    for (const c of floor.connections) {
      if (c.open) continue;
      const r = c.doorA;
      if (c.kind === "secret") {
        w.fillStyle = shade(band.wallTop, -14);
        w.fillRect(r.x, r.y, r.w, r.h);
        w.strokeStyle = "rgba(0,0,0,0.6)"; w.lineWidth = 1;
        w.beginPath();
        const cxp = r.x + r.w / 2, cyp = r.y + r.h / 2;
        w.moveTo(cxp - 10, cyp - 12); w.lineTo(cxp - 2, cyp - 2); w.lineTo(cxp - 8, cyp + 6); w.moveTo(cxp - 2, cyp - 2); w.lineTo(cxp + 9, cyp + 3); w.lineTo(cxp + 5, cyp + 14);
        w.stroke();
        if (c.secretHits > 0) { w.strokeStyle = "#ccff00"; w.globalAlpha = 0.25 * c.secretHits; w.stroke(); w.globalAlpha = 1; }
      } else if (c.kind === "gate" && c.tier) {
        const color = GATES[c.tier].color;
        w.fillStyle = "#07050b"; w.fillRect(r.x, r.y, r.w, r.h);
        bars(r, color, 0.55 + 0.3 * Math.sin(this.t * 3));
      }
    }
    if (g.lockedRoom !== null) {
      const room = floor.rooms[g.lockedRoom];
      for (const id of room.connections) {
        const c = floor.connections[id];
        if (!c.open) continue;
        bars(c.a === room.id ? c.doorA : c.doorB, "#ff2e4d", 0.7 + 0.25 * Math.sin(this.t * 6));
      }
    }
  }

  private drawFlame(x: number, y: number, size: number, color: string) {
    const w = this.wctx, t = this.game.reducedMotion ? 0 : this.t;
    const h = (10 + Math.sin(t * 13 + x) * 2) * size;
    w.fillStyle = color;
    w.beginPath(); w.moveTo(x - 5 * size, y); w.quadraticCurveTo(x, y - h * 1.6, x + 5 * size, y); w.fill();
    w.fillStyle = "#fff3c4";
    w.beginPath(); w.moveTo(x - 2 * size, y); w.quadraticCurveTo(x, y - h * 0.8, x + 2 * size, y); w.fill();
  }

  private shadow(x: number, y: number, rx: number) {
    const w = this.wctx;
    w.fillStyle = "rgba(0,0,0,0.45)";
    w.beginPath(); w.ellipse(x, y, rx, rx * 0.38, 0, 0, TAU); w.fill();
  }

  private glowAt(x: number, y: number, r: number, color: string, alpha: number) {
    this.emissive.push(() => {
      const w = this.wctx;
      w.save();
      w.globalCompositeOperation = "lighter";
      w.globalAlpha = alpha;
      w.drawImage(tintedGlow(this.glow, color), x - r, y - r, r * 2, r * 2);
      w.restore();
    });
  }

  private drawPlayer() {
    const g = this.game, p = g.player, w = this.wctx;
    if (p.dead && p.deathTime > 1.1) return;
    const bob = p.moving || g.reducedMotion ? 0 : Math.sin(this.t * 2.4) * 1;
    this.shadow(p.pos.x, p.pos.y + 4, 16);
    const glow = g.stats.powers.has("voidHeart") && g.screen === "run" ? "#ff3d7f" : g.glowColor();
    if (g.worn.glow === "glow-null") {
      // Null Halo: a pocket of darkness with a burning rim.
      this.emissive.push(() => {
        w.save(); w.globalAlpha = 0.55; w.fillStyle = "#050308";
        w.beginPath(); w.ellipse(p.pos.x, p.pos.y - 14, 30, 34, 0, 0, TAU); w.fill();
        w.globalCompositeOperation = "lighter"; w.globalAlpha = 0.5 + 0.2 * Math.sin(this.t * 4); w.strokeStyle = "#ff3d7f"; w.lineWidth = 2;
        w.beginPath(); w.ellipse(p.pos.x, p.pos.y - 14, 31, 35, 0, 0, TAU); w.stroke(); w.restore();
      });
    } else this.glowAt(p.pos.x, p.pos.y - 14, 56, glow, g.worn.glow === "glow-lime" ? 0.22 : 0.34);
    const frame = g.reducedMotion ? 0 : Math.floor((p.moving ? p.walkTime : this.t) / (p.moving ? 0.1 : 0.16)) % 8;
    const sprite = g.art.frame(g.skinLook as FriendLook, 3, p.facing, p.moving || p.dashTime > 0, frame, p.side);
    if (p.dashTime > 0 && !g.reducedMotion && (this.afterimages.length === 0 || this.afterimages[this.afterimages.length - 1].life < 0.36)) {
      this.afterimages.push({ x: p.pos.x, y: p.pos.y + 6, sprite, life: 0.4, color: glow });
    }
    let alpha = 1;
    if (p.dead) alpha = Math.max(0, 1 - p.deathTime);
    else if (p.iframes > 0 && p.dashTime <= 0 && !g.reducedMotion && Math.floor(this.t * 20) % 2) alpha = 0.45;
    if (p.dashTime > 0) alpha = 0.7;
    w.save();
    if (p.dead) { w.translate(p.pos.x, p.pos.y); w.rotate(Math.min(1.4, p.deathTime * 2)); w.translate(-p.pos.x, -p.pos.y); }
    drawSprite(w, sprite, p.pos.x, p.pos.y + 6 + bob, false, alpha);
    if (p.hitFlash > 0) drawSprite(w, flashSprite(sprite, "#ff4d6d"), p.pos.x, p.pos.y + 6 + bob, false, 0.7);
    if (p.chill > 0) drawSprite(w, flashSprite(sprite, "#8fe3ff"), p.pos.x, p.pos.y + 6 + bob, false, 0.3);
    w.restore();
    this.lights.push({ x: p.pos.x, y: p.pos.y - 10, r: 340, a: 1 });
    if (g.worn.glow !== "glow-lime") this.lights.push({ x: p.pos.x, y: p.pos.y - 10, r: 120, a: 0.6, color: glow });
    if (p.swing) this.drawSwing();
    if (g.stats.powers.has("runeOrbit") || g.stats.powers.has("voidHeart")) {
      for (let i = 0; i < 3; i++) {
        const a = p.orbit + (i / 3) * TAU;
        const x = p.pos.x + Math.cos(a) * 58, y = p.pos.y - 14 + Math.sin(a) * 58;
        this.glowAt(x, y, 16, "#ccff00", 0.8);
        w.fillStyle = "#ccff00"; w.fillRect(x - 3, y - 3, 6, 6);
      }
    }
    if (p.weakened > 0) { w.fillStyle = "#bb66ff"; w.fillRect(p.pos.x - 2, p.pos.y - 62, 4, 4); }
  }

  private drawSwing() {
    const p = this.game.player, s = p.swing!, w = this.wctx;
    const progress = s.t / s.dur;
    const start = s.angle - s.arc / 2, sweep = s.arc * Math.min(1, progress * 1.6);
    w.save();
    w.globalCompositeOperation = "lighter";
    w.globalAlpha = 1 - progress * 0.7;
    w.strokeStyle = s.heavy ? "#ccff00" : "#e9e4ff";
    w.lineWidth = s.heavy ? 12 : 8;
    w.lineCap = "round";
    w.beginPath(); w.arc(p.pos.x, p.pos.y - 12, s.range * 0.78, start, start + sweep); w.stroke();
    w.lineWidth = 3; w.strokeStyle = "#ffffff";
    w.beginPath(); w.arc(p.pos.x, p.pos.y - 12, s.range * 0.92, start, start + sweep); w.stroke();
    w.restore();
  }

  private enemySprite(e: Enemy): Sprite | null {
    const g = this.game, frame = g.reducedMotion ? 0 : Math.floor(e.anim / 0.22) % 2;
    const mod = e.mods[0] ? MODIFIER_INFO[e.mods[0]].color : null;
    switch (e.kind) {
      case "cursed": {
        const body = e.champion && mod ? shade(mod, -70) : "#5a2a66";
        return maskSprite(`husk:${frame}:${body}`, MASKS.husk[frame], { "#": body, x: "#0b0710", e: "#ff2e4d" }, e.champion ? 4 : 3);
      }
      case "crawler": {
        const body = e.champion && mod ? shade(mod, -80) : "#2c3654";
        return maskSprite(`crawler:${frame}:${body}`, MASKS.crawler[frame], { "#": body, x: "#ff3d7f", e: "#f0e6ff" }, e.champion ? 4 : 3);
      }
      case "goblin": return maskSprite(`goblin:${frame}`, MASKS.goblin[frame], { "#": "#7a6632", x: "#2a2010", e: "#ffd23c", s: "#ccff00" }, 3);
      case "corrupted": {
        const facing = Math.abs(Math.cos(angleTo(e.pos, g.player.pos))) > 0.6 ? (g.player.pos.x < e.pos.x ? "left" : "right") : g.player.pos.y < e.pos.y ? "up" : "down";
        return g.art.frame("corrupted", 4, facing, e.state === "chase" || e.state === "charge", g.reducedMotion ? 0 : Math.floor(e.anim / 0.12) % 8, g.player.pos.x < e.pos.x ? "left" : "right");
      }
      case "unminted": return g.art.frame("void", 6, "down", false, g.reducedMotion ? 0 : Math.floor(e.anim / 0.2) % 8, "right");
      default: {
        const band = g.floor!.band, accent = band.accent, bullet = band.bullet;
        const champ = e.champion && mod ? shade(mod, -60) : null;
        const def = bestiaryLook(e.kind, champ, accent, bullet, e.minion);
        if (!def) return null;
        const f = def.mask.length > 1 ? frame : 0;
        // Palettes depend only on the floor and champion color, so this key is cheap and stable.
        return maskSprite(`${e.kind}:${f}:${def.scale}:${champ ?? ""}:${accent}:${bullet}`, def.mask[f], def.pal, def.scale);
      }
    }
  }

  private drawEnemy(e: Enemy) {
    const w = this.wctx, g = this.game;
    const spawning = e.spawnT > 0 && !e.boss ? clamp(1 - e.spawnT / 0.45, 0, 1) : 1;
    if (e.spawnT > 0 && !e.boss) {
      w.save(); w.globalAlpha = 0.6; w.strokeStyle = e.elite ? "#ff2e4d" : "#9a7fd1"; w.lineWidth = 2;
      w.beginPath(); w.ellipse(e.pos.x, e.pos.y + 2, e.radius * 1.6 * spawning + 6, (e.radius * 1.6 * spawning + 6) * 0.4, 0, 0, TAU); w.stroke(); w.restore();
    }
    this.shadow(e.pos.x, e.pos.y + 3, e.radius * 1.1);
    if (e.elite || e.champion) {
      const color = e.mods[0] ? MODIFIER_INFO[e.mods[0]].color : "#ff2e4d";
      w.save(); w.globalAlpha = 0.5 + 0.2 * Math.sin(this.t * 5); w.strokeStyle = color; w.lineWidth = 2;
      w.beginPath(); w.ellipse(e.pos.x, e.pos.y + 3, e.radius * 1.5, e.radius * 0.6, 0, 0, TAU); w.stroke(); w.restore();
      this.glowAt(e.pos.x, e.pos.y - e.radius, e.radius * 2.4, color, 0.18);
    }
    if (e.shield > 0) {
      w.save(); w.globalCompositeOperation = "lighter"; w.globalAlpha = 0.35 + 0.1 * Math.sin(this.t * 6); w.strokeStyle = "#4fb0ff"; w.lineWidth = e.shield > 1 ? 3 : 1.5;
      w.beginPath(); w.arc(e.pos.x, e.pos.y - e.radius, e.radius + 12, 0, TAU); w.stroke(); w.restore();
    }
    if (e.kind === "warden") { this.drawWarden(e); return; }
    if (e.kind === "beast") { this.drawBeast(e); return; }
    const sprite = this.enemySprite(e)!;
    const telegraph = e.state === "windup" || e.state === "aim" || e.state === "chargeAim" || e.state === "blink" || e.state === "tell" || e.state === "gaze" || e.state === "vanish"
      || e.state === "fuse" || e.state === "reveal" || e.state === "lock" || e.state === "pound" || e.state === "cast" || (e.state === "burst" && e.stateT < 0);
    // Grave Wraiths are nearly invisible until they strike; a faint shimmer gives them away.
    const ghost = e.kind === "wraith" && e.state === "fade" && e.hitFlash <= 0 ? 0.14 + 0.06 * Math.sin(this.t * 7 + e.seed) : 1;
    // Squash on hit, stretch on a fuse or wind-up, a slow breath otherwise.
    const breathe = g.reducedMotion ? 0 : Math.sin(e.anim * 3 + e.seed) * 0.03;
    const size = e.guardian ? 1.9 : 1;
    const sx = size * (e.hitFlash > 0 ? 1.14 : e.state === "fuse" ? 1 + 0.12 * Math.abs(Math.sin(this.t * 24)) : 1 + breathe);
    const sy = size * (e.hitFlash > 0 ? 0.88 : e.state === "fuse" ? 1 - 0.06 * Math.abs(Math.sin(this.t * 24)) : 1 - breathe);
    // A faint halo keeps every foe readable in the dark; a fading wraith stays hidden.
    if (ghost === 1) this.lights.push({ x: e.pos.x, y: e.pos.y - 14 * size, r: 72 * size, a: 0.45 });
    if (e.guardian) {
      // A guardian wears a crown of light and a slow pulsing aura.
      this.glowAt(e.pos.x, e.pos.y - e.radius * 1.2, e.radius * 2.6, "#ff4d6d", 0.18 + 0.08 * Math.sin(this.t * 3));
      this.lights.push({ x: e.pos.x, y: e.pos.y - e.radius, r: 200, a: 0.6, color: "#ff4d6d" });
    }
    const lift = e.kind === "unminted" ? Math.sin(this.t * 2) * 6 - 14 : 0;
    if (e.kind === "unminted") this.glowAt(e.pos.x, e.pos.y - 50, 110, "#ff3d7f", 0.35 + 0.1 * Math.sin(this.t * 4));
    if (e.kind === "unminted" && !g.reducedMotion) {
      // Glitch slices: a Friend that was never minted does not hold still.
      for (let i = 0; i < 3; i++) {
        const offset = Math.sin(this.t * 17 + i * 2) * 8;
        w.save(); w.beginPath(); w.rect(e.pos.x - 70, e.pos.y - 110 + i * 34 + lift, 140, 14); w.clip();
        drawSprite(w, sprite, e.pos.x + offset, e.pos.y + 6 + lift, false, 0.5 * spawning); w.restore();
      }
    }
    const bob = (e.kind === "wisp" || e.kind === "drone" || e.kind === "shade" || e.kind === "prism" || e.kind === "wraith" || e.kind === "target") && !g.reducedMotion ? Math.sin(e.anim * 3 + e.seed) * 4 - 6 : 0;
    const liftAll = lift + bob;
    if (e.kind === "turret") {
      w.save(); w.strokeStyle = "#1a2230"; w.lineWidth = 8; w.lineCap = "round";
      w.beginPath(); w.moveTo(e.pos.x, e.pos.y - 24); w.lineTo(e.pos.x + Math.cos(e.aim) * 22, e.pos.y - 24 + Math.sin(e.aim) * 22); w.stroke();
      w.strokeStyle = g.floor!.band.accent; w.lineWidth = 3; w.stroke(); w.restore();
    }
    if (e.kind === "sniper" && e.state === "track") {
      w.save(); w.globalAlpha = 0.25 + 0.5 * (e.stateT / 0.8); w.strokeStyle = g.floor!.band.bullet; w.lineWidth = 1;
      w.beginPath(); w.moveTo(e.pos.x, e.pos.y - 18); w.lineTo(e.pos.x + Math.cos(e.aim) * 700, e.pos.y - 18 + Math.sin(e.aim) * 700); w.stroke(); w.restore();
    }
    const flip = e.kind === "lancer" || e.kind === "sniper" ? g.player.pos.x < e.pos.x : false;
    drawSprite(w, sprite, e.pos.x, e.pos.y + 6 + liftAll, flip, spawning * ghost, sx, sy);
    if (e.kind === "eyestalk") {
      const look = angleTo(e.pos, g.player.pos);
      w.fillStyle = "#07050b"; w.fillRect(Math.round(e.pos.x + Math.cos(look) * 4 - 3), Math.round(e.pos.y - 34 + Math.sin(look) * 3 - 3), 6, 6);
    }
    if (e.hitFlash > 0) drawSprite(w, flashSprite(sprite), e.pos.x, e.pos.y + 6 + liftAll, flip, 0.85, sx, sy);
    else if (telegraph) drawSprite(w, flashSprite(sprite, e.state === "blink" ? "#bb66ff" : e.state === "fuse" ? "#ffd23c" : "#ff2e4d"), e.pos.x, e.pos.y + 6 + liftAll, flip, 0.35 + 0.35 * Math.sin(this.t * 30), sx, sy);
    if (e.burnT > 0) drawSprite(w, flashSprite(sprite, "#ff9a3c"), e.pos.x, e.pos.y + 6 + liftAll, flip, 0.25, sx, sy);
    if (e.kind === "prism") { this.glowAt(e.pos.x, e.pos.y - 26 + liftAll, 44, g.floor!.band.bullet, 0.45); this.lights.push({ x: e.pos.x, y: e.pos.y - 20, r: 110, a: 0.55, color: g.floor!.band.bullet }); }
    if (e.kind === "hexer") this.lights.push({ x: e.pos.x, y: e.pos.y - 20, r: 80, a: 0.4, color: "#bb66ff" });
    if (e.kind === "hive") this.glowAt(e.pos.x, e.pos.y - 34, 30, g.floor!.band.accent, 0.3 + 0.2 * Math.sin(this.t * 3));
    if (e.kind === "bomber" && e.state === "fuse") this.glowAt(e.pos.x, e.pos.y - 20, 50, "#ff9a3c", 0.6);
    if (e.kind === "cursed" && e.state === "windup") {
      w.save(); w.globalAlpha = 0.25; w.fillStyle = "#ff2e4d";
      w.beginPath(); w.moveTo(e.pos.x, e.pos.y - 8); w.arc(e.pos.x, e.pos.y - 8, e.radius + 46, e.aim - 0.83, e.aim + 0.83); w.closePath(); w.fill(); w.restore();
    }
    if (e.kind === "goblin") this.lights.push({ x: e.pos.x, y: e.pos.y, r: 90, a: 0.6, color: "#ccff00" });
    if (e.kind === "crawler") this.lights.push({ x: e.pos.x, y: e.pos.y - 10, r: 50, a: 0.35, color: "#bb66ff" });
    if (e.elite) this.lights.push({ x: e.pos.x, y: e.pos.y - 20, r: 110, a: 0.5, color: "#ff2e4d" });
  }

  private drawWarden(e: Enemy) {
    const w = this.wctx, g = this.game, deep = g.depth >= 6, t = g.reducedMotion ? 0 : this.t;
    const x = Math.round(e.pos.x), y = Math.round(e.pos.y);
    const flash = e.hitFlash > 0, scale = 4;
    const pal = wardenPalette(deep, flash);
    const body = maskSprite(`warden:${deep}:${flash}`, WARDEN_BODY, pal, scale);
    const leg = maskSprite(`wardenLeg:${deep}:${flash}`, WARDEN_LEG, pal, scale);
    const moving = e.state === "idle" || e.state === "charge";
    const step = moving && !g.reducedMotion ? Math.sin(e.anim * (e.state === "charge" ? 18 : 7)) * 5 : 0;
    const breathe = g.reducedMotion ? 0 : Math.sin(t * 2.2) * 2;
    const core = deep ? "#8fe3ff" : "#ff5a3c";
    const intro = e.spawnT > 0 ? 1 - e.spawnT / 1.4 : 1;
    // The Warden rises out of the floor during its introduction.
    const rise = (1 - intro) * 60;
    w.save();
    if (rise > 0) { w.beginPath(); w.rect(x - 120, y - 200, 240, 206); w.clip(); }
    drawSprite(w, leg, x - 20, y + 4 + Math.min(0, step) + rise, false, 1);
    drawSprite(w, leg, x + 20, y + 4 + Math.min(0, -step) + rise, false, 1);
    const top = y - 18 + breathe * 0.5 + rise;
    drawSprite(w, body, x, top, false, 1, 1, 1 + breathe * 0.004);
    w.restore();
    // Swinging chains hang from the gauntlets.
    w.save(); w.strokeStyle = deep ? "#5d7a8c" : "#6a6a6a"; w.lineWidth = 3; w.lineCap = "round";
    for (const side of [-1, 1]) {
      const hx = x + side * 48, hy = top - 12, swing = Math.sin(t * 2.4 + side) * 0.5 + (e.state === "chains" ? t * 9 * side : 0);
      w.beginPath(); w.moveTo(hx, hy);
      for (let i = 1; i <= 5; i++) w.lineTo(hx + Math.sin(swing) * i * 7, hy + Math.cos(swing) * i * 7);
      w.stroke();
      w.fillStyle = core; w.fillRect(Math.round(hx + Math.sin(swing) * 38) - 4, Math.round(hy + Math.cos(swing) * 38) - 4, 8, 8);
    }
    w.restore();
    const pulse = 0.6 + 0.4 * Math.sin(this.t * (e.phase >= 2 ? 10 : 5));
    const coreY = top - (WARDEN_BODY.length + 2) * scale + 17.5 * scale;
    this.glowAt(x, coreY, 70 + 20 * pulse, core, 0.55 * pulse);
    for (const side of [-1, 1]) this.glowAt(x + side * 10, top - 78, 16, deep ? "#8fe3ff" : "#ff2e4d", 0.9);
    this.lights.push({ x, y: coreY, r: 240, a: 0.8, color: core });
    if (e.phase >= 2) {
      // Phase two: the armor cracks and bleeds light.
      this.emissive.push(() => {
        w.save(); w.globalCompositeOperation = "lighter"; w.strokeStyle = core; w.globalAlpha = 0.5 + 0.4 * pulse; w.lineWidth = 2;
        w.beginPath(); w.moveTo(x - 30, top - 70); w.lineTo(x - 18, top - 52); w.lineTo(x - 26, top - 36); w.moveTo(x + 28, top - 66); w.lineTo(x + 16, top - 44); w.lineTo(x + 24, top - 28); w.stroke();
        w.restore();
      });
      if (!g.reducedMotion && Math.random() < 0.3) g.particle({ x: x + (Math.random() - 0.5) * 70, y: top - 40, vx: 0, vy: -40, life: 0.6, size: 2, color: core, kind: "spark", drag: 1, gravity: -20 });
    }
    if (e.stunT > 0) for (let i = 0; i < 3; i++) { const a = this.t * 5 + i * 2.1; w.fillStyle = "#ffd23c"; w.fillRect(x + Math.cos(a) * 34, top - 128 + Math.sin(a) * 8, 5, 5); }
  }

  private drawBeast(e: Enemy) {
    const w = this.wctx, g = this.game, x = Math.round(e.pos.x), y = Math.round(e.pos.y);
    const t = g.reducedMotion ? 0 : this.t, scale = 4, flash = e.hitFlash > 0;
    // Tendrils writhe behind the body, thick at the root and thin at the tip.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.sin(t * 0.8 + i) * 0.25, reach = 120 + (e.phase >= 2 ? 30 : 0);
      const tipX = x + Math.cos(a + Math.sin(t * 2 + i) * 0.35) * reach, tipY = y - 30 + Math.sin(a) * reach * 0.55;
      const midX = x + Math.cos(a) * reach * 0.6, midY = y - 50 + Math.sin(a) * reach * 0.35;
      for (const [width, color] of [[14, "#07050b"], [9, e.phase >= 3 ? "#3a1030" : "#1f1630"], [3, e.phase >= 2 ? "#ff3d7f" : "#4a2a5c"]] as const) {
        w.strokeStyle = color; w.lineWidth = width; w.lineCap = "round";
        w.beginPath(); w.moveTo(x, y - 50); w.quadraticCurveTo(midX, midY, tipX, tipY); w.stroke();
      }
    }
    const body = maskSprite(`beast:${Math.min(3, e.phase)}:${flash}`, BEAST_BODY, beastPalette(e.phase, flash), scale);
    const breathe = g.reducedMotion ? 0 : Math.sin(t * 1.8) * 0.03;
    const intro = e.spawnT > 0 ? 1 - e.spawnT / 1.4 : 1;
    const top = y + 10;
    drawSprite(w, body, x, top, false, intro, 1 + breathe, 1 - breathe);
    const left = x - body.w / 2, head = top - body.h;
    // Eyes open with each phase and track the Friend.
    const look = angleTo({ x, y: y - 80 }, g.player.pos);
    for (const [ex, ey, phase] of BEAST_EYES) {
      if (e.phase < phase) continue;
      const cx = left + (ex + 1) * scale, cy = head + (ey + 1) * scale;
      const blink = !g.reducedMotion && Math.sin(t * 0.7 + ex) > 0.97 ? 0.2 : 1;
      w.fillStyle = "#07050b"; w.beginPath(); w.ellipse(cx, cy, 9, 8 * blink, 0, 0, TAU); w.fill();
      w.fillStyle = "#ccff00"; w.beginPath(); w.ellipse(cx, cy, 7, 6 * blink, 0, 0, TAU); w.fill();
      w.fillStyle = "#050308"; w.beginPath(); w.ellipse(cx + Math.cos(look) * 3, cy + Math.sin(look) * 2.5, 2, 4 * blink, 0, 0, TAU); w.fill();
      this.glowAt(cx, cy, 16, "#ccff00", 0.5);
    }
    this.glowAt(x, head + 10, 90, "#ccff00", 0.3);
    if (e.phase >= 3) this.glowAt(x, top - 60, 140, "#ff3d7f", 0.2 + 0.1 * Math.sin(t * 5));
    this.lights.push({ x, y: y - 80, r: 280, a: 0.85, color: e.phase >= 3 ? "#ff3d7f" : "#ccff00" });
  }

  private drawHazard(h: Hazard) {
    const w = this.wctx;
    if (h.owner === "player") {
      if (!h.fired && h.delay > 0) {
        w.save(); w.globalAlpha = 0.45; w.strokeStyle = h.color; w.lineWidth = 2; w.beginPath();
        if (h.shape === "line") { const dx = Math.cos(h.angle), dy = Math.sin(h.angle); w.moveTo(h.pos.x, h.pos.y); w.lineTo(h.pos.x + dx * h.length, h.pos.y + dy * h.length); w.lineWidth = h.width * 0.5; }
        else w.arc(h.pos.x, h.pos.y, h.radius, 0, TAU);
        w.stroke(); w.restore();
        return;
      }
      if (h.linger > 0) { w.save(); w.globalAlpha = 0.2; w.fillStyle = h.color; w.beginPath(); w.arc(h.pos.x, h.pos.y, h.radius, 0, TAU); w.fill(); w.restore(); }
      return;
    }
    const progress = h.fired ? 1 : 1 - h.delay / Math.max(0.01, h.telegraph);
    w.save();
    const path = () => {
      w.beginPath();
      if (h.shape === "circle" || h.shape === "ring") w.arc(h.pos.x, h.pos.y, h.radius, 0, TAU);
      else if (h.shape === "cone") { w.moveTo(h.pos.x, h.pos.y); w.arc(h.pos.x, h.pos.y, h.radius, h.angle - h.arc / 2, h.angle + h.arc / 2); w.closePath(); }
      else {
        const dx = Math.cos(h.angle), dy = Math.sin(h.angle), nx = -dy * h.width / 2, ny = dx * h.width / 2;
        w.moveTo(h.pos.x + nx, h.pos.y + ny); w.lineTo(h.pos.x + dx * h.length + nx, h.pos.y + dy * h.length + ny);
        w.lineTo(h.pos.x + dx * h.length - nx, h.pos.y + dy * h.length - ny); w.lineTo(h.pos.x - nx, h.pos.y - ny); w.closePath();
      }
    };
    if (h.shape === "ring") { w.globalAlpha = 0.5 * (1 - progress); w.strokeStyle = h.color; w.lineWidth = 6; path(); w.stroke(); w.restore(); return; }
    if (h.fired && h.linger > 0) {
      w.globalAlpha = 0.28 + 0.1 * Math.sin(this.t * 8);
      w.fillStyle = h.color; path(); w.fill();
      this.lights.push({ x: h.pos.x, y: h.pos.y, r: Math.max(80, h.radius + 20), a: 0.5, color: h.color });
    } else if (!h.fired) {
      w.globalAlpha = 0.12; w.fillStyle = h.color; path(); w.fill();
      w.globalAlpha = 0.75; w.strokeStyle = h.color; w.lineWidth = 2; path(); w.stroke();
      if (h.dmg > 0) {
        w.globalAlpha = 0.3; w.fillStyle = h.color;
        if (h.shape === "circle") { w.beginPath(); w.arc(h.pos.x, h.pos.y, h.radius * progress, 0, TAU); w.fill(); }
        else { w.save(); path(); w.clip(); w.globalAlpha = 0.3 * progress; w.fillRect(h.pos.x - 2000, h.pos.y - 2000, 4000, 4000); w.restore(); }
      }
      this.lights.push({ x: h.pos.x, y: h.pos.y, r: Math.max(90, h.radius), a: 0.45, color: h.color });
    }
    w.restore();
  }

  private drawProjectiles() {
    const w = this.wctx;
    for (const p of this.game.projectiles) {
      if (!this.visible(p.pos.x, p.pos.y, 20)) continue;
      this.glowAt(p.pos.x, p.pos.y, p.radius * 3.2, p.color, 0.6);
      w.save();
      w.fillStyle = p.color;
      if (p.owner === "enemy") {
        // Enemy bullets get a dark rim so they read against every floor.
        w.fillStyle = "#07050b"; w.beginPath(); w.arc(p.pos.x, p.pos.y, p.radius + 2, 0, TAU); w.fill();
        w.fillStyle = p.color;
      }
      if (p.kind === "glob") {
        const wob = 1 + Math.sin(this.t * 20) * 0.12;
        w.beginPath(); w.ellipse(p.pos.x, p.pos.y - 6, p.radius * wob, p.radius / wob, 0, 0, TAU); w.fill();
        w.fillStyle = "#ffffff"; w.beginPath(); w.arc(p.pos.x - 3, p.pos.y - 9, 3, 0, TAU); w.fill();
      } else if (p.kind === "needle") {
        const a = Math.atan2(p.vel.y, p.vel.x);
        w.translate(p.pos.x, p.pos.y); w.rotate(a);
        w.fillRect(-p.radius * 2, -p.radius * 0.4, p.radius * 3.2, p.radius * 0.8);
        w.fillStyle = "#ffffff"; w.fillRect(0, -1, p.radius, 2);
      } else if (p.kind === "pellet") {
        w.beginPath(); w.arc(p.pos.x, p.pos.y, p.radius, 0, TAU); w.fill();
        w.fillStyle = "#ffffff"; w.beginPath(); w.arc(p.pos.x, p.pos.y, p.radius * 0.45, 0, TAU); w.fill();
      } else if (p.kind === "bolt" || p.kind === "shard") {
        const a = Math.atan2(p.vel.y, p.vel.x);
        w.translate(p.pos.x, p.pos.y); w.rotate(a);
        w.fillRect(-p.radius * 1.8, -p.radius * 0.45, p.radius * 3, p.radius * 0.9);
        w.fillStyle = "#ffffff"; w.fillRect(0, -p.radius * 0.25, p.radius, p.radius * 0.5);
      } else if (p.kind === "wave") {
        const a = Math.atan2(p.vel.y, p.vel.x);
        w.strokeStyle = p.color; w.lineWidth = 5; w.beginPath(); w.arc(p.pos.x, p.pos.y, p.radius, a - 1, a + 1); w.stroke();
      } else {
        w.beginPath(); w.arc(p.pos.x, p.pos.y, p.radius, 0, TAU); w.fill();
        w.fillStyle = "#ffffff"; w.beginPath(); w.arc(p.pos.x - 2, p.pos.y - 2, p.radius * 0.35, 0, TAU); w.fill();
      }
      w.restore();
      this.lights.push({ x: p.pos.x, y: p.pos.y, r: 60, a: 0.5, color: p.color });
    }
  }

  private drawParticles() {
    const w = this.wctx;
    w.save();
    for (const p of this.game.particles) {
      if (!this.visible(p.x, p.y, p.size + 10)) continue;
      const a = Math.max(0, p.life / p.max);
      if (p.kind === "ring") {
        w.globalCompositeOperation = "lighter";
        w.globalAlpha = a * 0.8; w.strokeStyle = p.color; w.lineWidth = 3 + 6 * a;
        w.beginPath(); w.arc(p.x, p.y, p.size * (1 - a * 0.6), 0, TAU); w.stroke();
      } else if (p.kind === "glow") {
        w.globalCompositeOperation = "lighter";
        w.globalAlpha = a * 0.6;
        w.drawImage(tintedGlow(this.glow, p.color.slice(0, 7)), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else {
        w.globalCompositeOperation = p.kind === "spark" ? "lighter" : "source-over";
        w.globalAlpha = a; w.fillStyle = p.color;
        const s = Math.max(1, Math.round(p.size * (p.kind === "spark" ? a : 1)));
        w.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
    }
    w.restore();
  }

  private drawPickup(p: Pickup) {
    const w = this.wctx, t = this.t + p.id;
    const bob = this.game.reducedMotion ? 0 : Math.sin(t * 4) * 2;
    if (p.kind === "rf") {
      const spin = this.game.reducedMotion ? 1 : Math.abs(Math.cos(t * 5));
      this.glowAt(p.pos.x, p.pos.y - 8 + bob, 20, "#ccff00", 0.6);
      w.fillStyle = "#ccff00";
      w.beginPath(); w.ellipse(p.pos.x, p.pos.y - 8 + bob, 7 * spin + 1, 7, 0, 0, TAU); w.fill();
      w.fillStyle = "#3d5200"; w.fillRect(p.pos.x - 1, p.pos.y - 12 + bob, 2, 8);
      this.lights.push({ x: p.pos.x, y: p.pos.y, r: 50, a: 0.5, color: "#ccff00" });
    } else if (p.kind === "coin") {
      const spin = this.game.reducedMotion ? 1 : Math.abs(Math.cos(t * 6));
      this.glowAt(p.pos.x, p.pos.y - 8 + bob, 18, "#ffd23c", 0.6);
      w.fillStyle = "#ffd23c"; w.beginPath(); w.ellipse(p.pos.x, p.pos.y - 8 + bob, 6 * spin + 1, 6, 0, 0, TAU); w.fill();
      w.fillStyle = "#7a5a00"; w.fillRect(p.pos.x - 1, p.pos.y - 11 + bob, 2, 6);
      this.lights.push({ x: p.pos.x, y: p.pos.y, r: 44, a: 0.45, color: "#ffd23c" });
    } else if (p.kind === "potion") {
      w.fillStyle = "#e9e4ff"; w.fillRect(p.pos.x - 2, p.pos.y - 18 + bob, 4, 4);
      w.fillStyle = "#ff2e4d"; w.fillRect(p.pos.x - 5, p.pos.y - 14 + bob, 10, 10);
      w.fillStyle = "#ff8fa3"; w.fillRect(p.pos.x - 3, p.pos.y - 12 + bob, 3, 3);
      this.lights.push({ x: p.pos.x, y: p.pos.y, r: 40, a: 0.4, color: "#ff2e4d" });
    } else if (p.item) {
      const style = RARITY_STYLE[p.item.rarity], rank = rarityRank(p.item.rarity);
      const beam = 60 + rank * 34;
      w.save();
      w.globalCompositeOperation = "lighter";
      const grad = w.createLinearGradient(0, p.pos.y - beam, 0, p.pos.y);
      grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, style.color);
      w.globalAlpha = 0.35 + (rank >= 4 ? 0.2 * Math.sin(this.t * 6) : 0);
      w.fillStyle = grad; w.fillRect(p.pos.x - 4 - rank, p.pos.y - beam, 8 + rank * 2, beam);
      w.restore();
      this.glowAt(p.pos.x, p.pos.y - 6, 26 + rank * 6, style.color, 0.6);
      drawItemIcon(w, p.item.slot, p.pos.x, p.pos.y - 8 + bob, style.color);
      this.lights.push({ x: p.pos.x, y: p.pos.y, r: 70 + rank * 14, a: 0.6, color: style.color });
    }
  }

  /**
   * The great stairs sink north into the dark, framed by a ruined arch. The steps are ground, each pillar
   * sorts by its base and the lintel hangs overhead, so the Friend climbs between them instead of vanishing.
   */
  private drawStairs(it: Interactable, layer: "steps" | "left" | "right" | "lintel") {
    const w = this.wctx, x = Math.round(it.pos.x), y = Math.round(it.pos.y);
    const t = this.game.reducedMotion ? 0 : this.t;
    const steps = 9, top = y + 40 - steps * 15;
    if (layer === "steps") {
      for (let i = steps - 1; i >= 0; i--) {
        const k = i / steps, half = 104 - k * 48, sy = y + 40 - i * 15;
        w.fillStyle = shade("#3a2e26", -i * 5); w.fillRect(x - half, sy - 15, half * 2, 15);
        w.fillStyle = shade("#5e4e40", -i * 7); w.fillRect(x - half, sy - 15, half * 2, 3);
      }
      const grad = w.createLinearGradient(0, top - 40, 0, top + 30);
      grad.addColorStop(0, "#07030d"); grad.addColorStop(1, "rgba(7,3,13,0)");
      w.fillStyle = grad; w.fillRect(x - 60, top - 40, 120, 70);
      this.glowAt(x, top, 110, "#8f6fd8", 0.35 + 0.1 * Math.sin(t));
      this.lights.push({ x, y: top + 10, r: 220, a: 0.75, color: "#8f6fd8" });
      return;
    }
    if (layer === "left" || layer === "right") {
      const px = layer === "left" ? x - 120 : x + 96;
      this.shadow(px + 12, y + 36, 16);
      w.fillStyle = "#4e3f33"; w.fillRect(px, top - 70, 24, 200);
      w.fillStyle = "#5e4e40"; w.fillRect(px, top - 70, 4, 200);
      w.fillStyle = "#2a221d"; w.fillRect(px - 3, y + 26, 30, 10);
      return;
    }
    w.fillStyle = "#4e3f33"; w.fillRect(x - 120, top - 86, 240, 22);
    w.fillStyle = "#3a2e26"; w.fillRect(x - 60, top - 86, 40, 6); w.fillRect(x + 30, top - 80, 50, 4);
    const pulse = 0.5 + 0.4 * Math.sin(t * 2);
    w.fillStyle = "#ccff00"; w.globalAlpha = pulse;
    for (let i = 0; i < 9; i++) w.fillRect(x - 96 + i * 24, top - 78, 10, 4);
    w.globalAlpha = 1;
    this.glowAt(x, top - 76, 140, "#ccff00", 0.12 * pulse);
  }

  private drawInteractable(it: Interactable) {
    const w = this.wctx, g = this.game, x = Math.round(it.pos.x), y = Math.round(it.pos.y);
    const t = g.reducedMotion ? 0 : this.t;
    switch (it.kind) {
      case "shrine": {
        const def = SHRINES[it.shrine!], used = it.used;
        const color = used ? "#474747" : def.color;
        this.shadow(x, y + 4, it.shrine === "void" ? 40 : 26);
        if (it.shrine === "greed") {
          w.fillStyle = "#3a3a3a"; w.fillRect(x - 22, y - 26, 44, 28);
          w.fillStyle = "#4d4260"; w.fillRect(x - 26, y - 30, 52, 6);
          if (!used) this.drawFlame(x, y - 30, 1.4, color);
          w.fillStyle = "#ccff00"; w.fillRect(x - 12, y - 6, 4, 3); w.fillRect(x + 6, y - 4, 4, 3);
        } else if (it.shrine === "fate") {
          w.fillStyle = "#2b3a5c"; w.fillRect(x - 13, y - 70, 26, 72);
          w.fillStyle = "#3b4d75"; w.fillRect(x - 17, y - 74, 34, 6); w.fillRect(x - 17, y - 2, 34, 4);
          w.fillStyle = color; w.fillRect(x - 3, y - 60, 6, 40);
          if (!used) { const oy = y - 96 + Math.sin(t * 2) * 5; this.glowAt(x, oy, 34, color, 0.8); w.fillStyle = "#ffffff"; w.beginPath(); w.arc(x, oy, 7, 0, TAU); w.fill(); }
        } else {
          const pulse = used ? 0.2 : 0.6 + 0.4 * Math.sin(t * 2.2);
          w.fillStyle = "#040206"; w.fillRect(x - 26, y - 118, 52, 120);
          w.fillStyle = "#141414"; w.fillRect(x - 30, y - 4, 60, 8); w.fillRect(x - 30, y - 122, 60, 6);
          w.strokeStyle = used ? "#2a2a2a" : "#5c1a3a"; w.lineWidth = 2; w.strokeRect(x - 26, y - 118, 52, 120);
          const cracks = () => {
            w.save();
            w.strokeStyle = color; w.globalAlpha = pulse; w.lineWidth = 2;
            w.beginPath(); w.moveTo(x - 4, y - 112); w.lineTo(x + 6, y - 80); w.lineTo(x - 8, y - 52); w.lineTo(x + 4, y - 20); w.moveTo(x + 6, y - 80); w.lineTo(x + 18, y - 70); w.stroke();
            w.restore();
          };
          cracks();
          if (!used) {
            this.emissive.push(() => {
              cracks();
              const spark = (i: number, a: number) => {
                w.fillStyle = i % 2 ? "#ff3d7f" : "#ccff00";
                w.fillRect(x + Math.cos(a) * 72 - 3, y - 60 + Math.sin(a) * 28 - 3, 6, 6);
              };
              // The floor ring and the far half of the orbit pass behind the monolith: clip its shape out of them.
              w.save();
              w.beginPath(); w.rect(x - 200, y - 200, 400, 260); w.rect(x - 30, y - 122, 60, 130); w.clip("evenodd");
              w.globalAlpha = 0.55 + 0.25 * Math.sin(t * 2);
              w.strokeStyle = "#ff3d7f"; w.lineWidth = 2;
              w.beginPath(); w.ellipse(x, y + 2, 64, 22, 0, 0, TAU); w.stroke();
              w.globalAlpha = 1;
              for (let i = 0; i < 12; i++) { const a = t * 0.8 + (i / 12) * TAU; if (Math.sin(a) < 0) spark(i, a); }
              w.restore();
              for (let i = 0; i < 12; i++) { const a = t * 0.8 + (i / 12) * TAU; if (Math.sin(a) >= 0) spark(i, a); }
            });
            this.glowAt(x, y - 60, 150, "#ff3d7f", 0.45 * pulse);
            this.glowAt(x, y - 10, 90, "#ccff00", 0.15);
          }
        }
        this.lights.push({ x, y: y - 40, r: it.shrine === "void" ? 280 : 160, a: used ? 0.3 : 0.85, color });
        break;
      }
      case "gate": {
        const c = g.floor!.connections[it.gate!.connection];
        const def = GATES[it.gate!.tier];
        if (!it.used) {
          const d = c.doorA;
          this.glowAt(d.x + d.w / 2, d.y + d.h / 2, 70, def.color, 0.35 + 0.15 * Math.sin(t * 3));
          w.fillStyle = "#141414"; w.fillRect(x - 18, y - 30, 36, 24);
          w.strokeStyle = def.color; w.lineWidth = 2; w.strokeRect(x - 18, y - 30, 36, 24);
          w.fillStyle = def.color; w.fillRect(x - 3, y - 26, 6, 16);
          w.fillStyle = "#141414"; w.fillRect(x - 1, y - 24, 2, 4);
          w.fillStyle = "#2a2a2a"; w.fillRect(x - 3, y - 6, 6, 10);
        }
        break;
      }
      case "merchant": {
        w.fillStyle = "#5c1422"; w.fillRect(x - 46, y - 6, 92, 34);
        w.fillStyle = "#8a2438"; for (let i = 0; i < 6; i++) w.fillRect(x - 42 + i * 15, y - 2, 8, 2);
        const wares = ["#ff2e4d", "#bb66ff", "#4fb0ff", "#ffb02e", "#ccff00"];
        wares.forEach((color, i) => { w.fillStyle = color; w.fillRect(x - 38 + i * 16, y + 10, 8, 8); });
        const sprite = maskSprite("peddler", MASKS.peddler[0], { "#": "#4a3a5e", e: "#ffb02e", g: "#ffb02e", x: "#1a1024" }, 3);
        drawSprite(w, sprite, x, y - 2 + (g.reducedMotion ? 0 : Math.sin(t * 2) * 1.5));
        this.drawFlame(x + 40, y - 30, 0.8, "#ffb02e");
        this.lights.push({ x, y: y - 20, r: 200, a: 0.8, color: "#ffb02e" });
        break;
      }
      case "event": this.drawEvent(it, x, y, t); break;
      case "chest": {
        const kind = it.chest!.kind, open = it.used;
        const trim = kind === "mythic" ? (Math.floor(t * 4) % 2 ? "#ff3d7f" : "#ccff00") : kind === "elite" ? "#ff2e4d" : kind === "boss" ? "#ccff00" : kind === "cursed" ? "#bb66ff" : kind === "bonus" ? "#ff9a3c" : "#ffb02e";
        this.shadow(x, y + 6, 22);
        w.fillStyle = kind === "mythic" ? "#1a0a24" : "#4a2c14"; w.fillRect(x - 18, y - 16, 36, 22);
        w.fillStyle = trim; w.fillRect(x - 18, y - 16, 36, 3); w.fillRect(x - 18, y + 3, 36, 3); w.fillRect(x - 3, y - 12, 6, 7);
        if (open) { w.fillStyle = "#2a180a"; w.fillRect(x - 18, y - 30, 36, 10); }
        else {
          w.fillStyle = kind === "mythic" ? "#240e33" : "#5c3a1c"; w.fillRect(x - 20, y - 26, 40, 12);
          w.fillStyle = trim; w.fillRect(x - 20, y - 26, 40, 2);
          this.glowAt(x, y - 10, 46, trim, 0.4 + 0.15 * Math.sin(t * 4));
        }
        this.lights.push({ x, y, r: open ? 60 : 120, a: open ? 0.3 : 0.7, color: trim });
        break;
      }
      case "stairs": {
        const rift = it.label.startsWith("RETURN");
        if (rift) {
          for (let i = 0; i < 4; i++) { w.strokeStyle = i % 2 ? "#ff3d7f" : "#ccff00"; w.lineWidth = 3; w.beginPath(); w.arc(x, y - 20, 34 - i * 7, t * (1 + i * 0.4), t * (1 + i * 0.4) + 4.5); w.stroke(); }
          this.lights.push({ x, y: y - 20, r: 180, a: 0.8, color: "#ff3d7f" });
        } else {
          w.fillStyle = "#020104"; w.fillRect(x - 34, y - 24, 68, 48);
          for (let i = 0; i < 5; i++) { w.fillStyle = shade("#2c2440", -i * 6); w.fillRect(x - 30 + i * 3, y - 20 + i * 9, 60 - i * 6, 6); }
          w.strokeStyle = g.floor!.band.accent; w.lineWidth = 2; w.globalAlpha = 0.6 + 0.3 * Math.sin(t * 3); w.strokeRect(x - 34, y - 24, 68, 48); w.globalAlpha = 1;
          this.lights.push({ x, y, r: 150, a: 0.7, color: g.floor!.band.accent });
        }
        break;
      }
      case "waystone": {
        this.shadow(x, y + 4, 18);
        w.fillStyle = "#4d4260"; w.fillRect(x - 13, y - 58, 26, 60);
        w.fillStyle = "#5d5274"; w.fillRect(x - 13, y - 58, 26, 4);
        const pulse = 0.6 + 0.4 * Math.sin(t * 3);
        w.fillStyle = "#ccff00"; w.globalAlpha = pulse;
        w.fillRect(x - 2, y - 50, 4, 40); w.fillRect(x - 8, y - 40, 16, 3); w.fillRect(x - 6, y - 24, 12, 3);
        w.globalAlpha = 1;
        this.glowAt(x, y - 30, 60, "#ccff00", 0.4 * pulse);
        this.lights.push({ x, y: y - 30, r: 180, a: 0.8, color: "#ccff00" });
        break;
      }
      case "secretWall": break;
      case "prop": this.drawCampProp(it, x, y, t); break;
      case "station": this.drawStation(it, x, y, t); break;
    }
  }

  private drawCampProp(it: Interactable, x: number, y: number, t: number) {
    const w = this.wctx, g = this.game;
    switch (it.prop) {
      case "statue": {
        w.fillStyle = "#3a322a"; w.fillRect(x - 38, y - 18, 76, 30);
        w.fillStyle = "#4e443a"; w.fillRect(x - 42, y - 24, 84, 8);
        w.fillStyle = "#2a241e"; w.fillRect(x - 38, y + 8, 76, 4);
        const glow = 0.55 + 0.3 * Math.sin(t * 1.5 + x);
        w.fillStyle = "#ccff00"; w.globalAlpha = glow;
        for (let i = 0; i < 5; i++) w.fillRect(x - 28 + i * 13, y - 8, 7, 3);
        w.globalAlpha = 1;
        const sprite = g.art.frame("stone", 6, "down", false, 0, "right");
        drawSprite(w, sprite, x, y - 18);
        // Age: cracks and moss on the carved Friend.
        w.strokeStyle = "#2e2923"; w.lineWidth = 2; w.beginPath();
        w.moveTo(x - 20, y - 90); w.lineTo(x - 8, y - 70); w.lineTo(x - 14, y - 52); w.moveTo(x + 18, y - 64); w.lineTo(x + 8, y - 44); w.stroke();
        w.fillStyle = "#4f6b2a"; for (const [mx, my] of [[-24, -40], [-18, -36], [20, -30], [26, -34], [-4, -100], [10, -96]]) w.fillRect(x + mx, y + my, 4, 3);
        this.glowAt(x, y - 8, 60, "#ccff00", 0.18 * glow);
        this.lights.push({ x, y: y - 60, r: 150, a: 0.55, color: "#ccff00" });
        break;
      }
      case "tent": {
        const hue = ((x / 32) | 0) % 2 ? "#5c1422" : "#2c4a5a";
        this.shadow(x, y + 6, 40);
        w.fillStyle = hue; w.beginPath(); w.moveTo(x - 44, y + 8); w.lineTo(x, y - 52); w.lineTo(x + 44, y + 8); w.fill();
        w.fillStyle = shade(hue, -30); w.beginPath(); w.moveTo(x - 10, y + 8); w.lineTo(x, y - 30); w.lineTo(x + 10, y + 8); w.fill();
        w.strokeStyle = shade(hue, 30); w.lineWidth = 2; w.beginPath(); w.moveTo(x, y - 52); w.lineTo(x, y - 58); w.stroke();
        w.fillStyle = "#ccff00"; w.fillRect(x - 2, y - 62, 4, 4);
        break;
      }
      case "fire": {
        w.fillStyle = "#3a2618"; w.fillRect(x - 22, y + 2, 44, 7); w.fillRect(x - 16, y - 3, 32, 7);
        for (const [rx, ry] of [[-26, 6], [22, 6], [-18, 12], [14, 12]]) { w.fillStyle = "#474747"; w.fillRect(x + rx, y + ry, 8, 6); }
        this.drawFlame(x, y - 2, 2.4, "#ff9a3c");
        this.drawFlame(x + 5, y - 2, 1.5, "#ffd23c");
        this.glowAt(x, y - 20, 150, "#ff9a3c", 0.3 * this.flicker(x));
        this.lights.push({ x, y: y - 10, r: 380, a: this.flicker(x), color: "#ff9a3c" });
        break;
      }
      case "lantern": {
        w.fillStyle = "#2a241e"; w.fillRect(x - 1, y - 30, 2, 30);
        w.fillStyle = "#4e443a"; w.fillRect(x - 6, y - 40, 12, 12);
        w.fillStyle = "#ffd23c"; w.fillRect(x - 3, y - 37, 6, 6);
        this.glowAt(x, y - 34, 40, "#ffb347", 0.5);
        this.lights.push({ x, y: y - 34, r: 150, a: 0.7 * this.flicker(y), color: "#ffb347" });
        break;
      }
      case "pillar": {
        w.fillStyle = "#4e3f33"; w.fillRect(x - 14, y - 40, 28, 48);
        w.fillStyle = "#5e4e40"; w.fillRect(x - 18, y - 46, 36, 8);
        w.fillStyle = "#3a2e26"; w.fillRect(x - 14, y - 20, 28, 2); w.fillRect(x + 4, y - 40, 2, 20);
        w.fillStyle = "#ccff00"; w.globalAlpha = 0.35; w.fillRect(x - 4, y - 32, 8, 2); w.fillRect(x - 1, y - 35, 2, 8); w.globalAlpha = 1;
        break;
      }
      case "crates": {
        w.fillStyle = "#5c3a1c"; w.fillRect(x - 18, y - 16, 20, 18); w.fillRect(x, y - 10, 18, 12); w.fillRect(x - 10, y - 30, 16, 14);
        w.strokeStyle = "#3a2410"; w.lineWidth = 2; w.strokeRect(x - 18, y - 16, 20, 18); w.strokeRect(x, y - 10, 18, 12); w.strokeRect(x - 10, y - 30, 16, 14);
        break;
      }
      case "bedroll": {
        w.fillStyle = "#5c1422"; w.fillRect(x - 20, y - 6, 40, 14);
        w.fillStyle = "#8a2438"; w.fillRect(x - 20, y - 6, 12, 14);
        w.fillStyle = "#d8cfbf"; w.fillRect(x - 18, y - 4, 8, 10);
        break;
      }
    }
  }

  private drawStation(it: Interactable, x: number, y: number, t: number) {
    const w = this.wctx, g = this.game;
    switch (it.station) {
      case "descend": break; // Drawn in layers by drawStairs so the Friend can climb between them.
      case "friend": {
        w.fillStyle = "#3a322a"; w.beginPath(); w.ellipse(x, y, 34, 16, 0, 0, TAU); w.fill();
        w.fillStyle = "#0f2430"; w.beginPath(); w.ellipse(x, y, 28, 12, 0, 0, TAU); w.fill();
        w.save(); w.beginPath(); w.ellipse(x, y, 28, 12, 0, 0, TAU); w.clip();
        drawSprite(w, g.art.frame("hero", 2, "up", false, 0, "right"), x, y + 14, false, 0.45);
        w.restore();
        w.strokeStyle = "#3ef0ff"; w.globalAlpha = 0.4; w.beginPath(); w.ellipse(x + Math.sin(t) * 4, y, 12, 4, 0, 0, TAU); w.stroke(); w.globalAlpha = 1;
        this.lights.push({ x, y, r: 110, a: 0.5, color: "#3ef0ff" });
        break;
      }
      case "stash": {
        this.shadow(x, y + 6, 24);
        w.fillStyle = "#4a2c14"; w.fillRect(x - 20, y - 18, 40, 24);
        w.fillStyle = "#5c3a1c"; w.fillRect(x - 22, y - 28, 44, 12);
        w.fillStyle = "#ffb02e"; w.fillRect(x - 22, y - 28, 44, 2); w.fillRect(x - 3, y - 14, 6, 7);
        this.glowAt(x, y - 12, 40, "#ffb02e", 0.25);
        this.lights.push({ x, y, r: 90, a: 0.45, color: "#ffb02e" });
        break;
      }
      case "codex": {
        w.fillStyle = "#4e443a"; w.fillRect(x - 18, y - 52, 36, 56);
        w.fillStyle = "#5e544a"; w.fillRect(x - 18, y - 52, 36, 4);
        w.fillStyle = "#ccff00"; w.globalAlpha = 0.6 + 0.3 * Math.sin(t * 2);
        for (let i = 0; i < 6; i++) w.fillRect(x - 12, y - 44 + i * 7, 10 + ((i * 7) % 14), 2);
        w.globalAlpha = 1;
        this.lights.push({ x, y: y - 26, r: 100, a: 0.5, color: "#ccff00" });
        break;
      }
      case "hall": {
        w.fillStyle = "#35294a"; w.beginPath(); w.moveTo(x - 16, y + 4); w.lineTo(x - 10, y - 80); w.lineTo(x, y - 92); w.lineTo(x + 10, y - 80); w.lineTo(x + 16, y + 4); w.fill();
        w.fillStyle = "#bb66ff"; w.globalAlpha = 0.5 + 0.3 * Math.sin(t * 1.3);
        for (let i = 0; i < 7; i++) w.fillRect(x - 6, y - 70 + i * 10, 12, 2);
        w.globalAlpha = 1;
        this.lights.push({ x, y: y - 40, r: 120, a: 0.5, color: "#bb66ff" });
        break;
      }
      case "wardrobe": {
        // The Dye Altar: a tall mirror showing your Friend as it is dressed, with pots of glowing dye.
        this.shadow(x, y + 6, 34);
        w.fillStyle = "#4e3f33"; w.fillRect(x - 30, y - 4, 60, 10);
        w.fillStyle = "#b8913a"; w.beginPath(); w.ellipse(x, y - 52, 24, 44, 0, 0, TAU); w.fill();
        const grad = w.createLinearGradient(x - 20, y - 92, x + 20, y - 12);
        grad.addColorStop(0, "#3a3050"); grad.addColorStop(1, "#140f20");
        w.fillStyle = grad; w.beginPath(); w.ellipse(x, y - 52, 19, 38, 0, 0, TAU); w.fill();
        w.save(); w.beginPath(); w.ellipse(x, y - 52, 19, 38, 0, 0, TAU); w.clip();
        drawSprite(w, g.art.frame(g.skinLook as FriendLook, 2, "down", false, g.reducedMotion ? 0 : Math.floor(this.t / 0.2) % 8, "right"), x, y - 24, true, 0.9);
        w.restore();
        const dyes = ["#ff2e4d", "#3ef0ff", "#ffb02e", "#bb66ff", "#ff3d7f"];
        dyes.forEach((color, i) => {
          const px = x - 34 + i * 17, py = y + 10;
          w.fillStyle = "#2a241e"; w.fillRect(px - 5, py - 6, 10, 9);
          w.fillStyle = color; w.fillRect(px - 4, py - 6, 8, 3);
          this.glowAt(px, py - 6, 12, color, 0.5 + 0.2 * Math.sin(t * 3 + i));
        });
        this.glowAt(x, y - 52, 60, g.glowColor(), 0.25);
        this.lights.push({ x, y: y - 40, r: 140, a: 0.6, color: g.glowColor() });
        break;
      }
      case "rf": {
        w.fillStyle = "#3a2e26"; w.fillRect(x - 4, y - 30, 8, 34);
        w.fillStyle = "#5e4e40"; w.beginPath(); w.moveTo(x - 20, y - 30); w.lineTo(x + 20, y - 30); w.lineTo(x + 16, y - 42); w.lineTo(x - 16, y - 42); w.fill();
        const bob = Math.sin(t * 2) * 3;
        w.fillStyle = "#ccff00"; w.beginPath(); w.ellipse(x, y - 56 + bob, 9 * Math.abs(Math.cos(t * 2)) + 1, 9, 0, 0, TAU); w.fill();
        this.glowAt(x, y - 56 + bob, 30, "#ccff00", 0.6);
        this.lights.push({ x, y: y - 50, r: 110, a: 0.55, color: "#ccff00" });
        break;
      }
    }
  }

  private drawEvent(it: Interactable, x: number, y: number, t: number) {
    const w = this.wctx, g = this.game, used = it.used;
    const dim = used ? 0.45 : 1;
    w.save(); w.globalAlpha = dim;
    switch (it.event) {
      case "well":
        this.shadow(x, y + 8, 30);
        w.fillStyle = "#4d4260"; w.beginPath(); w.ellipse(x, y, 30, 18, 0, 0, TAU); w.fill();
        w.fillStyle = "#07121c"; w.beginPath(); w.ellipse(x, y - 2, 22, 12, 0, 0, TAU); w.fill();
        w.strokeStyle = "#3ef0ff"; w.globalAlpha = dim * 0.5; w.lineWidth = 1; w.beginPath(); w.ellipse(x + Math.sin(t) * 4, y - 2, 10, 4, 0, 0, TAU); w.stroke();
        this.lights.push({ x, y, r: 110, a: 0.5, color: "#3ef0ff" });
        break;
      case "stranger":
      case "gambler": {
        const sprite = it.event === "stranger"
          ? maskSprite("stranger", MASKS.stranger[0], { "#": "#1e1a26", e: "#ccff00", x: "#000000" }, 3)
          : maskSprite("gambler", MASKS.peddler[0], { "#": "#2c4a3a", e: "#ffd23c", g: "#ffd23c", x: "#0a1a10" }, 3);
        if (it.event === "gambler") { w.fillStyle = "#3a2a1a"; w.fillRect(x - 30, y + 2, 60, 14); w.fillStyle = "#e9e4ff"; w.fillRect(x - 10, y + 4, 6, 6); w.fillRect(x + 4, y + 5, 6, 6); }
        this.shadow(x, y + 4, 18);
        drawSprite(w, sprite, x, y + 2 + (g.reducedMotion ? 0 : Math.sin(t * 1.5) * 1.5));
        this.lights.push({ x, y: y - 20, r: 120, a: 0.6, color: it.event === "stranger" ? "#ccff00" : "#ffd23c" });
        break;
      }
      case "blackDoor": {
        w.fillStyle = "#141414"; w.fillRect(x - 30, y - 80, 60, 84);
        w.fillStyle = "#000000"; w.fillRect(x - 22, y - 72, 44, 76);
        w.strokeStyle = "#ff3d7f"; w.lineWidth = 2; w.globalAlpha = dim * (0.5 + 0.4 * Math.sin(t * 2)); w.strokeRect(x - 22, y - 72, 44, 76);
        this.glowAt(x, y - 34, 70, "#ff3d7f", 0.25 * dim);
        this.lights.push({ x, y: y - 30, r: 140, a: 0.6, color: "#ff3d7f" });
        break;
      }
      case "goldenDoor": {
        w.fillStyle = "#6b4a10"; w.fillRect(x - 30, y - 80, 60, 84);
        w.fillStyle = "#ffb02e"; w.fillRect(x - 22, y - 72, 44, 76);
        w.fillStyle = "#b87a10"; w.fillRect(x - 2, y - 72, 4, 76); w.fillRect(x + 8, y - 34, 6, 6);
        this.glowAt(x, y - 34, 80, "#ffb02e", 0.3 * dim);
        this.lights.push({ x, y: y - 30, r: 160, a: 0.7, color: "#ffb02e" });
        break;
      }
      case "mirror": {
        w.fillStyle = "#b8913a"; w.beginPath(); w.ellipse(x, y - 44, 26, 44, 0, 0, TAU); w.fill();
        const grad = w.createLinearGradient(x - 20, y - 84, x + 20, y - 4);
        grad.addColorStop(0, "#8fa3c9"); grad.addColorStop(1, "#1f2640");
        w.fillStyle = grad; w.beginPath(); w.ellipse(x, y - 44, 20, 38, 0, 0, TAU); w.fill();
        // The mirror shows your Friend.
        w.save(); w.beginPath(); w.ellipse(x, y - 44, 20, 38, 0, 0, TAU); w.clip();
        drawSprite(w, g.art.frame("hero", 2, "down", false, 0, "right"), x, y - 18, true, 0.55);
        w.restore();
        this.lights.push({ x, y: y - 40, r: 110, a: 0.5, color: "#8fa3c9" });
        break;
      }
      case "corpse": {
        const sprite = maskSprite("corpse", MASKS.husk[0], { "#": "#474747", x: "#1a1622", e: "#1a1622" }, 3);
        w.save(); w.translate(x, y); w.rotate(Math.PI / 2); drawSprite(w, sprite, 0, 24); w.restore();
        if (!used) { w.fillStyle = "#ccff00"; w.fillRect(x + 14, y - 4, 4, 4); }
        break;
      }
      case "lostFriend": {
        if (!used) {
          const sprite = g.art.frame("ghost", 3, "down", false, Math.floor(this.t / 0.2) % 8, "right");
          drawSprite(w, sprite, x, y - 6 + (g.reducedMotion ? 0 : Math.sin(t * 2) * 5), false, 0.75);
          this.glowAt(x, y - 30, 60, "#ccff00", 0.4);
          this.lights.push({ x, y: y - 30, r: 150, a: 0.7, color: "#ccff00" });
        }
        break;
      }
    }
    w.restore();
  }

  private applyLighting(darkness: number) {
    const l = this.lctx, cam = this.cam;
    l.setTransform(1 / LIGHT_SCALE, 0, 0, 1 / LIGHT_SCALE, 0, 0);
    l.globalCompositeOperation = "source-over";
    l.fillStyle = `rgba(4,3,8,${darkness})`;
    l.fillRect(0, 0, W, H);
    l.globalCompositeOperation = "destination-out";
    for (const light of this.lights) {
      const x = light.x - cam.x, y = light.y - cam.y;
      if (x < -light.r || y < -light.r || x > W + light.r || y > H + light.r) continue;
      l.globalAlpha = Math.min(1, light.a);
      l.drawImage(this.glow, x - light.r, y - light.r, light.r * 2, light.r * 2);
    }
    l.globalAlpha = 1;
    const w = this.wctx;
    this.presentLight();
    // Colored light pools tint the stone.
    w.save();
    w.globalCompositeOperation = "lighter";
    for (const light of this.lights) {
      if (!light.color) continue;
      const x = light.x - cam.x, y = light.y - cam.y, r = light.r * 0.7;
      if (x < -r || y < -r || x > W + r || y > H + r) continue;
      w.globalAlpha = 0.16 * light.a;
      w.drawImage(tintedGlow(this.glow, light.color), x - r, y - r, r * 2, r * 2);
    }
    w.restore();
  }

  /** Lay the quarter-resolution darkness mask over the world, smoothly upscaled. */
  private presentLight() {
    const w = this.wctx;
    w.imageSmoothingEnabled = true;
    w.drawImage(this.light, 0, 0, W, H);
    w.imageSmoothingEnabled = false;
  }

  // ─── World-space overlays drawn at full resolution ─────────────────────────

  private drawWorldOverlays() {
    const g = this.game, ctx = this.ctx, cam = this.cam;
    ctx.save();
    if (g.screen === "run") {
      // Nameplates and price plates stay in the world: they never show through the HUD panels or the action bar.
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      for (const [x, y, w, h] of HUD_RECTS) ctx.rect(x, y, w, h);
      ctx.clip("evenodd");
    }
    ctx.translate(-cam.x, -cam.y);
    ctx.textAlign = "center";
    for (const e of g.enemies) {
      if (e.boss || e.guardian || e.kind === "target" || e.spawnT > 0 || !this.visible(e.pos.x, e.pos.y, 60) || (e.kind === "wraith" && e.state === "fade")) continue;
      const damaged = e.hp < e.maxHp;
      const top = e.pos.y - (e.kind === "corrupted" ? 88 : e.kind === "brute" || e.kind === "hive" ? 80 : e.champion ? 66 : 54);
      if (e.elite || e.champion) {
        ctx.font = `15px ${FONT_UI}`;
        ctx.fillStyle = "#000"; ctx.fillText(e.name, e.pos.x + 1, top - 7);
        ctx.fillStyle = e.mods[0] ? MODIFIER_INFO[e.mods[0]].color : "#ff2e4d"; ctx.fillText(e.name, e.pos.x, top - 8);
      }
      if (damaged || e.elite || e.champion) {
        const bw = e.elite ? 64 : 36, bh = e.elite ? 6 : 4;
        ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(e.pos.x - bw / 2 - 1, top - 1, bw + 2, bh + 2);
        ctx.fillStyle = e.elite ? "#ff2e4d" : "#c2283f"; ctx.fillRect(e.pos.x - bw / 2, top, bw * clamp(e.hp / e.maxHp, 0, 1), bh);
      }
    }
    for (const p of g.pickups) {
      if (p.kind !== "item" || !p.item || rarityRank(p.item.rarity) < 2 || !this.visible(p.pos.x, p.pos.y, 40)) continue;
      ctx.font = `15px ${FONT_UI}`;
      ctx.fillStyle = "#000"; ctx.fillText(p.item.name, p.pos.x + 1, p.pos.y - 29);
      ctx.fillStyle = RARITY_STYLE[p.item.rarity].color; ctx.fillText(p.item.name, p.pos.x, p.pos.y - 30);
    }
    for (const it of g.interactables) {
      if (g.prompt && Math.abs(g.prompt.pos.x - it.pos.x) < 1) continue;
      if (it.kind === "station" && it.station !== "descend" && this.visible(it.pos.x, it.pos.y, 60)) this.costPlate(it.pos.x, it.pos.y + 30, it.label, "#d8cfbf");
      if (it.kind === "gate" && !it.used && this.visible(it.pos.x, it.pos.y, 60)) this.costPlate(it.pos.x, it.pos.y - 44, `${GATES[it.gate!.tier].cost} RF`, GATES[it.gate!.tier].color);
      if (it.kind === "shrine" && !it.used && this.visible(it.pos.x, it.pos.y, 60)) this.costPlate(it.pos.x, it.pos.y - (it.shrine === "void" ? 140 : it.shrine === "fate" ? 118 : 70), `${SHRINES[it.shrine!].cost} RF`, SHRINES[it.shrine!].color);
    }
    for (const f of g.floaters) {
      const a = clamp(f.life / f.max * 1.6, 0, 1), age = f.max - f.life;
      ctx.globalAlpha = a;
      // Numbers pop in large and settle, so hits feel punchy.
      const pop = g.reducedMotion ? 1 : 1 + Math.max(0, 0.12 - age) * 4;
      ctx.font = `${Math.round(f.size * pop)}px ${FONT_UI}`;
      ctx.lineWidth = 3; ctx.strokeStyle = "#07050b"; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    if (g.prompt) {
      const { text, pos, color } = g.prompt;
      ctx.font = `18px ${FONT_UI}`;
      const tw = ctx.measureText(text).width + 20;
      ctx.fillStyle = "rgba(8,8,8,0.88)"; ctx.fillRect(pos.x - tw / 2, pos.y - 16, tw, 24);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(pos.x - tw / 2 + 0.5, pos.y - 15.5, tw - 1, 23);
      ctx.fillStyle = color; ctx.fillText(text, pos.x, pos.y + 1);
    }
    ctx.restore();
  }

  private costPlate(x: number, y: number, text: string, color: string) {
    const ctx = this.ctx;
    ctx.font = `17px ${FONT_UI}`;
    const tw = ctx.measureText(text).width + 12;
    ctx.fillStyle = "rgba(8,8,8,0.85)"; ctx.fillRect(x - tw / 2, y - 13, tw, 18);
    ctx.fillStyle = color; ctx.fillText(text, x, y + 1);
  }

  // ─── HUD ───────────────────────────────────────────────────────────────────

  private drawHud() {
    const g = this.game, ctx = this.ctx, p = g.player, s = g.stats;
    ctx.textAlign = "left";
    // Low health warning.
    if (p.hp / s.maxHp < 0.3 && !p.dead) {
      const pulse = g.reducedMotion ? 0.5 : 0.4 + 0.3 * Math.sin(this.t * 6);
      const grad = ctx.createRadialGradient(W / 2, H / 2, 240, W / 2, H / 2, 560);
      grad.addColorStop(0, "rgba(194,40,63,0)"); grad.addColorStop(1, `rgba(194,40,63,${pulse})`);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    }
    // Player panel.
    panel(ctx, 12, 12, 330, 98);
    const card = g.art.frame("canonical", 4, "down", false, g.reducedMotion ? 0 : Math.floor(this.t / 0.18) % 8, "right");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(20, 20, 82, 82);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(card.canvas as CanvasImageSource, 21, 21, 80, 80);
    ctx.strokeStyle = "#ccff00"; ctx.lineWidth = 2; ctx.strokeRect(19, 19, 84, 84);
    ctx.font = `28px ${FONT_UI}`;
    ctx.fillStyle = "#f3eeff";
    ctx.fillText(g.friend.label.toUpperCase(), 112, 40);
    ctx.font = `20px ${FONT_UI}`;
    ctx.textAlign = "right"; ctx.fillStyle = "#ccff00"; ctx.fillText(`LV ${g.level}`, 334, 38); ctx.textAlign = "left";
    bar(ctx, 112, 48, 222, 18, p.hp / s.maxHp, "#c2283f", "#ff4d6d", "#2a0a12");
    ctx.font = `17px ${FONT_UI}`; ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.fillText(`${Math.ceil(p.hp)} / ${s.maxHp}`, 223, 62);
    ctx.textAlign = "left";
    bar(ctx, 112, 70, 222, 9, p.energy / s.energyMax, "#5a3fb0", "#3ef0ff", "#120a24");
    bar(ctx, 112, 83, 222, 5, p.xp / xpForLevel(g.level), "#6b8a00", "#ccff00", "#141a05");
    ctx.font = `15px ${FONT_UI}`; ctx.fillStyle = "#9a9a9a";
    ctx.fillText(`ATK ${s.atk}  ARM ${s.armor}  CRIT ${Math.round(s.critChance)}%  LUCK ${Math.round(s.luck)}%`, 112, 103);
    // Buffs and curses.
    let bx = 14;
    for (const buff of g.buffs) {
      const label = buff.run ? "RUN" : buff.floors !== undefined ? "FLR" : `${buff.rooms}`;
      ctx.fillStyle = "rgba(8,8,8,0.85)"; ctx.fillRect(bx, 116, 30, 30);
      ctx.strokeStyle = buff.color; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, 116.5, 29, 29);
      ctx.fillStyle = buff.color; ctx.font = `18px ${FONT_UI}`; ctx.textAlign = "center"; ctx.fillText(buff.icon, bx + 15, 133);
      ctx.font = `12px ${FONT_UI}`; ctx.fillText(label, bx + 15, 144); ctx.textAlign = "left";
      bx += 34;
    }
    if (g.ui.pendingLevels > 0) {
      ctx.font = `18px ${FONT_UI}`; ctx.fillStyle = "#ccff00";
      ctx.globalAlpha = g.reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(this.t * 5);
      ctx.fillText(`▲ LEVEL UP · clear the room to choose`, 14, bx > 14 ? 164 : 132);
      ctx.globalAlpha = 1;
    }
    this.drawMinimap();
    this.drawScore();
    if (!g.ui.touch) this.drawAbilityBar();
    if (g.boss && !g.boss.dead) { this.drawBossIntro(g.boss); this.drawBossBar(); }
    if (g.miniGame) this.drawMiniGame();
  }

  /** Timer and tally while a mini-game runs. */
  private drawMiniGame() {
    const g = this.game, game = g.miniGame!, ctx = this.ctx;
    const left = Math.max(0, game.until - g.time), x = 364, y = 18, w = 352;
    panel(ctx, x - 10, y - 6, w + 20, 56);
    ctx.textAlign = "center";
    ctx.font = `24px ${FONT_DISPLAY}`; ctx.fillStyle = "#ffd23c";
    ctx.fillText(game.kind === "gallery" ? "The Rune Gallery" : "The Coin Dash", x + w / 2, y + 18);
    ctx.font = `20px ${FONT_UI}`; ctx.fillStyle = left < 4 && Math.floor(this.t * 4) % 2 ? "#ff4d6d" : "#f3eeff";
    ctx.fillText(`${game.score} ${game.kind === "gallery" ? "runes" : "coins"} · ${left.toFixed(1)} s`, x + w / 2, y + 42);
    ctx.textAlign = "left";
  }

  /** Live run score under the minimap. Recomputed a few times a second, not every frame. */
  private drawScore() {
    const g = this.game, ctx = this.ctx;
    if (this.t - this.scoreCache.at > 0.25) this.scoreCache = { at: this.t, text: formatScore(g.scoreFor("running").total) };
    panel(ctx, 738, 238, 210, 30);
    ctx.font = `15px ${FONT_UI}`; ctx.fillStyle = "#9a9a9a"; ctx.textAlign = "left"; ctx.fillText("SCORE", 748, 258);
    ctx.font = `20px ${FONT_UI}`; ctx.fillStyle = "#ffd23c"; ctx.textAlign = "right"; ctx.fillText(this.scoreCache.text, 938, 259);
    ctx.textAlign = "left";
  }

  /** Cinematic letterbox bars while a boss makes its entrance. */
  private drawBossIntro(b: Enemy) {
    if (b.spawnT <= 0 && b.anim > 0.6) return;
    const ctx = this.ctx, k = b.spawnT > 0 ? Math.min(1, (1.4 - b.spawnT) * 4) : Math.max(0, 1 - b.anim / 0.6);
    const bar = 56 * k;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
  }

  private drawAbilityBar() {
    const g = this.game, ctx = this.ctx, p = g.player, s = g.stats, kit = g.kit;
    const slots: { key: string; id: string; cd: number; max: number; ok: boolean; count?: number; pips?: [number, number]; color: string }[] = [
      { key: "J", id: kit.attack.id, cd: p.attackCd, max: kit.attack.cd, ok: true, color: "#e9e4ff" },
      { key: "Q", id: kit.bolt.id, cd: p.boltCd, max: kit.bolt.cd, ok: p.energy >= kit.bolt.energy, color: kit.bolt.color },
      { key: "R", id: kit.signature.id, cd: p.novaCd, max: kit.signature.cd, ok: p.energy >= kit.signature.energy, color: kit.signature.color },
      { key: "SPC", id: kit.dodge.id, cd: p.dodgeCharges > 0 ? 0 : p.dodgeCd, max: s.dodgeCd, ok: p.dodgeCharges > 0, color: "#8fe3ff",
        pips: kit.dodge.charges > 1 ? [p.dodgeCharges, kit.dodge.charges] : undefined },
      { key: "F", id: "potion", cd: p.potionCd, max: 0.8, ok: p.potions > 0, count: p.potions, color: "#ff4d6d" },
    ];
    const size = 50, gap = 16, x0 = 440, y0 = 562;
    // Backplate so the bar reads over any floor.
    ctx.fillStyle = "rgba(8,8,8,0.78)"; ctx.fillRect(x0 - 12, y0 - 20, slots.length * (size + gap) - gap + 24, size + 44);
    ctx.fillStyle = kit.accent; ctx.globalAlpha = 0.7; ctx.fillRect(x0 - 12, y0 - 20, slots.length * (size + gap) - gap + 24, 2); ctx.globalAlpha = 1;
    slots.forEach((slot, i) => {
      const x = x0 + i * (size + gap), y = y0, cx = x + size / 2, cy = y + size / 2;
      const color = slot.ok ? slot.color : "#5a5a5a";
      // Decorative frame (this Friend's style) sits outside the icon well, never over text.
      frameRing(ctx, kit.frame, x, y, size, slot.ok ? kit.accent : "#3a3a3a");
      ctx.fillStyle = "#0c0c0c"; ctx.fillRect(x, y, size, size);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
      drawAbilityIcon(ctx, slot.id, cx, cy, color);
      if (slot.cd > 0) {
        ctx.globalAlpha = 0.66; ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, size, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(slot.cd / slot.max, 0, 1)); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        if (slot.cd > 0.5) outlined(ctx, slot.cd.toFixed(slot.cd < 10 ? 1 : 0), cx, cy + 6, "#ffffff", `18px ${FONT_UI}`, "center");
      }
      ctx.restore();
      ctx.strokeStyle = slot.ok ? color : "#3a3a3a"; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
      if (!slot.ok) { ctx.fillStyle = "#ff4d6d"; ctx.fillRect(x + 4, y + size - 4, size - 8, 2); }
      // Ability name above, key cap below: both on dark backgrounds.
      outlined(ctx, SHORT[slot.id] ?? "POTION", cx, y - 6, slot.ok ? "#ece7ff" : "#8a83a0", `14px ${FONT_UI}`, "center");
      ctx.font = `15px ${FONT_UI}`;
      const kw = Math.max(18, ctx.measureText(slot.key).width + 10);
      ctx.fillStyle = "#07050b"; ctx.fillRect(cx - kw / 2, y + size - 6, kw, 17);
      ctx.strokeStyle = "#8a83a0"; ctx.lineWidth = 1; ctx.strokeRect(cx - kw / 2 + 0.5, y + size - 5.5, kw - 1, 16);
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.fillText(slot.key, cx, y + size + 7);
      if (slot.count !== undefined) {
        ctx.fillStyle = "#07050b"; ctx.fillRect(x + size - 16, y - 2, 18, 17);
        outlined(ctx, `${slot.count}`, x + size - 7, y + 12, "#ffffff", `17px ${FONT_UI}`, "center");
      }
      if (slot.pips) for (let k = 0; k < slot.pips[1]; k++) {
        ctx.fillStyle = "#07050b"; ctx.fillRect(x + 2 + k * 10, y + 2, 9, 9);
        ctx.fillStyle = k < slot.pips[0] ? "#8fe3ff" : "#2a2a2a"; ctx.fillRect(x + 4 + k * 10, y + 4, 5, 5);
      }
      ctx.textAlign = "left";
    });
  }

  private drawBossBar() {
    const g = this.game, ctx = this.ctx, b = g.boss!;
    const x = 364, y = 18, w = 352;
    if (b.spawnT > 0) return;
    panel(ctx, x - 10, y - 6, w + 20, 56);
    ctx.textAlign = "center";
    ctx.font = `24px ${FONT_DISPLAY}`; ctx.fillStyle = b.kind === "beast" ? "#ccff00" : b.kind === "unminted" ? "#ff3d7f" : "#ff4d6d";
    ctx.fillText(titleCase(b.name), x + w / 2, y + 18);
    bar(ctx, x, y + 26, w, 14, b.hp / b.maxHp, "#8a1c2b", b.kind === "beast" ? "#ccff00" : "#ff2e4d", "#1a0508");
    ctx.font = `14px ${FONT_UI}`; ctx.fillStyle = "#fff"; ctx.fillText(b.guardian ? `GUARDIAN${b.hp < b.maxHp * 0.5 ? " · ENRAGED" : ""}` : `PHASE ${b.phase}${b.invulnT > 0 ? " · IMMUNE" : b.stunT > 0 ? " · STUNNED" : ""}`, x + w / 2, y + 38);
    ctx.textAlign = "left";
  }

  private drawMinimap() {
    const g = this.game, ctx = this.ctx, floor = g.floor!;
    const x0 = 738, y0 = 100, mw = 210, mh = 132;
    panel(ctx, x0, y0, mw, mh);
    if (floor.isArena) {
      ctx.font = `22px ${FONT_DISPLAY}`; ctx.fillStyle = "#ff3d7f"; ctx.textAlign = "center";
      ctx.fillText("THE RIFT", x0 + mw / 2, y0 + mh / 2 + 6); ctx.textAlign = "left";
      return;
    }
    const cw = (mw - 12) / floor.gridW, ch = (mh - 12) / floor.gridH;
    const center = (r: { cell: { x: number; y: number } }) => ({ x: x0 + 6 + (r.cell.x + 0.5) * cw, y: y0 + 6 + (r.cell.y + 0.5) * ch });
    ctx.lineWidth = 2;
    for (const c of floor.connections) {
      const a = floor.rooms[c.a], b = floor.rooms[c.b];
      if (!(a.known && b.known) || (c.kind === "secret" && !c.open)) continue;
      const pa = center(a), pb = center(b);
      ctx.strokeStyle = c.kind === "gate" && !c.open && c.tier ? GATES[c.tier].color : "#474747";
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    for (const r of floor.rooms) {
      if (!r.known) continue;
      const c = center(r), rw = cw - 8, rh = ch - 6;
      const current = g.currentRoom === r.id;
      ctx.fillStyle = current ? "#ccff00" : r.visited ? "#3a3a3a" : "#141414";
      ctx.fillRect(c.x - rw / 2, c.y - rh / 2, rw, rh);
      ctx.strokeStyle = r.visited ? "#6a6a6a" : "#474747"; ctx.lineWidth = 1; ctx.strokeRect(c.x - rw / 2 + 0.5, c.y - rh / 2 + 0.5, rw - 1, rh - 1);
      const icon = roomIcon(r);
      if (icon && (r.visited || r.revealed || r.type === "boss" || r.type === "exit" || r.type === "guardian")) {
        ctx.font = `14px ${FONT_UI}`; ctx.textAlign = "center"; ctx.fillStyle = current ? "#07050b" : icon.color;
        ctx.fillText(icon.glyph, c.x, c.y + 4); ctx.textAlign = "left";
      }
    }
    const cellPx = { w: CELL_W * TILE, h: CELL_H * TILE };
    const px = x0 + 6 + (g.player.pos.x / cellPx.w) * cw, py = y0 + 6 + (g.player.pos.y / cellPx.h) * ch;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(px - 2, py - 2, 4, 4);
  }

  // ─── Title, camp and summary backdrops ─────────────────────────────────────

  private emit(x: number, y: number, spread: number, color: string, rate: number, dt: number) {
    if (this.game.reducedMotion) return;
    if (Math.random() < rate * dt * 60) this.embers.push({ x: x + (Math.random() - 0.5) * spread, y, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 50, life: 1.5 + Math.random() * 1.5, color });
    for (const e of this.embers) { e.life -= dt; e.x += e.vx * dt; e.y += e.vy * dt; }
    this.embers = this.embers.filter(e => e.life > 0).slice(-160);
  }
  private drawEmbers() {
    const w = this.wctx;
    for (const e of this.embers) { w.globalAlpha = Math.min(1, e.life); w.fillStyle = e.color; w.fillRect(Math.round(e.x), Math.round(e.y), 2, 2); }
    w.globalAlpha = 1;
  }

  private drawTitle(dt: number) {
    const w = this.wctx, g = this.game, t = g.reducedMotion ? 0 : this.t;
    const grad = w.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#07050b"); grad.addColorStop(0.6, "#140c22"); grad.addColorStop(1, "#050308");
    w.fillStyle = grad; w.fillRect(0, 0, W, H);
    // A pit of runic rings falling away beneath your Friend.
    const cx = 480, cy = 470;
    for (let i = 11; i >= 0; i--) {
      const z = (i + (t * 0.35) % 1);
      const s = 1 / (1 + z * 0.55);
      const rx = 420 * s, ry = 120 * s;
      w.strokeStyle = i % 3 === 0 ? "#ccff00" : "#6b4fa0";
      w.globalAlpha = 0.08 + 0.5 * s * s;
      w.lineWidth = Math.max(1, 3 * s);
      w.beginPath(); w.ellipse(cx, cy + 120 * (1 - s) * 0.6, rx, ry, 0, 0, TAU); w.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + t * 0.2 * (i % 2 ? 1 : -1);
        w.fillStyle = "#ccff00"; w.fillRect(cx + Math.cos(a) * rx - 2, cy + 120 * (1 - s) * 0.6 + Math.sin(a) * ry - 2, 4 * s + 1, 4 * s + 1);
      }
    }
    w.globalAlpha = 1;
    this.emit(480, 640, 900, "#8f6fd8", 0.5, dt);
    this.drawEmbers();
    w.fillStyle = "#050308"; w.beginPath(); w.ellipse(cx, cy + 26, 120, 26, 0, 0, TAU); w.fill();
    this.glowAtScreen(cx, cy - 60, 170, "#ccff00", 0.22);
    const frame = g.reducedMotion ? 0 : Math.floor(this.t / 0.18) % 8;
    drawSprite(w, g.art.frame(g.skinLook as FriendLook, 7, "down", false, frame, "right"), cx, cy + 30);
  }

  private drawCamp(dt: number) {
    const w = this.wctx, g = this.game, t = g.reducedMotion ? 0 : this.t;
    w.fillStyle = "#07050b"; w.fillRect(0, 0, W, H);
    for (let y = 300; y < H; y += 32) for (let x = 0; x < W; x += 32) {
      w.fillStyle = (x / 32 + y / 32) % 2 ? "#1a1622" : "#1f1a29"; w.fillRect(x, y, 32, 32);
      w.fillStyle = "#28213a"; w.fillRect(x, y, 32, 1);
    }
    w.fillStyle = "#2c2440"; w.fillRect(0, 150, W, 150);
    w.fillStyle = "#3a3a3a"; w.fillRect(0, 140, W, 12);
    for (let x = 0; x < W; x += 48) { w.fillStyle = "#231d33"; w.fillRect(x + ((x / 48) % 2) * 24, 190, 1, 30); w.fillRect(x, 220, 48, 1); }
    // The Descent gate.
    const gx = 290, gy = 300;
    w.fillStyle = "#3a3a3a"; w.fillRect(gx - 110, gy - 190, 220, 190);
    w.fillStyle = "#050308"; w.beginPath(); w.moveTo(gx - 80, gy); w.lineTo(gx - 80, gy - 120); w.arc(gx, gy - 120, 80, Math.PI, 0); w.lineTo(gx + 80, gy); w.fill();
    for (let i = 0; i < 5; i++) {
      w.strokeStyle = i % 2 ? "#ccff00" : "#6b4fa0"; w.globalAlpha = 0.35; w.lineWidth = 2;
      w.beginPath(); w.ellipse(gx, gy - 70, 60 - i * 11, 90 - i * 16, 0, t * (0.3 + i * 0.1), t * (0.3 + i * 0.1) + 4.8); w.stroke();
    }
    w.globalAlpha = 1;
    for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; w.fillStyle = "#ccff00"; w.globalAlpha = 0.5 + 0.4 * Math.sin(t * 2 + i); w.fillRect(gx + Math.cos(a) * 96 - 3, gy - 120 + Math.sin(a) * 96 - 3, 6, 6); }
    w.globalAlpha = 1;
    // Tent and stash.
    w.fillStyle = "#5c1422"; w.beginPath(); w.moveTo(20, 470); w.lineTo(95, 360); w.lineTo(170, 470); w.fill();
    w.fillStyle = "#3d0d17"; w.beginPath(); w.moveTo(80, 470); w.lineTo(95, 400); w.lineTo(110, 470); w.fill();
    w.fillStyle = "#4a2c14"; w.fillRect(410, 470, 44, 28); w.fillStyle = "#ffb02e"; w.fillRect(410, 470, 44, 3); w.fillRect(429, 478, 6, 7);
    // Campfire.
    const fx = 290, fy = 470;
    w.fillStyle = "#3a2618"; w.fillRect(fx - 30, fy + 4, 60, 8); w.fillRect(fx - 22, fy - 2, 44, 8);
    this.drawFlameScreen(fx, fy, 3.2, "#ff9a3c");
    this.drawFlameScreen(fx + 8, fy, 2.2, "#ffd23c");
    this.emit(fx, fy - 20, 40, "#ffb347", 0.6, dt);
    this.drawEmbers();
    const frame = g.reducedMotion ? 0 : Math.floor(this.t / 0.18) % 8;
    drawSprite(w, g.art.frame("hero", 4, "right", false, frame, "right"), 200, 500);
    // Warm light.
    const l = this.lctx;
    l.setTransform(1 / LIGHT_SCALE, 0, 0, 1 / LIGHT_SCALE, 0, 0);
    l.globalCompositeOperation = "source-over"; l.fillStyle = "rgba(3,3,4,0.72)"; l.fillRect(0, 0, W, H);
    l.globalCompositeOperation = "destination-out";
    const flick = g.reducedMotion ? 1 : 0.9 + Math.sin(this.t * 11) * 0.05;
    l.drawImage(this.glow, fx - 300 * flick, fy - 300 * flick, 600 * flick, 600 * flick);
    l.drawImage(this.glow, gx - 180, gy - 230, 360, 360);
    this.presentLight();
    this.glowAtScreen(fx, fy - 20, 200, "#ff9a3c", 0.25);
  }

  private drawSummary(dt: number) {
    const w = this.wctx, g = this.game, summary = g.ui.summary;
    const fell = summary?.outcome === "fallen" || summary?.outcome === "abandoned";
    w.fillStyle = fell ? "#0b0508" : "#07050b"; w.fillRect(0, 0, W, H);
    this.emit(170, 640, 300, fell ? "#8a1c2b" : "#ccff00", 0.4, dt);
    this.drawEmbers();
    this.glowAtScreen(170, 380, 200, fell ? "#c2283f" : "#ccff00", 0.25);
    const frame = g.reducedMotion ? 0 : Math.floor(this.t / 0.18) % 8;
    drawSprite(w, g.art.frame(fell ? "void" : g.skinLook as FriendLook, 7, "down", false, frame, "right"), 170, 520, false, fell ? 0.8 : 1);
  }

  private glowAtScreen(x: number, y: number, r: number, color: string, alpha: number) {
    const w = this.wctx;
    w.save(); w.globalCompositeOperation = "lighter"; w.globalAlpha = alpha;
    w.drawImage(tintedGlow(this.glow, color), x - r, y - r, r * 2, r * 2); w.restore();
  }
  private drawFlameScreen(x: number, y: number, size: number, color: string) {
    const w = this.wctx, t = this.game.reducedMotion ? 0 : this.t;
    const h = (12 + Math.sin(t * 13 + x) * 3) * size;
    w.fillStyle = color;
    w.beginPath(); w.moveTo(x - 6 * size, y); w.quadraticCurveTo(x + Math.sin(t * 7) * 3, y - h * 1.5, x + 6 * size, y); w.fill();
  }

  /** The scanlines and vignette never change, so they are drawn once onto their own layer and only shown or hidden. */
  private drawCrt(on: boolean) {
    if (on && !this.crtDrawn) {
      const c = this.crtLayer, x = c.getContext("2d")!, k = this.scale;
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = "rgba(0,0,0,0.13)";
      for (let y = 0; y < c.height; y += 3 * Math.max(1, Math.round(k))) x.fillRect(0, y, c.width, Math.max(1, Math.round(k)));
      const grad = x.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.45, c.width / 2, c.height / 2, c.width * 0.72);
      grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,0.55)");
      x.fillStyle = grad; x.fillRect(0, 0, c.width, c.height);
      this.crtDrawn = true;
    }
    if (on !== this.crtShown) { this.crtShown = on; this.crtLayer.style.visibility = on ? "visible" : "hidden"; }
  }
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(8,8,8,0.82)"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#3a3a3a"; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = "#ccff00"; ctx.fillRect(x, y, 6, 2); ctx.fillRect(x, y, 2, 6); ctx.fillRect(x + w - 6, y + h - 2, 6, 2); ctx.fillRect(x + w - 2, y + h - 6, 2, 6);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, dark: string, light: string, back: string) {
  ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
  const fill = Math.round(w * clamp(ratio, 0, 1));
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, light); grad.addColorStop(1, dark);
  ctx.fillStyle = grad; ctx.fillRect(x, y, fill, h);
  ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(x, y, fill, Math.max(1, Math.floor(h / 4)));
  ctx.strokeStyle = "#07050b"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function roomIcon(r: { type: string; shrine?: string; bonus?: string }): { glyph: string; color: string } | null {
  switch (r.type) {
    case "shrine": return { glyph: "◆", color: r.shrine ? SHRINES[r.shrine as keyof typeof SHRINES].color : "#ccff00" };
    case "merchant": return { glyph: "$", color: "#ffb02e" };
    case "event": return { glyph: "?", color: "#3ef0ff" };
    case "treasure": return { glyph: "▣", color: "#ffb02e" };
    case "boss": return { glyph: "☠", color: "#ff2e4d" };
    case "exit": return { glyph: "▼", color: "#ccff00" };
    case "secret": return { glyph: "✦", color: "#ccff00" };
    case "elite": return { glyph: "!", color: "#ff2e4d" };
    case "guardian": return { glyph: "♛", color: "#ff4d6d" };
    case "bonus": return { glyph: "◈", color: r.bonus ? GATES[r.bonus as keyof typeof GATES].color : "#ff2e4d" };
    default: return null;
  }
}

export function drawItemIcon(ctx: CanvasRenderingContext2D, slot: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.fillStyle = "#07050b";
  ctx.fillRect(x - 9, y - 9, 18, 18);
  ctx.fillStyle = color;
  switch (slot) {
    case "weapon": ctx.fillRect(x - 1, y - 8, 3, 12); ctx.fillRect(x - 5, y + 3, 11, 2); ctx.fillRect(x - 1, y + 5, 3, 3); break;
    case "relic": ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 7, y); ctx.fill(); break;
    case "charm": ctx.beginPath(); ctx.arc(x, y + 2, 5, 0, TAU); ctx.fill(); ctx.fillRect(x - 1, y - 8, 2, 6); break;
    case "ring": ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y + 1, 5, 0, TAU); ctx.stroke(); ctx.fillRect(x - 2, y - 8, 4, 3); break;
    case "mask": ctx.fillRect(x - 7, y - 6, 14, 11); ctx.fillStyle = "#07050b"; ctx.fillRect(x - 5, y - 3, 3, 3); ctx.fillRect(x + 2, y - 3, 3, 3); break;
  }
  ctx.restore();
}

/** The Friend's frame style, drawn as a ring around (never over) an icon well. */
function frameRing(ctx: CanvasRenderingContext2D, frame: string, x: number, y: number, size: number, color: string) {
  const cx = x + size / 2, cy = y + size / 2, pad = 5;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
  if (frame === "round") { ctx.beginPath(); ctx.arc(cx, cy, size / 2 + pad + 2, 0, TAU); ctx.stroke(); }
  else if (frame === "diamond") {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const gx = cx + dx * (size / 2 + pad + 1), gy = cy + dy * (size / 2 + pad + 1);
      if (dy === 1) continue; // the key cap sits at the bottom
      ctx.beginPath(); ctx.moveTo(gx, gy - 4); ctx.lineTo(gx + 4, gy); ctx.lineTo(gx, gy + 4); ctx.lineTo(gx - 4, gy); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 0.5; ctx.strokeRect(x - pad + 0.5, y - pad + 0.5, size + pad * 2 - 1, size + pad * 2 - 1);
  } else if (frame === "notched") {
    const n = 8, l = x - pad, t = y - pad, r = x + size + pad, b = y + size + pad;
    ctx.beginPath(); ctx.moveTo(l + n, t); ctx.lineTo(r - n, t); ctx.lineTo(r, t + n); ctx.lineTo(r, b - n); ctx.lineTo(r - n, b); ctx.lineTo(l + n, b); ctx.lineTo(l, b - n); ctx.lineTo(l, t + n); ctx.closePath(); ctx.stroke();
  } else {
    const l = x - pad, t = y - pad, r = x + size + pad, b = y + size + pad, k = 9;
    for (const [px, py, sx, sy] of [[l, t, 1, 1], [r, t, -1, 1], [l, b, 1, -1], [r, b, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(px + sx * k, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * k); ctx.stroke();
    }
  }
  ctx.restore();
}

function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign) {
  ctx.font = font; ctx.textAlign = align;
  ctx.lineWidth = 3; ctx.strokeStyle = "#07050b"; ctx.lineJoin = "round"; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

function drawAbilityIcon(ctx: CanvasRenderingContext2D, icon: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3; ctx.lineCap = "round";
  const line = (a: number, b: number, c: number, d: number) => { ctx.beginPath(); ctx.moveTo(x + a, y + b); ctx.lineTo(x + c, y + d); ctx.stroke(); };
  switch (icon) {
    case "slash": ctx.beginPath(); ctx.arc(x - 6, y + 8, 18, -1.3, 0.1); ctx.stroke(); ctx.fillRect(x + 6, y - 12, 3, 3); break;
    case "lunge": line(-13, 10, 11, -10); ctx.beginPath(); ctx.moveTo(x + 13, y - 13); ctx.lineTo(x + 3, y - 10); ctx.lineTo(x + 10, y - 3); ctx.fill(); break;
    case "whirl": ctx.beginPath(); ctx.arc(x, y, 12, 0.3, 5.4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 12, y - 8); ctx.lineTo(x + 14, y + 2); ctx.lineTo(x + 5, y - 1); ctx.fill(); break;
    case "bolt": line(-12, 8, 10, -8); ctx.beginPath(); ctx.arc(x + 10, y - 8, 5, 0, TAU); ctx.fill(); break;
    case "shards": line(-12, 10, 8, -12); line(-12, 10, 12, -4); line(-12, 10, 13, 6); break;
    case "lance": ctx.lineWidth = 4; line(-14, 12, 12, -12); ctx.lineWidth = 2; line(-6, 12, -14, 4); break;
    case "nova": ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); break;
    case "boneSpikes": for (const dx of [-10, 0, 10]) { ctx.beginPath(); ctx.moveTo(x + dx - 5, y + 11); ctx.lineTo(x + dx, y - 12 + Math.abs(dx) * 0.6); ctx.lineTo(x + dx + 5, y + 11); ctx.fill(); } break;
    case "masquerade": ctx.beginPath(); ctx.ellipse(x, y, 13, 9, 0, 0, TAU); ctx.fill(); ctx.fillStyle = "#07050b"; ctx.fillRect(x - 8, y - 3, 5, 4); ctx.fillRect(x + 3, y - 3, 5, 4); break;
    case "rally": ctx.fillRect(x - 3, y - 12, 6, 24); ctx.fillRect(x - 12, y - 3, 24, 6); break;
    case "mitosis": for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 3, 0, TAU); ctx.fill(); } ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); break;
    case "chaosRift": ctx.beginPath(); ctx.moveTo(x - 12, y - 10); ctx.lineTo(x - 2, y - 2); ctx.lineTo(x - 8, y + 2); ctx.lineTo(x + 4, y + 12); ctx.moveTo(x + 2, y - 12); ctx.lineTo(x + 12, y - 4); ctx.stroke(); break;
    case "phaseBlink": ctx.setLineDash([4, 4]); line(-14, 0, 4, 0); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x + 14, y); ctx.lineTo(x + 4, y - 8); ctx.lineTo(x + 4, y + 8); ctx.fill(); break;
    case "earthshatter": ctx.fillRect(x - 14, y + 6, 28, 4); line(0, 6, -6, -4); line(0, 6, 7, -2); line(-6, -4, -2, -12); break;
    case "prismBurst": for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; line(Math.cos(a) * 4, Math.sin(a) * 4, Math.cos(a) * 13, Math.sin(a) * 13); } break;
    case "voidPull": ctx.beginPath(); for (let i = 0; i < 40; i++) { const a = i * 0.35, r = 13 - i * 0.3; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.stroke(); break;
    case "dash": line(-12, 0, 10, 0); line(3, -7, 10, 0); line(3, 7, 10, 0); ctx.globalAlpha = 0.5; line(-14, -7, -4, -7); break;
    case "double": line(-14, -4, 0, -4); line(-6, -10, 0, -4); line(-6, 2, 0, -4); line(-4, 6, 12, 6); line(6, 0, 12, 6); line(6, 12, 12, 6); break;
    case "potion": ctx.fillRect(x - 3, y - 12, 6, 5); ctx.beginPath(); ctx.arc(x, y + 3, 9, 0, TAU); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillRect(x - 4, y, 3, 3); break;
  }
  ctx.restore();
}



type Look = { mask: readonly (readonly string[])[]; pal: Record<string, string>; scale: number };
/** Palette and scale for each floor-bestiary enemy. Champions take their modifier's color. */
function bestiaryLook(kind: string, champ: string | null, accent: string, bullet: string, minion: boolean): Look | null {
  switch (kind) {
    case "wisp": return { mask: MASKS.wisp, pal: { "#": champ ?? "#c9c2e6", e: "#07050b", x: bullet }, scale: 3 };
    case "gunner": return { mask: MASKS.gunner, pal: { "#": champ ?? "#b8ad99", e: "#ff2e4d", x: "#2a2018", s: "#6b5a44" }, scale: 3 };
    case "drone": return { mask: MASKS.drone, pal: { "#": champ ?? "#2b4a5c", e: accent, x: "#0e1418", s: "#8fe3ff" }, scale: 3 };
    case "turret": return { mask: MASKS.turret, pal: { "#": champ ?? "#35415a", e: accent, x: "#1a2230" }, scale: 3 };
    case "mite": return { mask: MASKS.mite, pal: { "#": "#3a5a52", e: accent }, scale: 3 };
    case "spitter": return { mask: MASKS.spitter, pal: { "#": champ ?? "#6a2a3a", e: "#ffd23c", x: "#2a0a12" }, scale: 3 };
    case "eyestalk": return { mask: MASKS.eyestalk, pal: { "#": champ ?? "#5c1a2c", e: "#f3eeff", x: "#c2283f" }, scale: 3 };
    case "bloodling": return { mask: MASKS.bloodling, pal: { "#": champ ?? "#9a1c30", e: "#ffd23c", x: "#3d0d17" }, scale: minion ? 2 : 3 };
    case "shade": return { mask: MASKS.shade, pal: { "#": champ ?? "#140f20", e: bullet, x: accent }, scale: 3 };
    case "bomber": return { mask: MASKS.bomber, pal: { "#": champ ?? "#3a3444", e: "#ff9a3c", x: "#120d18", k: "#6b5a44", s: "#ffd23c" }, scale: 3 };
    case "lancer": return { mask: MASKS.lancer, pal: { "#": champ ?? "#d8cfbf", e: "#ff2e4d", x: "#2a2018", l: "#f3eeff" }, scale: 3 };
    case "hexer": return { mask: MASKS.hexer, pal: { "#": champ ?? "#2c1f3d", e: "#bb66ff", x: "#07050b", g: "#bb66ff", s: "#8a6a3a" }, scale: 3 };
    case "sniper": return { mask: MASKS.sniper, pal: { "#": champ ?? "#3b4d5c", e: bullet, b: "#8fe3ff" }, scale: 3 };
    case "brute": return { mask: MASKS.brute, pal: { "#": champ ?? "#8a2a3a", e: "#ffd23c", x: "#2a0a12" }, scale: minion ? 3 : 4 };
    case "hive": return { mask: MASKS.hive, pal: { "#": champ ?? "#5a3a2a", e: accent, x: "#1a0f08" }, scale: 4 };
    case "wraith": return { mask: MASKS.wraith, pal: { "#": champ ?? "#9a93c9", e: "#ccff00", x: "#07050b" }, scale: 3 };
    case "prism": return { mask: MASKS.prism, pal: { "#": champ ?? "#1a1030", l: "#e9e4ff", e: bullet }, scale: 3 };
    case "target": return { mask: MASKS.target, pal: { "#": "#ffd23c", e: "#ffffff" }, scale: 3 };
    default: return null;
  }
}

/** A still portrait of any creature, for the bestiary. Uses neutral floor colors. */
export function creaturePortrait(kind: string, art: FriendArt): Sprite {
  switch (kind) {
    case "warden": return maskSprite("portrait:warden", WARDEN_BODY, wardenPalette(false, false), 2);
    case "beast": return maskSprite("portrait:beast", BEAST_BODY, beastPalette(1, false), 2);
    case "unminted": return art.frame("void", 4, "down", false, 0, "right");
    case "corrupted": return art.frame("corrupted", 4, "down", false, 0, "right");
    case "cursed": return maskSprite("portrait:cursed", MASKS.husk[0], { "#": "#5a2a66", x: "#0b0710", e: "#ff2e4d" }, 3);
    case "crawler": return maskSprite("portrait:crawler", MASKS.crawler[0], { "#": "#2c3654", x: "#ff3d7f", e: "#f0e6ff" }, 3);
    case "goblin": return maskSprite("portrait:goblin", MASKS.goblin[0], { "#": "#7a6632", x: "#2a2010", e: "#ffd23c", s: "#ccff00" }, 3);
    default: {
      const look = bestiaryLook(kind, null, "#c9b8ff", "#ff8fa3", false)!;
      return maskSprite(`portrait:${kind}`, look.mask[0], look.pal, 3);
    }
  }
}
