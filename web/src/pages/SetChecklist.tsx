import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import * as api from "../lib/api";
import type { Availability, CatalogSet, SetProgress, UserCopy } from "../lib/api";

const AVAILABILITY_OPTIONS: Availability[] = ["KEEP", "TRADE", "SELL", "GIVE_AWAY"];

type Filter = "all" | "owned" | "missing" | "duplicates";

export function SetChecklistPage() {
  const { setId } = useParams<{ setId: string }>();
  const [set, setSet] = useState<CatalogSet | null>(null);
  const [progress, setProgress] = useState<SetProgress | null>(null);
  const [copies, setCopies] = useState<UserCopy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyCollectibleId, setBusyCollectibleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!setId) return;
    setError(null);
    try {
      const [setsRes, progressRes, copiesRes] = await Promise.all([
        api.listSets(),
        api.setProgress(setId),
        api.myCollection(setId),
      ]);
      setSet(setsRes.sets.find((s) => s.id === setId) ?? null);
      setProgress(progressRes);
      setCopies(copiesRes.copies);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load set");
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => {
    load();
  }, [load]);

  const copiesByCollectible = useMemo(() => {
    const map = new Map<string, UserCopy[]>();
    for (const copy of copies) {
      const id = copy.variant.collectible.id;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(copy);
    }
    return map;
  }, [copies]);

  async function handleAdd(collectibleId: string, variantId: string) {
    setBusyCollectibleId(collectibleId);
    try {
      await api.addCopy(variantId, "KEEP");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add copy");
    } finally {
      setBusyCollectibleId(null);
    }
  }

  async function handleAvailabilityChange(collectibleId: string, copyId: string, availability: Availability) {
    setBusyCollectibleId(collectibleId);
    try {
      await api.updateCopy(copyId, { availability });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update copy");
    } finally {
      setBusyCollectibleId(null);
    }
  }

  async function handleRemove(collectibleId: string, copyId: string) {
    setBusyCollectibleId(collectibleId);
    try {
      await api.deleteCopy(copyId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove copy");
    } finally {
      setBusyCollectibleId(null);
    }
  }

  if (loading) return <p className="muted">Loading checklist...</p>;
  if (error) return <p className="error">{error}</p>;
  if (!progress) return <p className="error">Set not found.</p>;

  const visibleEntries = progress.checklist.filter((entry) => {
    if (filter === "owned") return entry.is_owned;
    if (filter === "missing") return !entry.is_owned;
    if (filter === "duplicates") return entry.duplicate_quantity > 0;
    return true;
  });

  return (
    <div>
      <p>
        <Link to="/sets">&larr; All sets</Link>
      </p>
      <div className="page-title-row">
        <h2>{set?.name ?? "Set"}</h2>
        {setId && (
          <Link to={`/sets/${setId}/matches`} className="secondary">
            View matches
          </Link>
        )}
      </div>

      <div className="progress-summary card">
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${progress.completion_percentage}%` }} />
        </div>
        <div className="progress-stats">
          <span>
            <strong>{progress.completion_percentage}%</strong> complete
          </span>
          <span>{progress.owned_count} owned</span>
          <span>{progress.missing_count} missing</span>
          <span>{progress.duplicate_count} duplicates</span>
          <span>{progress.total_count} total</span>
        </div>
      </div>

      <div className="filters">
        {(["all", "owned", "missing", "duplicates"] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? "tab active" : "tab"} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="checklist">
        {visibleEntries.map((entry) => {
          const collectible = entry.collectible;
          const myCopies = copiesByCollectible.get(collectible.id) ?? [];
          const defaultVariant = collectible.variants.find((v) => v.isDefault) ?? collectible.variants[0];
          const busy = busyCollectibleId === collectible.id;

          return (
            <div key={collectible.id} className={"checklist-row" + (entry.is_owned ? "" : " missing")}>
              <div className="checklist-main">
                <span className="card-number">{collectible.number}</span>
                <span className="card-name">{collectible.name}</span>
                {collectible.rarity && <span className="badge small">{collectible.rarity}</span>}
                {entry.duplicate_quantity > 0 && (
                  <span className="badge dup">+{entry.duplicate_quantity} duplicate</span>
                )}
              </div>

              <div className="checklist-copies">
                {myCopies.map((copy) => (
                  <div key={copy.id} className="copy-row">
                    <select
                      value={copy.availability}
                      disabled={busy}
                      onChange={(e) =>
                        handleAvailabilityChange(collectible.id, copy.id, e.target.value as Availability)
                      }
                    >
                      {AVAILABILITY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <button
                      className="link-danger"
                      disabled={busy}
                      onClick={() => handleRemove(collectible.id, copy.id)}
                    >
                      remove
                    </button>
                  </div>
                ))}
                {defaultVariant && (
                  <button
                    className="secondary small"
                    disabled={busy}
                    onClick={() => handleAdd(collectible.id, defaultVariant.id)}
                  >
                    + Add copy
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
