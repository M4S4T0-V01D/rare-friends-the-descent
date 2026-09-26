import { normalize, type Vec } from "./math";

export type Action = "attack" | "dodge" | "bolt" | "nova" | "potion" | "interact" | "character" | "log" | "pause" | "mute";

const KEY_ACTIONS: Readonly<Record<string, Action>> = {
  j: "attack", " ": "dodge", shift: "dodge", k: "dodge", q: "bolt", l: "bolt", r: "nova", n: "nova",
  f: "potion", h: "potion", e: "interact", enter: "interact", c: "character", i: "character", tab: "log",
  escape: "pause", p: "pause", m: "mute",
};
const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

/** Keyboard, mouse and touch state for the stage. Held input clears on blur and hidden tabs. */
export class Input {
  readonly held = new Set<string>();
  private readonly pressed = new Set<Action>();
  mouse = { x: 480, y: 320, left: false, right: false, lastMove: -1e9, inside: false };
  touch = { active: false, stick: { x: 0, y: 0 }, attack: false };
  /** Set by the game each frame: when false, gameplay keys are ignored (menus own the keyboard). */
  gameplay = false;
  onAction: ((action: Action) => void) | null = null;
  private cleanup: (() => void) | null = null;

  attach(stage: HTMLElement, toStage: (clientX: number, clientY: number) => Vec) {
    const key = (event: KeyboardEvent) => event.key.toLowerCase();
    const down = (event: KeyboardEvent) => {
      const k = key(event);
      const action = KEY_ACTIONS[k];
      // Menus own Escape, Enter and Tab; gameplay keys only apply while playing.
      if (!this.gameplay) {
        if (action === "mute") this.onAction?.("mute");
        return;
      }
      if (MOVE_KEYS.has(k) || action) event.preventDefault();
      if (MOVE_KEYS.has(k)) this.held.add(k);
      if (action === "attack") this.held.add("attack");
      if (action && !event.repeat) { this.pressed.add(action); this.onAction?.(action); }
    };
    const up = (event: KeyboardEvent) => {
      const k = key(event);
      this.held.delete(k);
      if (KEY_ACTIONS[k] === "attack") this.held.delete("attack");
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const p = toStage(event.clientX, event.clientY);
      this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.lastMove = performance.now(); this.mouse.inside = true;
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !this.gameplay) return;
      if ((event.target as HTMLElement).closest("button, [role=dialog], .dx-touch")) return;
      const p = toStage(event.clientX, event.clientY);
      this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.lastMove = performance.now();
      if (event.button === 0) { this.mouse.left = true; this.pressed.add("attack"); }
      if (event.button === 2) { this.mouse.right = true; this.pressed.add("bolt"); }
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.button === 0) this.mouse.left = false;
      if (event.button === 2) this.mouse.right = false;
    };
    const blur = () => this.clear();
    const visibility = () => { if (document.hidden) this.clear(); };
    const context = (event: Event) => { if (this.gameplay) event.preventDefault(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointerup", pointerUp);
    stage.addEventListener("contextmenu", context);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    this.cleanup = () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointerup", pointerUp);
      stage.removeEventListener("contextmenu", context);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }

  detach() { this.cleanup?.(); this.cleanup = null; }

  clear() {
    this.held.clear(); this.pressed.clear();
    this.mouse.left = false; this.mouse.right = false;
    this.touch.stick = { x: 0, y: 0 }; this.touch.attack = false;
  }

  /** Touch buttons and tests press actions through here. */
  press(action: Action) { this.pressed.add(action); }

  consume(action: Action): boolean {
    const had = this.pressed.has(action);
    this.pressed.delete(action);
    return had;
  }
  flush() { this.pressed.clear(); }

  moveVector(): Vec {
    const h = this.held;
    const x = Number(h.has("d") || h.has("arrowright")) - Number(h.has("a") || h.has("arrowleft"));
    const y = Number(h.has("s") || h.has("arrowdown")) - Number(h.has("w") || h.has("arrowup"));
    if (x || y) return normalize(x, y);
    const s = this.touch.stick;
    const length = Math.hypot(s.x, s.y);
    return length > 0.15 ? { x: s.x / Math.max(1, length), y: s.y / Math.max(1, length) } : { x: 0, y: 0 };
  }

  attackHeld() { return this.held.has("attack") || this.mouse.left || this.touch.attack; }
  boltHeld() { return this.mouse.right; }
  /** The mouse steers aim while it has moved recently; otherwise aim follows movement and soft targeting. */
  mouseAiming() { return this.mouse.inside && performance.now() - this.mouse.lastMove < 2500; }
}
