import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { parseEther, formatEther, decodeEventLog } from "viem";
import { useDuelList } from "../hooks/useDuelList";
import { useArenaWrite } from "../hooks/useArenaWrite";
import { ARENA_ADDRESS, arenaAbi, DuelStatusLabel } from "../config/contract";
import { commitFor, generateSecret, storeSecret } from "../lib/secret";
import { wagmiConfig } from "../config/wagmi";
import { ChatBox } from "../components/ChatBox";
import type { Route } from "../lib/router";

export function Lobby({ navigate }: { navigate: (r: Route) => void }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { duels, loading } = useDuelList();
  const { call, isPending } = useArenaWrite();
  const [wagerInput, setWagerInput] = useState("0.01");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleCreate() {
    if (!address) return;
    setErrorMsg(null);
    try {
      const wager = parseEther(wagerInput || "0");
      const secret = generateSecret();
      const commit = commitFor(secret, address);
      const hash = await call("createDuel", [commit], wager);

      // We need the assigned duelId, which only exists once the tx is mined —
      // pull it back out of the DuelCreated event in the receipt.
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      for (const log of receipt.logs) {
        try {
          // Cast the decoded result: the ABI array is long enough that some
          // viem/abitype versions cap generic inference depth and fall back
          // to an untyped `args` shape instead of the named-tuple type this
          // event actually decodes to at runtime.
          const decoded = decodeEventLog({ abi: arenaAbi, ...log }) as unknown as {
            eventName: string;
            args: { duelId: bigint };
          };
          if (decoded.eventName === "DuelCreated") {
            storeSecret(chainId, ARENA_ADDRESS, decoded.args.duelId, secret);
            navigate({ name: "duel", id: decoded.args.duelId });
            return;
          }
        } catch {
          // not our event, skip
        }
      }
    } catch (err) {
      setErrorMsg((err as Error).message ?? "Failed to create duel");
    }
  }

  async function handleJoin(id: bigint, wager: bigint) {
    if (!address) return;
    setErrorMsg(null);
    setBusyId(id.toString());
    try {
      const secret = generateSecret();
      const commit = commitFor(secret, address);
      storeSecret(chainId, ARENA_ADDRESS, id, secret);
      await call("joinDuel", [id, commit], wager);
      navigate({ name: "duel", id });
    } catch (err) {
      setErrorMsg((err as Error).message ?? "Failed to join duel");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(id: bigint) {
    setErrorMsg(null);
    setBusyId(id.toString());
    try {
      await call("cancelDuel", [id]);
    } catch (err) {
      setErrorMsg((err as Error).message ?? "Failed to cancel duel");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="lobby">
      <section className="panel create-panel">
        <h2>Stake a duel</h2>
        <p className="muted">
          Whip only. No food, no prayer, no potions. Winner takes the whole pot — resolved entirely on-chain.
        </p>
        <div className="create-row">
          <label>
            Wager (ETH)
            <input
              type="number"
              min="0"
              step="0.001"
              value={wagerInput}
              onChange={(e) => setWagerInput(e.target.value)}
            />
          </label>
          <button className="btn btn-primary" disabled={!isConnected || isPending} onClick={handleCreate}>
            {isPending ? "Confirm in wallet…" : "Create duel"}
          </button>
        </div>
        {!isConnected && <p className="warn">Connect your wallet to create or join a duel.</p>}
        {errorMsg && <p className="error">{errorMsg}</p>}
      </section>

      <ChatBox />

      <section className="panel">
        <h2>Open challenges</h2>
        {loading && <p className="muted">Loading duels from-chain…</p>}
        {!loading && duels.length === 0 && <p className="muted">No duels yet — be the first to stake one.</p>}
        <table className="duel-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Creator</th>
              <th>Wager</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {duels.map((d) => {
              const isMine = address && d.playerA.toLowerCase() === address.toLowerCase();
              const isParticipant =
                address &&
                (d.playerA.toLowerCase() === address.toLowerCase() ||
                  d.playerB.toLowerCase() === address.toLowerCase());
              return (
                <tr key={d.id.toString()}>
                  <td>{d.id.toString()}</td>
                  <td>
                    {d.playerA.slice(0, 6)}…{d.playerA.slice(-4)}
                  </td>
                  <td>{formatEther(d.wager)} ETH</td>
                  <td>{DuelStatusLabel[d.status]}</td>
                  <td className="actions">
                    {d.status === 1 && !isMine && (
                      <button
                        className="btn btn-primary"
                        disabled={!isConnected || busyId === d.id.toString()}
                        onClick={() => handleJoin(d.id, d.wager)}
                      >
                        Match wager
                      </button>
                    )}
                    {d.status === 1 && isMine && (
                      <button
                        className="btn btn-ghost"
                        disabled={busyId === d.id.toString()}
                        onClick={() => handleCancel(d.id)}
                      >
                        Cancel
                      </button>
                    )}
                    {d.status === 2 && isParticipant && (
                      <button className="btn btn-primary" onClick={() => navigate({ name: "duel", id: d.id })}>
                        Enter duel room
                      </button>
                    )}
                    {d.status === 2 && !isParticipant && <span className="muted">Awaiting reveals</span>}
                    {d.status === 3 && (
                      <button className="btn btn-ghost" onClick={() => navigate({ name: "arena", id: d.id })}>
                        Watch replay
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
