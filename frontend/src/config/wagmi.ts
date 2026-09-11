import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodMainnet, robinhoodTestnet } from "./chains";

// Injected connector only (MetaMask, Rabby, Coinbase Wallet extension, etc.)
// — no WalletConnect project ID required, so this runs with zero external
// signup. Add walletConnect() from 'wagmi/connectors' later if you want
// mobile wallet support.
export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, robinhoodMainnet],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(),
    [robinhoodMainnet.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
