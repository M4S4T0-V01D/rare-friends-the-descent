# Rare Friends: The Descent

**Your Rare Friend descends into a dungeon where $RAREFRIENDS is the currency of risk.**

A dark bullet-hell action-RPG dungeon crawler for the Rare Friends Vibeathon. Your own Generations NFT is the playable hero. It fights through procedurally generated floors of cursed crypts, finds randomized loot, and at every turn faces the same question: *spend 5 RF now, save for 10, or risk everything for 25?*

| | |
|---|---|
| **Builder** | M4S4T0 · GitHub [@M4S4T0-V01D](https://github.com/M4S4T0-V01D) |
| **Category** | Game (FriendSDK). Entered for **Character Spotlight**, **Token Activity** and **Economy Potential** |
| **Stack** | FriendSDK **v0.1.2** runtime · TypeScript · React 19 (UI) · Canvas 2D renderer · Web Audio |
| **Playable preview** | **https://m4s4t0-v01d.github.io/rare-friends-the-descent/** |
| **Requirements** | A browser wallet on **Robinhood mainnet (chain 4663)** holding a **hardwired Rare Friends Generations NFT (generation ≥ 1)** |
| **Economy** | **SIMULATED $RAREFRIENDS.** No real money, no token transfers, no purchases, no transactions. |

---

## The three categories, at a glance

**Character Spotlight: your Rare Friend is the dungeon hero.**
The SDK verifies that you own the Friend, and the game then reads that Friend's canonical 16×16 on-chain artwork. The same pixels appear everywhere: walking and fighting through the dungeon with its real idle and walk animations, as the canonical black-on-white portrait in the HUD, on the title screen, at the camp, in boss introductions ("Hoverer #7730 vs Dungeon Warden"), in the character sheet and on the end-of-run summary. The elite enemy, the **Corrupted Friend**, is a crimson reflection of *your own* Friend. The secret boss, **The Unminted**, wears your Friend's silhouette as living void. Each Generations family also grants a unique passive (Skeleton, Mask, Family, Cellular, Asymmetry, Hoverer, Colossus, Sparkling, Hollow). On top of that, **every Friend gets its own combat kit** (see [Every Friend plays differently](#every-friend-plays-differently)).

**Token Activity: RF is spent and earned constantly.**
Every floor presents about **7–8 paid RF decisions**, measured across 900 generated floors: 1.5 shrines, 1 RF gate, about 1 paid event, a merchant on 58% of floors, and roughly 3.7 loot chests, each with an escalating 5 → 10 → 25 RF reroll. Revives cost 10 or 25 RF. Kills, elites, treasure, events and bosses pay RF back. Every movement shows up in a live **RF ACTIVITY** feed in the HUD, in a full ledger (Tab), and in the end-of-run summary.

**Economy Potential: a small-number risk economy built for real RF later.**
Every price lives in one file ([`src/economy/terms.ts`](src/economy/terms.ts)), uses only **5, 10 and 25 RF**, and is pinned by tests. Gameplay spends through a single [`TokenEconomy`](src/economy/TokenEconomy.ts) interface and grants an outcome only after the spend's receipt resolves. The shipped `SimulatedTokenEconomy` already uses the SDK's 18-decimal bigint RF units. A live adapter can replace it without touching combat, loot or UI code (see [Future real-token integration](#future-real-token-integration)).

---

## How to play

1. Connect your wallet and choose your Friend from a picker that shows each Friend's own on-chain artwork and family. The FriendSDK verifies ownership at a fresh block, and once you enter, that Friend is locked in for the session (reload the page to pick another).
2. **Begin** at the title and arrive at **the camp**: a ruined sanctuary of the ancient Rare Friends. Walk around with your Friend among tents, a campfire, lanterns and broken columns. Use the stations (your stash, the Rune Tablet codex, the Obelisk of Descents, the RF Ledger, and the Still Pool that shows your Friend's kit), then walk down **the great stairs**, flanked by two stone statues of your own Friend, to descend.
3. Clear rooms, loot, make RF decisions, go deeper. Bosses wait at depths 3, 6 and 9.
4. Escape at a Waystone with your loot, or die and decide whether RF can buy you another chance.

### Sound

Every place has its own mood, all synthesized live with Web Audio: the camp's warm drone and crackling fire, the crypts' choir pad with dripping water and wind, the Signal Vaults' electric hum and synth arpeggio with data chirps, the Hollow Deep's heartbeat and growling drone with wet squelches, the void's shimmering pads and glitch whispers, and a pulsing boss track. **Each Generations family has its own voice** (Skeleton bone-clacks, Mask hollow toks, Family chirps, Cellular bubbles, Asymmetry detuned zaps, Hoverer airy whooshes, Colossus deep thuds, Sparkling chimes, Hollow echoing pings), heard when you dodge, get hit, cast your signature, land a heavy blow or level up. Each Friend's on-chain seed tunes its voice slightly, so no two sound quite alike. Mute with M; music has its own toggle.

### Every Friend plays differently

Each Friend's kit is derived from its Generations family and its own on-chain art seed. The same Friend always gets the same kit, and there are 5,184 possible combinations, each reachable and evenly distributed.

| Slot | What varies | Options |
|---|---|---|
| **R · Signature** (by family) | A unique ability | Skeleton **Bone Spikes** · Mask **Masquerade** · Family **Rally** · Cellular **Mitosis** · Asymmetry **Chaos Rift** · Hoverer **Phase Blink** · Colossus **Earthshatter** · Sparkling **Prism Burst** · Hollow **Void Pull** |
| **J · Attack** (by seed) | Reach, arc and speed | Rune Slash (wide combo) · Piercing Lunge (long thrust that steps in) · Whirl (hits all around) |
| **Q · Bolt** (by seed) | Spread, range and piercing | Void Bolt · Scatter Shards (3-shard fan) · Piercing Lance (pierces 3) |
| **Space · Dodge** (by seed) | Charges | Dash (1 long) · Double Step (2 short charges) |
| **Action bar** (by seed) | Look | 4 frame styles (corner brackets, ring, diamond gems, notched) × 8 accent colors, drawn around each slot so key bindings always stay readable on their own keycaps |

The kit is shown on the title screen, in the camp's **Friend** tab, in the pause menu and on the action bar.

### Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | WASD or arrow keys | Drag on the left side |
| Attack (3-hit combo, hold to repeat) | J or left click | ATTACK |
| Bolt (your kit's style) | Q, L or right click | Bolt button |
| Signature ability (your family's) | R or N | Signature button |
| Dodge (brief invulnerability) | Space, Shift or K | DODGE |
| Potion (heals 35%) | F or H | ♥ |
| Interact / confirm | E or Enter | USE |
| Character sheet · RF ledger · pause | C · Tab · Esc | ☰ |
| Mute | M | Pause menu |
| Choose in dialogs | 1 / 2 / 3, R to reroll | Tap |

The mouse aims when you move it; keyboard players get soft auto-aim toward the nearest enemy they face. Clicking outside the game mid-fight pauses it.

### The first minute

Title → wallet → Friend → camp → **Depth 1**. The first room holds three Cursed Friends. Clearing it always drops a visible weapon upgrade. The very next room is the **Shrine of Greed (5 RF)**, your first RF decision. Depth 2 **always** contains the **Shrine of the Void (25 RF)**, the game's signature "give everything" moment.

---

## The $RAREFRIENDS economy (simulated)

**You start each descent with 25 RF.** If your balance is below 25 when a descent begins, a "Descent stipend (simulated preview)" tops it back up to 25, recorded in the ledger. This keeps the preview playable; a real economy would drop it (see below). RF is only ever spent by your own choice. Dying never takes RF.

### What RF buys

| | 5 RF | 10 RF | 25 RF |
|---|---|---|---|
| **Shrines** | Shrine of Greed: small blessing | Shrine of Fate: medium blessing | Shrine of the Void: major gamble |
| **Dungeon gates** | Blood Gate: optional combat room, better chest | Cursed Gate: elite encounter, Rare+ chest | Abyssal Gate: 3-wave vault, Epic+ chest, Mythic possible |
| **Loot rerolls** (per chest) | 1st reroll | 2nd reroll | 3rd reroll (no 4th) |
| **Revive** (on death) | | Revive: 40% HP | Full Revival: 100% HP, curses cleansed, damaging burst |
| **Merchant: Moth, the Peddler** | Health Potion (×2) · Cursed Mystery Box | Random Relic · Rare Item | Legendary Gamble |
| **Events** | The Well · The Gambler | The Stranger · The Golden Door | The Black Door |

### What RF pays back

| Source | Reward |
|---|---|
| Normal enemy | **+1 RF**, 6% chance (doubled for champions; raised by RF-find items, the Sparkling family and the Fortune boon) |
| Loot Goblin | **+1 RF** coins while it flees (max 3 per goblin) |
| Elite (Corrupted Friend) | **+2 RF** |
| Treasure room / The Corpse | **+3 RF** |
| Rare event (Lost Friend, secret room, horde survived, Void-hunt bounty) | **+5 RF** |
| Mini-boss (Dungeon Warden, depths 3 and 6) | **+5 RF** |
| Boss (The Rare Beast, depth 9) | **+10 RF** |
| Secret boss (The Unminted) | **+25 RF** |
| The Gambler (5 RF stake) | 0 RF 45% · 5 RF 30% · 10 RF 17% · 25 RF 8% |

### Shrine odds

Odds are shown in every shrine and event dialog. All tables sum to 100% (pinned by tests).

| Shrine of Greed · 5 RF | | Shrine of Fate · 10 RF | | Shrine of the Void · 25 RF | |
|---|---:|---|---:|---|---:|
| +10% damage, 2 rooms | 25% | +20% damage, 3 rooms | 22% | Legendary loot | 28% |
| Heal 15% HP | 20% | Full heal | 18% | Mythic loot | 10% |
| +5% speed this floor | 20% | +8% crit, 3 rooms | 18% | Void-Touched: +25% dmg, +8% crit, +10% speed for the run | 20% |
| Reveal the floor map | 15% | Next chest Rare or better | 17% | Summon a Void-hunting elite (drops Legendary + 5 RF) | 17% |
| Small loot bonus (+15% luck, 2 rooms, and an Uncommon+ item) | 20% | Reveal a secret room | 10% | Void Curse: −30% max HP, +25% damage taken, 3 rooms | 15% |
| | | Loot frenzy, 3 rooms | 15% | Secret boss: The Unminted (+25 RF, Mythic-grade loot) | 10% |

### Event odds

| Event | Cost | Outcomes |
|---|---|---|
| The Well | 5 RF | Heal 30% · blessing 20% · curse 15% · small loot 20% · nothing 15% |
| The Stranger | 10 RF | Reveals a secret room 30% · disappears 20% · gives a Rare+ relic 35% · summons an elite 15% |
| The Black Door | 25 RF | Secret boss 25% · Mythic chest 20% · cursed dungeon (Legendary hoard) 25% · enormous horde (+5 RF) 30% |
| The Golden Door | 10 RF | Epic 65% · Legendary 28% · Mythic 7% item |
| The Gambler | 5 RF | See the payout table above |
| The Mirror | free | Duplicate your strongest item (copy is secured) 50% · destroy it 50% |
| The Corpse | free | Loot 40% · ambush 25% · +3 RF 20% · curse 15% |
| A Lost Friend (rare) | free | +5 RF and a 25% heal |

Merchant gambles: **Legendary Gamble** Epic 30% · Legendary 58% · Mythic 12%. **Cursed Mystery Box** cursed item 55% · 2 potions 20% · curse 15% · Epic item 10%.

### Death, revival and extraction

- **Death:** choose **Revive (10 RF)**, **Full Revival (25 RF)** or **End Run**.
- **Waystones** appear after each boss (depths 3, 6, 9). Touching one **secures** everything you carry. You then **escape** (the run ends and all loot goes to your camp stash) or **descend** for more.
- **End Run after death:** secured items return to the stash; unsecured items and the run's progress are lost. Your RF balance is untouched.
- **Heirloom:** before a descent, carry one stash item into the dungeon. It is equipped and secured from the start.

---

## Loot, progression and enemies

**Rarities:** Common · Uncommon · Rare · Epic · **Legendary** · **MYTHIC**. Higher tiers roll more and stronger affixes. Legendary and Mythic drops get a light beam, a banner, sound and a particle burst.

**Slots:** Weapon · Relic · Charm · Ring · Mask. Better items auto-equip, and the rest go to a 10-slot bag. The character screen (C) shows your gear on a paper doll around your Friend, the bag grouped by item type with ▲/▼ upgrade markers, and a side-by-side comparison before you equip or destroy anything. **Cursed** items pair a large upside with a real downside and never auto-equip.

**Affixes** include +attack %, +movement speed, +critical chance and damage, heal on kill, burn, extra projectiles, loot chance, dodge, bonus damage below 35% HP, life steal, energy regeneration and RF find.
**Legendary powers:** Cinderheart, The Split Signal, Crown of Red Thirst, Glass Heart, Echo Engine, Ghoststep Sigil, Orrery of Runes, Last Light, Coin-Eater's Maw, Headsman's Grin.
**Mythic powers:** VOID HEART, THE RARE EDGE, CROWN OF THE FIRST FRIEND, NULL SIGNAL.

**Progression:** XP from kills and clears. Each level adds +8 HP, +1.6 attack and +1 armor, plus a choice of 3 of 16 boons, offered once the room is safe.

**Enemies (bullet-hell patterns, every attack telegraphed):** Cursed Friend (fast melee) · Void Crawler (aimed orbs) · Choir Wisp (bullet rings) · Bone Gunner (shotgun spreads) · Static Drone (strafing 3-round bursts) · Relay Turret (rotating spiral) · Signal Mite (lunging swarm packs) · Maw Spitter (lobbed globs that burst into rings) · Eye Stalk (a gaze line, then a needle stream) · Bloodling (splits in two) · Null Shade (blinks in with a bullet ring) · Loot Goblin (flees, drops coins, escapes after 14 s) · Corrupted Friend (elite: charge, slam) · Dungeon Warden (mini-boss, depths 3 and 6) · The Rare Beast (3-phase final boss, depth 9) · The Unminted (secret boss). Dodge-rolling through bullets is the core skill, and leftover enemy bullets vanish when a room is cleared.
**Modifiers:** Vampiric, Explosive, Frozen, Swarm, Frenzied, Armored, Teleporting and Cursed, applied to elites and to some normal "champions" on deeper floors. Every enemy attack is telegraphed.

**Every floor is its own place**, with its own palette, tile style, props and enemy roster:

| Depth | Floor | Look | New enemies |
|---|---|---|---|
| 1 | The Upper Crypts · Ossuary | Bone-strewn crypt slabs, gravestones, coffins | Cursed Friends, Choir Wisps |
| 2 | The Upper Crypts · Candle Nave | Candlelit amber crypt | Bone Gunners |
| 3 | The Upper Crypts · Warden's Vault | Chained vault, crimson accents | (Dungeon Warden) |
| 4 | The Signal Vaults · Relay Halls | Bolted cyan tech plates, terminals, cables | Static Drones, Signal Mites |
| 5 | The Signal Vaults · Server Tombs | Green-lit server racks | Relay Turrets |
| 6 | The Signal Vaults · Signal Core | Pipes and screens in signal green | (Warden of the Deep) |
| 7 | The Hollow Deep · Red Gullet | Veined flesh, tendrils, blood pools | Bloodlings, Maw Spitters |
| 8 | The Hollow Deep · Vein Galleries | Eyes in the floor | Eye Stalks |
| 9 | The Hollow Deep · The Beast's Heart | Ribcages and tendrils | (The Rare Beast) |
| 10+ | The Endless Void · Stratum N | Star-flecked void, shards, glitches | Null Shades, and everything else |

**The dungeon:** each floor is generated from a seed, and floors **grow larger and more complex as you descend**. The layout grid grows from 7×7 to 9×9 cells, and over 20 generated floors per depth, rooms go from about 9 to 22 and floor area almost quadruples. Deeper floors add loops (multiple routes), optional side-combat wings, branches off branches, and interior architecture: colonnades, dividing walls, inner rings and crosses. Every room tile is verified reachable. A main path of combat rooms leads to the stairs or the boss arena, with side rooms branching off it: treasure, shrines, the merchant, events, gated bonus rooms, and a hidden secret room behind a cracked wall (strike it three times). Floors run through The Upper Crypts, The Signal Vaults, The Hollow Deep and The Endless Void. After depth 9 you can keep descending for as long as you survive.

---

## Setup

Requires **Node.js 22+** on Linux (or Ubuntu on WSL2), plus a browser wallet as described above.

```sh
git clone <this repository>
cd DESCENT
npm ci
npm run dev          # http://127.0.0.1:4173
```

The FriendSDK v0.1.2 package archive is vendored at `vendor/rarefriends-friendsdk-0.1.2.tgz` (built with `npm pack` from [spokesz/friendsdk](https://github.com/spokesz/friendsdk) at the v0.1.2 release commit), so `npm ci` needs nothing else.

**How the site is built:** `npm run build` runs `scripts/site.mjs`. The FriendSDK CLI's `buildGame` builds the sandboxed game exactly as `friendsdk build` does. Then The Descent's trusted host page (`host/`) replaces the default runtime bundle. The host uses the SDK's own wallet session (`createFriendWalletSession`), owner-filtered discovery (`readOwnedFriends`) and `ConnectedGameHost`, which performs the fresh ownership and generation check before every session. Only the Friend picker is custom: it adds artwork thumbnails and locks the chosen Friend for the session. `npm run dev` builds and serves at http://127.0.0.1:4173 (re-run it after edits).

**Build a static preview:** `npm run build` writes `site/`. Serve that folder from any HTTPS static host, keeping its relative paths and the child document's CSP. The included GitHub Actions workflow (`.github/workflows/pages.yml`) runs the checks, builds and deploys to GitHub Pages on every push to `main`. In the repository settings, set **Pages → Source** to **GitHub Actions**.

### Project layout

| Path | What it is |
|---|---|
| `index.tsx`, `game.json`, `host.css`, `style.css` | FriendSDK game entry, required SDK definition, trusted runtime theme, game UI styles |
| `host/` | Trusted host page: SDK wallet session, discovery and `ConnectedGameHost`, plus the Friend picker with thumbnails and the session lock |
| `src/economy/` | `terms.ts` (every price and reward), `TokenEconomy.ts` (the interface), `SimulatedTokenEconomy.ts` |
| `src/game/` | Engine: `Game.ts` (run loop, combat, rooms, RF actions), `dungeon.ts`, `enemies.ts` and `bestiary.ts` (bullet patterns), `kit.ts` (per-Friend kits), `items.ts`, `stats.ts`, `content.ts` |
| `src/render/` | Canvas renderer, dungeon art, sprites (canonical Friend artwork plus original enemy art) |
| `src/ui/` | React overlays: title, camp, HUD, dialogs, summary, touch controls |
| `src/audio/` | Procedural sound effects and music, plus the FriendSDK sound kit |
| `tests/unit/`, `scripts/` | Unit tests; browser, live-gate and balance-playtest scripts |

`game.json` exists because the SDK runtime requires a chance-game definition. Its terms are **unused reference values**, not a mechanic of this game (the same approach as the SDK's scrolling-world example).

---

## Checks

| Command | What it covers | Result |
|---|---|---|
| `npm run typecheck` | TypeScript, strict | Pass |
| `npm run lint` | ESLint (typescript-eslint, react-hooks) | Pass |
| `npm run test:unit` | 16 tests: per-floor themes and rosters, floor growth with depth plus full-tile reachability, economy ledger, bigint RF units, insufficient funds, all prices in the 5/10/25 family, small rewards, every odds table sums to 100%, prices come from the economy terms, generation determinism, reachability of every room (300 floors), floor-1 script, depth-2 Void shrine, loot and stats | 16/16 pass |
| `npm run check` | FriendSDK game validation (imports, sandbox boundary, definition) | Pass |
| `npm run build` | Static preview build | Pass |
| `npm run test:browser` | 25 end-to-end checks in headless Chromium against **the site as shipped** (The Descent host plus the SDK runtime pieces) with the SDK's own mock wallet and RPC fixture: picker thumbnails, Friend locked in during play, walking the camp and descending the great stairs, every floor mood and family voice, title and verified Friend, keyboard movement, locked-room combat with real key presses, first loot, level-up, **5 RF** shrine, +3 RF treasure, **5 → 10 → 25** rerolls with no 4th, **5 RF** gate, events, **10 RF** revive, **25 RF** full revival, **25 RF** Void shrine (including the secret-boss path and +25 RF), merchant **5 RF** and **10 RF** buys, potion, pause, mute, reduced motion, depth-3 boss with +5 RF, Waystone, escape summary, restart, death and End Run, artwork-load error with retry, wrong-network unmount and recheck, browser refresh, touch joystick and buttons, zero console errors | 25/25 pass |
| `npm run test:real` (or `TARGET_URL=<preview> node scripts/test-real-gate.mjs`) | **Live Robinhood mainnet**, read-only, also run against the published GitHub Pages preview: a stand-in wallet that refuses every signing method reports a real holder's public address. The real SDK picker discovered the holder's 5 hardwired Friends, freshly verified ownership, and the game loaded that Friend's on-chain artwork. An address with only a generation-0 Friend was refused, and a wrong-network wallet was stopped before play. | 3/3 pass |
| `npm run playtest` | A bot plays the real engine at about 60× speed using only player controls, reporting depth, deaths, damage by source and RF flow | Used for balance: a bot that dodges bullets clears all 9 floors in about 15 minutes; a bot that never dodges falls around depths 5–8. RF earned per full run is about 40–100. |

---

## Known issues and limitations

- **Session-only progress.** The FriendSDK sandbox has no storage and the bridge has no save API, so the stash, codex, hall and RF ledger reset on reload. The global leaderboard is a placeholder for the same reason.
- **Two RF numbers are visible.** The SDK runtime's own "Friend wallet" panel shows its reference chance-game preview balance (20 RF). The Descent does not use that ledger; the in-game **$RAREFRIENDS** panel is this game's simulated purse. The pause menu explains this.
- **The public Robinhood RPC can reject bursts.** Friend discovery occasionally fails on the first try; the SDK picker's **Retry loading Friends** button resolves it.
- **Phones:** the game is landscape 3:2. On a portrait phone the frame is small, and the SDK's wallet toolbar takes proportionally more space. Touch controls work; landscape is recommended.
- **Audio** starts after your first click or key press (browser autoplay rules).
- **Not yet done:** a playthrough with a real wallet extension. Live-chain reads were verified with the read-only stand-in wallet described above. Balance was tuned with bot playtests, not a large human playtest.
- **Out of scope:** no real token transfers, contracts, trading, wearable NFTs or creator fees.

---

## Future real-token integration

The game is structured so the simulated economy can become a real one without rewriting gameplay.

1. **`LiveTokenEconomy implements TokenEconomy`.** `spend()` asks the trusted FriendSDK runtime for a wallet-confirmed RF transfer from the selected Friend's canonical wallet, to a game treasury or a burn address, and resolves only after a **verified receipt**. Gameplay already awaits that promise before granting any shrine, gate or reroll outcome, and failures change nothing.
2. **Contract-decided outcomes.** Shrine, gate, gamble and event rolls move from browser randomness to the SDK's Dice RNG flow. The odds tables in `content.ts` become the contract's fixed terms.
3. **Backed rewards.** RF faucets (bosses, treasure, bounties) are paid from a funded prize reserve. Every faucet is already a small fixed amount in `terms.ts`, which keeps reserves predictable. Sinks such as shrines and gates can burn RF or route it back into that reserve.
4. **Persistence.** The stash, heirlooms and leaderboard need a save API that SDK v0.1.2 does not provide.
5. **Remove the preview stipend.** In a real economy, players bring RF from their Friend's wallet.

**Capability gaps in SDK v0.1.2** (to raise with the Rare Friends team): no additional-currency, upgrade or persistence APIs; the chance-game client supports one consumable and one outcome table, which cannot express 5/10/25 multi-tier spends directly.

---

## Credits

Code and game design are original to this project. Rare Friends character artwork comes from the canonical Generations sprites, read on-chain through the FriendSDK. Reward cues use the FriendSDK sound kit. Fonts: Jacquard 24 and VT323, both SIL Open Font License. See [NOTICE.md](NOTICE.md).
