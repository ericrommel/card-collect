import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import * as api from "../lib/api";
import { ApiError } from "../lib/api";
import type { PublicCollectibleRef, PublicDuplicateRef, PublicShareView } from "../lib/api";

function CardList({ items }: { items: PublicCollectibleRef[] }) {
  if (items.length === 0) return <p className="muted small">None</p>;
  return (
    <ul className="offer-list">
      {items.map((item) => (
        <li key={item.number}>
          <span className="card-number">{item.number}</span> {item.name}
          {item.rarity && <span className="badge small">{item.rarity}</span>}
        </li>
      ))}
    </ul>
  );
}

function DuplicateList({ items }: { items: PublicDuplicateRef[] }) {
  if (items.length === 0) return <p className="muted small">None</p>;
  return (
    <ul className="offer-list">
      {items.map((item) => (
        <li key={item.number}>
          <span className="card-number">{item.number}</span> {item.name}
          <span className="badge dup small">+{item.duplicate_quantity}</span>
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
    <div>
      <div className="card public-header">
        <span className="badge">{view.set.name}</span>
        <h1>{view.collector.display_name}'s collection</h1>
        <p className="muted">
          {view.set.name} ({view.set.code}) — {view.set.total_count} cards in this set
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
            <h3>Owned</h3>
            <CardList items={view.owned} />
          </div>
        )}
        {view.missing && (
          <div className="card">
            <h3>Missing</h3>
            <CardList items={view.missing} />
          </div>
        )}
        {view.duplicates && (
          <div className="card">
            <h3>Duplicates</h3>
            <DuplicateList items={view.duplicates} />
          </div>
        )}
        {view.trade_offers && (
          <div className="card">
            <h3>Available for trade</h3>
            <CardList items={view.trade_offers} />
          </div>
        )}
        {view.give_away_offers && (
          <div className="card">
            <h3>Available to give away</h3>
            <CardList items={view.give_away_offers} />
          </div>
        )}
      </div>
    </div>
  );
}
