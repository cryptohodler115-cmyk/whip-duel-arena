import { useCallback, useEffect, useState } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { ARENA_ADDRESS, arenaAbi } from "../config/contract";
import type { Address } from "viem";

export type DuelData = {
  id: bigint;
  playerA: Address;
  playerB: Address;
  wager: bigint;
  commitA: `0x${string}`;
  commitB: `0x${string}`;
  revealedA: boolean;
  revealedB: boolean;
  revealDeadline: bigint;
  status: number;
  winner: Address;
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

// Mirrors the Duel struct decoded from getDuel(). Confirmed against the
// actual viem/abitype build output: wide integers (uint256, uint64) decode
// as `bigint`, but `status` (uint8) decodes as a plain `number` — small
// enough widths stay `number` in this version. `Number(d.status)` below is
// a harmless no-op in that case; it's kept because it's also correct if a
// future viem/abitype upgrade widens that mapping to bigint.
export type DuelStruct = {
  playerA: Address;
  playerB: Address;
  wager: bigint;
  commitA: `0x${string}`;
  commitB: `0x${string}`;
  secretA: bigint;
  secretB: bigint;
  revealedA: boolean;
  revealedB: boolean;
  revealDeadline: bigint;
  status: number;
  winner: Address;
};

export function useDuel(id: bigint | undefined) {
  const publicClient = usePublicClient();
  const [duel, setDuel] = useState<DuelData | null>(null);

  const refresh = useCallback(async () => {
    if (!publicClient || id === undefined) return;
    const d = (await publicClient.readContract({
      address: ARENA_ADDRESS,
      abi: arenaAbi,
      functionName: "getDuel",
      args: [id],
    })) as DuelStruct;
    setDuel({
      id,
      playerA: d.playerA,
      playerB: d.playerB ?? ZERO,
      wager: d.wager,
      commitA: d.commitA,
      commitB: d.commitB,
      revealedA: d.revealedA,
      revealedB: d.revealedB,
      revealDeadline: d.revealDeadline,
      status: Number(d.status),
      winner: d.winner,
    });
  }, [publicClient, id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filterArgs = id !== undefined ? { duelId: id } : undefined;

  useWatchContractEvent({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    eventName: "DuelJoined",
    args: filterArgs,
    onLogs: () => refresh(),
  });
  useWatchContractEvent({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    eventName: "Revealed",
    args: filterArgs,
    onLogs: () => refresh(),
  });
  useWatchContractEvent({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    eventName: "DuelResolved",
    args: filterArgs,
    onLogs: () => refresh(),
  });
  useWatchContractEvent({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    eventName: "DuelDrawn",
    args: filterArgs,
    onLogs: () => refresh(),
  });
  useWatchContractEvent({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    eventName: "DuelCancelled",
    args: filterArgs,
    onLogs: () => refresh(),
  });

  return { duel, refresh };
}
