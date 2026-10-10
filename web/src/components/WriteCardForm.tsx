import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  CONDITION_GRADES,
  createWrittenCard,
  writtenConflict,
  type Availability,
  type ConditionGrade,
  type WrittenCard,
  type WrittenConflict,
  type WrittenCreateBody,
  type WrittenIdentityBody,
} from "../lib/api";
import { AVAILABILITY_LABEL, AVAILABILITY_OPTIONS } from "../lib/labels";

export type WrittenDraft = {
  name: string;
  game: string;
  setName: string;
  number: string;
  noNumber: boolean;
  setCode: string;
  rarity: string;
  language: string;
  printing: string;
  availability: Availability;
  condition: ConditionGrade | "";
};

export function emptyWrittenDraft(): WrittenDraft {
  return {
    name: "",
    game: "",
    setName: "",
    number: "",
    noNumber: false,
    setCode: "",
    rarity: "",
    language: "",
    printing: "",
    availability: "KEEP",
    condition: "",
  };
}

export function draftFromCard(card: WrittenCard): WrittenDraft {
  return {
    ...emptyWrittenDraft(),
    name: card.name,
    game: card.game,
    setName: card.set_name,
    number: card.number ?? "",
    noNumber: card.no_number,
    setCode: card.set_code ?? "",
    rarity: card.rarity ?? "",
    language: card.language ?? "",
  };
}

function blankToNull(value: string): string | null {
  return value.trim() ? value : null;
}

export function identityBody(draft: WrittenDraft): WrittenIdentityBody {
  return {
    name: draft.name,
    game: draft.game,
    set_name: draft.setName,
    number: draft.noNumber ? null : draft.number,
    no_number: draft.noNumber,
    set_code: blankToNull(draft.setCode),
    rarity: blankToNull(draft.rarity),
    language: blankToNull(draft.language),
  };
}

function successSentence(card: WrittenCard): string {
  if (card.copy_count > 1) {
    return `Added another copy of ${card.name}. This is your note, not an official card.`;
  }
  return `Added ${card.name}. This is your note, not an official card.`;
}

export function AvailabilityFields({
  availability,
  condition,
  onAvailability,
  onCondition,
}: {
  availability: Availability;
  condition: ConditionGrade | "";
  onAvailability: (value: Availability) => void;
  onCondition: (value: ConditionGrade | "") => void;
}) {
  return (
    <>
      <div className="segmented" role="group" aria-label="Availability">
        {AVAILABILITY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={availability === option}
            onClick={() => onAvailability(option)}
          >
            {AVAILABILITY_LABEL[option]}
          </button>
        ))}
      </div>
      <label className="condition-field">
        Condition
        <select value={condition} onChange={(event) => onCondition(event.target.value as ConditionGrade | "")}>
          <option value="">Not set</option>
          {CONDITION_GRADES.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function WrittenIdentityFields({
  draft,
  onChange,
  includePrinting,
  autoFocusName = false,
}: {
  draft: WrittenDraft;
  onChange: (next: WrittenDraft) => void;
  includePrinting: boolean;
  autoFocusName?: boolean;
}) {
  function patch(partial: Partial<WrittenDraft>) {
    onChange({ ...draft, ...partial });
  }

  return (
    <>
      <label>
        Card name
        <input
          type="text"
          value={draft.name}
          maxLength={80}
          autoComplete="off"
          autoFocus={autoFocusName}
          onChange={(event) => patch({ name: event.target.value })}
        />
      </label>
      <label>
        Game
        <input
          type="text"
          value={draft.game}
          maxLength={60}
          autoComplete="off"
          onChange={(event) => patch({ game: event.target.value })}
        />
      </label>
      <label>
        Set name
        <input
          type="text"
          value={draft.setName}
          maxLength={80}
          autoComplete="off"
          onChange={(event) => patch({ setName: event.target.value })}
        />
      </label>
      <label>
        Collector number
        <input
          type="text"
          value={draft.noNumber ? "" : draft.number}
          maxLength={16}
          autoComplete="off"
          disabled={draft.noNumber}
          onChange={(event) => patch({ number: event.target.value })}
        />
      </label>
      <label className="written-check">
        <input
          type="checkbox"
          checked={draft.noNumber}
          onChange={(event) =>
            patch({ noNumber: event.target.checked, number: event.target.checked ? "" : draft.number })
          }
        />
        No number on this card
      </label>
      <label>
        Set code, optional
        <input
          type="text"
          value={draft.setCode}
          maxLength={40}
          autoComplete="off"
          onChange={(event) => patch({ setCode: event.target.value })}
        />
      </label>
      <label>
        Rarity, optional
        <input
          type="text"
          value={draft.rarity}
          maxLength={40}
          autoComplete="off"
          onChange={(event) => patch({ rarity: event.target.value })}
        />
      </label>
      <label>
        Language, optional
        <input
          type="text"
          value={draft.language}
          maxLength={40}
          autoComplete="off"
          onChange={(event) => patch({ language: event.target.value })}
        />
      </label>
      {includePrinting && (
        <label>
          Printing or finish, optional
          <input
            type="text"
            value={draft.printing}
            maxLength={40}
            autoComplete="off"
            onChange={(event) => patch({ printing: event.target.value })}
          />
        </label>
      )}
    </>
  );
}

function WriteCardFields({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const conflictRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<WrittenDraft>(emptyWrittenDraft);
  const [conflict, setConflict] = useState<WrittenConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (conflict) conflictRef.current?.scrollIntoView({ block: "nearest" });
  }, [conflict]);

  async function submit(flags?: Pick<WrittenCreateBody, "add_copy" | "different_card" | "same_card_id">) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createWrittenCard({
        ...identityBody(draft),
        printing: blankToNull(draft.printing),
        availability: draft.availability,
        condition: draft.condition || null,
        ...flags,
      });
      setConflict(null);
      setDraft(emptyWrittenDraft());
      onSaved(successSentence(res.card));
    } catch (err) {
      const found = writtenConflict(err);
      if (found) {
        setConflict(found);
        setError(null);
      } else {
        setConflict(null);
        setError(err instanceof ApiError ? err.message : "The note was not saved.");
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (conflict) return;
    void submit();
  }

  return (
    <form className="form written-form" autoComplete="off" onSubmit={onSubmit}>
      <div className="section-heading">
        <h2>Write down a card</h2>
        <button type="button" className="link" onClick={onClose}>
          Close
        </button>
      </div>
      <WrittenIdentityFields draft={draft} onChange={setDraft} includePrinting autoFocusName />
      <AvailabilityFields
        availability={draft.availability}
        condition={draft.condition}
        onAvailability={(availability) => setDraft({ ...draft, availability })}
        onCondition={(condition) => setDraft({ ...draft, condition })}
      />
      <p className="muted small">Condition is your note, not a grade.</p>
      <p className="muted small">
        "For trade" and "Donation" are labels for you only. Other people cannot match this card.
      </p>
      <p className="muted small">
        This is your note, not an official catalog. It is not added to the shared catalog, and other people cannot match
        it.
      </p>
      {conflict && (
        <div className="written-conflict" ref={conflictRef} role="status">
          <p>{conflict.message}</p>
          {conflict.code === "already_written" ? (
            <div className="written-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void submit({ add_copy: true })}>
                Add another physical copy
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setConflict(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <ul className="written-matches">
                {conflict.matches.map((match) => (
                  <li key={match.id}>
                    <p>
                      <strong>{match.name}</strong>{" "}
                      <span className="muted">
                        {match.game} · {match.set_name}
                      </span>
                    </p>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => void submit({ same_card_id: match.id })}
                    >
                      Same card, another copy?
                    </button>
                  </li>
                ))}
              </ul>
              <div className="written-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void submit({ different_card: true })}
                >
                  A different card?
                </button>
                <button type="button" className="secondary" disabled={busy} onClick={() => setConflict(null)}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {!conflict && (
        <button type="submit" className="primary written-save" disabled={busy}>
          {busy ? "Adding…" : "Add this copy"}
        </button>
      )}
    </form>
  );
}

export function WriteCardEntry() {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  return (
    <section className="card written-entry">
      {added && (
        <p className="notice-line">
          {added} <Link to="/written">Cards you wrote down</Link>
        </p>
      )}
      {open ? (
        <WriteCardFields onClose={() => setOpen(false)} onSaved={setAdded} />
      ) : (
        <button type="button" className="secondary" onClick={() => setOpen(true)}>
          Write down a card the catalog does not have.
        </button>
      )}
    </section>
  );
}
