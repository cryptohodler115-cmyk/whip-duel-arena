import { http } from "wagmi";
import { createConfig } from "@privy-io/wagmi";
import { robinhoodMainnet, robinhoodTestnet } from "./chains";

// Built with @privy-io/wagmi's createConfig rather than wagmi's own — same
// shape, but it wires up the wagmi connector Privy needs to reflect whichever
// wallet (embedded or external) the player is logged in with through
// PrivyProvider. No `connectors` array here: Privy manages the connection,
// and useSyncPrivyWallet (see hooks/) is what makes that wallet "active" for
// every normal wagmi hook (useAccount, useWriteContract, ...) used elsewhere
// in this app.
export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, robinhoodMainnet],
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
