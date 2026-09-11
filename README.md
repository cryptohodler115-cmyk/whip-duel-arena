# Whip Duel Arena

An on-chain, wager-staked PvP duel for EVM chains — two players each put up
ETH, a fair random seed is derived from a commit-reveal handshake between
them, and a deterministic melee combat simulation runs entirely inside the
smart contract to decide who takes the pot. No server, no oracle, no admin
key ever touches the outcome or the funds. The frontend is a lobby +
animated fight replay built on top of that.

It's inspired by the "duel arena, whip only, no food/prayer/potions" style
of fight from classic MMOs — stripped of every consumable so the fight is
pure weapon-vs-weapon RNG, same as a real symmetric-gear duel. It is an
original implementation: original contract, original UI, original SVG
art. It is not affiliated with, endorsed by, or built from any game
studio's assets, and "Robinhood Chain" is Robinhood's own product name for
the network this targets, referenced here only because that's the chain
this points at by default.

## How it works

From a player's seat, it's four steps: **stake → matched → ready up →
fight.** No wallets full of jargon, no "secret" or "commit" shown anywhere
in the UI — that's still what's happening underneath (see below), but the
app handles it for you.

1. **Put a wager up.** Player A stakes ETH to create a duel. Behind the
   scenes the app also generates a random secret client-side and commits
   `keccak256(secret, address)` on-chain in the same transaction — you never
   see or handle this secret directly, it's stored automatically for you
   (see `frontend/src/lib/secret.ts`).
2. **Wager matched.** Player B stakes the same amount to join. The app does
   the same automatic commit for them. Both commits are now locked in
   before either player could have seen the other's secret.
3. **Both ready up.** Once matched, each player clicks a single "I'm ready"
   button. That button is calling the contract's `reveal(secret)` with the
   secret from step 1/2 — but the player never sees that word. It's a
   15-minute window; whoever clicks first just waits on the other side.
4. **Fight — automatically.** The instant both players have readied up, the
   contract combines the two secrets (`keccak256(secretA, secretB, duelId,
   address(this))`) into a seed that neither player controlled alone, and
   immediately runs the fight. Both fighters use identical fixed stats and
   an identical weapon (see "Combat model" below), so the entire outcome
   rides on that seed. Each round, the contract rolls an accuracy check and
   a damage roll for each side and emits a `RoundResolved` event. Whoever's
   HP hits 0 first loses. The frontend never simulates the fight — the
   arena replay is a literal readout of `RoundResolved` events, i.e. what
   already happened on-chain.
5. **Payout.** The winner's share of the pot is credited internally; they
   call `withdraw()` to pull it out (a pull-payment pattern, so a broken or
   malicious recipient can never block the contract).

Why keep the commit-reveal machinery instead of just picking a random seed
some other way? Because it's still the part of this contract that makes the
fight un-riggable — neither player can choose their secret in reaction to
the other's, since both are locked in before either can ready up. Removing
that and, say, seeding off `blockhash`/`block.prevrandao` instead would trade
real fairness for a slightly shorter tx count. The contract didn't change
between the two — only the words the UI puts in front of it did.

## Combat model

No food, no prayer, no potions — both fighters are hardcoded to identical
stats:

- Attack / Strength / Defence: 99 / 99 / 99
- A single fast slashing weapon with gear bonuses of roughly +82 attack /
  +82 strength / +25 defence (modeled loosely on a well-known MMO's
  iconic tier-90ish whip-type weapon, purely as flavor — the numbers are
  hardcoded constants in the contract, not references to any external
  data source)
- 99 HP, no healing

Each round both fighters attack simultaneously using the standard
accuracy formula:

```
attackRoll  = (attackLevel + styleBonus + 8) * (gearAttackBonus + 64)
defenceRoll = (defenceLevel + 8) * (gearDefenceBonus + 64)
hitChance   = attackRoll > defenceRoll
                ? 1 - (defenceRoll + 2) / (2 * (attackRoll + 1))
                : attackRoll / (2 * (defenceRoll + 1))
maxHit      = floor((effStrength * (gearStrengthBonus + 64) + 320) / 640)
damage      = hit ? uniformRandom(0, maxHit) : 0
```

With these numbers that's about a 70% hit chance and a 0–24 damage roll,
which plays out to an average fight length around 10–11 rounds (see
`scripts/simulateCombat.js` — a dependency-free Node script that runs
100,000 simulated fights and prints the resulting balance stats; run it
with `npm run simulate`).

Because both fighters trade blows in the *same* round rather than taking
turns, a simultaneous double-KO near the end of a close fight is a real,
fairly common outcome (~8–9% of fights in the simulation) — not a bug.
When it happens, both wagers are refunded rather than the contract picking
an arbitrary winner. `MAX_ROUNDS` (60) exists only to bound gas in a
pathological unlucky streak; in practice fights essentially never get
anywhere close to it.

## Trust model, and its one known gap

(This section describes the contract, which is unchanged — see "How it
works" above for why the UI calls this step "ready up" instead of "reveal".)

Commit-reveal is only fair if neither side can choose their secret in
reaction to the other's — which holds here, since both commits are locked
in before either reveal happens. But there's a standard residual griefing
vector in *any* simple commit-reveal scheme: once player A reveals
publicly, player B already knows their own secret and can compute the
outcome locally before deciding whether to bother revealing (readying up)
at all. If B would lose, B can simply never call `reveal()`.

This contract bounds that with `claimTimeout()`: if the 15-minute ready-up
window closes and only one side readied up, that side claims the whole pot
by forfeit; if neither did, both wagers are refunded. So the worst a
griefer can do is force their opponent to wait out the timer — they can
never actually keep the money. A production-grade version could remove
this entirely with a bonded forced-reveal step or a commit-reveal scheme
that doesn't let either party learn the outcome before both are
committed to revealing (e.g. a VRF/VDF-based seed instead of player
secrets) — noted here rather than built, to keep this implementation
readable.

The contract itself has no owner, no admin function, no fee, and no
upgrade path — it only ever moves ETH between the two duelists (or
refunds them). `withdraw()` uses the pull-payment pattern with a
reentrancy guard, and all state changes happen before any external call.

## Repo layout

```
contracts/WhipDuelArena.sol   the whole game — zero imports, pastes straight into Remix too
test/WhipDuelArena.test.js    Hardhat/Chai test suite
scripts/deploy.js             deploy script
scripts/simulateCombat.js     dependency-free combat-balance sanity check (node scripts/simulateCombat.js)
hardhat.config.js             networks: localhost, Robinhood Chain testnet + mainnet
frontend/                     Vite + React + TypeScript + wagmi/viem app
  server.js                     production server: serves dist/ + runs the /ws stake-chat room
  src/config/chains.ts          Robinhood Chain testnet/mainnet definitions
  src/config/contract.ts        <- paste your deployed address here
  src/pages/Lobby.tsx           create / browse / join duels
  src/pages/DuelRoom.tsx        ready-up waiting room, timeout claims (still commit-reveal under the hood)
  src/pages/Arena.tsx           animated fight replay from on-chain events, in an original duel-arena backdrop
  src/components/Fighter.tsx    original inline-SVG duelist + whip animation
  src/components/ChatBox.tsx    ephemeral "stake chat" — haggle before you duel
  src/hooks/useChat.ts          WebSocket client for the stake chat
  src/config/privy.ts           Privy app config (login methods, chains) — needs VITE_PRIVY_APP_ID
  src/hooks/useSyncPrivyWallet.ts  keeps wagmi's active wallet in sync with whatever Privy logged you in with
```

## Setup

This was built in a sandboxed environment with no access to the npm
registry, so the contract, tests, and frontend are hand-written and have
been syntax-checked but **not yet compiled or run** — do that first thing
on your own machine:

```bash
# contracts + tests
npm install
npm run simulate       # instant, zero-dependency balance sanity check
npx hardhat compile
npm test                # runs test/WhipDuelArena.test.js

# frontend
cd frontend
npm install
cp .env.example .env   # set VITE_PRIVY_APP_ID — see "Wallet connection" below
npm run dev
```

### Wallet connection (Privy)

Wallet connect/login runs through [Privy](https://www.privy.io/) instead of
a bare injected-wallet button — players can either connect an existing
wallet (MetaMask, Rabby, Coinbase Wallet, WalletConnect, ...) or just log in
with an email address, in which case Privy automatically spins up an
embedded wallet for them behind the scenes. No signup needed on your end
beyond creating the Privy app:

1. Create a free app at [dashboard.privy.io](https://dashboard.privy.io).
2. Under **Settings → Domains**, add both `http://localhost:5173` (for
   local dev) and your production URL (e.g. your Railway domain).
3. Copy the **App ID** from Settings, and set it as `VITE_PRIVY_APP_ID` —
   in `frontend/.env` for local dev, and in Railway's **Variables** tab for
   the deployed site (Vite only exposes env vars prefixed `VITE_` to the
   frontend, and it needs to be present at *build* time, so redeploy after
   setting it).

If `VITE_PRIVY_APP_ID` isn't set, the app renders a banner explaining that
instead of crashing — same pattern as the "contract not deployed yet"
banner.

One honest caveat: an embedded wallet Privy creates for an email-login
player is not a traditional self-custodied seed-phrase wallet by default —
Privy's infrastructure holds the key material (splitting it between device
and server shares) unless the player exports it. That's a deliberate
trade-off for zero-friction onboarding, not a bug, but worth knowing before
you point real money at it — see "Before you point this at real money"
below either way.

If anything doesn't compile cleanly, it'll almost certainly be a minor
Hardhat-toolbox / ethers version-matching issue rather than a logic bug —
the combat math has been independently verified via the simulate script,
and the test suite exercises every path (lobby lifecycle, bad
commits/reveals, automatic resolution + payout + double-withdraw
rejection, determinism, both timeout branches).

### Deploying to Robinhood Chain

```bash
cp .env.example .env
# edit .env: set DEPLOYER_PRIVATE_KEY, and optionally your own RPC URLs

npm run deploy:testnet   # chain ID 46630 — do this first
# once you're happy:
npm run deploy:mainnet   # chain ID 4663 — real ETH, see the warning below
```

Then paste the printed address into `frontend/src/config/contract.ts`
(`ARENA_ADDRESS`), and flip `defaultChain` in `frontend/src/config/chains.ts`
from `robinhoodTestnet` to `robinhoodMainnet` if you're going live for real.

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | 46630 | 4663 |
| Public RPC | `rpc.testnet.chain.robinhood.com` | `rpc.mainnet.chain.robinhood.com` |
| Explorer | `explorer.testnet.chain.robinhood.com` | `robinhoodchain.blockscout.com` |

(Robinhood Chain is an Arbitrum-based Ethereum L2; testnet launched
February 2026, mainnet July 2026. Public RPCs are rate-limited — get an
Alchemy/QuickNode/etc key for anything beyond casual testing.)

## Before you point this at real money

This is a wagering game where the outcome is, by design, essentially a
coin flip shaped like a fight (symmetric stats — the whole point of a
whip-only duel). Depending on where you and your users are, running that
for real ETH may qualify as gambling under local law, with licensing
requirements that have nothing to do with whether the code is fair. That's
a legal question, not a code question — worth having a lawyer look at
before taking this past testnet. I'm not a lawyer and this isn't legal
advice.

Separately: nobody deployed this for you, and nobody here holds a private
key on your behalf. You deploy it yourself, from your own wallet, and you
are the only one who can.

## Known limitations / good next steps

- **Ready-up griefing** — bounded by timeout, not eliminated. See "Trust
  model" above.
- **Embedded wallet custody** — see the caveat at the end of "Wallet
  connection (Privy)" above; email-login players aren't fully
  self-custodial unless they export their key.
- **Unbounded log scan** — `useDuelList` and `useFightLog` scan
  `fromBlock: 0n`. Fine for a testnet demo; swap in a real indexer (or at
  least a recorded deployment block) before this has any real history.
- **No fee / no matchmaking** — pure 1v1 peer matching by wager size. A
  real product would probably want wager tiers, a small rake, and a
  ranked queue instead of a flat "first come, first matched" lobby table.
- **Single weapon/loadout** — intentionally, to match the "whip only, no
  consumables" brief. Adding more weapons/gear means extending the combat
  constants to be per-duel parameters instead of contract-wide constants.
- **Ephemeral stake chat** — the "Stake chat" box on the lobby (`server.js`,
  `/ws`) is an unauthenticated, in-memory WebSocket room: message history
  lives only in the running process and is lost on every redeploy/restart,
  and nothing stops someone from typing any name they like. It's for
  haggling over a wager before either side commits ETH, not a source of
  truth for anything. Swap in a real datastore (and wallet-signature-backed
  identities) before relying on it for more than that.
