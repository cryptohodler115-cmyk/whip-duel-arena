import { useWriteContract } from "wagmi";
import { ARENA_ADDRESS, arenaAbi } from "../config/contract";

/**
 * Thin wrapper around wagmi's useWriteContract bound to this one contract.
 * Typed loosely (args/value as any) on purpose: this single helper is used
 * to call several functions with different signatures, and wagmi's per-
 * function generic inference doesn't collapse cleanly across that — if you
 * want full type safety, call useWriteContract directly per call-site
 * instead of through this wrapper.
 */
export function useArenaWrite() {
  const { writeContractAsync, isPending, error } = useWriteContract();

  const call = (functionName: string, args: readonly unknown[], value?: bigint) =>
    writeContractAsync({
      address: ARENA_ADDRESS,
      abi: arenaAbi,
      functionName: functionName as never,
      args: args as never,
      value,
    });

  return { call, isPending, error };
}
