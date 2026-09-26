/**
 * Save relay: keeps each Friend's progress in this trusted page's localStorage.
 *
 * The game's sandbox has no storage, so it posts its save here. This page answers only the game's own iframe,
 * and only while a Friend is in play: DescentHost sets the target once it hands a Friend to ConnectedGameHost,
 * whose fresh ownership check must pass before the game frame even loads. Saves are filed under the Friend's
 * canonical wallet (its Generations token-bound account), because inventory and rewards belong to the Friend.
 * A save must name that same Friend and stay under the size cap. Everything saved is simulated game state;
 * the game re-validates it field by field when it loads.
 */
const MAX_SAVE_CHARS = 512 * 1024;

export type SaveTarget = Readonly<{ friendId: string; wallet: string; chainId: number }>;
let target: SaveTarget | null = null;

/** Called by DescentHost: the verified Friend now in play, or null when none is. */
export function setSaveTarget(next: SaveTarget | null) { target = next; }

export const saveKey = (t: SaveTarget) => `descent:save:v1:${t.chainId}:${t.wallet.toLowerCase()}`;

export function installSaveRelay(): () => void {
  const listen = (event: MessageEvent) => {
    const frame = document.querySelector("iframe");
    const data = event.data as { type?: unknown; id?: unknown; data?: unknown } | null;
    if (!frame?.contentWindow || event.source !== frame.contentWindow || !data || typeof data.id !== "string" || data.id.length > 80) return;
    const source = frame.contentWindow, id = data.id, t = target;
    if (data.type === "descent:load") {
      if (!t) { source.postMessage({ type: "descent:loaded", id, ok: false }, "*"); return; }
      let saved: string | null = null, ok = true;
      try { saved = localStorage.getItem(saveKey(t)); } catch { ok = false; }
      source.postMessage({ type: "descent:loaded", id, ok, wallet: t.wallet, data: saved }, "*");
    } else if (data.type === "descent:save") {
      let ok = false;
      if (t && typeof data.data === "string" && data.data.length <= MAX_SAVE_CHARS) {
        try {
          const parsed = JSON.parse(data.data) as { v?: unknown; friendId?: unknown };
          if (parsed?.v === 1 && parsed.friendId === t.friendId) { localStorage.setItem(saveKey(t), data.data); ok = true; }
        } catch { ok = false; }
      }
      source.postMessage({ type: "descent:saved", id, ok }, "*");
    }
  };
  window.addEventListener("message", listen);
  return () => window.removeEventListener("message", listen);
}
