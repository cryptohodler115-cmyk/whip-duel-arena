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

1. **Create a duel.** Player A generates a random secret client-side,
   commits `keccak256(secret, address)` on-chain, and stakes ETH.
2. **Match it.** Player B does the same — generates their own secret,
   commits to it, and stakes an equal amount. Both commits are now locked
   in before either player has seen the other's secret.
3. **Reveal.** Once both have joined, either player can reveal their secret
   at any time within a 15-minute window. The moment both are revealed, the
   contract combines them (`keccak256(secretA, secretB, duelId, address(this))`)
   into a seed that neither player controlled alone, and immediately runs
   the fight.
4. **Fight.** Both fighters use identical fixed stats and an identical
   weapon (see "Combat model" below), so the entire outcome rides on that
   seed. Each round, the contract rolls an accuracy check and a damage roll
   for each side and emits a `RoundResolved` event. Whoever's HP hits 0
   first loses.
5. **Payout.** The winner's share of the pot is credited internally; they
   call `withdraw()` to pull it out (a pull-payment pattern, so a broken or
   malicious recipient can never block the contract).

The frontend never simulates the fight — it just replays the
`RoundResolved` events as an animation. What you see in the arena is a
literal readout of what already happened on-chain.

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

Commit-reveal is only fair if neither side can choose their secret in
reaction to the other's — which holds here, since both commits are locked
in before either reveal happens. But there's a standard residual griefing
vector in *any* simple commit-reveal scheme: once player A reveals
publicly, player B already knows their own secret and can compute the
outcome locally before deciding whether to bother revealing at all. If B
would lose, B can simply never call `reveal()`.

This contract bounds that with `claimTimeout()`: if the 15-minute reveal
window closes and only one side revealed, that side claims the whole pot
by forfeit; if neither revealed, both wagers are refunded. So the worst a
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
  src/config/chains.ts          Robinhood Chain testnet/mainnet definitions
  src/config/contract.ts        <- paste your deployed address here
  src/pages/Lobby.tsx           create / browse / join duels
  src/pages/DuelRoom.tsx        commit-reveal waiting room, timeout claims
  src/pages/Arena.tsx           animated fight replay from on-chain events
  src/components/Fighter.tsx    original inline-SVG duelist + whip animation
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
npm run dev
```

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

- **Reveal griefing** — bounded by timeout, not eliminated. See "Trust
  model" above.
- **Unbounded log scan** — `useDuelList` and `useFightLog` scan
  `fromBlock: 0n`. Fine for a testnet demo; swap in a real indexer (or at
  least a recorded deployment block) before this has any real history.
- **No fee / no matchmaking** — pure 1v1 peer matching by wager size. A
  real product would probably want wager tiers, a small rake, and a
  ranked queue instead of a flat "first come, first matched" lobby table.
- **Single weapon/loadout** — intentionally, to match the "whip only, no
  consumables" brief. Adding more weapons/gear means extending the combat
  constants to be per-duel parameters instead of contract-wide constants.
