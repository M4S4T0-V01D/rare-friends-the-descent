import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { createFriendReader } from "@rarefriends/friendsdk/sprites";
import { SimulatedTokenEconomy } from "../economy/SimulatedTokenEconomy";
import { rf } from "../economy/TokenEconomy";
import { RF_STARTING_BALANCE } from "../economy/terms";
import { Game } from "../game/Game";
import type { Settings } from "../game/types";
import { Renderer } from "../render/renderer";
import { FriendArt } from "../render/sprites";
import { Overlay } from "./Overlay";

type Loaded = { art: FriendArt; family: string };

/** Mounts the engine inside the SDK's sandboxed child and scales the 960×640 stage to the frame. */
export function DescentApp({ friendId, client, paused }: GameComponentProps) {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState("Summoning your Friend from Robinhood Chain…");
  const [artFailed, setArtFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Load fonts, the session snapshot and the Friend's canonical artwork.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading"); setArtFailed(false); setLoaded(null);
    setMessage("Summoning your Friend from Robinhood Chain…");
    const fonts = Promise.all([document.fonts.load("20px VT323"), document.fonts.load("24px 'Jacquard 24'")]).catch(() => undefined);
    // The initial read also lets the SDK runtime finish its own loading state.
    const snapshot = client.read();
    const sprites = createFriendReader().read(friendId);
    void (async () => {
      try {
        const session = await snapshot;
        if (session.friendId !== friendId) throw new Error("This game session does not match the selected Friend.");
      } catch (cause) {
        if (!cancelled) { setStatus("error"); setMessage(cause instanceof Error ? cause.message : "The game session could not load."); }
        return;
      }
      await fonts;
      try {
        const art = await sprites;
        if (!cancelled) { setLoaded({ art: new FriendArt(art), family: art.familyName }); setStatus("ready"); }
      } catch {
        if (!cancelled) {
          setArtFailed(true); setStatus("error");
          setMessage("Your Friend's artwork could not be read from Robinhood Chain. Check your connection and retry.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [friendId, client, attempt]);

  // Boot the engine once assets are ready.
  useEffect(() => {
    if (status !== "ready" || !loaded || !canvas.current || !stage.current || !root.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settings: Settings = { sound: true, music: true, reducedMotion: reduced, screenShake: !reduced, damageNumbers: true, crt: !reduced };
    const economy = new SimulatedTokenEconomy(0n);
    void economy.reward(rf(RF_STARTING_BALANCE), "Starting balance (simulated)", "stipend");
    const label = `${loaded.family} #${friendId}`;
    const instance = new Game({ id: friendId, label, family: loaded.family }, loaded.art, economy, settings);
    const renderer = new Renderer(canvas.current, instance);
    instance.renderer = renderer;
    const stageEl = stage.current, rootEl = root.current;
    instance.input.attach(stageEl, (x, y) => {
      const rect = stageEl.getBoundingClientRect();
      return { x: (x - rect.left) * 960 / rect.width, y: (y - rect.top) * 640 / rect.height };
    });
    let scale = 0;
    const fit = () => {
      const w = rootEl.clientWidth, h = rootEl.clientHeight;
      const s = Math.min(w / 960, h / 640) || 1;
      stageEl.style.transform = `translate(${(w - 960 * s) / 2}px, ${(h - 640 * s) / 2}px) scale(${s})`;
      stageEl.dataset.scale = s.toFixed(3);
      const k = s * (window.devicePixelRatio || 1) > 1.25 ? 2 : 1;
      if (k !== scale) { scale = k; renderer.setScale(k); }
      canvas.current?.classList.toggle("dx-smooth", s < 0.98);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(rootEl);
    instance.setExternalPause(pausedRef.current);
    instance.start();
    setGame(instance);
    const focus = (event: PointerEvent) => { window.focus(); if (event.pointerType === "touch") instance.setTouch(true); };
    const keyboard = (event: KeyboardEvent) => { if (event.key.length === 1 || event.key.startsWith("Arrow")) instance.setTouch(false); };
    const blur = () => instance.onFocusLost();
    const hidden = () => { if (document.hidden) instance.onFocusLost(); };
    rootEl.addEventListener("pointerdown", focus);
    window.addEventListener("keydown", keyboard);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hidden);
    if (window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches) instance.setTouch(true);
    // Automated browsers get a read-only state view and test helpers; players never do.
    if (navigator.webdriver) (window as unknown as { __descent?: Game }).__descent = instance;
    return () => {
      observer.disconnect();
      rootEl.removeEventListener("pointerdown", focus);
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hidden);
      instance.dispose();
      setGame(null);
    };
  }, [status, loaded, friendId]);

  useEffect(() => { game?.setExternalPause(paused); }, [game, paused]);

  return <div className="dx-root" ref={root}>
    <div className="dx-stage" ref={stage}>
      <canvas ref={canvas} className="dx-canvas" aria-label="Rare Friends: The Descent game view" role="img" />
      {game && <Overlay game={game} />}
    </div>
    {status !== "ready" && <div className="dx-loading" role={status === "error" ? "alert" : "status"} aria-live="polite">
      <p className="dx-loading-title">The Descent</p>
      <p>{message}</p>
      {status === "loading" && <div className="dx-loading-runes" aria-hidden="true"><span /><span /><span /></div>}
      {status === "error" && <div className="dx-loading-actions">
        <button type="button" className="dx-btn dx-btn-primary" onClick={() => setAttempt(value => value + 1)}>Retry</button>
        {artFailed && <button type="button" className="dx-btn" onClick={() => { setLoaded({ art: new FriendArt(null), family: "Friend" }); setStatus("ready"); }}>
          Continue without artwork
        </button>}
      </div>}
    </div>}
  </div>;
}
