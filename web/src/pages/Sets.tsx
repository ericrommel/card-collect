import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../lib/api";
import type { CatalogSet, Universe } from "../lib/api";

export function SetsPage() {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [sets, setSets] = useState<CatalogSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listUniverses(), api.listSets()])
      .then(([u, s]) => {
        setUniverses(u.universes);
        setSets(s.sets);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const universeName = (id: string) => universes.find((u) => u.id === id)?.name ?? "Unknown universe";

  if (loading) return <p className="muted">Loading sets...</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <div>
      <h2>Available Sets</h2>
      <div className="grid">
        {sets.map((set) => (
          <Link key={set.id} to={`/sets/${set.id}`} className="card set-card">
            <span className="badge">{universeName(set.universeId)}</span>
            <h3>{set.name}</h3>
            <p className="muted">{set.code}</p>
            {set.releaseDate && <p className="muted small">Released {new Date(set.releaseDate).toLocaleDateString()}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
