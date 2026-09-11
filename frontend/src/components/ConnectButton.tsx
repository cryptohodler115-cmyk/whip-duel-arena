import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { defaultChain } from "../config/chains";

export function ConnectButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (!ready) {
    return (
      <button className="btn btn-ghost" disabled>
        Loading…
      </button>
    );
  }

  if (!authenticated) {
    return (
      <button className="btn btn-primary" onClick={login}>
        Connect wallet
      </button>
    );
  }

  if (!address) {
    // Authenticated with Privy, but wagmi hasn't picked up the active wallet
    // yet (useSyncPrivyWallet runs a beat after login resolves).
    return (
      <div className="connect-status">
        <span className="muted">Connecting…</span>
        <button className="btn btn-ghost" onClick={logout}>
          Disconnect
        </button>
      </div>
    );
  }

  const wrongNetwork = chainId !== defaultChain.id;

  return (
    <div className="connect-status">
      {wrongNetwork && (
        <button className="btn btn-warn" onClick={() => switchChain({ chainId: defaultChain.id })}>
          Switch to {defaultChain.name}
        </button>
      )}
      <span className="address-pill" title={address}>
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      <button className="btn btn-ghost" onClick={logout}>
        Disconnect
      </button>
    </div>
  );
}
