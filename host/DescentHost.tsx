import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Address } from "viem";
import { GameFrame } from "@rarefriends/friendsdk/frame";
import type { ChanceGameDefinition } from "@rarefriends/friendsdk/game";
import { readOwnedFriends, type OwnedFriend } from "@rarefriends/friendsdk/owned";
import { ConnectedGameHost } from "@rarefriends/friendsdk/runtime";
import { createFriendReader, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { createFriendPublicClient, createFriendWalletSession, type FriendWalletSession } from "@rarefriends/friendsdk/wallet";

/**
 * Trusted host page for The Descent.
 *
 * It is the FriendSDK GameHost with a richer Friend picker: the SDK's own wallet session,
 * owner-filtered discovery (readOwnedFriends) and ConnectedGameHost do all the security work,
 * including the fresh ownership check at a new block before every session. Only the picker is custom:
 * it shows each Friend's canonical artwork, and once a Friend enters the dungeon it stays locked for
 * this wallet session. Changing account or network always drops the lock and re-verifies.
 */
export function DescentHost({ definition, frameUrl }: { definition: ChanceGameDefinition; frameUrl: string }) {
  const [session] = useState(() => createFriendWalletSession());
  const [publicClient] = useState(() => createFriendPublicClient());
  useEffect(() => () => session.dispose(), [session]);
  const wallet = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [attempt, setAttempt] = useState(0);
  const [discovery, setDiscovery] = useState<{ key: string; friends: readonly OwnedFriend[]; hidden: number; error?: string } | null>(null);
  /** The Friend in the dungeon, tied to the account and wallet revision that chose it. */
  const [locked, setLocked] = useState<{ friend: OwnedFriend; account: string; revision: number } | null>(null);

  const identityKey = `${wallet.account ?? ""}:${wallet.chainId ?? ""}:${wallet.revision}:${attempt}`;
  useEffect(() => {
    if (wallet.status !== "connected" || !wallet.account) return;
    const controller = new AbortController();
    const key = identityKey;
    void readOwnedFriends(publicClient, wallet.account as Address, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setDiscovery({ key, friends: result.friends, hidden: result.hiddenCount });
    }).catch(error => {
      if (!controller.signal.aborted) setDiscovery({ key, friends: [], hidden: 0, error: error instanceof Error ? error.message : "Could not load your Friends. Try again." });
    });
    return () => controller.abort();
  }, [session, publicClient, wallet.status, wallet.account, identityKey]);

  const current = discovery?.key === identityKey ? discovery : null;
  // The public RPC sometimes rejects bursts; retry discovery twice on its own before asking the player.
  const autoRetries = useRef(0);
  const failed = Boolean(current?.error);
  useEffect(() => {
    if (!failed) { if (current) autoRetries.current = 0; return; }
    if (autoRetries.current >= 2) return;
    autoRetries.current++;
    const timer = window.setTimeout(() => setAttempt(value => value + 1), 2500 * autoRetries.current);
    return () => window.clearTimeout(timer);
  }, [failed, current]);
  // Any account, network or provider change ends the locked session; the SDK re-verifies on re-entry.
  const lockValid = locked && wallet.status === "connected" && wallet.account?.toLowerCase() === locked.account.toLowerCase() && wallet.revision === locked.revision;
  if (lockValid) {
    return <ConnectedGameHost definition={definition} frameUrl={frameUrl}
      selectedFriend={{ id: locked.friend.id, label: locked.friend.label, kind: "owned", walletAddress: locked.friend.walletAddress }}
      account={wallet.account ?? null} chainId={wallet.chainId ?? null} publicClient={publicClient} revision={wallet.revision} />;
  }
  return <GameFrame mode="preview" selectionMode="host" friends={[]} selectedFriendId={null}>
    <Picker session={session} wallet={wallet} discovery={current} loading={wallet.status === "connected" && !current}
      onRetry={() => setAttempt(value => value + 1)}
      onChoose={friend => { if (wallet.account) setLocked({ friend, account: wallet.account, revision: wallet.revision }); }} />
  </GameFrame>;
}

type Wallet = ReturnType<FriendWalletSession["getSnapshot"]>;

function Picker({ session, wallet, discovery, loading, onRetry, onChoose }: {
  session: FriendWalletSession; wallet: Wallet; loading: boolean;
  discovery: { friends: readonly OwnedFriend[]; hidden: number; error?: string } | null;
  onRetry: () => void; onChoose: (friend: OwnedFriend) => void;
}) {
  const friends = discovery?.friends ?? [];
  return <section className="dh-picker" aria-labelledby="dh-title">
    <header className="dh-head">
      <p className="dh-kicker">RARE FRIENDS</p>
      <h1 id="dh-title">Choose your Friend</h1>
      <p className="dh-sub">Your Friend is the hero of this descent. Once you enter the dungeon it is locked in for this session.</p>
    </header>
    <div className="dh-connection" role="status">
      {wallet.status === "unavailable" && <><p>No browser wallet found. Enable your wallet extension or open this game in your wallet's browser.</p>
        <button type="button" onClick={() => { void session.connect(); }}>Check for wallet</button></>}
      {wallet.status === "disconnected" && <p>Connect your wallet to find your Friends on Robinhood.</p>}
      {wallet.status === "connecting" && <p>Connecting wallet…</p>}
      {wallet.status === "switching-network" && <p>Switching network… check your wallet.</p>}
      {wallet.status === "wrong-network" && <p role="alert">Your wallet is on {wallet.chainId === 1 ? "Ethereum mainnet" : `chain ${wallet.chainId}`}. Switch to Robinhood mainnet (4663) to load your Friends.</p>}
      {wallet.error && <p role="alert">{wallet.error}</p>}
      {wallet.account && <p className="dh-account">Connected: {wallet.account}</p>}
      <div className="dh-actions">
        {(wallet.status === "disconnected" || wallet.status === "error") && wallet.wallets.map(value =>
          <button key={value.id} type="button" className="rf-frame-primary" onClick={() => { void session.connect(value.id); }}>
            {wallet.wallets.length === 1 ? "Connect wallet" : `Connect ${value.name}`}</button>)}
        {wallet.status === "wrong-network" && <><button type="button" className="rf-frame-primary" onClick={() => { void session.switchNetwork(); }}>Switch to Robinhood</button>
          <button type="button" onClick={() => { void session.refresh(); }}>Check network</button></>}
        {wallet.status === "connected" && <button type="button" onClick={onRetry}>{discovery?.error ? "Retry loading Friends" : "Refresh Friends"}</button>}
        {wallet.account && <button type="button" onClick={() => session.disconnect()}>Disconnect</button>}
      </div>
    </div>
    {loading && <p className="dh-note" role="status">Loading your Friends…</p>}
    {discovery?.error && <div className="dh-note" role="alert">
      <p>Couldn't load your Friends from Robinhood Chain. The public network is often busy for a moment; press <b>Retry loading Friends</b>.</p>
      <details className="dh-details"><summary>Technical details</summary><p>{discovery.error}</p></details>
    </div>}
    {friends.length > 0 && <ul className="dh-grid">{friends.map(friend => <li key={friend.id.toString()}><FriendCard friend={friend} onChoose={onChoose} /></li>)}</ul>}
    {discovery && !discovery.error && discovery.hidden > 0 && <p className="dh-note">{discovery.hidden} {discovery.hidden === 1 ? "Friend" : "Friends"} hidden: not hardwired (generation 0). Playing requires generation 1 or higher.</p>}
    {discovery && !discovery.error && !friends.length && <p className="dh-note">{discovery.hidden ? "No eligible Friends available in this wallet." : "No Rare Friends Generations NFTs found in this wallet on Robinhood."}</p>}
    <p className="dh-foot">Ownership is verified by the FriendSDK at a fresh block before play. Balances and outcomes are simulated. Reload the page to pick a different Friend.</p>
  </section>;
}

// Artwork reads are public and cached; a small queue keeps the public RPC from rejecting bursts.
const reader = createFriendReader();
let queue: Promise<unknown> = Promise.resolve();
function readArt(id: bigint): Promise<GenerationSprites> {
  const next = queue.then(() => reader.read(id)).catch(() => new Promise(resolve => setTimeout(resolve, 900)).then(() => reader.read(id)));
  queue = next.catch(() => undefined);
  return next;
}

function FriendCard({ friend, onChoose }: { friend: OwnedFriend; onChoose: (friend: OwnedFriend) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [family, setFamily] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer = 0;
    readArt(friend.id).then(sprites => {
      if (!alive) return;
      setFamily(sprites.familyName);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let frame = 0;
      const draw = () => {
        const node = canvas.current;
        if (!node || !alive) return;
        const ctx = node.getContext("2d")!;
        const rows = sprites.clips.idle.down[frame % 8].rows;
        const scale = 4, size = 16 * scale + 8;
        node.width = size; node.height = size;
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "#000000";
        rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "#") ctx.fillRect(4 + x * scale, 4 + y * scale, scale, scale); }));
        frame++;
        if (!reduced) timer = window.setTimeout(draw, 180);
      };
      draw();
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; window.clearTimeout(timer); };
  }, [friend.id]);
  return <button type="button" className="dh-card" onClick={() => onChoose(friend)} aria-label={`${friend.label}${family ? `, ${family}` : ""}. Enter the dungeon with this Friend`}>
    <span className="dh-thumb">{failed ? <span className="dh-thumb-missing">?</span> : <canvas ref={canvas} aria-hidden="true" />}</span>
    <span className="dh-card-text">
      <strong>{friend.label}</strong>
      <small>{family ?? (failed ? "Artwork unavailable" : "Loading artwork…")}</small>
      <small className="dh-gen">Hardwired · Gen {friend.generation}</small>
    </span>
  </button>;
}
