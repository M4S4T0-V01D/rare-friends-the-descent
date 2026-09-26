import type { Game } from "../game/Game";
import { RARITY_STYLE } from "../game/items";
import { formatScore, OUTCOME_LABEL } from "../game/score";
import type { RunSummary } from "../game/types";
import { formatTime } from "./components";

/**
 * Sharing a finished run. The game lives in a scripts-only sandbox, which may not touch the
 * clipboard or open windows, so it asks the trusted host page to do it (see host/shareRelay.ts).
 * If no host answers, the UI falls back to showing the card so it can be copied by hand.
 */
export type ShareAction = "copy" | "post";
export type ShareResult = { ok: boolean; error?: string };

const W = 1200, H = 675;
const FONT_UI = "VT323, ui-monospace, monospace";
const FONT_DISPLAY = "'Jacquard 24', VT323, serif";
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** A 1200×675 scoreboard card in the Rare Friends look: black, white, grey, a dithered glow, gold score. */
export async function renderScoreCard(game: Game, s: RunSummary): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const fell = s.outcome === "fallen" || s.outcome === "abandoned";
  ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, W, H);
  // A dithered pool of light behind the Friend.
  const cx = 250, cy = 330;
  for (let y = 0; y < H; y += 6) for (let x = 0; x < 620; x += 6) {
    const d = Math.hypot(x - cx, y - cy) / 330, glow = Math.max(0, 1 - d);
    if (glow * 16 > BAYER[((y / 6) & 3) * 4 + ((x / 6) & 3)]) { ctx.fillStyle = glow > 0.6 ? "#262626" : "#171717"; ctx.fillRect(x, y, 6, 6); }
  }
  // Border and corner accents, like the in-game panels.
  ctx.strokeStyle = "#3a3a3a"; ctx.lineWidth = 4; ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.fillStyle = "#ccff00";
  for (const [x, y, w, h] of [[12, 12, 40, 6], [12, 12, 6, 40], [W - 52, H - 18, 40, 6], [W - 18, H - 52, 6, 40]]) ctx.fillRect(x, y, w, h);

  // The Friend's canonical black-on-white artwork.
  const card = game.art.frame("canonical", 16, "down", false, 0, "right");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(cx - 150, cy - 170, 300, 300);
  ctx.drawImage(card.canvas as CanvasImageSource, cx - 144, cy - 164, 288, 288);
  ctx.strokeStyle = fell ? "#ff4d6d" : "#ccff00"; ctx.lineWidth = 4; ctx.strokeRect(cx - 152, cy - 172, 304, 304);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f2f2f2"; ctx.font = `44px ${FONT_UI}`; ctx.fillText(s.friendLabel.toUpperCase(), cx, cy + 180);
  ctx.fillStyle = "#9a9a9a"; ctx.font = `26px ${FONT_UI}`; ctx.fillText(`Level ${s.level} · ${s.family}`, cx, cy + 212);

  // Title, outcome and score.
  const x0 = 540;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ccff00"; ctx.font = `26px ${FONT_UI}`; ctx.fillText("R A R E   F R I E N D S", x0, 70);
  ctx.fillStyle = "#f2f2f2"; ctx.font = `64px ${FONT_DISPLAY}`; ctx.fillText("The Descent", x0, 128);
  ctx.fillStyle = fell ? "#ff4d6d" : "#ccff00"; ctx.font = `34px ${FONT_UI}`; ctx.fillText(OUTCOME_LABEL[s.outcome].toUpperCase(), x0, 174);
  ctx.fillStyle = "#9a9a9a"; ctx.font = `24px ${FONT_UI}`; ctx.fillText("SCORE", x0, 222);
  ctx.fillStyle = "#ffb02e"; ctx.font = `96px ${FONT_UI}`; ctx.fillText(formatScore(s.score.total), x0, 296);
  if (s.best) {
    const w = ctx.measureText(formatScore(s.score.total)).width;
    ctx.fillStyle = "#ccff00"; ctx.fillRect(x0 + w + 20, 246, 130, 34);
    ctx.fillStyle = "#0b0b0b"; ctx.font = `26px ${FONT_UI}`; ctx.fillText("NEW BEST", x0 + w + 32, 272);
  }

  // Stat grid: pairs of cells, with the rarest loot on its own full-width row.
  const cell = (label: string, value: string, x: number, y: number, width: number, color = "#f2f2f2") => {
    ctx.fillStyle = "#141414"; ctx.fillRect(x, y, width, 50);
    ctx.fillStyle = "#8a8a8a"; ctx.font = `22px ${FONT_UI}`; ctx.textAlign = "left"; ctx.fillText(label.toUpperCase(), x + 12, y + 32);
    ctx.fillStyle = color; ctx.font = `30px ${FONT_UI}`; ctx.textAlign = "right";
    let text = value;
    while (ctx.measureText(text).width > width - 150 && text.length > 4) text = `${text.slice(0, -2).trimEnd()}…`;
    ctx.fillText(text, x + width - 12, y + 34);
    ctx.textAlign = "left";
  };
  const half = 300, gap = 10;
  cell("Depth", String(s.depth), x0, 330, half);
  cell("Enemies", `${s.kills}${s.elites ? ` (${s.elites} elite)` : ""}`, x0 + half + gap, 330, half);
  cell("Guardians", String(s.guardians), x0, 390, half);
  cell("Bosses", s.bosses.length ? String(s.bosses.length) : "none", x0 + half + gap, 390, half);
  cell("Rarest loot", s.rarest ? `${RARITY_STYLE[s.rarest.rarity].label} ${s.rarest.name}` : "none", x0, 450, half * 2 + gap, s.rarest ? RARITY_STYLE[s.rarest.rarity].color : undefined);
  cell("RF earned", `+${s.rfEarned} RF`, x0, 510, half);
  cell("Time", formatTime(s.timeMs), x0 + half + gap, 510, half);
  ctx.fillStyle = "#6a6a6a"; ctx.font = `22px ${FONT_UI}`;
  ctx.fillText("$RAREFRIENDS in this preview is simulated · Rare Friends Vibeathon", x0, H - 40);
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("Could not draw the score card."))), "image/png"));
}

/** The post text. The host adds the link to the game itself. */
export function shareText(s: RunSummary): string {
  const how = s.outcome === "conquered" ? "conquered" : s.outcome === "escaped" ? "escaped" : s.outcome === "abandoned" ? "fled" : "fell in";
  const where = s.outcome === "fallen" || s.outcome === "abandoned" ? `${how} The Descent at depth ${s.depth}` : `${how} The Descent from depth ${s.depth}`;
  const text = `My Rare Friend ${s.friendLabel} ${where}: ${formatScore(s.score.total)} points, ${s.kills} kills${s.bosses.length ? `, ${s.bosses.length} boss${s.bosses.length === 1 ? "" : "es"} down` : ""}${s.best ? " (new best!)" : ""}. Can yours go deeper? #RareFriends $RAREFRIENDS`;
  return text.length <= 240 ? text : `${text.slice(0, 237)}…`;
}

let nextRequest = 1;
/** Ask the trusted host page to copy the card or open an X post. Resolves { ok: false } if no host answers. */
export function relayShare(action: ShareAction, png: Blob, text: string, timeoutMs = 3000): Promise<ShareResult> {
  const parent = window.parent;
  if (!parent || parent === window) return Promise.resolve({ ok: false, error: "no-host" });
  const id = `share-${Date.now()}-${nextRequest++}`;
  return new Promise(resolve => {
    const done = (result: ShareResult) => { window.clearTimeout(timer); window.removeEventListener("message", listen); resolve(result); };
    const listen = (event: MessageEvent) => {
      if (event.source !== parent || event.data?.type !== "descent:share-result" || event.data.id !== id) return;
      done({ ok: event.data.ok === true, error: typeof event.data.error === "string" ? event.data.error : undefined });
    };
    const timer = window.setTimeout(() => done({ ok: false, error: "no-host" }), timeoutMs);
    window.addEventListener("message", listen);
    // The sandbox has an opaque origin, so the host checks the source window instead of an origin.
    parent.postMessage({ type: "descent:share", id, action, png, text }, "*");
  });
}
