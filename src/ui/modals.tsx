import { useEffect, useState } from "react";
import { GAMBLER_PAYOUTS, RF_COSTS, type MerchantOffer } from "../economy/terms";
import { EVENTS, GATES, MERCHANT, SHRINES } from "../game/content";
import type { Game } from "../game/Game";
import { RARITY_STYLE, SLOT_LABEL } from "../game/items";
import { BOONS } from "../game/stats";
import type { Modal, UiState } from "../game/types";
import { Dialog, ItemCard, OddsTable, Rf, SimulatedTag, TxList } from "./components";
import { CharacterModal } from "./inventory";

export function Modals({ game, ui }: { game: Game; ui: UiState }) {
  const m = ui.modal;
  switch (m.kind) {
    case "none": return null;
    case "shrine": return <ShrineModal game={game} ui={ui} modal={m} />;
    case "gate": return <GateModal game={game} ui={ui} modal={m} />;
    case "merchant": return <MerchantModal game={game} ui={ui} modal={m} />;
    case "event": return <EventModal game={game} ui={ui} modal={m} />;
    case "loot": return <LootModal game={game} ui={ui} modal={m} />;
    case "levelUp": return <LevelUpModal game={game} modal={m} />;
    case "reveal": return <RevealModal key={m.id} game={game} modal={m} />;
    case "waystone": return <WaystoneModal game={game} ui={ui} />;
    case "death": return <DeathModal game={game} ui={ui} />;
    case "character": return <CharacterModal game={game} />;
    case "log": return <LogModal game={game} ui={ui} />;
    case "pause": return <PauseModal game={game} ui={ui} />;
  }
}

function Balance({ ui, cost }: { ui: UiState; cost: number }) {
  const after = ui.balance - cost;
  return <p className="dx-balance">You carry <Rf amount={ui.balance} />{cost > 0 && <> · after: <b className={after < 0 ? "dx-neg" : ""}>{after < 0 ? "not enough" : `${after} RF`}</b></>} <SimulatedTag /></p>;
}

function PayButton({ ui, cost, label, onClick, hotkey = "Enter" }: { ui: UiState; cost: number; label: string; onClick: () => void; hotkey?: string }) {
  const short = ui.balance < cost;
  return <button type="button" className="dx-btn dx-btn-primary dx-pay" data-autofocus disabled={short || ui.busy} onClick={onClick}>
    {ui.busy ? "Offering…" : short ? `Need ${cost - ui.balance} more RF` : label}<kbd>{hotkey}</kbd>
  </button>;
}

function ShrineModal({ game, ui, modal }: { game: Game; ui: UiState; modal: Extract<Modal, { kind: "shrine" }> }) {
  const def = SHRINES[modal.tier];
  const close = () => game.closeModal();
  const offer = () => { if (ui.balance >= def.cost && !ui.busy) void game.offerShrine(); };
  return <Dialog className={`dx-shrine dx-shrine-${modal.tier}`} title={def.name} subtitle={`${def.cost} RF SHRINE`} labelColor={def.color} onClose={close} keys={{ enter: offer }}
    footer={<><button type="button" className="dx-btn" onClick={close}>Walk away <kbd>Esc</kbd></button><PayButton ui={ui} cost={def.cost} label={`Offer ${def.cost} RF`} onClick={offer} /></>}>
    <p className="dx-shrine-cost" style={{ color: def.color }}>{def.cost} RF</p>
    <p className="dx-shrine-tagline">“{def.tagline}”</p>
    <p className="dx-dim">{def.blurb}</p>
    {modal.tier === "void" && ui.balance >= 25 && ui.balance <= 30 && <p className="dx-warning">This is almost everything you carry.</p>}
    <OddsTable rows={def.outcomes} />
    <Balance ui={ui} cost={def.cost} />
  </Dialog>;
}

function GateModal({ game, ui, modal }: { game: Game; ui: UiState; modal: Extract<Modal, { kind: "gate" }> }) {
  const def = GATES[modal.tier];
  const close = () => game.closeModal();
  const open = () => { if (ui.balance >= def.cost && !ui.busy) void game.openGate(); };
  const beyond = modal.tier === "blood" ? "A combat room. Its chest rolls better loot (Uncommon or better)."
    : modal.tier === "cursed" ? "Corrupted Friend elites with extra modifiers. Guaranteed Rare-or-better chest, +2 RF per elite."
    : "Three waves of powerful enemies and elites. The vault chest is Epic or better, and Legendary or Mythic is likely.";
  return <Dialog className={`dx-gate dx-gate-${modal.tier}`} title={def.name} subtitle="DUNGEON GATE" labelColor={def.color} onClose={close} keys={{ enter: open }}
    footer={<><button type="button" className="dx-btn" onClick={close}>Leave it sealed <kbd>Esc</kbd></button><PayButton ui={ui} cost={def.cost} label={`Open for ${def.cost} RF`} onClick={open} /></>}>
    <p className="dx-shrine-cost" style={{ color: def.color }}>{def.cost} RF</p>
    <p>{def.text}</p>
    <p className="dx-dim">Beyond: {beyond}</p>
    <Balance ui={ui} cost={def.cost} />
  </Dialog>;
}

function MerchantModal({ game, ui, modal }: { game: Game; ui: UiState; modal: Extract<Modal, { kind: "merchant" }> }) {
  const merchant = game.interactables.find(it => it.id === modal.id);
  const close = () => game.closeModal();
  const offers = Object.keys(MERCHANT) as MerchantOffer[];
  const keys = Object.fromEntries(offers.map((offer, i) => [String(i + 1), () => void game.buy(offer)]));
  return <Dialog className="dx-merchant" title="Moth, the Peddler" subtitle="MERCHANT" labelColor="#ffb02e" onClose={close} keys={keys}
    footer={<button type="button" className="dx-btn" onClick={close}>Leave <kbd>Esc</kbd></button>}>
    <p className="dx-shrine-tagline">“Everything has a price, little Friend. Mine are small.”</p>
    <ul className="dx-offers">
      {offers.map((offer, i) => {
        const def = MERCHANT[offer], stock = merchant?.stock?.[offer] ?? 0;
        const short = ui.balance < def.cost;
        const full = offer === "potion" && game.player.potions >= game.stats.potionMax;
        return <li key={offer} className={stock <= 0 ? "dx-soldout" : ""}>
          <div><strong>{def.name}</strong><small>{def.text}{offer === "potion" ? ` · belt ${game.player.potions}/${game.stats.potionMax}` : ""}</small></div>
          <span className="dx-offer-cost"><Rf amount={def.cost} /></span>
          <button type="button" className="dx-btn dx-btn-primary" data-autofocus={i === 0 ? true : undefined} disabled={stock <= 0 || short || ui.busy || full} onClick={() => void game.buy(offer)}>
            {stock <= 0 ? "Sold out" : full ? "Belt full" : short ? `Need ${def.cost - ui.balance}` : `Buy`}<kbd>{i + 1}</kbd>
          </button>
        </li>;
      })}
    </ul>
    <Balance ui={ui} cost={0} />
  </Dialog>;
}

function EventModal({ game, ui, modal }: { game: Game; ui: UiState; modal: Extract<Modal, { kind: "event" }> }) {
  const def = EVENTS[modal.event];
  const close = () => game.closeModal();
  const act = () => { if (ui.balance >= def.cost && !ui.busy) void game.resolveEvent(); };
  const rows = modal.event === "gambler"
    ? GAMBLER_PAYOUTS.map(row => ({ label: row.payout ? `Win ${row.payout} RF` : "Win nothing", chanceBps: row.chanceBps }))
    : def.outcomes;
  return <Dialog className={`dx-event dx-event-${modal.event}`} title={def.name} subtitle={def.rare ? "RARE EVENT" : def.cost ? `${def.cost} RF EVENT` : "EVENT"}
    labelColor={def.cost >= 25 ? "#ff3d7f" : "#3ef0ff"} onClose={close} keys={{ enter: act }}
    footer={<><button type="button" className="dx-btn" onClick={close}>Walk away <kbd>Esc</kbd></button>
      {def.cost > 0 ? <PayButton ui={ui} cost={def.cost} label={def.action} onClick={act} />
        : <button type="button" className="dx-btn dx-btn-primary" data-autofocus disabled={ui.busy} onClick={act}>{def.action}<kbd>Enter</kbd></button>}</>}>
    <p className="dx-shrine-tagline">{def.prompt}</p>
    {def.cost > 0 && <p className="dx-shrine-cost" style={{ color: def.cost >= 25 ? "#ff3d7f" : "#ccff00" }}>{def.cost} RF</p>}
    <OddsTable rows={rows} />
    {def.cost > 0 && <Balance ui={ui} cost={def.cost} />}
  </Dialog>;
}

function LootModal({ game, ui, modal }: { game: Game; ui: UiState; modal: Extract<Modal, { kind: "loot" }> }) {
  const chest = game.chestOf(modal.id);
  if (!chest?.options) return null;
  const rerolls = chest.rerolls, next = RF_COSTS.reroll[rerolls];
  const choose = (i: number) => game.chooseLoot(i);
  const reroll = () => { if (next !== undefined && ui.balance >= next && !ui.busy) void game.rerollLoot(); };
  return <Dialog className="dx-loot" title="Choose Your Reward" subtitle="LOOT" labelColor="#ffb02e" onClose={() => game.closeModal()}
    keys={{ "1": () => choose(0), "2": () => choose(1), "3": () => choose(2), r: reroll }}
    footer={<>
      <button type="button" className="dx-btn" onClick={() => game.closeModal()}>Decide later <kbd>Esc</kbd></button>
      <button type="button" className="dx-btn dx-reroll" disabled={next === undefined || ui.balance < next || ui.busy} onClick={reroll}>
        {next === undefined ? "No rerolls left" : ui.balance < next ? `Reroll needs ${next} RF` : `Reroll · ${next} RF`}<kbd>R</kbd>
      </button>
      <span className="dx-reroll-ladder" aria-label="Reroll costs">{RF_COSTS.reroll.map((cost, i) => <span key={i} className={i < rerolls ? "dx-used" : i === rerolls ? "dx-next" : ""}>{cost}</span>)}</span>
    </>}>
    <div className="dx-choices">
      {chest.options.map((item, i) => {
        const current = game.equipment[item.slot];
        return <ItemCard key={item.id} item={item} hotkey={String(i + 1)} onClick={() => choose(i)}
          note={current ? `Equipped ${SLOT_LABEL[item.slot].toLowerCase()}: ${current.name} (${RARITY_STYLE[current.rarity].label.toLowerCase()})` : `Empty ${SLOT_LABEL[item.slot].toLowerCase()} slot`} />;
      })}
    </div>
    <Balance ui={ui} cost={0} />
  </Dialog>;
}

function LevelUpModal({ game, modal }: { game: Game; modal: Extract<Modal, { kind: "levelUp" }> }) {
  const choose = (i: number) => { const id = modal.options[i]; if (id) game.chooseBoon(id); };
  return <Dialog className="dx-levelup" title={`Level ${game.level}`} subtitle="LEVEL UP" labelColor="#ccff00"
    keys={{ "1": () => choose(0), "2": () => choose(1), "3": () => choose(2) }}>
    <p className="dx-dim">+8 max HP, +1.6 attack and +1 armor. Choose one more upgrade:</p>
    <div className="dx-choices">
      {modal.options.map((id, i) => <button key={id} type="button" className="dx-boon" data-autofocus={i === 0 ? true : undefined} onClick={() => choose(i)}>
        <kbd>{i + 1}</kbd><strong>{BOONS[id].name}</strong><span>{BOONS[id].text}</span>
        {(game.boons.get(id) ?? 0) > 0 && <small>Taken ×{game.boons.get(id)}</small>}
      </button>)}
    </div>
  </Dialog>;
}

function RevealModal({ game, modal }: { game: Game; modal: Extract<Modal, { kind: "reveal" }> }) {
  const suspense = game.reducedMotion ? Math.min(0.3, modal.suspense) : modal.suspense;
  const [shown, setShown] = useState(suspense <= 0);
  useEffect(() => {
    if (suspense <= 0) return;
    const timer = window.setTimeout(() => setShown(true), suspense * 1000);
    return () => window.clearTimeout(timer);
  }, [suspense]);
  useEffect(() => {
    if (!shown) return;
    const cue = modal.tone === "legendary" || modal.tone === "mythic" ? "reveal-legendary" : modal.tone === "void" ? "reveal-rare" : modal.tone === "bad" ? "impact" : "reveal-common";
    game.audio.cue(cue);
  }, [shown, modal.tone, game]);
  const color = modal.tone === "mythic" ? "#ff3d7f" : modal.tone === "legendary" ? "#ffb02e" : modal.tone === "void" ? "#ff3d7f" : modal.tone === "bad" ? "#ff4d6d" : modal.tone === "neutral" ? "#b9b3c9" : "#ccff00";
  if (!shown) {
    return <div className="dx-scrim dx-suspense" role="status" aria-live="polite">
      <div className="dx-suspense-runes" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <span key={i} style={{ transform: `rotate(${i * 45}deg) translateY(-70px)` }} />)}</div>
      <p>{modal.subtitle?.includes("VOID") ? "The Void considers your offering…" : "The outcome is being decided…"}</p>
    </div>;
  }
  const continueLabel = modal.action ?? "Continue";
  return <Dialog className={`dx-reveal dx-tone-${modal.tone}`} title={modal.title} subtitle={modal.subtitle} labelColor={color}
    onClose={modal.followUp ? undefined : () => game.closeModal()} keys={{ enter: () => game.closeModal() }}
    footer={<button type="button" className="dx-btn dx-btn-primary" data-autofocus onClick={() => game.closeModal()}>{continueLabel}<kbd>Enter</kbd></button>}>
    {modal.rf !== undefined && <p className="dx-reveal-rf">+{modal.rf} RF</p>}
    {modal.lines.map((line, i) => <p key={i}>{line}</p>)}
    {modal.item && <ItemCard item={modal.item} note={game.equipment[modal.item.slot]?.id === modal.item.id ? "Equipped" : "In your bag (C to compare)"} />}
    <p className="dx-dim dx-small"><SimulatedTag /> Simulated outcome from the displayed odds.</p>
  </Dialog>;
}

function WaystoneModal({ game, ui }: { game: Game; ui: UiState }) {
  const carried = game.allCarried().length;
  return <Dialog className="dx-waystone" title="The Waystone" subtitle={`DEPTH ${ui.depth} CLEARED`} labelColor="#ccff00"
    keys={{ enter: () => game.waystoneDescend(), x: () => game.waystoneEscape() }}
    footer={<>
      <button type="button" className="dx-btn" onClick={() => game.waystoneEscape()}>Escape the Descent <kbd>X</kbd></button>
      <button type="button" className="dx-btn dx-btn-primary" data-autofocus onClick={() => game.waystoneDescend()}>Descend deeper<kbd>Enter</kbd></button>
    </>}>
    <p>Your {carried} item{carried === 1 ? " is" : "s are"} now <b className="dx-pos">SECURED</b>. They return to your camp stash even if your Friend falls.</p>
    <p className="dx-dim">Escape now to end the run with everything, or risk more for deeper loot, bigger bosses and more RF.</p>
    <Balance ui={ui} cost={0} />
  </Dialog>;
}

function DeathModal({ game, ui }: { game: Game; ui: UiState }) {
  const unsecured = game.allCarried().filter(item => !game.secured.has(item.id)).length;
  const { partial, full } = RF_COSTS.revive;
  return <Dialog className="dx-death" title="Your Friend Has Fallen" subtitle={`DEPTH ${ui.depth}`} labelColor="#ff4d6d"
    keys={{ "1": () => { if (ui.balance >= partial) void game.revive("partial"); }, "2": () => { if (ui.balance >= full) void game.revive("full"); }, "3": () => game.endRunFromDeath() }}>
    <div className="dx-death-options">
      <button type="button" className="dx-btn dx-death-opt" data-autofocus disabled={ui.balance < partial || ui.busy} onClick={() => void game.revive("partial")}>
        <kbd>1</kbd><strong>Revive</strong><span className="dx-rf">{partial} RF</span><small>Return with 40% HP.</small>
      </button>
      <button type="button" className="dx-btn dx-death-opt dx-death-full" disabled={ui.balance < full || ui.busy} onClick={() => void game.revive("full")}>
        <kbd>2</kbd><strong>Full Revival</strong><span className="dx-rf">{full} RF</span><small>Full HP, curses cleansed, a burst that clears space.</small>
      </button>
      <button type="button" className="dx-btn dx-death-opt dx-death-end" onClick={() => game.endRunFromDeath()}>
        <kbd>3</kbd><strong>End Run</strong><span>Keep secured loot</span><small>{unsecured ? `${unsecured} unsecured item${unsecured === 1 ? "" : "s"} will be lost.` : "Nothing unsecured to lose."}</small>
      </button>
    </div>
    <Balance ui={ui} cost={0} />
  </Dialog>;
}

function LogModal({ game, ui }: { game: Game; ui: UiState }) {
  return <Dialog className="dx-log" title="RF Activity" subtitle="$RAREFRIENDS LEDGER" labelColor="#ccff00" onClose={() => game.closeModal()}>
    <p><b className="dx-big-rf">{ui.balance} RF</b> <SimulatedTag /></p>
    <TxList transactions={[...game.economy.getHistory()].reverse()} />
  </Dialog>;
}

function PauseModal({ game, ui }: { game: Game; ui: UiState }) {
  const [confirm, setConfirm] = useState(false);
  const s = ui.settings;
  const toggle = (key: keyof typeof s, label: string) => <label className="dx-toggle"><input type="checkbox" checked={s[key]} onChange={() => game.toggleSetting(key)} /> {label}</label>;
  return <Dialog className="dx-pause" title="Paused" subtitle="THE DESCENT" labelColor="#ccff00" onClose={() => game.closeModal()}
    footer={<>
      {confirm ? <button type="button" className="dx-btn dx-btn-danger" onClick={() => game.abandonRun()}>Confirm: abandon run</button>
        : <button type="button" className="dx-btn" onClick={() => setConfirm(true)}>Abandon run…</button>}
      <button type="button" className="dx-btn dx-btn-primary" data-autofocus onClick={() => game.closeModal()}>Resume<kbd>Esc</kbd></button>
    </>}>
    <div className="dx-pause-cols">
      <div>
        <h3>Settings</h3>
        {toggle("sound", "Sound (M)")}
        {toggle("music", "Music")}
        {toggle("reducedMotion", "Reduced motion")}
        {toggle("screenShake", "Screen shake")}
        {toggle("damageNumbers", "Damage numbers")}
        {toggle("crt", "CRT scanlines")}
        <p>
          <button type="button" className="dx-btn" onClick={() => game.setModal({ kind: "character" })}>Character (C)</button>{" "}
          <button type="button" className="dx-btn" onClick={() => game.setModal({ kind: "log" })}>RF activity (Tab)</button>
        </p>
      </div>
      <div>
        <h3>Controls</h3>
        <ul className="dx-controls">
          <li><kbd>WASD</kbd>/<kbd>Arrows</kbd> move</li>
          <li><kbd>J</kbd>/<kbd>Click</kbd> {game.kit.attack.name} (hold)</li>
          <li><kbd>Q</kbd>/<kbd>Right-click</kbd> {game.kit.bolt.name} · {game.kit.bolt.energy} energy</li>
          <li><kbd>R</kbd> {game.kit.signature.name} · {game.kit.signature.energy} energy</li>
          <li><kbd>Space</kbd>/<kbd>Shift</kbd> {game.kit.dodge.name}{game.kit.dodge.charges > 1 ? ` (${game.kit.dodge.charges} charges)` : ""}</li>
          <li><kbd>F</kbd> potion · <kbd>E</kbd> interact</li>
          <li><kbd>C</kbd> character · <kbd>Tab</kbd> RF log · <kbd>Esc</kbd> pause</li>
        </ul>
        <h3>About $RAREFRIENDS here</h3>
        <p className="dx-dim">Every RF price, reward and outcome in The Descent is <b>simulated</b>. No real tokens move and no transactions are sent. Your Friend's ownership was verified by the FriendSDK runtime. The runtime's Friend wallet panel shows the SDK's own reference preview balance, which this game does not spend. Reloading starts a new session.</p>
      </div>
    </div>
  </Dialog>;
}

