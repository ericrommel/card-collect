import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CardFace } from "../components/CardFace";
import { OptionalBackPhoto } from "../components/OptionalBackPhoto";
import { cardMotif } from "../lib/cardMotif";
import { saveCopyPhotos } from "../lib/saveCopyPhotos";
import {
  ApiError,
  addCopy,
  identifyPhoto,
  searchCatalog,
  type Availability,
  type CatalogSearchHit,
  type ConditionGrade,
  type IdentifyCandidate,
  type IdentifyResponse,
  CONDITION_GRADES,
} from "../lib/api";
import { AVAILABILITY_LABEL, AVAILABILITY_OPTIONS, rarityLabel } from "../lib/labels";

function ownedLine(count: number | undefined): string {
  if (count === undefined) return "";
  if (count <= 0) return " · Missing";
  if (count === 1) return " · You have 1";
  return ` · You have ${count}`;
}

export function AddCopyPage() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLElement>(null);
  const pendingPick = useRef<{ setCode: string; number: string } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogSearchHit[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CatalogSearchHit | null>(null);
  const [availability, setAvailability] = useState<Availability>("KEEP");
  const [condition, setCondition] = useState<ConditionGrade | "">("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [backPhoto, setBackPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [identify, setIdentify] = useState<IdentifyResponse | null>(null);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ name: string; setId: string; setName: string; number: string } | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setTruncated(false);
      setSearching(false);
      setSelected(null);
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
          const pending = pendingPick.current;
          if (pending) {
            pendingPick.current = null;
            const hit = res.results.find((item) => item.set.code === pending.setCode && item.number === pending.number);
            setSelected(hit ?? null);
            if (!hit) setError("That guess is not in this catalog. Search for the card yourself.");
            return;
          }
          setSelected((current) => (current ? (res.results.find((item) => item.id === current.id) ?? null) : null));
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

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!selected) return;
    confirmRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected, identify, identifyError]);

  function choose(hit: CatalogSearchHit) {
    pendingPick.current = null;
    setSelected(hit);
    setAdded(null);
    setPhotoNote(null);
    setError(null);
  }

  function applyCandidate(candidate: IdentifyCandidate) {
    const hit = results?.find((item) => item.set.code === candidate.set_code && item.number === candidate.number);
    setAdded(null);
    setPhotoNote(null);
    setError(null);
    if (hit) {
      pendingPick.current = null;
      setSelected(hit);
      setQuery(candidate.number);
      return;
    }
    if (query.trim() === candidate.number) {
      pendingPick.current = null;
      setSelected(null);
      setError("That guess is not in this catalog. Search for the card yourself.");
      return;
    }
    pendingPick.current = { setCode: candidate.set_code, number: candidate.number };
    setSelected(null);
    setQuery(candidate.number);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhoto(file);
    setBackPhoto(null);
    setIdentify(null);
    setIdentifyError(null);
    setPhotoNote(null);
    setError(null);
    try {
      setIdentify(await identifyPhoto(file));
    } catch (err) {
      setIdentifyError(err instanceof ApiError ? err.message : "The photo could not be checked.");
    }
  }

  function clearPhoto() {
    setPhoto(null);
    setBackPhoto(null);
    setIdentify(null);
    setIdentifyError(null);
  }

  async function addSelected() {
    if (!selected || !selected.defaultVariantId || busy) return;
    const variantId = selected.defaultVariantId;
    setBusy(true);
    setError(null);
    setPhotoNote(null);
    const hit = selected;
    try {
      const created = await addCopy(variantId, availability, condition || null);
      const photoProblem = await saveCopyPhotos(created.copy.id, { front: photo, back: backPhoto });
      if (photoProblem) setPhotoNote(`Added ${hit.name}. ${photoProblem}`);
      setAdded({ name: hit.name, setId: hit.set.id, setName: hit.set.name, number: hit.number });
      setResults(
        (current) =>
          current?.map((item) =>
            item.id === hit.id ? { ...item, owned_quantity: (item.owned_quantity ?? 0) + 1 } : item,
          ) ?? null,
      );
      setSelected(null);
      setCondition("");
      clearPhoto();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The copy was not added.");
    } finally {
      setBusy(false);
    }
  }

  const needle = query.trim();

  return (
    <div className="page-stack add-card-page">
      <div className="explorer-heading">
        <div>
          <p className="eyebrow">Your collection</p>
          <h1>Add a card</h1>
          <p className="muted">
            Search the catalog, or take a photo. You confirm the card before it is saved. Marking many cards at once is
            faster on the set page.
          </p>
        </div>
      </div>

      <div className="add-layout">
        <div className="page-stack">
          <section className="card add-search">
            <label>
              Find a card
              <input
                type="search"
                value={query}
                placeholder="Name, number, or set"
                onChange={(event) => {
                  pendingPick.current = null;
                  setSelected(null);
                  setQuery(event.target.value);
                }}
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
          </section>

          {preview && (
            <section className="card">
              <div className="add-photo-pair">
                <figure className="add-photo-figure">
                  <img src={preview} alt="Front of the card you selected" className="add-preview" />
                  <figcaption className="muted small">Front</figcaption>
                </figure>
                <OptionalBackPhoto file={backPhoto} onChange={setBackPhoto} />
              </div>
              {!selected && identify && (
                <p className={identify.status === "candidates" ? "notice-line" : "muted"}>{identify.message}</p>
              )}
              {!selected && identifyError && <p className="error">{identifyError}</p>}
              {identify?.candidates.map((candidate) => (
                <div key={`${candidate.set_code}-${candidate.number}`} className="guess-row">
                  <p>
                    <strong>{candidate.name}</strong>
                    <span className="muted">
                      {" "}
                      {candidate.set_code} {candidate.number} · {Math.round(candidate.confidence * 100)}% guess
                    </span>
                  </p>
                  <button type="button" className="secondary small" onClick={() => applyCandidate(candidate)}>
                    Use this card
                  </button>
                </div>
              ))}
              <button type="button" className="secondary" onClick={clearPhoto}>
                Remove photo
              </button>
            </section>
          )}

          {searching && <p className="muted small">Searching…</p>}
          <ul className="add-results">
            {needle.length === 0 && <li className="muted">Type a name or number to see cards.</li>}
            {needle.length === 1 && <li className="muted">Type at least two letters.</li>}
            {needle.length > 1 && results?.length === 0 && !searching && <li className="muted">No cards match.</li>}
            {results?.map((hit) => {
              const active = hit.id === selected?.id;
              return (
                <li key={hit.id}>
                  <button
                    type="button"
                    className={active ? "add-result is-selected" : "add-result"}
                    aria-pressed={active}
                    onClick={() => choose(hit)}
                  >
                    <CardFace
                      size="sm"
                      number={hit.number}
                      name={hit.name}
                      rarity={hit.rarity}
                      kind={hit.kind}
                      ink={hit.ink}
                    />
                    <span className="row-copy">
                      <strong>{hit.name}</strong>
                      <span className="muted small">
                        {hit.set.code} {hit.number}
                        {hit.rarity ? ` · ${rarityLabel(hit.rarity)}` : ""}
                        {cardMotif(hit.kind) ? ` · ${cardMotif(hit.kind)}` : ""}
                        {ownedLine(hit.owned_quantity)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {truncated && <p className="muted small">Showing the first 24 matches. Add more of the name.</p>}
        </div>

        <section
          ref={confirmRef}
          className={selected ? "card add-confirm add-confirm-inline" : "card add-confirm add-confirm-inline is-idle"}
          aria-live="polite"
        >
          {!selected && <p className="muted">Select a card, then add one physical copy.</p>}
          {selected && (
            <>
              <CardFace
                number={selected.number}
                name={selected.name}
                rarity={selected.rarity}
                kind={selected.kind}
                ink={selected.ink}
              />
              <h2>{selected.name}</h2>
              <p className="muted small">
                {selected.set.code} {selected.number} · {selected.set.name}
                {ownedLine(selected.owned_quantity)}
              </p>
              <Link to={`/sets/${selected.set.id}?q=${encodeURIComponent(selected.number)}`}>
                Open {selected.set.name}
              </Link>
              {photo && !identify && !identifyError && <p className="muted small">Checking the photo…</p>}
              {identify && (
                <p className={identify.status === "candidates" ? "notice-line" : "muted small"}>{identify.message}</p>
              )}
              {identifyError && <p className="error small">{identifyError}</p>}
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
              <button
                type="button"
                className="primary"
                disabled={busy || !selected.defaultVariantId}
                onClick={() => void addSelected()}
              >
                {busy ? "Adding…" : "Add this copy"}
              </button>
              {!selected.defaultVariantId && <p className="error small">This card has no printing to add.</p>}
              <p className="muted small">
                Condition is your note, not a grade, and it does not change the match score.
                {photo || backPhoto ? " Photos stay on your account." : ""}
              </p>
            </>
          )}
          {added && (
            <p className="notice-line">
              Added {added.name}.{" "}
              <Link to={`/sets/${added.setId}?q=${encodeURIComponent(added.number)}`}>See it in {added.setName}</Link>
            </p>
          )}
          {photoNote && <p className="notice-line">{photoNote}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </div>
    </div>
  );
}
