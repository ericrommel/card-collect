import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, searchCatalog, type CatalogSearchHit } from "../lib/api";
import { rarityLabel } from "../lib/labels";
import { CardFace } from "./CardFace";

function ownedLabel(count: number): string {
  if (count <= 0) return "Missing";
  if (count === 1) return "Owned";
  return `${count} copies`;
}

export function CardSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogSearchHit[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

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
      <p className="muted small">Search the sample catalog. A result says whether you have that card.</p>
      {searching && <p className="muted small">Searching…</p>}
      {error && <p className="error small">{error}</p>}
      {results && results.length === 0 && !searching && <p className="muted">No cards match.</p>}
      {results && results.length > 0 && (
        <ul className="search-results">
          {results.map((hit) => (
            <li key={hit.id}>
              <Link className="search-hit" to={`/sets/${hit.set.id}?q=${encodeURIComponent(hit.number)}`}>
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
            </li>
          ))}
        </ul>
      )}
      {truncated && <p className="muted small">Showing the first 24 matches. Add more of the name.</p>}
    </section>
  );
}
