import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { defaultChain } from "../config/chains";

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    const injectedConnector = connectors[0];
    return (
      <button
        className="btn btn-primary"
        disabled={isPending}
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
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
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </span>
      <button className="btn btn-ghost" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
