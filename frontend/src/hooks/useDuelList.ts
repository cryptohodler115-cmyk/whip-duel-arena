import { useCallback, useEffect, useState } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { ARENA_ADDRESS, arenaAbi } from "../config/contract";
import type { DuelData, DuelStruct } from "./useDuel";
import type { Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Lists every duel the contract has ever seen by scanning DuelCreated logs
 * from genesis, then keeps each one's status fresh by re-reading getDuel
 * whenever a relevant event fires. Fine for a testnet demo; a production
 * deployment with real history depth would want a proper indexer instead of
 * an unbounded fromBlock: 0n log scan.
 */
export function useDuelList() {
  const publicClient = usePublicClient();
  const [duels, setDuels] = useState<Map<string, DuelData>>(new Map());
  const [loading, setLoading] = useState(true);

  const refreshOne = useCallback(
    async (id: bigint) => {
      if (!publicClient) return;
      const d = (await publicClient.readContract({
        address: ARENA_ADDRESS,
        abi: arenaAbi,
        functionName: "getDuel",
        args: [id],
      })) as DuelStruct;
      setDuels((prev) => {
        const next = new Map(prev);
        next.set(id.toString(), {
          id,
          playerA: d.playerA,
          playerB: d.playerB ?? ZERO,
          wager: d.wager,
          commitA: d.commitA,
          commitB: d.commitB,
          revealedA: d.revealedA,
          revealedB: d.revealedB,
          revealDeadline: d.revealDeadline,
          status: d.status,
          winner: d.winner,
        });
        return next;
      });
    },
    [publicClient]
  );

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const logs = await publicClient.getContractEvents({
        address: ARENA_ADDRESS,
        abi: arenaAbi,
        eventName: "DuelCreated",
        fromBlock: 0n,
        toBlock: "latest",
      });
      if (cancelled) return;
      const ids = [...new Set(logs.map((l) => l.args.duelId).filter((v): v is bigint => v !== undefined))];
      await Promise.all(ids.map(refreshOne));
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, refreshOne]);

  // `logs` is typed `any[]` deliberately: the ABI array is long enough that
  // some viem/abitype versions cap generic inference depth for the
  // per-event decoded `Log` type and fall back to a shape TS considers
  // incompatible with a hand-written one (even though the runtime value is
  // always fully decoded). Falling back to `any` here sidesteps that
  // version-specific inference limit instead of fighting it.
  const onAny =
    (extract: (args: Record<string, unknown>) => bigint | undefined) =>
    (logs: any[]) => {
      for (const l of logs) {
        const id = extract((l?.args ?? {}) as Record<string, unknown>);
        if (id !== undefined) refreshOne(id);
      }
    };

  useWatchContractEvent({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    eventName: "DuelCreated",
    onLogs: onAny((a) => a.duelId as bigint | undefined),
  } as any);
  useWatchContractEvent({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    eventName: "DuelJoined",
    onLogs: onAny((a) => a.duelId as bigint | undefined),
  } as any);
  useWatchContractEvent({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    eventName: "DuelCancelled",
    onLogs: onAny((a) => a.duelId as bigint | undefined),
  } as any);
  useWatchContractEvent({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    eventName: "DuelResolved",
    onLogs: onAny((a) => a.duelId as bigint | undefined),
  } as any);
  useWatchContractEvent({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    eventName: "DuelDrawn",
    onLogs: onAny((a) => a.duelId as bigint | undefined),
  } as any);

  const list = Array.from(duels.values()).sort((a, b) => (a.id > b.id ? -1 : 1));
  return { duels: list, loading };
}
