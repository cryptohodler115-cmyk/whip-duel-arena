import { parseAbi } from "viem";

// Fill this in after you run `npm run deploy:testnet` (or :mainnet) from the
// project root. The deploy script prints the address to paste here.
export const ARENA_ADDRESS = "0x94E9d380887C8c17d0A010F6Dc62943554Fa9c54" as const;

// Human-readable ABI — matches contracts/WhipDuelArena.sol exactly. Keep the
// two in sync if you change the contract.
//
// IMPORTANT: this must be run through viem's `parseAbi()` rather than kept
// as a plain array of strings. Passing raw human-readable strings straight
// into wagmi/viem's runtime functions (readContract, getContractEvents,
// useWatchContractEvent, decodeEventLog, ...) throws at runtime — those
// functions expect real ABI item objects, and `parseAbi()` is what turns
// this human-readable syntax into that shape. It's also what gives structs
// like `getDuel`'s return value proper field-level type inference instead
// of collapsing to `unknown`.
export const arenaAbi = parseAbi([
  "struct Duel { address playerA; address playerB; uint256 wager; bytes32 commitA; bytes32 commitB; uint256 secretA; uint256 secretB; bool revealedA; bool revealedB; uint64 revealDeadline; uint8 status; address winner; }",
  "function createDuel(bytes32 commitHash) payable returns (uint256 duelId)",
  "function joinDuel(uint256 duelId, bytes32 commitHash) payable",
  "function cancelDuel(uint256 duelId)",
  "function reveal(uint256 duelId, uint256 secret)",
  "function claimTimeout(uint256 duelId)",
  "function withdraw()",
  "function balances(address) view returns (uint256)",
  "function nextDuelId() view returns (uint256)",
  "function REVEAL_WINDOW() view returns (uint64)",
  "function combatConstants() view returns (uint256 attackRoll, uint256 defenceRoll, uint256 maxHit, uint256 hpStart, uint256 maxRounds)",
  "function getDuel(uint256 duelId) view returns (Duel)",
  "event DuelCreated(uint256 indexed duelId, address indexed playerA, uint256 wager)",
  "event DuelJoined(uint256 indexed duelId, address indexed playerB, uint64 revealDeadline)",
  "event DuelCancelled(uint256 indexed duelId)",
  "event Revealed(uint256 indexed duelId, address indexed player)",
  "event RoundResolved(uint256 indexed duelId, uint256 round, uint256 dmgToB, uint256 dmgToA, uint256 hpA, uint256 hpB)",
  "event DuelResolved(uint256 indexed duelId, address winner, uint256 pot)",
  "event DuelDrawn(uint256 indexed duelId, uint256 refundEach)",
  "event Withdrawn(address indexed player, uint256 amount)",
]);

export const DuelStatus = {
  None: 0,
  Open: 1,
  Committed: 2,
  Resolved: 3,
  Cancelled: 4,
} as const;

export const DuelStatusLabel: Record<number, string> = {
  0: "None",
  1: "Open",
  2: "Waiting to ready up",
  3: "Resolved",
  4: "Cancelled",
};
