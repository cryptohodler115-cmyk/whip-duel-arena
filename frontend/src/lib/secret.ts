import { encodePacked, keccak256, type Address, type Hex } from "viem";

/**
 * Generates a fresh, cryptographically random 256-bit secret for one duel.
 * NEVER reuse a secret across duels — the contract's commit-reveal fairness
 * guarantee relies on each commitment being unpredictable and one-time use.
 */
export function generateSecret(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt(hex);
}

/** Mirrors the contract: keccak256(abi.encodePacked(secret, sender)) */
export function commitFor(secret: bigint, address: Address): Hex {
  return keccak256(encodePacked(["uint256", "address"], [secret, address]));
}

const storageKey = (chainId: number, contract: Address, duelId: bigint) =>
  `whip-duel-secret:${chainId}:${contract.toLowerCase()}:${duelId.toString()}`;

export function storeSecret(chainId: number, contract: Address, duelId: bigint, secret: bigint) {
  try {
    localStorage.setItem(storageKey(chainId, contract, duelId), secret.toString());
  } catch {
    // localStorage can throw in private-browsing contexts — the reveal step
    // will simply be unavailable for this duel in that case.
  }
}

export function loadSecret(chainId: number, contract: Address, duelId: bigint): bigint | null {
  try {
    const raw = localStorage.getItem(storageKey(chainId, contract, duelId));
    return raw ? BigInt(raw) : null;
  } catch {
    return null;
  }
}
