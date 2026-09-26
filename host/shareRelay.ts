/**
 * Share relay for the run-complete scoreboard.
 *
 * The game runs in a scripts-only sandbox with an opaque origin: it cannot write to the clipboard
 * or open windows. It posts a share request here instead. This trusted page accepts requests only
 * from the game's own iframe, checks their shape, and then:
 *   - "copy": writes the PNG score card to the clipboard;
 *   - "post": copies the card (so it can be pasted into the post) and opens X's post composer.
 * The X URL is built here, from a fixed base and this page's own address; the game supplies only
 * the post text, which is length-checked. Clicks inside the frame count as user activation for this
 * page too, so the clipboard and the new window are allowed.
 */
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 240;

type Request = { type: "descent:share"; id: string; action: "copy" | "post"; png: Blob; text: string };

function isRequest(data: unknown): data is Request {
  const d = data as Partial<Request> | null;
  return Boolean(d && d.type === "descent:share" && typeof d.id === "string" && d.id.length <= 80 && (d.action === "copy" || d.action === "post")
    && d.png instanceof Blob && d.png.type === "image/png" && d.png.size > 0 && d.png.size <= MAX_PNG_BYTES
    && typeof d.text === "string" && d.text.length <= MAX_TEXT);
}

async function copyImage(png: Blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("unsupported");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export function postUrl(text: string, pageUrl: string) {
  const params = new URLSearchParams({ text, url: pageUrl });
  return `https://x.com/intent/post?${params.toString()}`;
}

export function installShareRelay(): () => void {
  const listen = (event: MessageEvent) => {
    const frame = document.querySelector("iframe");
    if (!frame?.contentWindow || event.source !== frame.contentWindow || !isRequest(event.data)) return;
    const request = event.data, source = frame.contentWindow;
    const reply = (ok: boolean, error?: string) => source.postMessage({ type: "descent:share-result", id: request.id, ok, error }, "*");
    void (async () => {
      let copied = true;
      try { await copyImage(request.png); } catch { copied = false; }
      if (request.action === "copy") { reply(copied, copied ? undefined : "clipboard"); return; }
      const page = `${location.origin}${location.pathname}`;
      // With noopener, window.open returns null even when it works, so there is nothing more to check.
      window.open(postUrl(request.text, page), "_blank", "noopener,noreferrer");
      reply(true, copied ? undefined : "clipboard");
    })().catch(() => reply(false, "error"));
  };
  window.addEventListener("message", listen);
  return () => window.removeEventListener("message", listen);
}
