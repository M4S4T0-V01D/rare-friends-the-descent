import { useEffect, useRef, useState } from "react";
import type { Game } from "../game/Game";
import { describeAffix, itemScore, RARITY_STYLE, SLOT_LABEL, SLOTS, type Item, type Slot } from "../game/items";
import { BOONS } from "../game/stats";
import { drawItemIcon } from "../render/renderer";
import { Dialog, FriendPortrait, ItemCard } from "./components";

const GROUP_LABEL: Readonly<Record<Slot, string>> = { weapon: "Weapons", relic: "Relics", charm: "Charms", ring: "Rings", mask: "Masks" };
/** Where each slot sits around the Friend on the paper doll. */
const DOLL_AREA: Readonly<Record<Slot, string>> = { mask: "mask", weapon: "weapon", relic: "relic", ring: "ring", charm: "charm" };

/** The same pixel icon used for loot on the ground, drawn at 2× for the menus. */
export function SlotIcon({ slot, color, size = 32 }: { slot: Slot; color: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = 36; canvas.height = 36;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 36, 36);
    ctx.scale(2, 2);
    drawItemIcon(ctx, slot, 9, 9, color);
  }, [slot, color]);
  return <canvas ref={ref} className="dx-slot-icon" style={{ width: size, height: size }} aria-hidden="true" />;
}

type Selection = { from: "equipped"; slot: Slot } | { from: "bag"; id: number };

export function CharacterModal({ game }: { game: Game }) {
  const s = game.stats;
  const firstEquipped = SLOTS.find(slot => game.equipment[slot]) ?? "weapon";
  const [selected, setSelected] = useState<Selection>({ from: "equipped", slot: firstEquipped });
  const [, force] = useState(0);
  const refresh = () => force(n => n + 1);

  const bagItem = selected.from === "bag" ? game.bag.find(item => item.id === selected.id) : undefined;
  const shown: Item | null = selected.from === "equipped" ? game.equipment[selected.slot] : bagItem ?? null;
  const shownSlot: Slot = selected.from === "equipped" ? selected.slot : bagItem?.slot ?? "weapon";
  const worn = game.equipment[shownSlot];

  const equip = (item: Item) => { game.equipFromBag(item.id); setSelected({ from: "equipped", slot: item.slot }); refresh(); };
  const destroy = (item: Item) => { game.destroyBagItem(item.id); setSelected({ from: "equipped", slot: item.slot }); refresh(); };

  const stats: [string, string][] = [
    ["HP", `${Math.ceil(game.player.hp)}/${s.maxHp}`], ["ATK", `${s.atk}`], ["ARMOR", `${s.armor}`],
    ["CRIT", `${Math.round(s.critChance)}%`], ["CRIT DMG", `×${(s.critDmg / 100).toFixed(2)}`], ["SPEED", `${Math.round(s.moveSpeed)}`],
    ["LUCK", `${Math.round(s.luck)}%`], ["BOLTS", `${s.projectiles}`],
  ];

  return <Dialog className="dx-character" title={game.friend.label} subtitle={`LEVEL ${game.level} · ${game.trait.name.toUpperCase()}: ${game.trait.text.toUpperCase()}`}
    labelColor="#ccff00" onClose={() => game.closeModal()}>
    <dl className="dx-statstrip">{stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <div className="dx-inv">
      <section className="dx-inv-equipped" aria-label="Equipped items">
        <h3 className="dx-inv-head"><span>Equipped</span></h3>
        <div className="dx-doll">
          <div className="dx-doll-friend" aria-hidden="true"><FriendPortrait art={game.art} look="hero" scale={4} /></div>
          {SLOTS.map(slot => {
            const item = game.equipment[slot];
            const style = item ? RARITY_STYLE[item.rarity] : null;
            const active = selected.from === "equipped" && selected.slot === slot;
            return <button key={slot} type="button" style={{ gridArea: DOLL_AREA[slot], borderColor: style?.color }}
              className={`dx-doll-slot${item ? ` dx-r-${item.rarity}` : " dx-doll-empty"}${active ? " dx-doll-active" : ""}`}
              onClick={() => setSelected({ from: "equipped", slot })} aria-pressed={active}
              aria-label={`${SLOT_LABEL[slot]}: ${item ? `${style!.label} ${item.name}` : "empty"}`}>
              <span className="dx-doll-top"><SlotIcon slot={slot} color={style?.color ?? "#4a4452"} size={26} /><small>{SLOT_LABEL[slot]}</small></span>
              {item ? <><strong style={{ color: style!.color }}>{item.name}</strong><em>{style!.label}{item.cursed ? " · CURSED" : ""}</em></>
                : <em className="dx-dim">Empty</em>}
              {item && game.secured.has(item.id) && <span className="dx-secured" title="Secured: kept even if you fall">◆</span>}
            </button>;
          })}
        </div>
        <p className="dx-inv-foot">
          {game.buffs.map(b => <span key={b.id} style={{ color: b.color }}>{b.icon} {b.name} ({b.run ? "run" : b.floors !== undefined ? "floor" : `${b.rooms} rm`}) </span>)}
          {game.boons.size > 0 && <span className="dx-dim">Boons: {[...game.boons].map(([id, n]) => `${BOONS[id].name}${n > 1 ? ` ×${n}` : ""}`).join(", ")}</span>}
        </p>
      </section>

      <section className="dx-inv-detail" aria-label="Item details" aria-live="polite">
        <h3 className="dx-inv-head"><span>{selected.from === "bag" ? "In your bag" : `${SLOT_LABEL[shownSlot]} slot`}</span></h3>
        {shown ? <ItemCard item={shown} note={game.secured.has(shown.id) ? "Secured: kept even if you fall" : undefined} />
          : <p className="dx-dim">Nothing equipped here. Better {SLOT_LABEL[shownSlot].toLowerCase()}s you find equip automatically.</p>}
        {bagItem && <>
          <p className="dx-compare">{worn ? <>Replaces <b style={{ color: RARITY_STYLE[worn.rarity].color }}>{worn.name}</b> <Delta a={bagItem} b={worn} /></> : "Fills an empty slot."}</p>
          {worn && <ul className="dx-compare-list">{worn.affixes.map((affix, i) => <li key={i}>{describeAffix(affix)}</li>)}</ul>}
          <div className="dx-detail-actions">
            <button type="button" className="dx-btn dx-btn-primary" data-autofocus onClick={() => equip(bagItem)}>Equip</button>
            <button type="button" className="dx-btn dx-btn-danger" onClick={() => destroy(bagItem)}>Destroy</button>
          </div>
        </>}
      </section>

      <section className="dx-inv-bag" aria-label="Bag">
        <h3 className="dx-inv-head"><span>Bag</span><small>{game.bag.length}/10</small></h3>
        <div className="dx-bag-groups">
          {SLOTS.map(slot => {
            const items = game.bag.filter(item => item.slot === slot).sort((a, b) => itemScore(b) - itemScore(a));
            return <div key={slot} className={`dx-bag-group${items.length ? "" : " dx-bag-group-empty"}`}>
              <div className="dx-bag-sep"><SlotIcon slot={slot} color={items.length ? "#ccff00" : "#4a4452"} size={20} /><span>{GROUP_LABEL[slot]}</span><small>{items.length}</small></div>
              {items.map(item => {
                const style = RARITY_STYLE[item.rarity];
                const active = selected.from === "bag" && selected.id === item.id;
                return <button key={item.id} type="button" className={`dx-bag-item${active ? " dx-bag-active" : ""}`} style={{ borderLeftColor: style.color }}
                  onClick={() => setSelected({ from: "bag", id: item.id })} aria-pressed={active}>
                  <strong style={{ color: style.color }}>{item.name}</strong>
                  <small>{style.label}{item.cursed ? " · CURSED" : ""} · {item.affixes.slice(0, 2).map(describeAffix).join(" · ")}</small>
                  <Delta a={item} b={game.equipment[slot]} />
                </button>;
              })}
            </div>;
          })}
          {!game.bag.length && <p className="dx-dim dx-bag-note">Your bag is empty. Items that don't beat what you wear land here.</p>}
        </div>
      </section>
    </div>
  </Dialog>;
}

function Delta({ a, b }: { a: Item; b: Item | null }) {
  if (!b) return <span className="dx-delta dx-up" title="Fills an empty slot">NEW</span>;
  const d = itemScore(a) - itemScore(b);
  if (a.cursed) return <span className="dx-delta dx-curse" title="Cursed: big upside, real downside">CURSED</span>;
  return d > 0 ? <span className="dx-delta dx-up" title="Stronger than what you wear">▲</span>
    : d < 0 ? <span className="dx-delta dx-down" title="Weaker than what you wear">▼</span>
    : <span className="dx-delta" title="About the same">=</span>;
}
