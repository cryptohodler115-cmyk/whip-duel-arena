import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { ARENA_ADDRESS, arenaAbi } from "../config/contract";

export type RoundEvent = {
  round: bigint;
  dmgToB: bigint;
  dmgToA: bigint;
  hpA: bigint;
  hpB: bigint;
};

export function useFightLog(id: bigint | undefined) {
  const publicClient = usePublicClient();
  const [rounds, setRounds] = useState<RoundEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!publicClient || id === undefined) return;
    let cancelled = false;
    (async () => {
      setLoaded(false);
      const logs = await publicClient.getContractEvents({
        address: ARENA_ADDRESS,
        abi: arenaAbi,
        eventName: "RoundResolved",
        args: { duelId: id },
        fromBlock: 0n,
        toBlock: "latest",
      });
      if (cancelled) return;
      // Cast through `unknown` here: the RoundResolved ABI entry sits in a
      // very long human-readable ABI array, and some viem/abitype versions
      // cap generic inference depth for that case and fall back to a bare
      // `Log` type with no decoded `args` field at the type level (it's
      // still present at runtime — viem always decodes it).
      const decodedLogs = logs as unknown as Array<{
        args: Partial<RoundEvent> & { duelId?: bigint };
      }>;
      const parsed = decodedLogs
        .map((l) => l.args)
        .filter(
          (a): a is { round: bigint; dmgToB: bigint; dmgToA: bigint; hpA: bigint; hpB: bigint; duelId?: bigint } =>
            a.round !== undefined
        )
        .map((a) => ({ round: a.round, dmgToB: a.dmgToB, dmgToA: a.dmgToA, hpA: a.hpA, hpB: a.hpB }))
        .sort((x, y) => (x.round < y.round ? -1 : 1));
      setRounds(parsed);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, id]);

  return { rounds, loaded };
}
