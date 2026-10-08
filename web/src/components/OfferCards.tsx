import { useState } from "react";
import { CardFace } from "./CardFace";
import { rarityLabel } from "../lib/labels";

export interface OfferItem {
  id?: string;
  number: string;
  name: string;
  rarity: string | null;
  condition?: string | null;
}

export function OfferCards({
  items,
  limit = 8,
  showCondition = false,
}: {
  items: OfferItem[];
  limit?: number;
  showCondition?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return <p className="muted small">No cards</p>;
  const visible = expanded ? items : items.slice(0, limit);
  return (
    <div className="offer-block">
      <ul className="offer-grid">
        {visible.map((item, index) => (
          <li key={item.id ?? `${item.number}-${item.name}-${index}`}>
            <CardFace number={item.number} name={item.name} rarity={item.rarity} />
            <span className="tile-name">{item.name}</span>
            <span className="tile-sub">
              {item.number}
              {item.rarity ? ` · ${rarityLabel(item.rarity)}` : ""}
            </span>
            {showCondition && <span className="badge small">{item.condition ?? "Not set"}</span>}
          </li>
        ))}
      </ul>
      {items.length > limit && (
        <button type="button" className="link" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Show fewer" : `Show all ${items.length} cards`}
        </button>
      )}
    </div>
  );
}
