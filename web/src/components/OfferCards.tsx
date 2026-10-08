import { useState } from "react";
import { cardMotif } from "../lib/cardMotif";
import { rarityLabel } from "../lib/labels";
import { CardFace } from "./CardFace";

export interface OfferItem {
  id?: string;
  number: string;
  name: string;
  rarity: string | null;
  condition?: string | null;
  kind?: string | null;
  ink?: string | null;
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
        {visible.map((item, index) => {
          const kind = cardMotif(item.kind);
          return (
            <li key={item.id ?? `${item.number}-${item.name}-${index}`}>
              <CardFace number={item.number} name={item.name} rarity={item.rarity} kind={kind} ink={item.ink} />
              <span className="offer-copy">
                <span className="tile-name">{item.name}</span>
                <span className="tile-sub">
                  {item.number}
                  {item.rarity ? ` · ${rarityLabel(item.rarity)}` : ""}
                </span>
                {kind && <span className="tile-sub">{kind}</span>}
                {showCondition &&
                  "condition" in item &&
                  (item.condition ? (
                    <span className="badge condition">{item.condition}</span>
                  ) : (
                    <span className="muted small">Not set</span>
                  ))}
              </span>
            </li>
          );
        })}
      </ul>
      {items.length > limit && (
        <button type="button" className="link" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Show fewer" : `Show all ${items.length} cards`}
        </button>
      )}
    </div>
  );
}
