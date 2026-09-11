import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { useDuel } from "../hooks/useDuel";
import { useFightLog } from "../hooks/useFightLog";
import { useArenaWrite } from "../hooks/useArenaWrite";
import { ARENA_ADDRESS, arenaAbi } from "../config/contract";
import { Fighter } from "../components/Fighter";
import type { Route } from "../lib/router";

const HP_START = 99n;
const ROUND_INTERVAL_MS = 900;

export function Arena({ id, navigate }: { id: bigint; navigate: (r: Route) => void }) {
  const { address } = useAccount();
  const { duel } = useDuel(id);
  const { rounds, loaded } = useFightLog(id);
  const { call, isPending } = useArenaWrite();

  const [cursor, setCursor] = useState(-1); // index into rounds already shown
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    setCursor(-1);
    setPlaying(true);
  }, [rounds.length > 0]);

  useEffect(() => {
    if (!playing) return;
    if (cursor >= rounds.length - 1) return;
    const t = setTimeout(() => setCursor((c) => c + 1), ROUND_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [playing, cursor, rounds.length]);

  const current = cursor >= 0 ? rounds[cursor] : null;
  const hpA = current ? current.hpA : HP_START;
  const hpB = current ? current.hpB : HP_START;
  const finished = cursor === rounds.length - 1 && rounds.length > 0;

  const { data: myBalance, refetch: refetchBalance } = useReadContract({
    address: ARENA_ADDRESS,
    abi: arenaAbi,
    functionName: "balances",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  async function handleWithdraw() {
    await call("withdraw", []);
    refetchBalance();
  }

  const outcomeText = useMemo(() => {
    if (!duel || duel.status !== 3) return null;
    if (duel.winner === "0x0000000000000000000000000000000000000000") {
      return "Simultaneous knockout — it's a draw. Both wagers refunded.";
    }
    const you = address && duel.winner.toLowerCase() === address.toLowerCase();
    return you ? "You win the pot!" : `Winner: ${duel.winner.slice(0, 6)}…${duel.winner.slice(-4)}`;
  }, [duel, address]);

  return (
    <div className="panel arena-page">
      <button className="btn btn-ghost back-btn" onClick={() => navigate({ name: "lobby" })}>
        ← Back to lobby
      </button>
      <h2>Duel #{id.toString()} — fight replay</h2>

      {!loaded && <p className="muted">Fetching fight log from-chain…</p>}
      {loaded && rounds.length === 0 && <p className="muted">No fight log yet — this duel hasn't resolved.</p>}

      {rounds.length > 0 && (
        <>
          <div className="arena-stage">
            <div className="fighter-slot">
              {/* key={cursor} forces a remount each round so the CSS swing
                  animation restarts instead of staying frozen in its end state */}
              <Fighter key={`a-${cursor}`} facing="right" swinging={!!current} defeated={hpA === 0n} tint="#8a3b2f" />
              <div className="hp-bar">
                <div className="hp-fill" style={{ width: `${(Number(hpA) / Number(HP_START)) * 100}%` }} />
              </div>
              <span className="hp-label">Player A — {hpA.toString()} HP</span>
              {current && current.dmgToA > 0n && (
                <span key={`splash-a-${cursor}`} className="hitsplash left">
                  -{current.dmgToA.toString()}
                </span>
              )}
              {current && current.dmgToA === 0n && (
                <span key={`miss-a-${cursor}`} className="hitsplash miss left">
                  miss
                </span>
              )}
            </div>

            <div className="round-indicator">{current ? `Round ${current.round.toString()}` : "Ready"}</div>

            <div className="fighter-slot">
              <Fighter key={`b-${cursor}`} facing="left" swinging={!!current} defeated={hpB === 0n} tint="#2f5c8a" />
              <div className="hp-bar">
                <div className="hp-fill" style={{ width: `${(Number(hpB) / Number(HP_START)) * 100}%` }} />
              </div>
              <span className="hp-label">Player B — {hpB.toString()} HP</span>
              {current && current.dmgToB > 0n && (
                <span key={`splash-b-${cursor}`} className="hitsplash right">
                  -{current.dmgToB.toString()}
                </span>
              )}
              {current && current.dmgToB === 0n && (
                <span key={`miss-b-${cursor}`} className="hitsplash miss right">
                  miss
                </span>
              )}
            </div>
          </div>

          <div className="arena-controls">
            <button className="btn btn-ghost" onClick={() => setPlaying((p) => !p)} disabled={finished}>
              {finished ? "Finished" : playing ? "Pause" : "Resume"}
            </button>
            <button className="btn btn-ghost" onClick={() => setCursor(rounds.length - 1)} disabled={finished}>
              Skip to end
            </button>
          </div>

          <div className="combat-log">
            {rounds.slice(0, cursor + 1).map((r) => (
              <div key={r.round.toString()} className="log-line">
                <strong>Round {r.round.toString()}</strong> — A deals {r.dmgToB.toString()}
                {r.dmgToB === 0n ? " (miss)" : ""}, B deals {r.dmgToA.toString()}
                {r.dmgToA === 0n ? " (miss)" : ""}. HP: {r.hpA.toString()} / {r.hpB.toString()}
              </div>
            ))}
          </div>

          {finished && outcomeText && (
            <div className="outcome-banner">
              <p>{outcomeText}</p>
              {duel && duel.status === 3 && myBalance !== undefined && myBalance > 0n && (
                <button className="btn btn-primary" disabled={isPending} onClick={handleWithdraw}>
                  {isPending ? "Confirm in wallet…" : `Withdraw ${formatEther(myBalance)} ETH`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
