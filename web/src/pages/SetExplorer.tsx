import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CardDetail } from "../components/CardDetail";
import { CardFace, inkFromMetadata } from "../components/CardFace";
import { SharingPanel } from "../components/SharingPanel";
import * as api from "../lib/api";
import type { Availability, CatalogSet, ConditionGrade, SetProgress, Universe, UserCopy } from "../lib/api";
import { BULK_CHUNK, CONDITION_GRADES } from "../lib/api";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  applyExplorerQuery,
  defaultVariant,
  metadataFacets,
  readExplorerView,
  writeExplorerView,
  type AvailabilityFilter,
  type ConditionFilter,
  type ExplorerEntry,
  type ExplorerFilters,
  type ExplorerSort,
  type ExplorerView,
  type OwnershipFilter,
} from "../lib/explorerQuery";
import { AVAILABILITY_LABEL, AVAILABILITY_OPTIONS, rarityLabel, titleCaseKey } from "../lib/labels";

const OWNERSHIP: { id: OwnershipFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "owned", label: "Owned" },
  { id: "missing", label: "Missing" },
  { id: "duplicates", label: "Duplicates" },
];

const AVAILABILITY_FILTERS: { id: AvailabilityFilter; label: string }[] = [
  { id: "any", label: "Any availability" },
  { id: "keep", label: "Keep" },
  { id: "trade", label: "For trade" },
  { id: "sell", label: "For sale" },
  { id: "donation", label: "Donation" },
];

function TileBadges({ entry }: { entry: ExplorerEntry }) {
  const offered = [...new Set(entry.copies.map((copy) => copy.availability))].filter((value) => value !== "KEEP");
  return (
    <span className="tile-badges">
      {!entry.isOwned && <span className="badge missing">Missing</span>}
      {entry.isOwned && entry.duplicateQuantity === 0 && <span className="badge owned">Owned</span>}
      {entry.duplicateQuantity > 0 && <span className="badge dup">×{entry.ownedQuantity}</span>}
      {entry.copies.some((copy) => copy.reserved) && <span className="badge reserved">In exchange</span>}
      {offered.map((value) => (
        <span key={value} className={`badge avail avail-${value}`}>
          {AVAILABILITY_LABEL[value]}
        </span>
      ))}
    </span>
  );
}

export function SetExplorerPage() {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const [setInfo, setSetInfo] = useState<CatalogSet | null>(null);
  const [allSets, setAllSets] = useState<CatalogSet[]>([]);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [progress, setProgress] = useState<SetProgress | null>(null);
  const [copies, setCopies] = useState<UserCopy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<ExplorerFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<ExplorerView>(readExplorerView);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "refresh") => {
      if (!setId) return;
      if (mode === "initial") setLoading(true);
      try {
        const [setsRes, universesRes, progressRes, copiesRes] = await Promise.all([
          api.listSets(),
          api.listUniverses(),
          api.setProgress(setId),
          api.myCollection(setId),
        ]);
        setAllSets(setsRes.sets);
        setUniverses(universesRes.universes);
        setSetInfo(setsRes.sets.find((set) => set.id === setId) ?? null);
        setProgress(progressRes);
        setCopies(copiesRes.copies);
        setLoadError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load this set";
        if (mode === "initial") setLoadError(message);
        else setActionError(message);
      } finally {
        if (mode === "initial") setLoading(false);
      }
    },
    [setId],
  );

  useEffect(() => {
    setFilters(EMPTY_FILTERS);
    setSelected(new Set());
    setSelecting(false);
    setFocusId(null);
    setStatus(null);
    setActionError(null);
    void load("initial");
  }, [load]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selecting) {
        setSelecting(false);
        setSelected(new Set());
      } else {
        setFocusId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  const copiesByCollectible = useMemo(() => {
    const map = new Map<string, UserCopy[]>();
    for (const copy of copies) {
      const id = copy.variant.collectible.id;
      const list = map.get(id);
      if (list) list.push(copy);
      else map.set(id, [copy]);
    }
    return map;
  }, [copies]);

  const entries = useMemo<ExplorerEntry[]>(() => {
    if (!progress) return [];
    return progress.checklist.map((item) => ({
      collectible: item.collectible,
      ownedQuantity: item.owned_quantity,
      duplicateQuantity: item.duplicate_quantity,
      isOwned: item.is_owned,
      copies: copiesByCollectible.get(item.collectible.id) ?? [],
    }));
  }, [progress, copiesByCollectible]);

  const visible = useMemo(() => applyExplorerQuery(entries, filters), [entries, filters]);
  const facets = useMemo(() => metadataFacets(entries), [entries]);
  const rarities = useMemo(() => {
    const values = [
      ...new Set(entries.map((entry) => entry.collectible.rarity).filter((value): value is string => !!value)),
    ];
    return values.sort((a, b) => a.localeCompare(b));
  }, [entries]);
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.collectible.id, entry])), [entries]);
  const selectedEntries = entries.filter((entry) => selected.has(entry.collectible.id));
  const focusEntry = focusId ? (entryById.get(focusId) ?? null) : null;

  let detailMode: "single" | "compare" | "bulk" | null = null;
  let detailEntries: ExplorerEntry[] = [];
  if (selecting && selectedEntries.length === 2) {
    detailMode = "compare";
    detailEntries = selectedEntries;
  } else if (selecting && selectedEntries.length === 1) {
    detailMode = "single";
    detailEntries = selectedEntries;
  } else if (!selecting && focusEntry) {
    detailMode = "single";
    detailEntries = [focusEntry];
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await task();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update your collection");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onTile(entry: ExplorerEntry) {
    if (selecting) toggleSelected(entry.collectible.id);
    else setFocusId(entry.collectible.id);
  }

  function freeCopyIds(): string[] {
    const ids: string[] = [];
    for (const entry of selectedEntries) {
      for (const copy of entry.copies) {
        if (!copy.reserved) ids.push(copy.id);
      }
    }
    return ids;
  }

  async function markOwned() {
    const ids = [...selected];
    if (!setId || ids.length === 0) return;
    await run(async () => {
      let created = 0;
      let skipped = 0;
      for (let index = 0; index < ids.length; index += BULK_CHUNK) {
        const result = await api.bulkCreateCopies(setId, {
          collectible_ids: ids.slice(index, index + BULK_CHUNK),
          mode: "ensure_one",
        });
        created += result.created_count;
        skipped += result.skipped_count;
      }
      setStatus(
        created === 0 ? "Those cards were already owned." : `Added ${created} ${created === 1 ? "card" : "cards"}.`,
      );
      if (skipped > 0 && created > 0) setStatus(`Added ${created}. ${skipped} already owned.`);
      setSelected(new Set());
    });
  }

  async function addAnother() {
    const ids = [...selected];
    if (!setId || ids.length === 0) return;
    await run(async () => {
      let created = 0;
      for (let index = 0; index < ids.length; index += BULK_CHUNK) {
        const result = await api.bulkCreateCopies(setId, {
          collectible_ids: ids.slice(index, index + BULK_CHUNK),
          mode: "add",
        });
        created += result.created_count;
      }
      setStatus(`Added ${created} ${created === 1 ? "copy" : "copies"}.`);
      setSelected(new Set());
    });
  }

  async function addOne(entry: ExplorerEntry) {
    const variant = defaultVariant(entry.collectible);
    if (!variant) return;
    await run(async () => {
      await api.addCopy(variant.id, "KEEP");
      setStatus(`Added ${entry.collectible.name}.`);
    });
  }

  async function setAvailability(availability: Availability) {
    const ids = freeCopyIds();
    if (ids.length === 0) {
      setActionError("Those copies are in an exchange, or you don't own them yet.");
      return;
    }
    await run(async () => {
      let updated = 0;
      for (let index = 0; index < ids.length; index += BULK_CHUNK) {
        const result = await api.bulkUpdateCopies({
          copy_ids: ids.slice(index, index + BULK_CHUNK),
          availability,
        });
        updated += result.updated_count;
      }
      setStatus(`Updated ${updated} ${updated === 1 ? "copy" : "copies"} to ${AVAILABILITY_LABEL[availability]}.`);
    });
  }

  async function setCondition(condition: ConditionGrade | null) {
    const ids = freeCopyIds();
    if (ids.length === 0) {
      setActionError("Those copies are in an exchange, or you don't own them yet.");
      return;
    }
    await run(async () => {
      let updated = 0;
      for (let index = 0; index < ids.length; index += BULK_CHUNK) {
        const result = await api.bulkUpdateCopies({
          copy_ids: ids.slice(index, index + BULK_CHUNK),
          condition,
        });
        updated += result.updated_count;
      }
      setStatus(
        condition ? `Set condition to ${condition} on ${updated} copies.` : `Cleared condition on ${updated} copies.`,
      );
    });
  }

  async function removeSelected() {
    const ids = freeCopyIds();
    if (ids.length === 0) {
      setActionError("Nothing to remove. Copies in an exchange stay where they are.");
      return;
    }
    const label = ids.length === 1 ? "1 copy" : `${ids.length} copies`;
    if (!window.confirm(`Remove ${label}? Cards in an open exchange are left as they are.`)) return;
    await run(async () => {
      let deleted = 0;
      for (let index = 0; index < ids.length; index += BULK_CHUNK) {
        const result = await api.bulkDeleteCopies(ids.slice(index, index + BULK_CHUNK));
        deleted += result.deleted_count;
      }
      setStatus(`Removed ${deleted} ${deleted === 1 ? "copy" : "copies"}.`);
      setSelected(new Set());
    });
  }

  function changeView(next: ExplorerView) {
    setView(next);
    writeExplorerView(next);
  }

  if (!setId) return <p className="error">Set not found.</p>;
  if (loading) return <p className="muted">Loading collection…</p>;
  if (loadError) return <p className="error">{loadError}</p>;
  if (!progress) return <p className="error">Set not found.</p>;

  const notice = universes.find((universe) => universe.id === setInfo?.universeId)?.notice;
  const filterCount = activeFilterCount(filters);
  const visibleIds = visible.map((entry) => entry.collectible.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  return (
    <div className={`explorer ${detailMode ? "has-detail" : ""} ${detailMode === "compare" ? "is-compare" : ""}`}>
      <div className="explorer-main page-stack">
        <div className="explorer-heading">
          <div>
            <p className="eyebrow">
              <Link to="/">Home</Link>
              <span aria-hidden="true"> / </span>
              {universes.find((universe) => universe.id === setInfo?.universeId)?.name}
            </p>
            <h1>{setInfo?.name ?? "Set"}</h1>
            <p className="muted small">{setInfo?.code}</p>
          </div>
          <div className="heading-actions">
            <label className="set-switcher">
              <span className="sr-only">Switch set</span>
              <select value={setId} onChange={(event) => navigate(`/sets/${event.target.value}`)}>
                {universes.map((universe) => (
                  <optgroup key={universe.id} label={universe.name}>
                    {allSets
                      .filter((set) => set.universeId === universe.id)
                      .map((set) => (
                        <option key={set.id} value={set.id}>
                          {set.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <Link to={`/sets/${setId}/add`} className="primary">
              Add cards
            </Link>
            <Link to={`/sets/${setId}/matches`} className="secondary">
              Matches
            </Link>
          </div>
        </div>

        {notice && <p className="notice-line">{notice}</p>}

        <section className="card progress-summary">
          <div
            className="progress-bar-track"
            role="progressbar"
            aria-valuenow={progress.completion_percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${progress.completion_percentage} percent complete`}
          >
            <div className="progress-bar-fill" style={{ width: `${progress.completion_percentage}%` }} />
          </div>
          <div className="progress-stats">
            <span>
              <strong>{progress.completion_percentage}%</strong> complete
            </span>
            <span>{progress.owned_count} owned</span>
            <span>{progress.missing_count} missing</span>
            <span>{progress.duplicate_count} extras</span>
            <span>{progress.total_count} in the set</span>
          </div>
          {progress.owned_count === 0 && (
            <p className="small">
              Select the cards you own, then choose Mark owned. Open Matches to see donations without adding anything
              yet.
            </p>
          )}
        </section>

        <details className="share-disclosure">
          <summary>Share this collection</summary>
          <SharingPanel setId={setId} />
        </details>

        <div className="explorer-toolbar">
          <label className="search-field">
            <span className="sr-only">Search cards</span>
            <input
              type="search"
              value={filters.search}
              placeholder="Search name or number"
              autoComplete="off"
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            />
          </label>
          <button
            type="button"
            className={filtersOpen ? "secondary is-on" : "secondary"}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filter{filterCount > 0 ? ` (${filterCount})` : ""}
          </button>
          <label className="sort-field">
            <span className="sr-only">Sort</span>
            <select
              value={filters.sort}
              onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as ExplorerSort }))}
            >
              <option value="number">Number</option>
              <option value="name">Name</option>
              <option value="rarity">Rarity</option>
              <option value="missing">Missing first</option>
              <option value="owned">Most copies</option>
              <option value="duplicates">Duplicates</option>
            </select>
          </label>
          <div className="segmented view-toggle" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === "grid"} onClick={() => changeView("grid")}>
              Grid
            </button>
            <button type="button" aria-pressed={view === "list"} onClick={() => changeView("list")}>
              List
            </button>
          </div>
          <button
            type="button"
            className={selecting ? "secondary is-on" : "secondary"}
            aria-pressed={selecting}
            onClick={() => {
              setSelecting((current) => !current);
              setSelected(new Set());
              if (!selecting) setFocusId(null);
            }}
          >
            Select
          </button>
        </div>

        {filtersOpen && (
          <div className="filter-panel">
            <fieldset>
              <legend>Ownership</legend>
              <div className="chip-row">
                {OWNERSHIP.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="chip"
                    aria-pressed={filters.ownership === option.id}
                    onClick={() => setFilters((current) => ({ ...current, ownership: option.id }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Availability</legend>
              <div className="chip-row">
                {AVAILABILITY_FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="chip"
                    aria-pressed={filters.availability === option.id}
                    onClick={() => setFilters((current) => ({ ...current, availability: option.id }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            {rarities.length > 0 && (
              <fieldset>
                <legend>Rarity</legend>
                <div className="chip-row">
                  {rarities.map((rarity) => (
                    <button
                      key={rarity}
                      type="button"
                      className="chip"
                      aria-pressed={filters.rarities.includes(rarity)}
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          rarities: current.rarities.includes(rarity)
                            ? current.rarities.filter((value) => value !== rarity)
                            : [...current.rarities, rarity],
                        }))
                      }
                    >
                      {rarityLabel(rarity)}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset>
              <legend>Condition</legend>
              <div className="chip-row">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={filters.condition === "any"}
                  onClick={() => setFilters((current) => ({ ...current, condition: "any" }))}
                >
                  Any
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={filters.condition === "unset"}
                  onClick={() => setFilters((current) => ({ ...current, condition: "unset" }))}
                >
                  Not set
                </button>
                {CONDITION_GRADES.map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    className="chip"
                    aria-pressed={filters.condition === grade}
                    onClick={() => setFilters((current) => ({ ...current, condition: grade as ConditionFilter }))}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </fieldset>
            {facets.map((facet) => (
              <fieldset key={facet.key}>
                <legend>{titleCaseKey(facet.key)}</legend>
                <div className="chip-row">
                  {facet.values.map((value) => {
                    const on = (filters.metadata[facet.key] ?? []).includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        className="chip"
                        aria-pressed={on}
                        onClick={() =>
                          setFilters((current) => {
                            const selectedValues = new Set(current.metadata[facet.key] ?? []);
                            if (selectedValues.has(value)) selectedValues.delete(value);
                            else selectedValues.add(value);
                            return {
                              ...current,
                              metadata: { ...current.metadata, [facet.key]: [...selectedValues] },
                            };
                          })
                        }
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {filterCount > 0 && (
              <button
                type="button"
                className="link"
                onClick={() =>
                  setFilters((current) => ({ ...EMPTY_FILTERS, search: current.search, sort: current.sort }))
                }
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="result-row">
          <p role="status" className="muted small">
            {visible.length} of {entries.length} cards
            {status ? ` · ${status}` : ""}
          </p>
          {selecting && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setSelected((current) => {
                  const next = new Set(current);
                  if (allVisibleSelected) {
                    for (const id of visibleIds) next.delete(id);
                  } else {
                    for (const id of visibleIds) next.add(id);
                  }
                  return next;
                });
              }}
            >
              {allVisibleSelected ? "Unselect visible" : "Select visible"}
            </button>
          )}
        </div>
        {actionError && <p className="error">{actionError}</p>}

        {visible.length === 0 ? (
          <div className="card empty-state">
            <p>No cards match.</p>
            <button type="button" className="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear search and filters
            </button>
          </div>
        ) : view === "grid" ? (
          <div className="card-grid">
            {visible.map((entry) => {
              const isSelected = selected.has(entry.collectible.id);
              return (
                <div
                  key={entry.collectible.id}
                  className={`card-tile ${entry.isOwned ? "is-owned" : "is-missing"} ${isSelected ? "is-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="tile-open"
                    aria-pressed={selecting ? isSelected : undefined}
                    onClick={() => onTile(entry)}
                  >
                    <CardFace
                      number={entry.collectible.number}
                      name={entry.collectible.name}
                      rarity={entry.collectible.rarity}
                      ink={inkFromMetadata(entry.collectible.metadata)}
                    />
                    <span className="tile-name">{entry.collectible.name}</span>
                    <span className="tile-sub">
                      {entry.collectible.number}
                      {entry.collectible.rarity ? ` · ${rarityLabel(entry.collectible.rarity)}` : ""}
                    </span>
                    <TileBadges entry={entry} />
                  </button>
                  {!entry.isOwned && !selecting && (
                    <button
                      type="button"
                      className="tile-add"
                      disabled={busy}
                      aria-label={`Add ${entry.collectible.name}`}
                      onClick={() => void addOne(entry)}
                    >
                      Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card-list">
            {visible.map((entry) => {
              const isSelected = selected.has(entry.collectible.id);
              return (
                <div key={entry.collectible.id} className={`card-row ${isSelected ? "is-selected" : ""}`}>
                  <button
                    type="button"
                    className="row-open"
                    aria-pressed={selecting ? isSelected : undefined}
                    onClick={() => onTile(entry)}
                  >
                    <CardFace
                      size="sm"
                      number={entry.collectible.number}
                      name={entry.collectible.name}
                      rarity={entry.collectible.rarity}
                      ink={inkFromMetadata(entry.collectible.metadata)}
                    />
                    <span className="row-copy">
                      <span className="tile-name">{entry.collectible.name}</span>
                      <span className="tile-sub">
                        {entry.collectible.number}
                        {entry.collectible.rarity ? ` · ${rarityLabel(entry.collectible.rarity)}` : ""}
                      </span>
                      <TileBadges entry={entry} />
                    </span>
                  </button>
                  {!entry.isOwned && !selecting && (
                    <button
                      type="button"
                      className="secondary small"
                      disabled={busy}
                      aria-label={`Add ${entry.collectible.name}`}
                      onClick={() => void addOne(entry)}
                    >
                      Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {selecting && selected.size > 0 && (
          <div className="bulk-bar">
            <strong>{selected.size} selected</strong>
            <button type="button" className="primary small" disabled={busy} onClick={() => void markOwned()}>
              Mark owned
            </button>
            <button type="button" className="secondary small" disabled={busy} onClick={() => void addAnother()}>
              Add a copy
            </button>
            <label>
              Availability
              <select
                aria-label="Set availability for selected copies"
                defaultValue=""
                disabled={busy}
                onChange={(event) => {
                  const value = event.target.value as Availability;
                  event.target.value = "";
                  if (value) void setAvailability(value);
                }}
              >
                <option value="">Choose</option>
                {AVAILABILITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {AVAILABILITY_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Condition
              <select
                aria-label="Set condition for selected copies"
                defaultValue=""
                disabled={busy}
                onChange={(event) => {
                  const value = event.target.value;
                  event.target.value = "";
                  if (value === "clear") void setCondition(null);
                  else if (value) void setCondition(value as ConditionGrade);
                }}
              >
                <option value="">Choose</option>
                <option value="clear">Clear condition</option>
                {CONDITION_GRADES.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="link-danger" disabled={busy} onClick={() => void removeSelected()}>
              Remove copies
            </button>
            <button type="button" className="link" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        )}
      </div>

      {detailMode && (
        <>
          <button
            type="button"
            className="detail-backdrop"
            aria-label="Close card details"
            onClick={() => {
              if (selecting) {
                setSelecting(false);
                setSelected(new Set());
              } else setFocusId(null);
            }}
          />
          <CardDetail
            entries={detailEntries}
            mode={detailMode}
            selectedCount={selected.size}
            busy={busy}
            onClose={() => {
              if (selecting) {
                setSelecting(false);
                setSelected(new Set());
              } else setFocusId(null);
            }}
            onAdd={(variantId) =>
              void run(async () => {
                await api.addCopy(variantId, "KEEP");
                setStatus("Added a copy.");
              })
            }
            onAvailability={(copyId, availability) =>
              void run(async () => {
                await api.updateCopy(copyId, { availability });
                setStatus(`Availability set to ${AVAILABILITY_LABEL[availability]}.`);
              })
            }
            onCondition={(copyId, condition) =>
              void run(async () => {
                await api.updateCopy(copyId, { condition });
                setStatus(condition ? `Condition set to ${condition}.` : "Condition cleared.");
              })
            }
            onRemove={(copyId) => {
              const copy = copies.find((item) => item.id === copyId);
              const name = copy?.variant.collectible.name ?? "this card";
              if (!window.confirm(`Remove this copy of ${name}?`)) return;
              void run(async () => {
                await api.deleteCopy(copyId);
                setStatus("Removed a copy.");
              });
            }}
          />
        </>
      )}
    </div>
  );
}
