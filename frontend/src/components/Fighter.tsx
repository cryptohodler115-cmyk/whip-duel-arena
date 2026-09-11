/**
 * An original SVG duelist — deliberately its own design, not a copy of any
 * game studio's character model: a cloaked, armored combatant with a dark
 * segmented "tentacle-style" whip. Pure inline SVG so it themes cleanly and
 * the whip-swing animation is just a CSS transform on the weapon group.
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
      viewBox="0 0 120 170"
      className={`fighter-svg ${defeated ? "defeated" : ""}`}
      style={{ transform: `scaleX(${flip})` }}
    >
      {/* ground shadow */}
      <ellipse cx="60" cy="160" rx="28" ry="6" fill="rgba(0,0,0,0.4)" />

      {/* cloak, billowing slightly behind the torso */}
      <path
        d="M40 78 Q20 100 26 140 Q30 150 42 152 L44 96 Z"
        fill={tint}
        opacity="0.55"
      />

      {/* legs + boots */}
      <rect x="47" y="122" width="11" height="30" rx="4" fill="#241d17" />
      <rect x="63" y="122" width="11" height="30" rx="4" fill="#241d17" />
      <rect x="45" y="146" width="15" height="8" rx="2" fill="#151009" />
      <rect x="61" y="146" width="15" height="8" rx="2" fill="#151009" />

      {/* torso armor */}
      <rect x="44" y="72" width="32" height="54" rx="10" fill={tint} />
      <path d="M44 82 L76 82 L72 92 L48 92 Z" fill="rgba(0,0,0,0.25)" />
      <rect x="56" y="76" width="8" height="46" rx="3" fill="rgba(255,255,255,0.12)" />

      {/* shoulder plates */}
      <circle cx="44" cy="76" r="9" fill={tint} />
      <circle cx="76" cy="76" r="9" fill={tint} />
      <circle cx="44" cy="76" r="9" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
      <circle cx="76" cy="76" r="9" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />

      {/* hood + face */}
      <path d="M38 46 Q60 14 82 46 Q84 66 60 70 Q36 66 38 46 Z" fill={tint} />
      <path d="M44 44 Q60 26 76 44 Q76 58 60 60 Q44 58 44 44 Z" fill="#1a140d" />
      <ellipse cx="60" cy="50" rx="9" ry="6" fill="#e7d3b0" opacity="0.9" />

      {/* off-hand arm, resting */}
      <rect x="72" y="78" width="10" height="32" rx="5" fill={tint} />
      <circle cx="77" cy="112" r="6" fill="#e7d3b0" />

      {/* whip arm — this whole group swings */}
      <g className={`weapon-arm ${swinging ? "swing" : ""}`} style={{ transformOrigin: "36px 82px" }}>
        <rect x="28" y="76" width="12" height="32" rx="6" fill={tint} />
        <circle cx="34" cy="110" r="6" fill="#e7d3b0" />

        {/* segmented dark tentacle-style whip, tapering to a barbed tip */}
        <g fill="none" strokeLinecap="round">
          <path d="M32 112 C 8 122, -2 142, 6 160" stroke="#241028" strokeWidth="7" />
          <path d="M32 112 C 8 122, -2 142, 6 160" stroke="#3d1a49" strokeWidth="3.5" opacity="0.8" />
          {/* segment rings */}
          <circle cx="24" cy="118" r="2.2" fill="#120716" />
          <circle cx="12" cy="132" r="2" fill="#120716" />
          <circle cx="4" cy="148" r="1.6" fill="#120716" />
          {/* barbed tip */}
          <path d="M6 160 L1 156 M6 160 L2 164 M6 160 L9 165" stroke="#120716" strokeWidth="2" />
        </g>
      </g>
    </svg>
  );
}
