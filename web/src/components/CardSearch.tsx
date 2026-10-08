import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, addCopy, searchCatalog, type CatalogSearchHit } from "../lib/api";
import { rarityLabel } from "../lib/labels";
import { CardFace } from "./CardFace";

function ownedLabel(count: number): string {
  if (count <= 0) return "Missing";
  if (count === 1) return "Owned";
  return `${count} copies`;
}

export function CardSearch({ onAdded }: { onAdded?: () => void | Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogSearchHit[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const resultsRef = useRef<HTMLUListElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const resultKey = results?.map((hit) => hit.id).join("|") ?? "";
  const feedback = error ?? (results && results.length === 0 && !searching ? "empty" : "");

  useEffect(() => {
    const hit = resultsRef.current?.querySelector(".search-hit");
    const target = feedbackRef.current ?? hit;
    // The bottom nav covers the page, so a result can be in the viewport and still be hidden.
    if (target instanceof HTMLElement) target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [resultKey, feedback]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setTruncated(false);
      setError(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchCatalog(q)
        .then((res) => {
          if (cancelled) return;
          setResults(res.results);
          setTruncated(res.truncated);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof ApiError ? err.message : "The catalog could not be searched.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  async function addOne(hit: CatalogSearchHit) {
    if (!hit.defaultVariantId || addingId) return;
    setAddingId(hit.id);
    setError(null);
    try {
      await addCopy(hit.defaultVariantId, "KEEP");
      setResults(
        (current) =>
          current?.map((item) =>
            item.id === hit.id ? { ...item, owned_quantity: (item.owned_quantity ?? 0) + 1 } : item,
          ) ?? null,
      );
      await onAdded?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that card.");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <section className="card card-search">
      <label>
        Find a card
        <input
          type="search"
          value={query}
          placeholder="Name, number, or set"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <p className="muted small">
        Search the sample catalog. A result says whether you have that card. Add a copy without opening the set.
      </p>
      {searching && <p className="muted small">Searching…</p>}
      {error && (
        <p ref={feedbackRef} className="error small search-feedback">
          {error}
        </p>
      )}
      {results && results.length === 0 && !searching && (
        <p ref={feedbackRef} className="muted search-feedback">
          No cards match.
        </p>
      )}
      {results && results.length > 0 && (
        <ul ref={resultsRef} className="search-results">
          {results.map((hit) => (
            <li key={hit.id} className="search-hit">
              <Link className="search-hit-open" to={`/sets/${hit.set.id}?q=${encodeURIComponent(hit.number)}`}>
                <CardFace size="sm" number={hit.number} name={hit.name} rarity={hit.rarity} />
                <span className="row-copy">
                  <span className="search-hit-title">
                    <strong>{hit.name}</strong>
                    {hit.owned_quantity !== undefined && (
                      <span className={hit.owned_quantity > 0 ? "badge owned" : "badge missing"}>
                        {ownedLabel(hit.owned_quantity)}
                      </span>
                    )}
                  </span>
                  <span className="muted small">
                    {hit.set.code} {hit.number}
                    {hit.rarity ? ` · ${rarityLabel(hit.rarity)}` : ""} · {hit.set.name}
                  </span>
                </span>
              </Link>
              {hit.owned_quantity !== undefined && hit.defaultVariantId && (
                <button
                  type="button"
                  className="secondary"
                  disabled={addingId === hit.id}
                  aria-label={hit.owned_quantity > 0 ? `Add another copy of ${hit.name}` : `Add a copy of ${hit.name}`}
                  onClick={() => void addOne(hit)}
                >
                  {addingId === hit.id ? "Adding…" : hit.owned_quantity > 0 ? "Add another" : "Add a copy"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {truncated && <p className="muted small">Showing the first 24 matches. Add more of the name.</p>}
    </section>
  );
}
