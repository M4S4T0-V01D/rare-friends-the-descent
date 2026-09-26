import { useEffect, useId, useRef, type ReactNode } from "react";
import { wholeRf, type RfTransaction } from "../economy/TokenEconomy";
import { titleCase } from "../game/Game";
import { describeAffix, POWERS, RARITY_STYLE, SLOT_LABEL, type Item } from "../game/items";
import type { FriendArt, FriendLook } from "../render/sprites";

export function Rf({ amount, sign = false }: { amount: number; sign?: boolean }) {
  return <span className="dx-rf">{sign && amount > 0 ? "+" : ""}{amount} RF</span>;
}

export function SimulatedTag() {
  return <span className="dx-sim-tag" title="No real tokens move. The economy is simulated for this preview.">SIMULATED</span>;
}

export function ItemCard({ item, compact = false, note, onClick, hotkey, selected }: {
  item: Item; compact?: boolean; note?: ReactNode; onClick?: () => void; hotkey?: string; selected?: boolean;
}) {
  const style = RARITY_STYLE[item.rarity];
  const power = item.power ? POWERS[item.power] : null;
  const body = <>
    <header>
      {hotkey && <kbd>{hotkey}</kbd>}
      <strong style={{ color: style.color }}>{item.name}</strong>
      <small>{style.label} · {SLOT_LABEL[item.slot]}{item.cursed ? " · CURSED" : ""} · depth {item.ilvl}</small>
    </header>
    <ul>{item.affixes.map((affix, i) => <li key={i} className={affix.value < 0 || affix.stat === "damageTakenPct" ? "dx-neg" : undefined}>{describeAffix(affix)}</li>)}</ul>
    {power && <p className="dx-power">{power.text}</p>}
    {!compact && item.flavor && <p className="dx-flavor">{item.flavor}</p>}
    {note && <p className="dx-note">{note}</p>}
  </>;
  const className = `dx-item dx-r-${item.rarity}${compact ? " dx-compact" : ""}${selected ? " dx-selected" : ""}`;
  return onClick
    ? <button type="button" className={className} onClick={onClick} style={{ borderColor: style.color }}>{body}</button>
    : <div className={className} style={{ borderColor: style.color }}>{body}</div>;
}

/** An in-stage dialog. Enter/Escape/number keys are handled by the caller's `keys` map. */
export function Dialog({ title, subtitle, className = "", children, footer, keys, onClose, labelColor }: {
  title: ReactNode; subtitle?: ReactNode; className?: string; children: ReactNode; footer?: ReactNode;
  keys?: Record<string, () => void>; onClose?: () => void; labelColor?: string;
}) {
  const id = useId();
  const node = useRef<HTMLDivElement>(null);
  const keyRef = useRef(keys);
  keyRef.current = keys;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const primary = node.current?.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)") ?? node.current?.querySelector<HTMLElement>("button:not(:disabled)");
    (primary ?? node.current)?.focus();
    const down = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeRef.current) { event.preventDefault(); closeRef.current(); return; }
      const action = keyRef.current?.[event.key.toLowerCase()];
      if (action && !event.repeat) { event.preventDefault(); action(); }
      if (event.key === "Tab" && node.current) {
        const items = [...node.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", down);
    return () => { window.removeEventListener("keydown", down); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="dx-scrim">
    <div ref={node} className={`dx-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
      <header className="dx-dialog-head">
        <div>
          {subtitle && <p className="dx-dialog-sub" style={labelColor ? { color: labelColor } : undefined}>{subtitle}</p>}
          <h2 id={id}>{typeof title === "string" ? titleCase(title) : title}</h2>
        </div>
        {onClose && <button type="button" className="dx-close" onClick={onClose} aria-label="Close">×</button>}
      </header>
      <div className="dx-dialog-body">{children}</div>
      {footer && <footer className="dx-dialog-foot">{footer}</footer>}
    </div>
  </div>;
}

export function OddsTable({ rows }: { rows: readonly { label: string; chanceBps: number }[] }) {
  return <table className="dx-odds">
    <caption>Possible outcomes · simulated odds</caption>
    <tbody>{rows.map((row, i) => <tr key={i}><td>{row.label}</td><td>{(row.chanceBps / 100).toFixed(row.chanceBps % 100 ? 1 : 0)}%</td></tr>)}</tbody>
  </table>;
}

export function TxList({ transactions, empty = "No RF activity yet." }: { transactions: readonly RfTransaction[]; empty?: string }) {
  if (!transactions.length) return <p className="dx-dim">{empty}</p>;
  return <ol className="dx-tx">
    {transactions.map(tx => <li key={tx.id} className={tx.kind === "spend" ? "dx-tx-spend" : "dx-tx-reward"}>
      <span className="dx-tx-amount">{tx.kind === "spend" ? "-" : "+"}{wholeRf(tx.amount)} RF</span>
      <span className="dx-tx-reason">{tx.reason}</span>
      <span className="dx-tx-bal">{wholeRf(tx.balanceAfter)}</span>
    </li>)}
  </ol>;
}

/** Draws a Friend frame into a small canvas for DOM screens (portraits, codex). */
export function FriendPortrait({ art, look = "canonical", scale = 5, className }: { art: FriendArt; look?: FriendLook; scale?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0, raf = 0, last = 0;
    const draw = (now: number) => {
      const canvas = ref.current;
      if (!canvas) return;
      if (now - last > 180) {
        last = now;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const sprite = art.frame(look, scale, "down", false, reduced ? 0 : frame++ % 8, "right");
        canvas.width = sprite.w; canvas.height = sprite.h;
        const ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, sprite.w, sprite.h);
        ctx.drawImage(sprite.canvas as CanvasImageSource, 0, 0);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [art, look, scale]);
  return <canvas ref={ref} className={`dx-portrait ${className ?? ""}`} aria-hidden="true" />;
}

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
