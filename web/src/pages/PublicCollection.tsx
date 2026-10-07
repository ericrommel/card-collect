import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CardFace } from "../components/CardFace";
import * as api from "../lib/api";
import { rarityLabel } from "../lib/labels";
import { ApiError } from "../lib/api";
import type { PublicCollectibleRef, PublicShareView } from "../lib/api";

function PublicGrid({ items }: { items: (PublicCollectibleRef & { duplicate_quantity?: number })[] }) {
  if (items.length === 0) return <p className="muted small">None</p>;
  return (
    <ul className="public-grid">
      {items.map((item) => (
        <li key={`${item.number}-${item.name}`}>
          <CardFace size="sm" number={item.number} name={item.name} rarity={item.rarity} />
          <span className="tile-name">{item.name}</span>
          <span className="tile-sub">
            {item.number}
            {item.rarity ? ` · ${rarityLabel(item.rarity)}` : ""}
          </span>
          {item.duplicate_quantity ? <span className="badge dup">+{item.duplicate_quantity} extra</span> : null}
        </li>
      ))}
    </ul>
  );
}

// Public share links should not be indexed or crawled — this is opt-in
// sharing between people who already have the link, not a public listing.
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);
}

export function PublicCollectionPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [view, setView] = useState<PublicShareView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useNoIndex();

  useEffect(() => {
    if (!shareId) return;
    api
      .getPublicCollection(shareId)
      .then(setView)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load this collection");
        }
      })
      .finally(() => setLoading(false));
  }, [shareId]);

  if (loading) return <p className="muted">Loading...</p>;

  if (notFound) {
    return (
      <div className="card auth-card">
        <h1>Not available</h1>
        <p className="muted">This collection isn't shared, or the link has been revoked.</p>
      </div>
    );
  }

  if (error || !view) {
    return <p className="error">{error ?? "Something went wrong."}</p>;
  }

  return (
    <div className="page-stack">
      <p className="eyebrow">
        <Link to="/login">Cards Collect</Link>
      </p>
      <div className="card public-header">
        <span className="badge">{view.set.code}</span>
        <h1>{view.collector.display_name}'s collection</h1>
        <p className="muted">
          {view.set.name} · {view.set.total_count} cards. This page is read-only and shows only what they chose to
          share.
        </p>
      </div>

      {view.completion_percentage !== undefined && (
        <div className="card progress-summary">
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${view.completion_percentage}%` }} />
          </div>
          <div className="progress-stats">
            <span>
              <strong>{view.completion_percentage}%</strong> complete
            </span>
          </div>
        </div>
      )}

      <div className="public-sections">
        {view.owned && (
          <div className="card">
            <h3>Owned ({view.owned.length})</h3>
            <PublicGrid items={view.owned} />
          </div>
        )}
        {view.missing && (
          <div className="card">
            <h3>Missing ({view.missing.length})</h3>
            <PublicGrid items={view.missing} />
          </div>
        )}
        {view.duplicates && (
          <div className="card">
            <h3>Duplicates ({view.duplicates.length})</h3>
            <PublicGrid items={view.duplicates} />
          </div>
        )}
        {view.trade_offers && (
          <div className="card">
            <h3>For trade ({view.trade_offers.length})</h3>
            <PublicGrid items={view.trade_offers} />
          </div>
        )}
        {view.give_away_offers && (
          <div className="card">
            <h3>Donations ({view.give_away_offers.length})</h3>
            <PublicGrid items={view.give_away_offers} />
          </div>
        )}
      </div>
    </div>
  );
}
