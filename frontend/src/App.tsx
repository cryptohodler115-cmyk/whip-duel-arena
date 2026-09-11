import { ConnectButton } from "./components/ConnectButton";
import { Lobby } from "./pages/Lobby";
import { DuelRoom } from "./pages/DuelRoom";
import { Arena } from "./pages/Arena";
import { useRoute } from "./lib/router";
import { ARENA_ADDRESS } from "./config/contract";

export default function App() {
  const [route, navigate] = useRoute();
  // Cast to a plain string for this comparison — ARENA_ADDRESS is a narrow
  // literal type (via `as const`), so TS considers a direct comparison
  // against a different literal to be always-false once a real address is
  // filled in, which is exactly the case we're detecting here.
  const notDeployed = (ARENA_ADDRESS as string) === "0x0000000000000000000000000000000000000000";

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 onClick={() => navigate({ name: "lobby" })}>⚔ Whip Duel Arena</h1>
        <ConnectButton />
      </header>

      {notDeployed && (
        <div className="banner banner-warn">
          ARENA_ADDRESS is still the placeholder zero address. Deploy the contract (see README) and paste the
          address into <code>frontend/src/config/contract.ts</code> before this app will do anything real.
        </div>
      )}

      <main className="app-main">
        {route.name === "lobby" && <Lobby navigate={navigate} />}
        {route.name === "duel" && <DuelRoom id={route.id} navigate={navigate} />}
        {route.name === "arena" && <Arena id={route.id} navigate={navigate} />}
      </main>
    </div>
  );
}
