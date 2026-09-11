import { useEffect } from "react";
import { useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";

/**
 * Privy can hand a player either an embedded wallet (created automatically
 * on email login) or a connected external one (MetaMask, etc.) — this is the
 * glue that tells wagmi which of those is "the" active wallet, so every
 * normal wagmi hook used elsewhere (useAccount, useWriteContract, ...) just
 * works without every call site needing to know Privy exists. Mount this
 * once, near the root, inside both PrivyProvider and WagmiProvider.
 */
export function useSyncPrivyWallet() {
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();

  useEffect(() => {
    const wallet = wallets[0];
    if (wallet) {
      setActiveWallet(wallet);
    }
  }, [wallets, setActiveWallet]);
}
