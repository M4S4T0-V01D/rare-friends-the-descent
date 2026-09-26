# Rare Friends: The Descent

Your Rare Friend descends into a dark bullet-hell action-RPG dungeon where **$RAREFRIENDS is the currency of risk**. Fight, loot, and at every shrine, gate, reroll and revive decide: *spend 5 RF now, save for 10, or risk everything for 25?*

**Builder:** M4S4T0 · [@M4S4T0-V01D](https://github.com/M4S4T0-V01D) · **Category:** Character Spotlight · Token Activity · Economy Potential · **SDK:** FriendSDK v0.1.2

[Source code](https://github.com/M4S4T0-V01D/rare-friends-the-descent) · [Full rules, odds and economy](https://github.com/M4S4T0-V01D/rare-friends-the-descent#the-rarefriends-economy-simulated) · **[Play the preview](https://m4s4t0-v01d.github.io/rare-friends-the-descent/)**

## Play it

Open the preview link with a browser wallet on **Robinhood mainnet (4663)** holding a **hardwired Rare Friends Generations NFT (generation ≥ 1)**. Connect, choose your Friend (the FriendSDK verifies ownership at a fresh block), press **Begin**, then **Descend**. No RF funding and no transaction signature are needed.

To run locally with Node.js 22+:

```sh
git clone https://github.com/M4S4T0-V01D/rare-friends-the-descent.git
cd rare-friends-the-descent
npm ci
npm run dev
```

**Controls:** WASD/arrows move · J or click attack · Q or right-click bolt · R your Friend's signature ability · Space dodge · F potion · E interact · C character · Tab RF ledger · Esc pause · M mute. Touch: drag the left side to move, with on-screen ATTACK, BOLT, NOVA, DODGE and potion buttons. Settings include mute, music, reduced motion, screen shake, damage numbers and CRT scanlines.

## How it uses Rare Friends and $RAREFRIENDS

- **Character Spotlight:** your verified Generations NFT is the hero. Its canonical on-chain 16×16 artwork and animations are used in the dungeon, the HUD portrait, the camp, boss introductions, the character sheet and the run summary. The elite enemy is a corrupted reflection of *your* Friend, the secret boss wears its silhouette, each Generations family grants a unique passive, and every Friend gets its own kit (signature ability by family; attack, bolt and dodge styles and action-bar look from its on-chain seed; 5,184 combinations).
- **Token Activity:** about **7–8 paid RF decisions per floor** (measured across 900 generated floors): 5/10/25 RF shrines, 5/10/25 RF gates, 5 → 10 → 25 RF loot rerolls, a merchant, events, and 10/25 RF revives. RF is earned back from kills, elites, treasure, events and bosses. Every transaction appears in a live HUD feed, a full ledger and the end-of-run summary.
- **Economy Potential:** every price uses only 5, 10 or 25 RF and lives in one terms file pinned by tests. Gameplay spends through a single `TokenEconomy` interface, awaiting a receipt before granting any outcome. The simulated ledger already uses the SDK's 18-decimal bigint RF units, ready for a live adapter.

## Costs and rewards

**All balances, purchases and rewards are simulated. No real tokens move.** Each descent starts with 25 RF; if your balance is lower, a labeled preview stipend tops it up.

| | 5 RF | 10 RF | 25 RF |
|---|---|---|---|
| Shrines | Greed: small blessing | Fate: medium blessing | **Void: major gamble** |
| Gates | Blood: bonus combat room | Cursed: elite encounter | Abyssal: 3-wave vault, Mythic possible |
| Loot rerolls | 1st | 2nd | 3rd (no 4th) |
| Revive | | 40% HP | Full HP + cleanse |
| Merchant | Potion · Cursed Box | Relic · Rare Item | Legendary Gamble |
| Events | Well · Gambler | Stranger · Golden Door | Black Door |

**Shrine of the Void (25 RF):** Legendary loot 28% · Mythic loot 10% · run-long Void-Touched blessing 20% · Void-hunting elite with bounty 17% · Void Curse 15% · secret boss (The Unminted) 10%. Every shrine, gamble and event shows its odds in game; the [full tables are in the README](https://github.com/M4S4T0-V01D/rare-friends-the-descent#shrine-odds).

**Rewards:** normal enemy +1 RF (6% chance) · Loot Goblin coins +1 · elite +2 · treasure +3 · rare event +5 · mini-boss +5 · boss +10 · secret boss +25. RF is never lost on death. Waystones after each boss secure your loot; ending a run after death keeps only secured items.

## Checks and known issues

Floors grow larger and more complex as you descend (more rooms, loops, wings, interior architecture). Each of the nine floors has its own scenery and enemy roster, with 16 enemy types firing telegraphed bullet patterns. The Friend picker shows each Friend's on-chain artwork, and the chosen Friend stays locked in for the session. Before each descent you walk your Friend around a ruined Rare Friends sanctuary and down a great staircase guarded by stone statues of your Friend. Each floor theme has its own music and ambience, and each Generations family has its own voice. Typecheck, ESLint, 16 unit tests, FriendSDK game validation and the static build all pass. **25 of 25 end-to-end browser checks pass** against the real SDK runtime with the SDK's mock wallet and RPC. They cover movement, combat, loot, every 5/10/25 RF spend, rerolls, rewards, the ledger, death and revive, the boss, the summary, restart, refresh, the error state, wrong network, touch, mute and reduced motion, with zero console errors.

A **live Robinhood mainnet check against the published preview** (read-only stand-in wallet that refuses all signing) passed 3 of 3. A real holder's Friends were discovered, the ownership gate passed, and the Friend's on-chain artwork loaded. A generation-0-only address and a wrong-network wallet were both blocked. A playthrough with a real wallet extension is still outstanding.

**Known issues:** progress is session-only, because the SDK sandbox has no storage. The runtime's own "Friend wallet" panel shows the SDK reference ledger (20 RF), which this game does not use. The public RPC sometimes needs **Retry loading Friends**. The game is landscape-first on phones. No live contracts, token transfers, trading, wearable NFTs or creator fees are included.

**Credits:** original code, game design, enemy and dungeon art, and audio. Rare Friends Generations artwork is read through the FriendSDK (permitted by its NOTICE), plus the FriendSDK sound kit and the OFL fonts Jacquard 24 and VT323. See [NOTICE.md](https://github.com/M4S4T0-V01D/rare-friends-the-descent/blob/main/NOTICE.md).
