import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CardFace } from "../components/CardFace";
import {
  AvailabilityFields,
  WrittenIdentityFields,
  draftFromCard,
  identityBody,
  writtenMatchLine,
  type WrittenDraft,
} from "../components/WriteCardForm";
import {
  ApiError,
  CONDITION_GRADES,
  addWrittenCopy,
  correctWrittenCard,
  deleteWrittenCopy,
  listWrittenCards,
  updateWrittenCopy,
  writtenConflict,
  type Availability,
  type ConditionGrade,
  type WrittenCard,
  type WrittenConflict,
  type WrittenCopy,
  type WrittenList,
} from "../lib/api";
import { AVAILABILITY_LABEL } from "../lib/labels";
import { writtenCountSentence } from "../lib/writtenCount";

function copyLine(copy: WrittenCopy): string {
  const condition = copy.condition ?? "Condition not set";
  const printing = copy.printing ? ` · ${copy.printing}` : "";
  return `${AVAILABILITY_LABEL[copy.availability]} · ${condition}${printing}`;
}

function noteMeta(card: WrittenCard): string {
  const number = card.no_number ? "No number on this card" : (card.number ?? "");
  const extras = [card.set_code, card.rarity, card.language].filter(Boolean);
  const tail = extras.length > 0 ? ` · ${extras.join(" · ")}` : "";
  const copies = card.copy_count === 1 ? "1 copy" : `${card.copy_count} copies`;
  return `${card.game} · ${card.set_name} · ${number}${tail} · ${copies}`;
}

function CopyEditor({
  availability,
  condition,
  printing,
  saveLabel,
  busy,
  onCancel,
  onSave,
}: {
  availability: Availability;
  condition: ConditionGrade | "";
  printing: string;
  saveLabel: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (next: { availability: Availability; condition: ConditionGrade | ""; printing: string }) => void;
}) {
  const [nextAvailability, setAvailability] = useState(availability);
  const [nextCondition, setCondition] = useState(condition);
  const [nextPrinting, setPrinting] = useState(printing);

  return (
    <form
      className="form written-copy-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ availability: nextAvailability, condition: nextCondition, printing: nextPrinting });
      }}
    >
      <AvailabilityFields
        availability={nextAvailability}
        condition={nextCondition}
        onAvailability={setAvailability}
        onCondition={setCondition}
      />
      <label>
        Printing or finish, optional
        <input
          type="text"
          value={nextPrinting}
          maxLength={40}
          autoComplete="off"
          onChange={(event) => setPrinting(event.target.value)}
        />
      </label>
      <p className="muted small">Printing is for this copy only.</p>
      <div className="written-actions">
        <button type="submit" className="primary written-save" disabled={busy}>
          {busy ? "Saving…" : saveLabel}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CorrectNote({
  card,
  busy,
  error,
  clash,
  onCancel,
  onSave,
  onAddCopyOf,
}: {
  card: WrittenCard;
  busy: boolean;
  error: string | null;
  clash: WrittenConflict | null;
  onCancel: () => void;
  onSave: (draft: WrittenDraft) => void;
  onAddCopyOf: (cardId: string) => void;
}) {
  const [draft, setDraft] = useState(() => draftFromCard(card));

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (clash) return;
        onSave(draft);
      }}
    >
      <WrittenIdentityFields draft={draft} onChange={setDraft} includePrinting={false} locked={clash !== null} />
      <p className="muted small">This changes your note only. It does not change anyone else's cards.</p>
      {error && <p className="error">{error}</p>}
      {clash && (
        <div className="written-conflict" role="status">
          <p>{clash.message}</p>
          <p className="muted small">This note was not changed.</p>
          {clash.code === "confirm_same" ? (
            <ul className="written-matches">
              {clash.matches.map((match) => (
                <li key={match.id}>
                  <p>
                    <strong>{match.name}</strong> <span className="muted">{writtenMatchLine(match)}</span>
                  </p>
                  <button type="button" className="primary" disabled={busy} onClick={() => onAddCopyOf(match.id)}>
                    Add a copy
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="written-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => onAddCopyOf(clash.card_id)}>
                Add a copy
              </button>
            </div>
          )}
          <div className="written-actions">
            <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {!clash && (
        <div className="written-actions">
          <button type="submit" className="primary written-save" disabled={busy}>
            {busy ? "Saving…" : "Save this note"}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

export function WrittenCardsPage() {
  const { hash } = useLocation();
  const [list, setList] = useState<WrittenList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctError, setCorrectError] = useState<string | null>(null);
  const [correctClash, setCorrectClash] = useState<WrittenConflict | null>(null);
  const scrolledHash = useRef<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [editingCopyId, setEditingCopyId] = useState<string | null>(null);

  async function refresh() {
    setList(await listWrittenCards());
  }

  useEffect(() => {
    let cancelled = false;
    listWrittenCards()
      .then((next) => {
        if (!cancelled) setList(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the cards you wrote down.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!list || !hash || scrolledHash.current === hash) return;
    const node = document.getElementById(hash.slice(1));
    if (!node) return;
    node.scrollIntoView({ block: "start" });
    scrolledHash.current = hash;
  }, [list, hash]);

  function closeEditors() {
    setCorrectingId(null);
    setCorrectError(null);
    setCorrectClash(null);
    setAddingId(null);
    setEditingCopyId(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That change was not saved.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCorrection(cardId: string, draft: WrittenDraft) {
    setBusy(true);
    setCorrectError(null);
    setError(null);
    try {
      await correctWrittenCard(cardId, identityBody(draft));
      await refresh();
      setCorrectingId(null);
      setCorrectClash(null);
      setNotice("Saved. This changes your note only. It does not change anyone else's cards.");
    } catch (err) {
      const clash = writtenConflict(err);
      if (clash) {
        setCorrectClash(clash);
        setCorrectError(null);
      } else {
        setCorrectClash(null);
        setCorrectError(err instanceof ApiError ? err.message : "The note was not changed.");
      }
    } finally {
      setBusy(false);
    }
  }

  function removeCopy(card: WrittenCard, copy: WrittenCopy) {
    const last = card.copies.length === 1;
    const question = last
      ? `Remove this copy of ${card.name}? It is the last copy, so the note is removed too.`
      : `Remove this copy of ${card.name}?`;
    if (!window.confirm(question)) return;
    void run(async () => {
      await deleteWrittenCopy(copy.id);
      if (correctingId === card.id && last) closeEditors();
      if (editingCopyId === copy.id) setEditingCopyId(null);
      setNotice(last ? `Removed ${card.name}.` : "Removed that copy.");
    });
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!list) return <p className="error">{error ?? "Could not load the cards you wrote down."}</p>;

  return (
    <div className="page-stack written-page">
      <div>
        <p className="eyebrow">Your collection</p>
        <h1>Cards you wrote down</h1>
        <p className="muted">
          "For trade" and "Donation" on a card you write down are labels for you only. Other people cannot match them.
        </p>
        {list.note_count > 0 && <p>{writtenCountSentence(list.note_count, list.extra_count)}</p>}
      </div>
      {notice && <p className="notice-line">{notice}</p>}
      {error && <p className="error">{error}</p>}
      {list.note_count === 0 ? (
        <div className="card empty-state">
          <p>You have not written a card down yet.</p>
          <Link to="/add">Write down a card the catalog does not have.</Link>
        </div>
      ) : (
        <div className="stack">
          {list.notes.map((card) => (
            <article key={card.id} id={`written-${card.id}`} className="card written-note">
              <div className="written-note-head">
                <CardFace size="sm" number={card.number ?? ""} name={card.name} rarity={card.rarity} />
                <div>
                  <h2>{card.name}</h2>
                  <p className="muted small">{noteMeta(card)}</p>
                </div>
              </div>
              <ul className="written-copies">
                {card.copies.map((copy, index) => (
                  <li key={copy.id}>
                    <p>
                      Copy {index + 1}: {copyLine(copy)}
                    </p>
                    <div className="written-actions">
                      <button
                        type="button"
                        className="secondary small"
                        disabled={busy}
                        onClick={() => {
                          closeEditors();
                          setEditingCopyId(copy.id);
                        }}
                      >
                        Change this copy
                      </button>
                      <button type="button" className="link" disabled={busy} onClick={() => removeCopy(card, copy)}>
                        Remove this copy
                      </button>
                    </div>
                    {editingCopyId === copy.id && (
                      <CopyEditor
                        availability={copy.availability}
                        condition={copy.condition && isGrade(copy.condition) ? copy.condition : ""}
                        printing={copy.printing ?? ""}
                        saveLabel="Save this copy"
                        busy={busy}
                        onCancel={() => setEditingCopyId(null)}
                        onSave={(next) => {
                          void run(async () => {
                            await updateWrittenCopy(copy.id, {
                              availability: next.availability,
                              condition: next.condition || null,
                              printing: next.printing.trim() ? next.printing : null,
                            });
                            setEditingCopyId(null);
                            setNotice("Saved this copy.");
                          });
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
              <div className="written-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    closeEditors();
                    setAddingId(card.id);
                  }}
                >
                  Add a copy
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    closeEditors();
                    setCorrectingId(card.id);
                  }}
                >
                  Correct this note
                </button>
              </div>
              {addingId === card.id && (
                <CopyEditor
                  availability="KEEP"
                  condition=""
                  printing=""
                  saveLabel="Add this copy"
                  busy={busy}
                  onCancel={() => setAddingId(null)}
                  onSave={(next) => {
                    void run(async () => {
                      await addWrittenCopy(card.id, {
                        availability: next.availability,
                        condition: next.condition || null,
                        printing: next.printing.trim() ? next.printing : null,
                      });
                      setAddingId(null);
                      setNotice(`Added another copy of ${card.name}.`);
                    });
                  }}
                />
              )}
              {correctingId === card.id && (
                <CorrectNote
                  card={card}
                  busy={busy}
                  error={correctError}
                  clash={correctClash}
                  onCancel={() => {
                    setCorrectingId(null);
                    setCorrectError(null);
                    setCorrectClash(null);
                  }}
                  onSave={(draft) => void saveCorrection(card.id, draft)}
                  onAddCopyOf={(cardId) => {
                    closeEditors();
                    setAddingId(cardId);
                    document.getElementById(`written-${cardId}`)?.scrollIntoView({ block: "start" });
                  }}
                />
              )}
            </article>
          ))}
        </div>
      )}
      <p className="muted small">
        <Link to="/add">Add a card</Link> from the catalog, or write another one down there.
      </p>
    </div>
  );
}

function isGrade(value: string): value is ConditionGrade {
  return (CONDITION_GRADES as readonly string[]).includes(value);
}
