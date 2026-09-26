import { useEffect, useRef, useState } from "react";
import type { Game } from "../game/Game";
import { BESTIARY_ORDER, LORE, type BestiaryKind } from "../game/lore";
import { GUARDIAN_TITLES } from "../game/enemies";
import { creaturePortrait } from "../render/renderer";
import { flashSprite } from "../render/sprites";

/** One creature's portrait, or a dark silhouette until your Friend has seen it. */
function CreaturePortrait({ game, kind, known, size }: { game: Game; kind: BestiaryKind; known: boolean; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const base = creaturePortrait(kind, game.art);
    const sprite = known ? base : flashSprite(base, "#262626");
    const k = Math.min(size / sprite.w, size / sprite.h);
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(sprite.canvas as CanvasImageSource, (size - sprite.w * k) / 2, (size - sprite.h * k) / 2, sprite.w * k, sprite.h * k);
  }, [game, kind, known, size]);
  return <canvas ref={ref} className="dx-creature" aria-hidden="true" />;
}

/** The bestiary: every creature unlocks the first time your Friend sees it. */
export function BestiaryView({ game }: { game: Game }) {
  const seen = BESTIARY_ORDER.filter(kind => game.bestiary.has(kind));
  const [selected, setSelected] = useState<BestiaryKind | null>(seen[seen.length - 1] ?? null);
  const entry = selected ? LORE[selected] : null, record = selected ? game.bestiary.get(selected) : undefined;
  const guardian = selected ? GUARDIAN_TITLES[selected] : undefined;
  return <div className="dx-bestiary">
    <p className="dx-dim">{seen.length} / {BESTIARY_ORDER.length} creatures recorded. New pages unlock the first time your Friend sees a creature.</p>
    <div className="dx-bestiary-grid" role="listbox" aria-label="Creatures">
      {BESTIARY_ORDER.map(kind => {
        const known = game.bestiary.has(kind);
        return <button key={kind} type="button" role="option" aria-selected={selected === kind} disabled={!known}
          className={`dx-bestiary-tile${selected === kind ? " dx-on" : ""}${LORE[kind].group === "Boss" ? " dx-boss" : ""}`}
          title={known ? LORE[kind].name : "Not yet seen"} aria-label={known ? LORE[kind].name : "Unknown creature"} onClick={() => setSelected(kind)}>
          <CreaturePortrait game={game} kind={kind} known={known} size={44} />
        </button>;
      })}
    </div>
    {entry && selected && record ? <article className="dx-bestiary-page">
      <CreaturePortrait game={game} kind={selected} known size={112} />
      <div>
        <p className="dx-bestiary-group">{entry.group === "Boss" ? "BOSS" : entry.group === "Elite" ? "ELITE / SPECIAL" : `${entry.group.toUpperCase()} CREATURE`}</p>
        <h3>{entry.name}</h3>
        <p className="dx-bestiary-lore">“{entry.lore}”</p>
        <h4>Attacks</h4>
        <ul>{entry.attacks.map(line => <li key={line}>{line}</li>)}</ul>
        <p className="dx-dim">Found: {entry.found} · Slain this session: {record.kills}</p>
        {guardian && <p className={record.guardians.length ? "dx-pos" : "dx-dim"}>Guardian form: {guardian}{record.guardians.length ? " · slain ✓" : " · not yet slain"}</p>}
      </div>
    </article> : <p className="dx-bestiary-empty">Descend and meet something. Its page will be waiting here.</p>}
  </div>;
}
