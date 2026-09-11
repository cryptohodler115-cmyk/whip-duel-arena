import type { PrivyClientConfig } from "@privy-io/react-auth";
import { robinhoodMainnet, robinhoodTestnet, defaultChain } from "./chains";

// Public client identifier for your Privy app — safe to expose in frontend
// code (it's not a secret, same idea as a WalletConnect project ID or a
// Stripe publishable key). Create a free app at https://dashboard.privy.io,
// then set VITE_PRIVY_APP_ID in Railway's Variables tab (or a local .env for
// `npm run dev`) to the App ID shown on your app's Settings page. Also add
// this site's URL under Settings -> Domains in the Privy dashboard, or login
// will be rejected.
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

// Zero-config login methods only: an external wallet (MetaMask, Rabby,
// Coinbase Wallet, WalletConnect, ...) or an email magic code, which spins up
// a Privy-managed embedded wallet automatically for anyone who doesn't
// already have one. Social logins (Google, Discord, ...) aren't enabled here
// since those need extra setup in the Privy dashboard — add them to
// `loginMethods` later if you configure them there.
export const privyConfig: PrivyClientConfig = {
  loginMethods: ["wallet", "email"],
  appearance: {
    theme: "dark",
    accentColor: "#ffcf5e",
    walletChainType: "ethereum-only",
  },
  embeddedWallets: {
    createOnLogin: "users-without-wallets",
  },
  defaultChain,
  supportedChains: [robinhoodTestnet, robinhoodMainnet],
};
