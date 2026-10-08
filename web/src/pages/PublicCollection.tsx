import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CardFace } from "../components/CardFace";
import * as api from "../lib/api";
import { cardMotif } from "../lib/cardMotif";
import { rarityLabel } from "../lib/labels";
import { ApiError } from "../lib/api";
import type { PublicCollectibleRef, PublicShareView } from "../lib/api";
import {
  defaultPublicSection,
  publicCardsMatching,
  publicSections,
  type PublicSectionId,
} from "../lib/publicShareBrowse";

function PublicGrid({ items }: { items: (PublicCollectibleRef & { duplicate_quantity?: number })[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="public-grid">
      {items.map((item) => (
        <li key={`${item.number}-${item.name}`}>
          <CardFace
            size="sm"
            number={item.number}
            name={item.name}
            rarity={item.rarity}
            kind={item.kind}
            ink={item.ink}
          />
          <span className="public-copy">
            <span className="tile-name">{item.name}</span>
            <span className="tile-sub">
              {item.number}
              {item.rarity ? ` · ${rarityLabel(item.rarity)}` : ""}
            </span>
            {cardMotif(item.kind) && <span className="tile-sub">{cardMotif(item.kind)}</span>}
            {item.duplicate_quantity ? <span className="badge dup">+{item.duplicate_quantity} extra</span> : null}
          </span>
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

function countLabel(shown: number, total: number, query: string): string {
  if (query.trim()) return `${shown} of ${total}`;
  return `${total} ${total === 1 ? "card" : "cards"}`;
}

function PublicBrowser({ view }: { view: PublicShareView }) {
  const sections = useMemo(() => publicSections(view), [view]);
  const [activeId, setActiveId] = useState<PublicSectionId | null>(() => defaultPublicSection(sections));
  const [query, setQuery] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const active = sections.find((section) => section.id === activeId) ?? sections[0] ?? null;
  const shown = active ? publicCardsMatching(active.items, query) : [];
  const elsewhere = active
    ? sections
        .filter((section) => section.id !== active.id)
        .map((section) => ({
          id: section.id,
          title: section.title,
          count: publicCardsMatching(section.items, query).length,
        }))
        .filter((section) => section.count > 0)
    : [];

  function selectSection(id: PublicSectionId) {
    setActiveId(id);
    sectionRef.current?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="page-stack public-page">
      <p className="eyebrow">
        <Link to="/login">Cards Collect</Link>
      </p>
      <div className="card public-header">
        <span className="badge">{view.set.code}</span>
        <h1>{view.collector.display_name}'s collection</h1>
        <p className="muted">
          {view.set.name} · {view.set.total_count} cards. Read-only. This page does not show an email, a location,
          photos, or a card's condition.
        </p>
        {view.completion_percentage !== undefined && (
          <div className="public-progress">
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
      </div>

      {active ? (
        <>
          <div className="public-tools">
            <label className="search-field">
              <span className="sr-only">Search shared cards</span>
              <input
                type="search"
                value={query}
                placeholder="Search name or number"
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="chip-row" role="group" aria-label="Shared lists">
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className="chip"
                  aria-pressed={section.id === active.id}
                  onClick={() => selectSection(section.id)}
                >
                  {section.title} ({section.items.length})
                </button>
              ))}
            </div>
          </div>
          <section className="card public-section" ref={sectionRef} aria-labelledby="public-section-title">
            <h2 id="public-section-title">{active.title}</h2>
            <p role="status" className="muted small">
              {countLabel(shown.length, active.items.length, query)}
            </p>
            {query.trim() && elsewhere.length > 0 && (
              <div className="public-also">
                <span className="small">Also in</span>
                {elsewhere.map((hit) => (
                  <button key={hit.id} type="button" className="chip" onClick={() => selectSection(hit.id)}>
                    {hit.title} ({hit.count})
                  </button>
                ))}
              </div>
            )}
            {shown.length === 0 ? (
              <p className="muted">{query.trim() ? "No cards match in this list." : "Nothing shared here."}</p>
            ) : (
              <PublicGrid items={shown} />
            )}
          </section>
        </>
      ) : (
        <p className="muted">No individual cards are shared on this link.</p>
      )}
    </div>
  );
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

  return <PublicBrowser view={view} />;
}
