import React from "react";
import ReactDOM from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./config/wagmi";
import { PRIVY_APP_ID, privyConfig } from "./config/privy";
import App from "./App";
import "./styles.css";

const queryClient = new QueryClient();

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (!PRIVY_APP_ID) {
  // Fails soft rather than letting PrivyProvider throw on an empty appId —
  // same idea as the ARENA_ADDRESS placeholder banner in App.tsx. Set
  // VITE_PRIVY_APP_ID (Railway -> Variables, or a local .env for `npm run
  // dev`) to the App ID from https://dashboard.privy.io to enable wallet
  // connection.
  root.render(
    <React.StrictMode>
      <div className="app-shell">
        <div className="banner banner-warn">
          VITE_PRIVY_APP_ID is not set. Create a free app at{" "}
          <a href="https://dashboard.privy.io" target="_blank" rel="noreferrer">
            dashboard.privy.io
          </a>
          , add this site's URL under Settings → Domains, then set VITE_PRIVY_APP_ID to its App ID (Railway →
          Variables for the live site, or a local .env for <code>npm run dev</code>) before this app can connect a
          wallet.
        </div>
      </div>
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={wagmiConfig}>
            <App />
          </WagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    </React.StrictMode>
  );
}
