import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RF_REWARDS, RF_STARTING_BALANCE } from "../economy/terms";
import { wholeRf } from "../economy/TokenEconomy";
import { titleCase, type Game } from "../game/Game";
import { RARITIES, RARITY_STYLE } from "../game/items";
import type { UiState } from "../game/types";
import { FriendPortrait, formatTime, ItemCard, Rf, SimulatedTag, TxList } from "./components";
import { Modals } from "./modals";

export function Overlay({ game }: { game: Game }) {
  const ui = useSyncExternalStore(game.store.subscribe, game.store.get);
  return <div className={`dx-overlay${ui.settings.reducedMotion ? " dx-reduced" : ""}`}>
    {ui.screen === "title" && <TitleScreen game={game} />}
    {ui.screen === "camp" && <CampScreen game={game} ui={ui} />}
    {ui.screen === "summary" && ui.summary && <SummaryScreen game={game} ui={ui} />}
    {ui.screen === "run" && <RunHud game={game} ui={ui} />}
    {ui.screen === "run" && <Modals game={game} ui={ui} />}
    <Toasts ui={ui} />
  </div>;
}

function TitleScreen({ game }: { game: Game }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { button.current?.focus(); }, []);
  return <section className="dx-title" aria-labelledby="dx-title-heading">
    <p className="dx-kicker">RARE FRIENDS</p>
    <h1 id="dx-title-heading">The Descent</h1>
    <p className="dx-tagline">Your Rare Friend descends into a dungeon where <b>$RAREFRIENDS</b> is the currency of risk.</p>
    <p className="dx-verified"><span aria-hidden="true">✓</span> {game.friend.label} · verified hardwired Generations NFT</p>
    <button ref={button} type="button" className="dx-btn dx-btn-primary dx-btn-big" onClick={() => game.beginFromTitle()}>Begin ▸</button>
    <p className="dx-hint">Press Enter or tap · Sound on · M to mute</p>
    <p className="dx-sim-line"><SimulatedTag /> All RF in this game is simulated. No real tokens move.</p>
  </section>;
}

type CampTab = "descend" | "friend" | "stash" | "codex" | "hall" | "rf";

function CampScreen({ game, ui }: { game: Game; ui: UiState }) {
  const [tab, setTab] = useState<CampTab>("descend");
  const descend = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (tab === "descend") descend.current?.focus(); }, [tab]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "Enter" && document.activeElement?.tagName !== "BUTTON") { event.preventDefault(); void game.descend(); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [game]);
  const tabs: [CampTab, string][] = [["descend", "Descend"], ["friend", "Friend"], ["stash", `Stash ${game.stash.length}`], ["codex", "Codex"], ["hall", "Hall"], ["rf", "$RF"]];
  const balance = ui.balance;
  return <section className="dx-camp" aria-label="The Camp">
    <div className="dx-camp-title"><p className="dx-kicker">THE CAMP</p><h1>Before the Descent</h1></div>
    <div className="dx-camp-panel">
      <div className="dx-camp-rf"><span>$RAREFRIENDS</span><strong>{balance} RF</strong><SimulatedTag /></div>
      <nav className="dx-tabs" role="tablist" aria-label="Camp">
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "dx-tab-on" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <div className="dx-camp-body" role="tabpanel">
        {tab === "descend" && <>
          <p>Each descent starts with at least <Rf amount={RF_STARTING_BALANCE} />. RF is scarce: every coin is a decision.</p>
          <table className="dx-denoms">
            <tbody>
              <tr><th><Rf amount={5} /></th><td>Shrine of Greed · Blood Gate · first reroll · potion · Cursed Box · The Well</td></tr>
              <tr><th><Rf amount={10} /></th><td>Shrine of Fate · Cursed Gate · second reroll · Revive · relics · The Stranger</td></tr>
              <tr><th><Rf amount={25} /></th><td>Shrine of the Void · Abyssal Gate · third reroll · Full Revival · Legendary Gamble · The Black Door</td></tr>
            </tbody>
          </table>
          <p className="dx-dim">Earn it back: +{RF_REWARDS.enemy} (chance) per enemy, +{RF_REWARDS.elite} elites, +{RF_REWARDS.treasureRoom} treasure, +{RF_REWARDS.miniBoss} mini-boss, +{RF_REWARDS.boss} boss, +{RF_REWARDS.secretBoss} secret boss.</p>
          {game.stash.length > 0 && <label className="dx-heirloom">Heirloom:
            <select value={game.heirloomId ?? ""} onChange={event => game.setHeirloom(event.target.value ? Number(event.target.value) : null)}>
              <option value="">None</option>
              {game.stash.map(item => <option key={item.id} value={item.id}>{RARITY_STYLE[item.rarity].label} · {item.name}</option>)}
            </select>
          </label>}
          <button ref={descend} type="button" className="dx-btn dx-btn-primary dx-btn-big" onClick={() => void game.descend()}>Descend ▾</button>
          <p className="dx-hint">WASD move · J/click attack · Q bolt · R nova · Space dodge · F potion · E interact</p>
        </>}
        {tab === "friend" && <div className="dx-friend">
          <FriendPortrait art={game.art} scale={6} />
          <div>
            <h2>{game.friend.label}</h2>
            <p className="dx-dim">Generations family: {game.friend.family}</p>
            <p><b>Family trait · {game.trait.name}:</b> {game.trait.text}</p>
            <p className="dx-dim">Base: 110 HP · 20 ATK · 5 armor · 5% crit. Grows +8 HP, +1.6 ATK and +1 armor per level.</p>
            <p className="dx-dim">Descents this session: {game.runsStarted}</p>
          </div>
        </div>}
        {tab === "stash" && <>
          <p className="dx-dim">Loot you escape with (or secure at a Waystone) lands here. Pick one heirloom to carry into your next descent. Session only: reloading clears it.</p>
          {game.stash.length ? <div className="dx-grid">{game.stash.map(item => <ItemCard key={item.id} item={item} compact
            note={game.heirloomId === item.id ? "Heirloom for next descent" : undefined} selected={game.heirloomId === item.id}
            onClick={() => game.setHeirloom(game.heirloomId === item.id ? null : item.id)} />)}</div> : <p>Your stash is empty.</p>}
        </>}
        {tab === "codex" && <>
          <p className="dx-dim">Every item your Friend has found this session.</p>
          <p>{RARITIES.map(r => <span key={r} className="dx-codex-count" style={{ color: RARITY_STYLE[r].color }}>{RARITY_STYLE[r].label} {[...game.codex.values()].filter(e => e.rarity === r).length} </span>)}</p>
          <ul className="dx-codex">{[...game.codex.values()].sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity)).map(entry =>
            <li key={entry.name + entry.rarity} style={{ color: RARITY_STYLE[entry.rarity].color }}>{entry.name}{entry.count > 1 ? ` ×${entry.count}` : ""}</li>)}</ul>
        </>}
        {tab === "hall" && <>
          <p className="dx-dim">Your best descents this session.</p>
          {game.hall.length ? <ol className="dx-hall">{game.hall.map((run, i) => <li key={i}>
            <b>Depth {run.depth}</b> · {run.kills} kills · {run.outcome} · {run.rarest ? <span style={{ color: RARITY_STYLE[run.rarest.rarity].color }}>{run.rarest.name}</span> : "no loot"}
          </li>)}</ol> : <p>No descents yet.</p>}
          <p className="dx-dim">Global leaderboard: coming soon. FriendSDK v0.1.2 has no persistence API yet.</p>
        </>}
        {tab === "rf" && <>
          <p><b>{balance} RF</b> <SimulatedTag /> · session ledger</p>
          <TxList transactions={[...game.economy.getHistory()].reverse()} />
          <p className="dx-dim">Every price and reward runs through one TokenEconomy interface. This preview uses a simulated ledger. The runtime's Friend wallet panel shows the SDK's own reference preview balance, which The Descent does not spend.</p>
        </>}
      </div>
    </div>
  </section>;
}

function SummaryScreen({ game, ui }: { game: Game; ui: UiState }) {
  const s = ui.summary!;
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => { primary.current?.focus(); }, []);
  const heading = s.outcome === "conquered" ? "The Descent Conquered" : s.outcome === "escaped" ? "Escaped with the Loot" : s.outcome === "abandoned" ? "Run Abandoned" : "Your Friend Has Fallen";
  return <section className={`dx-summary dx-summary-${s.outcome}`} aria-labelledby="dx-summary-heading">
    <div className="dx-summary-panel">
      <p className="dx-kicker">RUN COMPLETE</p>
      <h1 id="dx-summary-heading">{heading}</h1>
      <dl className="dx-summary-stats">
        <div><dt>Rare Friend</dt><dd>{s.friendLabel}</dd></div>
        <div><dt>Depth</dt><dd>{s.depth}</dd></div>
        <div><dt>Enemies defeated</dt><dd>{s.kills}{s.elites ? ` (${s.elites} elite)` : ""}</dd></div>
        <div><dt>Level</dt><dd>{s.level}</dd></div>
        <div><dt>Bosses</dt><dd>{s.bosses.length ? s.bosses.join(", ") : "none"}</dd></div>
        <div><dt>Rarest loot</dt><dd style={{ color: s.rarest ? RARITY_STYLE[s.rarest.rarity].color : undefined }}>{s.rarest ? `${RARITY_STYLE[s.rarest.rarity].label} ${s.rarest.name}` : "none"}</dd></div>
        <div><dt>Time</dt><dd>{formatTime(s.timeMs)}</dd></div>
        <div><dt>Loot to stash</dt><dd>{s.secured} kept{s.lost ? ` · ${s.lost} lost` : ""}</dd></div>
      </dl>
      <div className="dx-summary-rf">
        <div><span>RF started</span><strong>{s.rfStarted}</strong></div>
        <div><span>RF earned</span><strong className="dx-pos">+{s.rfEarned}</strong></div>
        <div><span>RF spent</span><strong className="dx-neg">-{s.rfSpent}</strong></div>
        <div><span>RF remaining</span><strong>{s.rfRemaining}</strong></div>
      </div>
      <details className="dx-summary-log"><summary>RF activity this run ({s.transactions.length}) <SimulatedTag /></summary><TxList transactions={[...s.transactions].reverse()} /></details>
      <div className="dx-summary-actions">
        <button ref={primary} type="button" className="dx-btn dx-btn-primary dx-btn-big" onClick={() => void game.descend()}>Descend Again</button>
        <button type="button" className="dx-btn" onClick={() => game.returnToCamp()}>Return to Camp</button>
      </div>
      <p className="dx-dim dx-seed">Descent seed {s.seed.toString(16).toUpperCase()}</p>
    </div>
  </section>;
}

function RunHud({ game, ui }: { game: Game; ui: UiState }) {
  const [flash, setFlash] = useState<{ id: number; delta: number } | null>(null);
  useEffect(() => {
    if (!ui.rfFlash) return;
    setFlash(ui.rfFlash);
    const timer = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(timer);
  }, [ui.rfFlash]);
  return <>
    <div className={`dx-rfpanel${flash ? (flash.delta < 0 ? " dx-rf-down" : " dx-rf-up") : ""}`}>
      <div className="dx-rfpanel-top"><span>$RAREFRIENDS</span><SimulatedTag /></div>
      <strong aria-live="polite" aria-label={`${ui.balance} RF`}>{ui.balance} RF</strong>
      {flash && <span key={flash.id} className="dx-rf-delta">{flash.delta > 0 ? "+" : ""}{flash.delta}</span>}
      <div className="dx-floor">FLOOR {ui.depth}<span> · {ui.floorName}</span></div>
      <button type="button" className="dx-menu-btn" onClick={() => game.setModal({ kind: "pause" })} aria-label="Open menu">☰</button>
    </div>
    <section className="dx-rflog" aria-label="RF activity">
      <h3>RF ACTIVITY</h3>
      <ol>{ui.recent.slice(0, 4).map(tx => <li key={tx.id} className={tx.kind === "spend" ? "dx-tx-spend" : "dx-tx-reward"}>
        <b>{tx.kind === "spend" ? "-" : "+"}{wholeRf(tx.amount)} RF</b> {tx.reason}
      </li>)}</ol>
    </section>
    {ui.banner && <Banner key={ui.banner.id} ui={ui} />}
    {ui.touch && <TouchControls game={game} ui={ui} />}
  </>;
}

function Banner({ ui }: { ui: UiState }) {
  const [visible, setVisible] = useState(true);
  const banner = ui.banner!;
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), banner.kind === "boss" ? 2600 : banner.kind === "floor" ? 2400 : 1800);
    return () => window.clearTimeout(timer);
  }, [banner]);
  if (!visible) return null;
  return <div className={`dx-banner dx-banner-${banner.kind}`} style={{ color: banner.color }} role="status">
    <strong>{titleCase(banner.title)}</strong>{banner.subtitle && <span>{banner.subtitle}</span>}
  </div>;
}

function Toasts({ ui }: { ui: UiState }) {
  return <div className="dx-toasts" role="status" aria-live="polite">
    {ui.toasts.map(toast => <p key={toast.id} style={{ color: toast.color, borderColor: toast.color }}>{toast.text}</p>)}
  </div>;
}

function TouchControls({ game, ui }: { game: Game; ui: UiState }) {
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const pointer = useRef<number | null>(null);
  const toStage = (event: React.PointerEvent) => {
    const stage = (event.currentTarget as HTMLElement).closest(".dx-stage") as HTMLElement;
    const rect = stage.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * 960 / rect.width, y: (event.clientY - rect.top) * 640 / rect.height };
  };
  const press = (action: "bolt" | "nova" | "dodge" | "potion" | "interact") => (event: React.PointerEvent) => { event.preventDefault(); game.input.press(action); };
  const hold = (on: boolean) => (event: React.PointerEvent) => { event.preventDefault(); game.input.touch.attack = on; if (on) game.input.press("attack"); };
  return <div className="dx-touch">
    <div className="dx-stick-zone"
      onPointerDown={event => { event.preventDefault(); pointer.current = event.pointerId; try { (event.target as HTMLElement).setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ } const p = toStage(event); setKnob({ ox: p.x, oy: p.y, x: p.x, y: p.y }); }}
      onPointerMove={event => {
        if (pointer.current !== event.pointerId || !knob) return;
        const p = toStage(event);
        const dx = p.x - knob.ox, dy = p.y - knob.oy, len = Math.hypot(dx, dy), max = 56;
        const k = len > max ? max / len : 1;
        setKnob({ ...knob, x: knob.ox + dx * k, y: knob.oy + dy * k });
        game.input.touch.stick = { x: dx / max, y: dy / max };
      }}
      onPointerUp={() => { pointer.current = null; setKnob(null); game.input.touch.stick = { x: 0, y: 0 }; }}
      onPointerCancel={() => { pointer.current = null; setKnob(null); game.input.touch.stick = { x: 0, y: 0 }; }}>
      {knob && <><span className="dx-stick-base" style={{ left: knob.ox, top: knob.oy }} /><span className="dx-stick-knob" style={{ left: knob.x, top: knob.y }} /></>}
      {!knob && <span className="dx-stick-hint">Drag to move</span>}
    </div>
    <div className="dx-touch-buttons">
      <button type="button" className="dx-t-attack" onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerLeave={hold(false)} onPointerCancel={hold(false)}>ATTACK</button>
      <button type="button" className="dx-t-bolt" onPointerDown={press("bolt")}>BOLT</button>
      <button type="button" className="dx-t-nova" onPointerDown={press("nova")}>NOVA</button>
      <button type="button" className="dx-t-dodge" onPointerDown={press("dodge")}>DODGE</button>
      <button type="button" className="dx-t-potion" onPointerDown={press("potion")}>♥ {game.player.potions}</button>
      {ui.canInteract && <button type="button" className="dx-t-use" onPointerDown={press("interact")}>USE</button>}
    </div>
  </div>;
}

