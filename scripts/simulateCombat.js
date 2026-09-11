// Pure-Node sanity check for the combat math in WhipDuelArena.sol.
// No dependencies (deliberately) — this mirrors the contract's integer
// formulas exactly but substitutes Math.random() for the on-chain
// keccak256-based rolls, since the point here is to sanity-check game
// balance (hit chance / average damage / round count / draw rate), not to
// byte-for-byte re-implement Keccak. Run with: node scripts/simulateCombat.js

const ATTACK_LEVEL = 99;
const STRENGTH_LEVEL = 99;
const DEFENCE_LEVEL = 99;
const STYLE_ATTACK_BONUS = 3;
const STYLE_STRENGTH_BONUS = 0;
const GEAR_ATTACK_BONUS = 82;
const GEAR_STRENGTH_BONUS = 82;
const GEAR_DEFENCE_BONUS = 25;
const HP_START = 99;
const MAX_ROUNDS = 60;

const effAttack = ATTACK_LEVEL + STYLE_ATTACK_BONUS + 8;
const ATTACK_ROLL = effAttack * (GEAR_ATTACK_BONUS + 64);

const effDefence = DEFENCE_LEVEL + 8;
const DEFENCE_ROLL = effDefence * (GEAR_DEFENCE_BONUS + 64);

const effStrength = STRENGTH_LEVEL + STYLE_STRENGTH_BONUS + 8;
const MAX_HIT = Math.floor((effStrength * (GEAR_STRENGTH_BONUS + 64) + 320) / 640);

function randInt(mod) {
  return Math.floor(Math.random() * mod);
}

function rollHits() {
  const atk = ATTACK_ROLL;
  const def = DEFENCE_ROLL;
  if (atk > def) {
    const denom = 2 * (atk + 1);
    const threshold = def + 2;
    return randInt(denom) >= threshold;
  } else {
    const denom = 2 * (def + 1);
    return randInt(denom) < atk;
  }
}

function rollDamage() {
  return randInt(MAX_HIT + 1);
}

function simulateOneFight() {
  let hpA = HP_START;
  let hpB = HP_START;
  let round = 0;
  while (round < MAX_ROUNDS) {
    round++;
    const dmgToB = rollHits() ? rollDamage() : 0;
    const dmgToA = rollHits() ? rollDamage() : 0;
    hpB = Math.max(0, hpB - dmgToB);
    hpA = Math.max(0, hpA - dmgToA);
    if (hpA === 0 || hpB === 0) break;
  }
  let winner;
  if (hpA === 0 && hpB === 0) winner = "draw-doubleKO";
  else if (hpB === 0) winner = "A";
  else if (hpA === 0) winner = "B";
  else if (hpA === hpB) winner = "draw-cap";
  else winner = hpA > hpB ? "A" : "B";
  return { round, winner };
}

const N = 100000;
let winsA = 0,
  winsB = 0,
  draws = 0,
  hitRounds = 0,
  totalRounds = 0,
  maxRoundsSeen = 0,
  cappedFights = 0;

for (let i = 0; i < N; i++) {
  const { round, winner } = simulateOneFight();
  totalRounds += round;
  maxRoundsSeen = Math.max(maxRoundsSeen, round);
  if (round === MAX_ROUNDS) cappedFights++;
  if (winner === "A") winsA++;
  else if (winner === "B") winsB++;
  else draws++;
}

let hitCount = 0;
const hitTrials = 2000000;
for (let i = 0; i < hitTrials; i++) if (rollHits()) hitCount++;

console.log("=== WhipDuelArena combat balance check ===");
console.log(`ATTACK_ROLL=${ATTACK_ROLL}  DEFENCE_ROLL=${DEFENCE_ROLL}  MAX_HIT=${MAX_HIT}  HP_START=${HP_START}`);
console.log(`Empirical hit chance: ${((hitCount / hitTrials) * 100).toFixed(2)}% (over ${hitTrials} trials)`);
console.log(`Fights simulated: ${N}`);
console.log(`  A wins: ${winsA} (${((winsA / N) * 100).toFixed(2)}%)`);
console.log(`  B wins: ${winsB} (${((winsB / N) * 100).toFixed(2)}%)`);
console.log(`  Draws:  ${draws} (${((draws / N) * 100).toFixed(3)}%)`);
console.log(`Average rounds to finish: ${(totalRounds / N).toFixed(2)}`);
console.log(`Longest fight seen: ${maxRoundsSeen} rounds`);
console.log(`Fights that hit the ${MAX_ROUNDS}-round cap: ${cappedFights}`);
console.log("");
console.log("Expect: ~50/50 A vs B (symmetric stats -> fair coin), a modest draw rate");
console.log("(both fighters trade blows in the same round, so a simultaneous double-KO");
console.log("near the end of a fight is a real, fair outcome, not a bug — see README),");
console.log("average rounds well under the cap, and essentially 0 capped fights.");
