import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CardDetail } from "../components/CardDetail";
import { inkFromMetadata } from "../components/CardFace";
import { kindFromMetadata } from "../lib/cardMotif";
import { OwnedFace } from "../components/OwnedFace";
import { SharingPanel } from "../components/SharingPanel";
import * as api from "../lib/api";
import type { Availability, CatalogSet, ConditionGrade, SetProgress, Universe, UserCopy } from "../lib/api";
import { BULK_CHUNK, CONDITION_GRADES } from "../lib/api";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  applyExplorerQuery,
  defaultVariant,
  explorerLead,
  filtersFromSearchParams,
  metadataFacets,
  readExplorerView,
  searchParamsFromFilters,
  writeExplorerView,
  type AvailabilityFilter,
  type ConditionFilter,
  type ExplorerEntry,
  type ExplorerFilters,
  type ExplorerSort,
  type ExplorerView,
  type OwnershipFilter,
} from "../lib/explorerQuery";
import { conditionSummary } from "../lib/conditionSummary";
import { bulkAvailabilityConfirm, bulkConditionConfirm } from "../lib/bulkConfirm";
import { duplicateOfferConfirm, duplicateOfferStatus, planDuplicateOffers } from "../lib/duplicateOffers";
import { explorerDetail } from "../lib/explorerDetail";
import { toggleVisibleSelection } from "../lib/explorerSelection";
import { liftShift } from "../lib/liftAboveBar";
import { useNarrowViewport } from "../lib/useNarrowViewport";
import { AVAILABILITY_LABEL, AVAILABILITY_OPTIONS, rarityLabel, titleCaseKey } from "../lib/labels";

const OWNERSHIP: { id: OwnershipFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "owned", label: "Owned" },
  { id: "missing", label: "Missing" },
  { id: "duplicates", label: "Extras" },
];

const AVAILABILITY_FILTERS: { id: AvailabilityFilter; label: string }[] = [
  { id: "any", label: "Any availability" },
  { id: "keep", label: "Keep" },
  { id: "trade", label: "For trade" },
  { id: "sell", label: "For sale" },
  { id: "donation", label: "Donation" },
];

/** The phone navigation, or the bottom of the window when that bar is hidden. */
function viewportBottom(): number {
  const nav = document.querySelector(".bottom-nav");
  if (nav instanceof HTMLElement && getComputedStyle(nav).display !== "none") {
    return nav.getBoundingClientRect().top;
  }
  return window.innerHeight;
}

/** Put the result count just under the tools when a search moved it off screen. */
function revealResults(root: HTMLElement) {
  const toolbar = root.querySelector(".explorer-toolbar");
  const target = root.querySelector<HTMLElement>(".result-row");
  if (!toolbar || !target) return;
  const topLimit = toolbar.getBoundingClientRect().bottom + 8;
  const rect = target.getBoundingClientRect();
  if (rect.top >= topLimit && rect.bottom <= viewportBottom() - 8) return;
  window.scrollBy({ top: rect.top - topLimit, behavior: "auto" });
}

/** Bring one selected card fully above the phone bar the first time that bar appears. */
function revealSelectedCard(root: HTMLElement, collectibleId: string) {
  const card = root.querySelector<HTMLElement>(`[data-collectible-id="${CSS.escape(collectibleId)}"]`);
  if (!card) return;
  const barTop = root.querySelector(".bulk-bar")?.getBoundingClientRect().top ?? window.innerHeight;
  const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  const toolsBottom = root.querySelector(".explorer-toolbar")?.getBoundingClientRect().bottom ?? headerBottom;
  const rect = card.getBoundingClientRect();
  if (rect.top >= Math.max(headerBottom, toolsBottom) + 4 && rect.bottom <= barTop - 8 && rect.bottom > rect.top)
    return;
  card.scrollIntoView({ block: "center", inline: "nearest" });
}

/** Move the selected card's name and number above the bar when More makes that bar taller. */
function liftSelectedCard(root: HTMLElement, collectibleId: string) {
  const card = root.querySelector<HTMLElement>(`[data-collectible-id="${CSS.escape(collectibleId)}"]`);
  const barTop = root.querySelector(".bulk-bar")?.getBoundingClientRect().top;
  if (!card || barTop == null) return;
  const name = card.querySelector<HTMLElement>(".tile-name");
  const subs = [...card.querySelectorAll<HTMLElement>(".tile-sub")];
  const topEl = name ?? card;
  const bottomEl = subs.at(-1) ?? name ?? card;
  const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  const toolsBottom = root.querySelector(".explorer-toolbar")?.getBoundingClientRect().bottom ?? headerBottom;
  const shift = liftShift(
    { top: topEl.getBoundingClientRect().top, bottom: bottomEl.getBoundingClientRect().bottom },
    barTop,
    Math.max(headerBottom, toolsBottom) + 4,
  );
  if (shift > 0) window.scrollBy({ top: shift, behavior: "auto" });
}

function TileSubtitle({ entry }: { entry: ExplorerEntry }) {
  const kind = kindFromMetadata(entry.collectible.metadata);
  return (
    <>
      <span className="tile-sub">
        {entry.collectible.number}
        {entry.collectible.rarity ? ` · ${rarityLabel(entry.collectible.rarity)}` : ""}
      </span>
      {kind && <span className="tile-sub">{kind}</span>}
    </>
  );
}

function TileBadges({ entry }: { entry: ExplorerEntry }) {
  const offered = [...new Set(entry.copies.map((copy) => copy.availability))].filter((value) => value !== "KEEP");
  const condition = conditionSummary(entry.copies.map((copy) => copy.condition));
  return (
    <span className="tile-badges">
      {!entry.isOwned && <span className="badge missing">Missing</span>}
      {entry.isOwned && entry.duplicateQuantity === 0 && <span className="badge owned">Owned</span>}
      {entry.duplicateQuantity > 0 && <span className="badge dup">×{entry.ownedQuantity}</span>}
      {condition && <span className="badge condition">{condition}</span>}
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
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromSearchParams(params), [params]);

  function setFilters(update: ExplorerFilters | ((current: ExplorerFilters) => ExplorerFilters)) {
    const next = typeof update === "function" ? update(filters) : update;
    const query = searchParamsFromFilters(next);
    if (query.toString() !== params.toString()) setParams(query, { replace: true });
  }

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<ExplorerView>(readExplorerView);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [inspect, setInspect] = useState(false);
  const [bulkMore, setBulkMore] = useState(false);
  const [photoRevision, setPhotoRevision] = useState(0);
  const narrow = useNarrowViewport();
  const resultsRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const pinnedSelection = useRef(false);
  const liftedForMore = useRef(false);
  const skipSearchReveal = useRef(true);

  useEffect(() => {
    if (!filtersOpen) return;
    filterPanelRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [filtersOpen]);

  useEffect(() => {
    if (skipSearchReveal.current) {
      skipSearchReveal.current = false;
      return;
    }
    const root = resultsRef.current;
    if (!root) return;
    revealResults(root);
  }, [filters.search]);

  useEffect(() => {
    if (selected.size === 0) setBulkMore(false);
  }, [selected.size]);

  useEffect(() => {
    if (selected.size === 0) {
      pinnedSelection.current = false;
      return;
    }
    if (pinnedSelection.current) return;
    pinnedSelection.current = true;
    const collectibleId = selected.values().next().value;
    const root = resultsRef.current;
    if (!collectibleId || !root) return;
    if (narrow) revealSelectedCard(root, collectibleId);
    else liftSelectedCard(root, collectibleId);
  }, [narrow, selected]);

  useEffect(() => {
    if (!narrow || !bulkMore || selected.size === 0) {
      liftedForMore.current = false;
      return;
    }
    if (liftedForMore.current) return;
    liftedForMore.current = true;
    const collectibleId = selected.values().next().value;
    const root = resultsRef.current;
    if (!collectibleId || !root) return;
    liftSelectedCard(root, collectibleId);
  }, [narrow, bulkMore, selected]);

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
    setSelected(new Set());
    setSelecting(false);
    setInspect(false);
    setFocusId(null);
    setStatus(null);
    setActionError(null);
    void load("initial");
  }, [load]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selecting && narrow && inspect) {
        setInspect(false);
        return;
      }
      if (selecting) {
        setSelecting(false);
        setSelected(new Set());
        setInspect(false);
      } else {
        setFocusId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting, narrow, inspect]);

  useEffect(() => {
    if (selected.size !== 1 && selected.size !== 2) setInspect(false);
  }, [selected.size]);

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

  const detail = explorerDetail({
    selecting,
    narrow,
    inspect,
    selected: selectedEntries,
    focus: focusEntry,
  });

  function closeDetail() {
    if (!selecting) {
      setFocusId(null);
      return;
    }
    if (narrow) {
      setInspect(false);
      return;
    }
    setInspect(false);
    setSelecting(false);
    setSelected(new Set());
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

  async function offerDuplicates() {
    const plan = planDuplicateOffers(selectedEntries.map((entry) => entry.copies));
    if (plan.cards === 0) {
      setActionError(
        "Those cards don't have a free duplicate. Add a copy, or open one card to offer the copy you have.",
      );
      return;
    }
    if (!window.confirm(duplicateOfferConfirm(plan))) return;
    await run(async () => {
      const batches: { ids: string[]; availability: Availability }[] = [
        { ids: plan.keepIds, availability: "KEEP" },
        { ids: plan.offerIds, availability: "TRADE" },
      ];
      for (const batch of batches) {
        for (let index = 0; index < batch.ids.length; index += BULK_CHUNK) {
          await api.bulkUpdateCopies({
            copy_ids: batch.ids.slice(index, index + BULK_CHUNK),
            availability: batch.availability,
          });
        }
      }
      setStatus(duplicateOfferStatus(plan));
    });
  }

  async function setAvailability(availability: Availability) {
    const ids = freeCopyIds();
    if (ids.length === 0) {
      setActionError("Those copies are in an exchange, or you don't own them yet.");
      return;
    }
    if (!window.confirm(bulkAvailabilityConfirm(ids.length, AVAILABILITY_LABEL[availability]))) return;
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
    if (!window.confirm(bulkConditionConfirm(ids.length, condition))) return;
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
  const progressNarrowed =
    filters.availability !== "any" ||
    filters.rarities.length > 0 ||
    filters.condition !== "any" ||
    Object.values(filters.metadata).some((values) => values.length > 0);
  const progressList = progressNarrowed ? null : filters.ownership;

  function showProgressList(next: OwnershipFilter) {
    setFilters((current) => ({
      ...current,
      ownership: progressList === next ? "all" : next,
      availability: "any",
      rarities: [],
      condition: "any",
      metadata: {},
    }));
  }
  const lead = explorerLead(filters);
  const visibleIds = visible.map((entry) => entry.collectible.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  return (
    <div className={`explorer ${detail ? "has-detail" : ""} ${detail?.mode === "compare" ? "is-compare" : ""}`}>
      <div className="explorer-main page-stack" ref={resultsRef}>
        <div className="explorer-heading">
          <div>
            <p className="eyebrow">
              <Link to="/">Home</Link>
              <span aria-hidden="true"> / </span>
              {universes.find((universe) => universe.id === setInfo?.universeId)?.name}
            </p>
            <h1>{setInfo?.name ?? "Set"}</h1>
            <p className="set-code">{setInfo?.code}</p>
          </div>
          <div className="heading-actions">
            <label className="set-switcher">
              <span className="sr-only">Switch set</span>
              <select
                value={setId}
                onChange={(event) => {
                  const next = searchParamsFromFilters({ ...filters, search: "" });
                  const query = next.toString();
                  navigate(query ? `/sets/${event.target.value}?${query}` : `/sets/${event.target.value}`);
                }}
              >
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
            <button type="button" aria-pressed={progressList === "owned"} onClick={() => showProgressList("owned")}>
              {progress.owned_count} owned
            </button>
            <button type="button" aria-pressed={progressList === "missing"} onClick={() => showProgressList("missing")}>
              {progress.missing_count} missing
            </button>
            <button
              type="button"
              aria-pressed={progressList === "duplicates"}
              onClick={() => showProgressList("duplicates")}
            >
              {progress.duplicate_count} extras
            </button>
            <button type="button" aria-pressed={progressList === "all"} onClick={() => showProgressList("all")}>
              {progress.total_count} in the set
            </button>
          </div>
          {progress.owned_count === 0 && (
            <p className="small">
              Choose Select these, then Mark owned. Open Matches to see donations without adding anything yet.
            </p>
          )}
        </section>

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
              <option value="duplicates">Extras</option>
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
              setInspect(false);
              if (!selecting) setFocusId(null);
            }}
          >
            Select
          </button>
        </div>

        {filtersOpen && (
          <div className="filter-panel" ref={filterPanelRef}>
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

        {lead && (
          <p className="notice-line" role="status">
            {lead}{" "}
            <button
              type="button"
              className="link"
              onClick={() =>
                setFilters((current) => ({ ...EMPTY_FILTERS, search: current.search, sort: current.sort }))
              }
            >
              Show all cards
            </button>
          </p>
        )}

        <div className="result-row">
          <details className="share-disclosure">
            <summary>
              Share<span className="share-long"> this collection</span>
            </summary>
            <SharingPanel setId={setId} />
          </details>
          <p role="status" className="muted small">
            {visible.length} of {entries.length} cards
            {status ? ` · ${status}` : ""}
          </p>
          {visible.length > 0 && (
            <button
              type="button"
              className="link"
              aria-label={
                !selecting
                  ? "Select these cards"
                  : allVisibleSelected
                    ? "Unselect visible cards"
                    : "Select visible cards"
              }
              onClick={() => {
                if (!selecting) {
                  setSelecting(true);
                  setInspect(false);
                  setFocusId(null);
                }
                setSelected((current) => toggleVisibleSelection(selecting ? current : [], visibleIds));
              }}
            >
              {!selecting ? "Select these" : allVisibleSelected ? "Unselect visible" : "Select visible"}
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
                  data-collectible-id={entry.collectible.id}
                >
                  <button
                    type="button"
                    className="tile-open"
                    aria-pressed={selecting ? isSelected : undefined}
                    onClick={() => onTile(entry)}
                  >
                    <OwnedFace
                      number={entry.collectible.number}
                      name={entry.collectible.name}
                      rarity={entry.collectible.rarity}
                      ink={inkFromMetadata(entry.collectible.metadata)}
                      kind={kindFromMetadata(entry.collectible.metadata)}
                      copies={entry.copies}
                      photoRevision={photoRevision}
                    />
                    <span className="tile-name">{entry.collectible.name}</span>
                    <TileSubtitle entry={entry} />
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
                <div
                  key={entry.collectible.id}
                  className={`card-row ${isSelected ? "is-selected" : ""}`}
                  data-collectible-id={entry.collectible.id}
                >
                  <button
                    type="button"
                    className="row-open"
                    aria-pressed={selecting ? isSelected : undefined}
                    onClick={() => onTile(entry)}
                  >
                    <OwnedFace
                      size="sm"
                      number={entry.collectible.number}
                      name={entry.collectible.name}
                      rarity={entry.collectible.rarity}
                      ink={inkFromMetadata(entry.collectible.metadata)}
                      kind={kindFromMetadata(entry.collectible.metadata)}
                      copies={entry.copies}
                      photoRevision={photoRevision}
                    />
                    <span className="row-copy">
                      <span className="tile-name">{entry.collectible.name}</span>
                      <TileSubtitle entry={entry} />
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
            <div className="bulk-primary">
              <strong>{selected.size} selected</strong>
              {narrow && selected.size === 1 && (
                <button type="button" className="secondary small" onClick={() => setInspect(true)}>
                  Details
                </button>
              )}
              {narrow && selected.size === 2 && (
                <button type="button" className="secondary small" onClick={() => setInspect(true)}>
                  Compare
                </button>
              )}
              <button type="button" className="primary small" disabled={busy} onClick={() => void markOwned()}>
                Mark owned
              </button>
              {narrow && (
                <button
                  type="button"
                  className="secondary small"
                  aria-expanded={bulkMore}
                  onClick={() => setBulkMore((open) => !open)}
                >
                  {bulkMore ? "Less" : "More"}
                </button>
              )}
            </div>
            {(!narrow || bulkMore) && (
              <div className="bulk-extra">
                <button type="button" className="secondary small" disabled={busy} onClick={() => void addAnother()}>
                  Add a copy
                </button>
                <button
                  type="button"
                  className="secondary small"
                  disabled={busy}
                  onClick={() => void offerDuplicates()}
                >
                  Offer duplicates
                </button>
                <label>
                  All copies
                  <select
                    aria-label="Set availability for every free copy of the selected cards"
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
        )}
      </div>

      {detail && (
        <>
          <button type="button" className="detail-backdrop" aria-label="Close card details" onClick={closeDetail} />
          <CardDetail
            entries={detail.entries}
            mode={detail.mode}
            modal={narrow}
            selectedCount={selected.size}
            busy={busy}
            onClose={closeDetail}
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
            onPhotosChange={(event) => {
              if (event === "saved") setPhotoRevision((current) => current + 1);
              void load("refresh");
            }}
          />
        </>
      )}
    </div>
  );
}
