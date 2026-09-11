import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";

// sessionStorage (not localStorage) on purpose: it survives a page refresh
// so a connected player doesn't get booted just for reloading, but it's
// gone the moment the tab/window closes — so the very next visit is back to
// a clean "Connect wallet" state, exactly like the first visit ever.
const CONNECT_FLAG_KEY = "sand-casino:wallet-connect-requested";

/**
 * Privy persists a login across visits by default: if a player connected
 * before, the next time they load this page Privy silently restores that
 * session and `authenticated` flips to true before they've clicked
 * anything. We don't want that here — connecting a wallet (and any signature
 * prompt that comes with it) should only ever happen because the player
 * pressed "Connect wallet", never automatically in the background.
 *
 * This hook waits for Privy to finish resolving whatever session it found,
 * and if the player turns out to be authenticated without having pressed
 * "Connect wallet" during this tab's session (that press is what sets the
 * sessionStorage flag below, in ConnectButton), it immediately logs them
 * back out. That's a plain, silent `logout()` call — no dialog, no wallet
 * popup — so the UI just settles on "Connect wallet" like normal, and the
 * only way to get connected from there is to click it.
 */
export function useEnforceManualConnect() {
  const { ready, authenticated, logout } = usePrivy();

  useEffect(() => {
    if (!ready || !authenticated) return;

    let requested = false;
    try {
      requested = sessionStorage.getItem(CONNECT_FLAG_KEY) === "1";
    } catch {
      // sessionStorage blocked (private browsing, etc.) — treat as "not
      // requested" so we fail toward requiring an explicit connect rather
      // than silently letting a restored session through.
    }

    if (!requested) {
      logout();
    }
  }, [ready, authenticated, logout]);
}

/** Call this right before `login()` so the hook above knows this connection was asked for. */
export function markWalletConnectRequested() {
  try {
    sessionStorage.setItem(CONNECT_FLAG_KEY, "1");
  } catch {
    // If storage isn't available the flag just won't stick — worst case a
    // refresh re-triggers the logout above, which is the safe direction to
    // fail in.
  }
}
