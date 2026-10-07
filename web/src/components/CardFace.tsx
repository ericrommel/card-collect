const WASHES: Record<string, { paper: string; ink: string }> = {
  Sea: { paper: "#e7f3f1", ink: "#0e6b5c" },
  Ember: { paper: "#f8efe4", ink: "#8d4b1f" },
  Leaf: { paper: "#eef4e6", ink: "#3c6b34" },
  Stone: { paper: "#f3efe8", ink: "#5c564c" },
};

const RARITY_FRAME: Record<string, string> = {
  common: "#8a8478",
  c: "#8a8478",
  uncommon: "#3c6b34",
  uc: "#3c6b34",
  rare: "#1d5c86",
  r: "#1d5c86",
  legendary: "#8a5a12",
  sr: "#8a5a12",
  sec: "#8a5a12",
  secret: "#8a5a12",
  l: "#6a3d78",
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function washFor(ink: string | null | undefined, seed: number): { paper: string; ink: string } {
  if (ink && WASHES[ink]) return WASHES[ink];
  const keys = Object.keys(WASHES);
  return WASHES[keys[seed % keys.length]];
}

/**
 * Original geometric stand-in for a card face. It is generated from the
 * card's own number and name. It is not official artwork and does not
 * claim to depict a real collectible.
 */
export function CardFace({
  number,
  name,
  rarity,
  ink,
  size = "md",
}: {
  number: string;
  name: string;
  rarity: string | null;
  ink?: string | null;
  size?: "sm" | "md";
}) {
  const seed = hashString(`${number}:${name}`);
  const wash = washFor(ink, seed);
  const rarityKey = (rarity ?? "").trim().toLowerCase();
  const frame = RARITY_FRAME[rarityKey] ?? "#5c564c";
  const featured =
    rarityKey === "legendary" ||
    rarityKey === "sec" ||
    rarityKey === "secret" ||
    rarityKey === "sr" ||
    rarityKey === "l";
  const shapes = [0, 1, 2].map((index) => {
    const n = hashString(`${seed}:${index}`);
    return {
      x: 18 + (n % 26),
      y: 28 + ((n >>> 8) % 28),
      r: 5 + (n % 5),
      kind: n % 3,
    };
  });
  const caption = number.length > 11 ? number.slice(-8) : number;

  return (
    <svg viewBox="0 0 63 88" className={`card-face card-face-${size}`} aria-hidden="true">
      <rect
        x="1.25"
        y="1.25"
        width="60.5"
        height="85.5"
        rx="6"
        fill={wash.paper}
        stroke={frame}
        strokeWidth={featured ? 2.4 : 1.4}
      />
      {featured && (
        <rect x="4.2" y="4.2" width="54.6" height="79.6" rx="4" fill="none" stroke={frame} strokeWidth="0.7" />
      )}
      <rect x="1.25" y="1.25" width="60.5" height="9" rx="6" fill={frame} />
      <rect x="1.25" y="6" width="60.5" height="4.5" fill={frame} />
      {shapes.map((shape, index) =>
        shape.kind === 0 ? (
          <circle key={index} cx={shape.x} cy={shape.y} r={shape.r} fill={wash.ink} opacity="0.88" />
        ) : shape.kind === 1 ? (
          <rect
            key={index}
            x={shape.x - shape.r}
            y={shape.y - shape.r}
            width={shape.r * 2}
            height={shape.r * 2}
            rx="1"
            fill={wash.ink}
            opacity="0.82"
          />
        ) : (
          <polygon
            key={index}
            points={`${shape.x},${shape.y - shape.r} ${shape.x + shape.r},${shape.y + shape.r * 0.75} ${shape.x - shape.r},${shape.y + shape.r * 0.75}`}
            fill={wash.ink}
            opacity="0.82"
          />
        ),
      )}
      <text x="6" y="80" fill={wash.ink} fontSize="4.5" fontFamily="ui-monospace, monospace">
        {caption}
      </text>
    </svg>
  );
}

export function inkFromMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  const ink = metadata?.ink;
  return typeof ink === "string" ? ink : null;
}
