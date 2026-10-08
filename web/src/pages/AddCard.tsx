import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CardFace, inkFromMetadata } from "../components/CardFace";
import { kindFromMetadata } from "../lib/cardMotif";
import {
  ApiError,
  addCopy,
  identifyPhoto,
  listSets,
  listUniverses,
  setProgress as loadSetProgress,
  uploadCopyPhoto,
  type Availability,
  type CatalogSet,
  type ConditionGrade,
  type IdentifyResponse,
  type SetProgress,
  type Universe,
  CONDITION_GRADES,
} from "../lib/api";
import { defaultVariant } from "../lib/explorerQuery";
import { AVAILABILITY_LABEL, AVAILABILITY_OPTIONS, rarityLabel } from "../lib/labels";

const RESULT_LIMIT = 24;

export function AddCardPage() {
  const { setId = "" } = useParams();
  const [params] = useSearchParams();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sets, setSets] = useState<CatalogSet[]>([]);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [progress, setProgressData] = useState<SetProgress | null>(null);
  const [query, setQuery] = useState(params.get("number") ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>("KEEP");
  const [condition, setCondition] = useState<ConditionGrade | "">("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [identify, setIdentify] = useState<IdentifyResponse | null>(null);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listUniverses(), listSets(), loadSetProgress(setId)])
      .then(([universeRes, setRes, progressRes]) => {
        if (cancelled) return;
        setUniverses(universeRes.universes);
        setSets(setRes.sets);
        setProgressData(progressRes);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "The set could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setId]);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const setInfo = sets.find((set) => set.id === setId);
  const universe = universes.find((item) => item.id === setInfo?.universeId);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!progress || needle.length === 0) return [];
    return progress.checklist
      .filter((entry) => {
        const meta = JSON.stringify(entry.collectible.metadata ?? "").toLowerCase();
        return (
          entry.collectible.name.toLowerCase().includes(needle) ||
          entry.collectible.number.toLowerCase().includes(needle) ||
          meta.includes(needle)
        );
      })
      .slice(0, RESULT_LIMIT);
  }, [progress, query]);

  const selected = progress?.checklist.find((entry) => entry.collectible.id === selectedId) ?? null;

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhoto(file);
    setIdentify(null);
    setIdentifyError(null);
    setStatus(null);
    setError(null);
    try {
      const result = await identifyPhoto(file);
      setIdentify(result);
      const match = result.candidates.find((candidate) =>
        progress?.checklist.some((entry) => entry.collectible.number === candidate.number),
      );
      if (match) {
        const entry = progress?.checklist.find((item) => item.collectible.number === match.number);
        if (entry) {
          setQuery(match.number);
          setSelectedId(entry.collectible.id);
        }
      }
    } catch (err) {
      setIdentifyError(err instanceof ApiError ? err.message : "The photo could not be checked.");
    }
  }

  async function addSelected() {
    if (!selected) return;
    const variant = defaultVariant(selected.collectible);
    if (!variant) {
      setError("This card has no printable version to add.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const created = await addCopy(variant.id, availability, condition || null);
      if (photo) {
        try {
          await uploadCopyPhoto(created.copy.id, "front", photo);
        } catch (err) {
          setStatus(
            `Added ${selected.collectible.name}, but the photo was not saved. ${err instanceof ApiError ? err.message : ""}`.trim(),
          );
          setPhoto(null);
          setIdentify(null);
          setSelectedId(null);
          setProgressData(await loadSetProgress(setId));
          return;
        }
      }
      setStatus(`Added ${selected.collectible.name}.`);
      setPhoto(null);
      setIdentify(null);
      setSelectedId(null);
      setProgressData(await loadSetProgress(setId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The copy was not added.");
    } finally {
      setBusy(false);
    }
  }

  if (!setId) return <p className="error">Set not found.</p>;

  return (
    <div className="page-stack add-card-page">
      <div className="explorer-heading">
        <div>
          <p className="eyebrow">
            <Link to={`/sets/${setId}`}>{setInfo?.name ?? "Set"}</Link>
          </p>
          <h1>Add a card</h1>
          <p className="muted">
            {universe?.name ? `${universe.name}. ` : ""}
            Search by name or number. A photo is optional, and you confirm the card before it is added.
          </p>
        </div>
      </div>

      {loading && <p className="muted">Loading set…</p>}

      <div className="add-layout">
        <div className="page-stack">
          <section className="card add-search">
            <label>
              Search this set
              <input
                type="search"
                value={query}
                autoFocus
                placeholder="Name, number, or detail"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="photo-actions">
              <button type="button" className="primary" onClick={() => cameraRef.current?.click()}>
                Take a photo
              </button>
              <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
                Choose a photo
              </button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void onPhoto(file);
                }}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void onPhoto(file);
                }}
              />
            </div>
            <p className="muted small">Adding many cards is faster from the set page, where you can select a group.</p>
          </section>

          {preview && (
            <section className="card">
              <img src={preview} alt="Photo you selected" className="add-preview" />
              {identify && (
                <p className={identify.status === "candidates" ? "notice-line" : "muted"}>{identify.message}</p>
              )}
              {identifyError && <p className="error">{identifyError}</p>}
              {identify?.candidates.map((candidate) => {
                const here = progress?.checklist.some((entry) => entry.collectible.number === candidate.number);
                const other = sets.find((set) => set.code === candidate.set_code && set.id !== setId);
                return (
                  <div key={`${candidate.set_code}-${candidate.number}`} className="guess-row">
                    <p>
                      <strong>{candidate.name}</strong>
                      <span className="muted">
                        {" "}
                        {candidate.set_code} {candidate.number} · {Math.round(candidate.confidence * 100)}% guess
                      </span>
                    </p>
                    {here ? (
                      <button
                        type="button"
                        className="secondary small"
                        onClick={() => {
                          const entry = progress?.checklist.find(
                            (item) => item.collectible.number === candidate.number,
                          );
                          if (!entry) return;
                          setQuery(candidate.number);
                          setSelectedId(entry.collectible.id);
                        }}
                      >
                        Use this card
                      </button>
                    ) : other ? (
                      <Link to={`/sets/${other.id}/add?number=${encodeURIComponent(candidate.number)}`}>
                        Look in {other.name}
                      </Link>
                    ) : (
                      <p className="muted small">Not in the sets on this account.</p>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          <ul className="add-results">
            {query.trim().length === 0 && <li className="muted">Type a name or number to see cards.</li>}
            {query.trim().length > 0 && results.length === 0 && !loading && <li className="muted">No cards match.</li>}
            {results.map((entry) => {
              const active = entry.collectible.id === selectedId;
              return (
                <li key={entry.collectible.id}>
                  <button
                    type="button"
                    className={active ? "add-result is-selected" : "add-result"}
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(entry.collectible.id);
                      setStatus(null);
                      setError(null);
                    }}
                  >
                    <CardFace
                      size="sm"
                      number={entry.collectible.number}
                      name={entry.collectible.name}
                      rarity={entry.collectible.rarity}
                      ink={inkFromMetadata(entry.collectible.metadata)}
                      kind={kindFromMetadata(entry.collectible.metadata)}
                    />
                    <span className="row-copy">
                      <strong>{entry.collectible.name}</strong>
                      <span className="muted small">
                        {entry.collectible.number}
                        {entry.collectible.rarity ? ` · ${rarityLabel(entry.collectible.rarity)}` : ""}
                        {kindFromMetadata(entry.collectible.metadata)
                          ? ` · ${kindFromMetadata(entry.collectible.metadata)}`
                          : ""}
                        {entry.is_owned ? ` · You have ${entry.owned_quantity}` : " · Missing"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {progress && query.trim().length > 0 && results.length === RESULT_LIMIT && (
            <p className="muted small">Showing the first {RESULT_LIMIT} matches. Keep typing to narrow the list.</p>
          )}
        </div>

        <section className={selected ? "card add-confirm" : "card add-confirm is-idle"} aria-live="polite">
          {!selected && <p className="muted">Select a card, then add one physical copy.</p>}
          {selected && (
            <>
              <CardFace
                number={selected.collectible.number}
                name={selected.collectible.name}
                rarity={selected.collectible.rarity}
                ink={inkFromMetadata(selected.collectible.metadata)}
                kind={kindFromMetadata(selected.collectible.metadata)}
              />
              <h2>{selected.collectible.name}</h2>
              <p className="muted small">
                {selected.collectible.number}
                {selected.is_owned ? ` · You already have ${selected.owned_quantity}` : " · You do not have this yet"}
              </p>
              <div className="segmented" role="group" aria-label="Availability">
                {AVAILABILITY_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={availability === option}
                    onClick={() => setAvailability(option)}
                  >
                    {AVAILABILITY_LABEL[option]}
                  </button>
                ))}
              </div>
              <label className="condition-field">
                Condition
                <select value={condition} onChange={(event) => setCondition(event.target.value as ConditionGrade | "")}>
                  <option value="">Not set</option>
                  {CONDITION_GRADES.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="primary" disabled={busy} onClick={() => void addSelected()}>
                {busy ? "Adding…" : "Add this copy"}
              </button>
              <p className="muted small">
                Condition is your note, not a grade, and it does not change the match score.
                {photo ? " The photo is saved only on your account." : ""}
              </p>
            </>
          )}
          {status && <p className="notice-line">{status}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </div>
    </div>
  );
}
