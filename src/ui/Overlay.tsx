import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RF_REWARDS, RF_STARTING_BALANCE } from "../economy/terms";
import { wholeRf } from "../economy/TokenEconomy";
import { titleCase, type Game } from "../game/Game";
import { SHORT } from "../game/kit";
import { RARITIES, RARITY_STYLE } from "../game/items";
import { COSMETICS, type Cosmetic, type CosmeticSlot } from "../game/content";
import { formatScore, OUTCOME_LABEL } from "../game/score";
import { relayShare, renderScoreCard, shareText, type ShareAction } from "./share";
import { BASE_ATK, BASE_HP, ATK_PER_LEVEL, HP_PER_LEVEL } from "../game/stats";
import type { FriendLook } from "../render/sprites";
import type { CampTab, UiState } from "../game/types";
import { FriendPortrait, formatTime, ItemCard, Rf, SimulatedTag, TxList } from "./components";
import { Modals } from "./modals";
import { BestiaryView } from "./bestiary";

export function Overlay({ game }: { game: Game }) {
  const ui = useSyncExternalStore(game.store.subscribe, game.store.get);
  return <div className={`dx-overlay${ui.settings.reducedMotion ? " dx-reduced" : ""}${ui.settings.faded ? " dx-faded" : ""}`}>
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
    <p className="dx-title-kit" style={{ color: game.kit.accent }}>Your Friend's kit: {game.kit.attack.name} · {game.kit.bolt.name} · <b>{game.kit.signature.name}</b> · {game.kit.dodge.name}</p>
    <button ref={button} type="button" className="dx-btn dx-btn-primary dx-btn-big" onClick={() => game.beginFromTitle()}>Begin ▸</button>
    <p className="dx-hint">Press Enter or tap · Sound on · M to mute</p>
    <p className="dx-sim-line"><SimulatedTag /> All RF in this game is simulated. No real tokens move.</p>
  </section>;
}

/** Walking around the camp: a light overlay; stations open the camp panel. */
function CampScreen({ game, ui }: { game: Game; ui: UiState }) {
  return <section className="dx-camp" aria-label="The Camp">
    <div className="dx-camp-title"><p className="dx-kicker">THE CAMP</p><h1>Ruined Sanctuary</h1></div>
    <div className="dx-camp-rfchip"><span>$RAREFRIENDS</span><strong>{ui.balance} RF</strong><SimulatedTag /></div>
    <div className="dx-camp-hint">
      <p>{ui.touch ? "Drag to walk · tap USE at the glowing stations" : "WASD walk · E use · walk down the great stairs to descend"}</p>
      <div>
        <button type="button" className="dx-btn" onClick={() => game.openCampPanel("friend")}>Camp menu</button>
        <button type="button" className="dx-btn dx-btn-primary" onClick={() => void game.descend()}>Descend ▾</button>
      </div>
    </div>
    {ui.touch && <TouchControls game={game} ui={ui} />}
    {ui.campPanel && <CampPanel game={game} ui={ui} tab={ui.campPanel} />}
  </section>;
}

function CampPanel({ game, ui, tab }: { game: Game; ui: UiState; tab: CampTab }) {
  const descend = useRef<HTMLButtonElement>(null);
  const setTab = (next: CampTab) => game.openCampPanel(next);
  useEffect(() => { if (tab === "descend") descend.current?.focus(); }, [tab]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); game.closeCampPanel(); } };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [game]);
  const tabs: [CampTab, string][] = [["descend", "Descend"], ["friend", "Friend"], ["wardrobe", "Wardrobe"], ["bestiary", "Bestiary"], ["stash", `Stash ${game.stash.length}`], ["codex", "Codex"], ["hall", "Hall"], ["rf", "$RF"]];
  const balance = ui.balance;
  return <div className="dx-scrim dx-camp-scrim">
    <div className="dx-camp-panel" role="dialog" aria-modal="true" aria-label="Camp menu">
      <button type="button" className="dx-close dx-camp-close" onClick={() => game.closeCampPanel()} aria-label="Close camp menu">×</button>
      <div className="dx-camp-rf"><span>$RAREFRIENDS</span><strong>{balance} RF</strong><SimulatedTag /></div>
      <nav className="dx-tabs" role="tablist" aria-label="Camp">
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "dx-tab-on" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <div className="dx-camp-body" role="tabpanel">
        {tab === "descend" && <>
          <p>Your Friend descends with exactly the RF it carries: <Rf amount={balance} />. There are no free top-ups, so every coin is a decision. (Every Friend's first session starts with <Rf amount={RF_STARTING_BALANCE} />.)</p>
          <table className="dx-denoms">
            <tbody>
              <tr><th><Rf amount={5} /></th><td>Shrine of Greed · Blood Gate · first reroll · potion · Cursed Box · The Well · common dyes</td></tr>
              <tr><th><Rf amount={10} /></th><td>Shrine of Fate · Cursed Gate · second reroll · Revive · relics · The Stranger · rare dyes and skins</td></tr>
              <tr><th><Rf amount={25} /></th><td>Shrine of the Void · Abyssal Gate · third reroll · Full Revival · Legendary Gamble · The Black Door · legendary looks</td></tr>
            </tbody>
          </table>
          <p className="dx-dim">Every run is scored: depth, kills, elites, bosses, level, the loot on your Friend and RF earned, then ×1.5 for escaping, ×2 for conquering, ×0.75 if you fall.</p>
          <p className="dx-dim">Earn it back: +{RF_REWARDS.enemy} (chance) per enemy, +{RF_REWARDS.elite} elites, +{RF_REWARDS.treasureRoom} treasure, +{RF_REWARDS.miniBoss} mini-boss, +{RF_REWARDS.boss} boss, +{RF_REWARDS.secretBoss} secret boss.</p>
          {game.stash.length > 0 && <label className="dx-heirloom">Heirloom:
            <select value={game.heirloomId ?? ""} onChange={event => game.setHeirloom(event.target.value ? Number(event.target.value) : null)}>
              <option value="">None</option>
              {game.stash.map(item => <option key={item.id} value={item.id}>{RARITY_STYLE[item.rarity].label} · {item.name}</option>)}
            </select>
          </label>}
          <button ref={descend} type="button" className="dx-btn dx-btn-primary dx-btn-big" onClick={() => void game.descend()}>Begin the Descent</button>
          <p className="dx-hint">WASD move · J/click attack · Q bolt · R nova · Space dodge · F potion · E interact</p>
        </>}
        {tab === "friend" && <div className="dx-friend">
          <FriendPortrait art={game.art} scale={6} />
          <div>
            <h2>{game.friend.label}</h2>
            <p className="dx-dim">Generations family: {game.friend.family}</p>
            <p><b>Family trait · {game.trait.name}:</b> {game.trait.text}</p>
            <h3>This Friend's kit</h3>
            <ul className="dx-kit" style={{ borderColor: game.kit.accent }}>
              <li><kbd>J</kbd> <b>{game.kit.attack.name}</b> {game.kit.attack.text}</li>
              <li><kbd>Q</kbd> <b>{game.kit.bolt.name}</b> {game.kit.bolt.text} {game.kit.bolt.energy} energy.</li>
              <li><kbd>R</kbd> <b style={{ color: game.kit.signature.color }}>{game.kit.signature.name}</b> {game.kit.signature.text} {game.kit.signature.energy} energy.</li>
              <li><kbd>SPC</kbd> <b>{game.kit.dodge.name}</b> {game.kit.dodge.text}</li>
            </ul>
            <p className="dx-dim">Every Friend's kit comes from its Generations family and its own on-chain art seed. No two play quite alike.</p>
            <p className="dx-dim">Base: {BASE_HP} HP · {BASE_ATK} ATK · 3 armor · 5% crit. Grows +{HP_PER_LEVEL} HP, +{ATK_PER_LEVEL} ATK and +0.6 armor per level. The dungeon hits hard: dodge, don't trade blows.</p>
            <p className="dx-dim">Descents this session: {game.runsStarted}</p>
          </div>
        </div>}
        {tab === "wardrobe" && <Wardrobe game={game} ui={ui} />}
        {tab === "bestiary" && <BestiaryView game={game} />}
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
          <p className="dx-hall-totals"><span>Lifetime score <b>{formatScore(game.lifetimeScore)}</b></span><span>Best run <b>{formatScore(game.bestScore)}</b></span></p>
          <p className="dx-dim">Your best descents this session, by score.</p>
          {game.hall.length ? <ol className="dx-hall">{game.hall.map((run, i) => <li key={i}>
            <b className="dx-hall-score">{formatScore(run.score.total)}</b> · Depth {run.depth} · {run.kills} kills · {OUTCOME_LABEL[run.outcome].toLowerCase()} · {run.rarest ? <span style={{ color: RARITY_STYLE[run.rarest.rarity].color }}>{run.rarest.name}</span> : "no loot"}
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
  </div>;
}

const SLOT_TITLES: Readonly<Record<CosmeticSlot, string>> = { glow: "Glows", skin: "Skins", trail: "Trails" };

/** The Dye Altar: spend RF on cosmetics that recolor (never reshape) your Friend. */
function Wardrobe({ game, ui }: { game: Game; ui: UiState }) {
  return <div className="dx-wardrobe">
    <div className="dx-wardrobe-head">
      <FriendPortrait art={game.art} look={game.skinLook as FriendLook} scale={5} className="dx-wardrobe-preview" />
      <div>
        <p>Spend RF at the Dye Altar on looks for your Friend. Cosmetics only recolor your Friend's canonical pixels and add light: the on-chain shape never changes, and they give no power.</p>
        <p className="dx-dim">Bought cosmetics last for this session. You carry <Rf amount={ui.balance} /> <SimulatedTag /></p>
      </div>
    </div>
    {(["glow", "skin", "trail"] as const).map(slot => <section key={slot}>
      <h3>{SLOT_TITLES[slot]}</h3>
      <div className="dx-cosmetics">{COSMETICS.filter(c => c.slot === slot).map(c => <CosmeticCard key={c.id} game={game} ui={ui} item={c} />)}</div>
    </section>)}
  </div>;
}

function CosmeticCard({ game, ui, item }: { game: Game; ui: UiState; item: Cosmetic }) {
  const owned = game.ownedCosmetics.has(item.id), worn = game.worn[item.slot] === item.id;
  const short = !owned && ui.balance < item.cost;
  const swatch = item.color === "prism" ? "linear-gradient(90deg,#ff3d7f,#ffd23c,#ccff00,#3ef0ff,#bb66ff)"
    : item.color === "null" ? "radial-gradient(circle,#050308 45%,#ff3d7f 70%,transparent 72%)" : item.color;
  return <button type="button" className={`dx-cosmetic${worn ? " dx-worn" : ""}${owned ? " dx-owned" : ""}`} disabled={(short || ui.busy) && !owned}
    onClick={() => void game.buyCosmetic(item.id)} aria-pressed={worn}>
    {item.look ? <FriendPortrait art={game.art} look={item.look as FriendLook} scale={3} className="dx-cosmetic-art" />
      : <span className="dx-swatch" style={{ background: swatch }} aria-hidden="true" />}
    <strong>{item.name}</strong>
    <small>{item.text}</small>
    <span className="dx-cosmetic-price">{worn ? "WORN" : owned ? "Wear" : item.cost === 0 ? "Free" : short ? `Need ${item.cost - ui.balance} more RF` : <Rf amount={item.cost} />}</span>
  </button>;
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
        <div><dt>Friend</dt><dd>{s.friendLabel}</dd></div>
        <div><dt>Depth</dt><dd>{s.depth}</dd></div>
        <div><dt>Level</dt><dd>{s.level}</dd></div>
        <div><dt>Kills</dt><dd>{s.kills}{s.elites ? ` (${s.elites} elite)` : ""}</dd></div>
        <div><dt>Bosses</dt><dd title={s.bosses.join(", ")}>{s.bosses.length ? s.bosses.length : "none"}</dd></div>
        <div><dt>Time</dt><dd>{formatTime(s.timeMs)}</dd></div>
        <div><dt>Stash</dt><dd>{s.secured} kept{s.lost ? ` · ${s.lost} lost` : ""}</dd></div>
        <div className="dx-summary-wide dx-summary-loot"><dt>Rarest loot</dt><dd style={{ color: s.rarest ? RARITY_STYLE[s.rarest.rarity].color : undefined }}>{s.rarest ? `${RARITY_STYLE[s.rarest.rarity].label} ${s.rarest.name}` : "none"}</dd></div>
      </dl>
      <ScoreBreakdown summary={s} />
      <div className="dx-summary-rf">
        <div><span>RF started</span><strong>{s.rfStarted}</strong></div>
        <div><span>RF earned</span><strong className="dx-pos">+{s.rfEarned}</strong></div>
        <div><span>RF spent</span><strong className="dx-neg">-{s.rfSpent}</strong></div>
        <div><span>RF remaining</span><strong>{s.rfRemaining}</strong></div>
      </div>
      <details className="dx-summary-log"><summary>RF activity this run ({s.transactions.length}) <SimulatedTag /></summary><TxList transactions={[...s.transactions].reverse()} /></details>
      <ShareBar game={game} summary={s} />
      <div className="dx-summary-actions">
        <button ref={primary} type="button" className="dx-btn dx-btn-primary dx-btn-big" onClick={() => void game.descend()}>Descend Again</button>
        <button type="button" className="dx-btn" onClick={() => game.returnToCamp()}>Return to Camp</button>
      </div>
      <p className="dx-dim dx-seed">Descent seed {s.seed.toString(16).toUpperCase()}</p>
    </div>
  </section>;
}

/**
 * Share the run: copy an image of the scoreboard, or post it on X. The trusted host page does the
 * copying and opens X; if no host answers, the card is shown so it can be copied or saved by hand.
 */
function ShareBar({ game, summary }: { game: Game; summary: NonNullable<UiState["summary"]> }) {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState<{ url: string; text: string; action: ShareAction } | null>(null);
  useEffect(() => () => { if (fallback) URL.revokeObjectURL(fallback.url); }, [fallback]);
  const share = async (action: ShareAction) => {
    if (busy) return;
    setBusy(true);
    setStatus(action === "copy" ? "Drawing your scoreboard…" : "Opening X…");
    try {
      const png = await renderScoreCard(game, summary), text = shareText(summary);
      const result = await relayShare(action, png, text);
      game.sfx("ui");
      if (result.ok && action === "copy") setStatus("Scoreboard image copied. Paste it anywhere!");
      else if (result.ok) setStatus(result.error ? "X opened in a new tab. Copy the image below to attach it." : "X opened in a new tab. The image is on your clipboard: paste it into your post.");
      else setStatus(action === "copy" ? "Your browser blocked the clipboard. Right-click the image to copy or save it." : "Couldn't open X from here. Copy the text and image below.");
      if (!result.ok || result.error) setFallback({ url: URL.createObjectURL(png), text, action });
    } catch {
      setStatus("Could not draw the scoreboard image.");
    } finally { setBusy(false); }
  };
  return <div className="dx-share">
    <div className="dx-share-buttons">
      <button type="button" className="dx-btn dx-share-x" disabled={busy} onClick={() => void share("post")}><span aria-hidden="true">𝕏</span> Post on X</button>
      <button type="button" className="dx-btn" disabled={busy} onClick={() => void share("copy")}>Copy image</button>
    </div>
    <p className="dx-share-status" role="status" aria-live="polite">{status}</p>
    {fallback && <div className="dx-share-fallback">
      <img src={fallback.url} alt={`Scoreboard for ${summary.friendLabel}: ${formatScore(summary.score.total)} points`} />
      {fallback.action === "post" && <textarea readOnly value={fallback.text} aria-label="Post text" onFocus={event => event.currentTarget.select()} />}
      <button type="button" className="dx-btn" onClick={() => setFallback(null)}>Hide</button>
    </div>}
  </div>;
}

/** The run's score, line by line, counting up to the total. */
function ScoreBreakdown({ summary }: { summary: NonNullable<UiState["summary"]> }) {
  const score = summary.score;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !score.total) { setShown(score.total); return; }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1400);
      setShown(Math.round(score.total * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score.total]);
  return <section className="dx-score" aria-label="Run score">
    <table className="dx-score-lines"><tbody>
      {score.lines.filter(line => line.points > 0 || line.id === "loot").map(line => <tr key={line.id}>
        <th>{line.label}</th><td className="dx-dim">{line.detail}</td><td>{formatScore(line.points)}</td>
      </tr>)}
      <tr className="dx-score-sub"><th>Subtotal</th><td /><td>{formatScore(score.subtotal)}</td></tr>
      <tr className={`dx-score-mult${score.multiplier >= 1 ? " dx-pos" : " dx-neg"}`}><th>{OUTCOME_LABEL[score.outcome]}</th><td /><td>×{score.multiplier}</td></tr>
    </tbody></table>
    <div className="dx-score-total">
      <span>SCORE</span><strong aria-label={`Score ${formatScore(score.total)}`}>{formatScore(shown)}</strong>
      {summary.best && <em>NEW BEST</em>}
      <small>Lifetime total {formatScore(summary.lifetimeScore)}</small>
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
      <button type="button" className="dx-t-bolt" onPointerDown={press("bolt")}>{SHORT[game.kit.bolt.id]}</button>
      <button type="button" className="dx-t-nova" style={{ borderColor: game.kit.signature.color }} onPointerDown={press("nova")}>{SHORT[game.kit.signature.id]}</button>
      <button type="button" className="dx-t-dodge" onPointerDown={press("dodge")}>{SHORT[game.kit.dodge.id]}</button>
      <button type="button" className="dx-t-potion" onPointerDown={press("potion")}>♥ {game.player.potions}</button>
      {ui.canInteract && <button type="button" className="dx-t-use" onPointerDown={press("interact")}>USE</button>}
    </div>
  </div>;
}

