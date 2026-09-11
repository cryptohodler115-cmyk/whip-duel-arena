import type { Route } from "../lib/router";

export function Landing({ navigate }: { navigate: (r: Route) => void }) {
  return (
    <div className="landing-page">
      <div className="landing-overlay" />
      <div className="landing-content">
        <p className="landing-kicker">Stake your wager. Ready up. Duel in the sand.</p>
        <h1 className="landing-title">Sand Casino</h1>
        <button className="landing-enter-btn" onClick={() => navigate({ name: "lobby" })}>
          Enter The Sand Casino
        </button>
      </div>
    </div>
  );
}
