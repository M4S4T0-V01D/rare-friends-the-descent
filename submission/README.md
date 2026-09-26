# Rare Friends: The Descent

Your Rare Friend descends into a dark bullet-hell action-RPG dungeon where **$RAREFRIENDS is the currency of risk**. Fight, loot, and at every shrine, gate, reroll, revive and mini-game decide: *spend 5 RF now, save for 10, or risk everything for 25?*

**Builder:** M4S4T0 · [@M4S4T0-V01D](https://github.com/M4S4T0-V01D) · **Category:** Character Spotlight · Token Activity · Economy Potential · **SDK:** FriendSDK v0.1.2

[Source code](https://github.com/M4S4T0-V01D/rare-friends-the-descent) · [Full rules, odds and economy](https://github.com/M4S4T0-V01D/rare-friends-the-descent#the-rarefriends-economy-simulated) · **[Play the preview](https://m4s4t0-v01d.github.io/rare-friends-the-descent/)** (wallet required) · **[Watch the trailer and meet every family](https://m4s4t0-v01d.github.io/rare-friends-the-descent/live-preview/)** (no wallet needed)

| | |
|---|---|
| ![The camp: a ruined Rare Friends sanctuary](https://raw.githubusercontent.com/M4S4T0-V01D/rare-friends-the-descent/main/docs/screenshots/camp.png) | ![The great stairs, flanked by statues of your own Friend](https://raw.githubusercontent.com/M4S4T0-V01D/rare-friends-the-descent/main/docs/screenshots/camp-stairs.png) |
| **The camp.** Walk your Friend around a ruined sanctuary. | **The great stairs,** guarded by statues of *your* Friend. |
| ![Depth 3: Hex Priest curse circles and a Loot Goblin](https://raw.githubusercontent.com/M4S4T0-V01D/rare-friends-the-descent/main/docs/screenshots/combat-depth-3.png) | ![Depth 5: a Signal Mite swarm under turret fire](https://raw.githubusercontent.com/M4S4T0-V01D/rare-friends-the-descent/main/docs/screenshots/combat-depth-5.png) |
| **Depth 3 · Warden's Vault.** | **Depth 5 · Server Tombs.** |
| ![Depth 8: named champions and an Eye Stalk's needle stream](https://raw.githubusercontent.com/M4S4T0-V01D/rare-friends-the-descent/main/docs/screenshots/combat-depth-8.png) | ![The character sheet with its paper doll and grouped bag](https://raw.githubusercontent.com/M4S4T0-V01D/rare-friends-the-descent/main/docs/screenshots/inventory.png) |
| **Depth 8 · Vein Galleries.** | **Character sheet.** |

## Play it

The [showcase page](https://m4s4t0-v01d.github.io/rare-friends-the-descent/live-preview/) needs no wallet: it has a gameplay trailer with sound, a guide to each family's signature ability, trait and voice, and screenshots. It is not playable, because every playable build keeps the FriendSDK ownership gate.

To play, open the preview link with a browser wallet on **Robinhood mainnet (4663)** holding a **hardwired Rare Friends Generations NFT (generation ≥ 1)**. Connect, choose your Friend from a picker showing each Friend's on-chain artwork (the FriendSDK verifies ownership at a fresh block, and the Friend stays locked in for the session), press **Begin**, walk your Friend through the camp and down the great stairs. No RF funding and no transaction signature are needed.

To run locally with Node.js 22+:

```sh
git clone https://github.com/M4S4T0-V01D/rare-friends-the-descent.git
cd rare-friends-the-descent
npm ci
npm run dev
```

**Controls:** WASD/arrows move · J or click attack · Q or right-click bolt · R your Friend's signature ability · Space dodge · F potion · E interact · C character · B bestiary · Tab RF ledger · Esc pause · M mute. Touch: drag the left side to move, with on-screen attack, bolt, signature, dodge and potion buttons. Settings include mute, music, reduced motion, screen shake, damage numbers, CRT scanlines and the Rare Friends look (muted monochrome grade).

## How it uses Rare Friends and $RAREFRIENDS

- **Character Spotlight:** your verified Generations NFT is the hero. Its canonical on-chain 16×16 artwork and animations are used in the dungeon, the HUD portrait, the camp (including two stone statues of your Friend flanking the stairs), boss introductions, the character sheet, the run summary and a shareable scoreboard card. The elite enemy is a corrupted reflection of *your* Friend, and the secret boss wears its silhouette. Each Generations family grants a passive and its own voice. Every Friend gets its own kit: a signature ability by family, plus attack, bolt and dodge styles and an action-bar look from its on-chain seed (5,184 combinations). RF-bought cosmetics recolor the canonical pixels without changing their shape.
- **Token Activity:** about **7–8 paid RF decisions per floor** (measured across 900 generated floors): 5/10/25 RF shrines, 5/10/25 RF gates, 5 → 10 → 25 RF loot rerolls, a merchant, events, 10/25 RF revives, and 5/10 RF skill mini-games. Between runs, the camp's Dye Altar sells 20 cosmetics for 5, 10 or 25 RF. RF is earned back from kills, elites, treasure, guardians, events, mini-games and bosses. Every transaction appears in a live HUD feed, a full ledger and the end-of-run summary.
- **Economy Potential:** every price uses only 5, 10 or 25 RF and lives in one terms file pinned by tests. Gameplay spends through a single `TokenEconomy` interface, awaiting a receipt before granting any outcome. The simulated ledger already uses the SDK's 18-decimal bigint RF units, ready for a live adapter.

## Costs and rewards

**All balances, purchases and rewards are simulated. No real tokens move.** Each Friend starts with 25 RF on its very first visit, the only free RF. After that there are no top-ups: each descent begins with what your Friend carried out of the camp, and RF is only ever spent by your own choice.

| | 5 RF | 10 RF | 25 RF |
|---|---|---|---|
| Shrines | Greed: small blessing | Fate: medium blessing | **Void: major gamble** |
| Gates | Blood: bonus combat room | Cursed: elite encounter | Abyssal: 3-wave vault, Mythic possible |
| Loot rerolls | 1st | 2nd | 3rd (no 4th) |
| Revive | | 40% HP | Full HP + cleanse |
| Merchant | Potion · Cursed Box | Relic · Rare Item | Legendary Gamble |
| Events | Well · Gambler | Stranger · Golden Door | Black Door |
| Mini-games | Rune Gallery · Shell Game | Coin Dash | |
| Dye Altar (camp) | Common glows, Statue Stone skin, Embers trail | Rare glows and skins, Sparkles and Void Motes trails | Prismatic and Null Halo glows, Gilded and Unminted Void skins, Rune Steps trail |

**Shrine of the Void (25 RF):** Legendary loot 28% · Mythic loot 10% · run-long Void-Touched blessing 20% · Void-hunting elite with bounty 17% · Void Curse 15% · secret boss (The Unminted) 10%. Every shrine, gamble, event and mini-game shows its odds or payouts in game; the [full tables are in the README](https://github.com/M4S4T0-V01D/rare-friends-the-descent#shrine-odds).

**Rewards:** normal enemy +1 RF (6% chance) · Loot Goblin coins +1 · elite +2 · treasure +3 · guardian +3 · rare event +5 · mini-boss +5 · boss +10 · final boss +25 · secret boss +25. Mini-games pay by skill: Rune Gallery up to 20 RF, Shell Game 15 RF for the right cup, Coin Dash 1 RF per coin (up to 20). RF is never lost on death. Waystones after each boss secure your loot; ending a run after death keeps only secured items.

**Scoring:** every run is scored on depth, kills, elites, guardians, bosses, level, the loot your Friend carries and RF earned, then multiplied by how it ended (conquered ×2, escaped ×1.5, fell ×0.75, abandoned ×0.5). The run-complete screen can copy a scoreboard image or open X's composer with your run (through a postMessage relay in the trusted host page, since the game sandbox cannot use the clipboard).

## What's in the dungeon

**30 floors in 10 acts** (the Upper Crypts, the Signal Vaults, the Hollow Deep, the Frozen Archive, the Ember Forge, the Rot Garden, the Sunken Choir, the Clockwork Tomb, the Mirror Halls and the Null Throne), then an optional endless Void. Every act has its own palette, props, ambient particles, enemies and composed creepy tune. Every attack has a soft sound of its own: each enemy bullet kind, igniting blasts, bullets breaking on walls, and each of your Friend's bolt styles. Floors grow larger and more complex as you descend (more rooms, loops, side wings, interior architecture). There are 44 creatures with telegraphed attacks, each recorded in a **bestiary** the first time your Friend sees it. A titled **guardian** (a giant form of one of the floor's creatures) blocks the stairs on every boss-less floor from depth 2, and **ten bosses** with cinematic entrances wait at the bottom of each act, among them **The Reflection**, which fights with *your own* Friend's artwork, bolt style and signature, and the final boss, **The First Friend**. Beat it at depth 30 and escape to conquer the Descent. The Rare Friends look grades the world toward black and white, while room ambient light, enemy halos and colored glows keep every fight readable.

## Checks and known issues

Typecheck, ESLint, **31 unit tests**, FriendSDK game validation and the static build all pass. **30 of 30 end-to-end browser checks pass** against the site as shipped (The Descent's host page plus the SDK runtime) with the SDK's mock wallet and RPC. They cover the picker and Friend lock, walking the camp and descending the stairs, movement, combat, loot, level-ups, every 5/10/25 RF spend, rerolls, rewards, the ledger, guardians, the bestiary, mini-games, Dye Altar purchases, death and revive, the boss, the scored summary and sharing, restart, progress saved per Friend and restored after a refresh (with forged saves refused), the error state, wrong network, touch, audio, mute and reduced motion, with zero console errors. A separate showcase check (12 of 12) confirms the no-wallet page makes zero wallet calls and no outside requests, links Play to the gated game, and plays the trailer and all nine family clips at desktop and phone widths.

A **guided tour of all 30 floors** passes too: every act fought, all ten bosses beaten, and the run ends as Conquered after The First Friend, with zero errors. A **live Robinhood mainnet check against the published preview** (read-only stand-in wallet that refuses all signing) passed 3 of 3. A real holder's Friends were discovered, the ownership gate passed, and the Friend's on-chain artwork loaded. A generation-0-only address and a wrong-network wallet were both blocked. A playthrough with a real wallet extension is still outstanding.

**Saved progress:** the simulated RF balance and ledger, stash, heirloom, codex, scores, bestiary, cosmetics and settings save automatically per Friend, filed under the Friend's canonical wallet in the browser where you play. The trusted host page stores them for the verified Friend only, and the game re-validates every save it loads.

**Known issues:** saves are per browser, not synced between devices. The runtime's own "Friend wallet" panel shows the SDK reference ledger (20 RF), which this game does not use. The public RPC sometimes needs **Retry loading Friends**. The game is landscape-first on phones. Balance was tuned with bot playtests, not a large human playtest. No live contracts, token transfers, trading, wearable NFTs or creator fees are included.

**Credits:** original code, game design, enemy and dungeon art, and audio. Rare Friends Generations artwork is read through the FriendSDK (permitted by its NOTICE), plus the FriendSDK sound kit and the OFL fonts Jacquard 24 and VT323. See [NOTICE.md](https://github.com/M4S4T0-V01D/rare-friends-the-descent/blob/main/NOTICE.md).
