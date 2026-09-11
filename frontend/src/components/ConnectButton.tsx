import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { defaultChain } from "../config/chains";
import { markWalletConnectRequested } from "../hooks/useEnforceManualConnect";

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
    // This button press is the ONLY place this app ever calls Privy's
    // login() — see useEnforceManualConnect for why that matters: a
    // returning player's session is never silently restored, so a wallet
    // can't get "connected" (and never prompts a signature) without this
    // exact click happening first.
    const handleConnect = () => {
      markWalletConnectRequested();
      login();
    };
    return (
      <button className="btn btn-primary" onClick={handleConnect}>
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
