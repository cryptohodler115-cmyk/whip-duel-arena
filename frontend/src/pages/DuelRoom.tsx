import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { formatEther } from "viem";
import { useDuel } from "../hooks/useDuel";
import { useArenaWrite } from "../hooks/useArenaWrite";
import { ARENA_ADDRESS, DuelStatusLabel } from "../config/contract";
import { loadSecret } from "../lib/secret";
import type { Route } from "../lib/router";

function useCountdown(target: bigint) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = Number(target) - now;
  return remaining;
}

// Player-facing wording deliberately hides the commit-reveal mechanics: under
// the hood this still calls the contract's `reveal(duelId, secret)` (the
// secret was generated and committed automatically back when you created or
// joined the duel — see lib/secret.ts), but from the player's side this is
// just "both sides ready up, then the fight starts," matching a normal PvP
// queue. The fairness guarantee is unchanged: neither side can pick their
// secret in reaction to the other's, because both were already committed
// before either could ready up.
export function DuelRoom({ id, navigate }: { id: bigint; navigate: (r: Route) => void }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { duel, refresh } = useDuel(id);
  const { call, isPending } = useArenaWrite();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const role = useMemo(() => {
    if (!duel || !address) return null;
    if (duel.playerA.toLowerCase() === address.toLowerCase()) return "A" as const;
    if (duel.playerB.toLowerCase() === address.toLowerCase()) return "B" as const;
    return null;
  }, [duel, address]);

  const myKey = useMemo(() => loadSecret(chainId, ARENA_ADDRESS, id), [chainId, id]);
  const iAmReady = role === "A" ? duel?.revealedA : role === "B" ? duel?.revealedB : undefined;
  const opponentReady = role === "A" ? duel?.revealedB : role === "B" ? duel?.revealedA : undefined;

  const remaining = useCountdown(duel?.revealDeadline ?? 0n);
  const deadlinePassed = duel?.status === 2 && remaining <= 0;

  useEffect(() => {
    if (duel?.status === 3) {
      navigate({ name: "arena", id });
    }
  }, [duel?.status, id, navigate]);

  async function handleReady() {
    if (myKey === null) {
      setErrorMsg(
        "Can't ready up from this browser — this device doesn't have this duel's key. Ready up from the same browser/profile you used to create or join it."
      );
      return;
    }
    setErrorMsg(null);
    try {
      await call("reveal", [id, myKey]);
      refresh();
    } catch (err) {
      setErrorMsg((err as Error).message ?? "Ready-up failed");
    }
  }

  async function handleClaimTimeout() {
    setErrorMsg(null);
    try {
      await call("claimTimeout", [id]);
      refresh();
    } catch (err) {
      setErrorMsg((err as Error).message ?? "Claim failed");
    }
  }

  if (!duel) return <div className="panel">Loading duel #{id.toString()}…</div>;

  return (
    <div className="panel duel-room">
      <button className="btn btn-ghost back-btn" onClick={() => navigate({ name: "lobby" })}>
        ← Back to lobby
      </button>
      <h2>Duel #{id.toString()}</h2>
      <p className="muted">{DuelStatusLabel[duel.status]}</p>

      <div className="duel-room-players">
        <div className={`player-card ${role === "A" ? "you" : ""}`}>
          <span className="label">Player A</span>
          <span className="addr">{duel.playerA}</span>
          <span className={`badge ${duel.revealedA ? "good" : ""}`}>{duel.revealedA ? "Ready" : "Not ready"}</span>
        </div>
        <div className="vs">VS</div>
        <div className={`player-card ${role === "B" ? "you" : ""}`}>
          <span className="label">Player B</span>
          <span className="addr">
            {duel.playerB === "0x0000000000000000000000000000000000000000" ? "— open —" : duel.playerB}
          </span>
          <span className={`badge ${duel.revealedB ? "good" : ""}`}>{duel.revealedB ? "Ready" : "Not ready"}</span>
        </div>
      </div>

      <p>
        Pot: <strong>{formatEther(duel.wager * 2n)} ETH</strong> ({formatEther(duel.wager)} ETH each)
      </p>

      {duel.status === 1 && (
        <p className="muted">Waiting for an opponent to match the wager. Share the lobby link with them.</p>
      )}

      {duel.status === 2 && !deadlinePassed && (
        <>
          <p className="countdown">Ready-up window closes in {Math.max(0, remaining)}s</p>
          {role && !iAmReady && (
            <button className="btn btn-primary" disabled={isPending} onClick={handleReady}>
              {isPending ? "Confirm in wallet…" : "I'm ready — start the fight"}
            </button>
          )}
          {role && iAmReady && !opponentReady && (
            <p className="muted">
              You're ready. Waiting on your opponent — if they stall past the deadline you can claim the pot by
              forfeit.
            </p>
          )}
          {!role && <p className="muted">You're spectating — only the two duelists can ready up.</p>}
        </>
      )}

      {duel.status === 2 && deadlinePassed && (
        <>
          <p className="warn">Ready-up window has closed.</p>
          <button className="btn btn-primary" onClick={handleClaimTimeout}>
            Claim timeout outcome
          </button>
        </>
      )}

      {duel.status === 4 && <p className="muted">This duel was cancelled before anyone joined.</p>}

      {errorMsg && <p className="error">{errorMsg}</p>}
    </div>
  );
}
