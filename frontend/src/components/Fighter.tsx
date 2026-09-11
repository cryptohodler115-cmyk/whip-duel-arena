/**
 * A small original SVG combatant — deliberately generic (no borrowed IP):
 * a hooded duelist with a single long segmented weapon. Pure inline SVG so
 * it themes cleanly and the whip-swing animation is just a CSS transform on
 * the weapon group.
 */
export function Fighter({
  facing,
  swinging,
  defeated,
  tint,
}: {
  facing: "left" | "right";
  swinging: boolean;
  defeated: boolean;
  tint: string;
}) {
  const flip = facing === "left" ? -1 : 1;
  return (
    <svg
      viewBox="0 0 120 160"
      className={`fighter-svg ${defeated ? "defeated" : ""}`}
      style={{ transform: `scaleX(${flip})` }}
    >
      {/* body */}
      <ellipse cx="60" cy="150" rx="26" ry="6" fill="rgba(0,0,0,0.35)" />
      <rect x="46" y="70" width="28" height="52" rx="10" fill={tint} />
      <circle cx="60" cy="46" r="20" fill="#e7d3b0" />
      <path d="M40 40 Q60 10 80 40 Q80 60 60 62 Q40 60 40 40 Z" fill={tint} opacity="0.9" />
      {/* off-hand arm */}
      <rect x="70" y="76" width="10" height="34" rx="5" fill={tint} />
      {/* whip arm + weapon, this is the part that swings */}
      <g className={`weapon-arm ${swinging ? "swing" : ""}`} style={{ transformOrigin: "38px 82px" }}>
        <rect x="30" y="76" width="12" height="30" rx="6" fill={tint} />
        <path
          d="M34 104 C 10 118, 4 140, 20 156"
          stroke="#3a2c22"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="20" cy="156" r="3" fill="#3a2c22" />
      </g>
      {/* legs */}
      <rect x="48" y="118" width="10" height="28" rx="4" fill="#2b2b33" />
      <rect x="62" y="118" width="10" height="28" rx="4" fill="#2b2b33" />
    </svg>
  );
}
