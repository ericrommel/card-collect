import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  CONDITION_GRADES,
  addWrittenCopy,
  createWrittenCard,
  writtenConflict,
  type Availability,
  type ConditionGrade,
  type WrittenCard,
  type WrittenConflict,
  type WrittenCreateBody,
  type WrittenIdentityBody,
  type WrittenSameMatch,
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

export function writtenMatchLine(match: WrittenSameMatch): string {
  const parts = [match.game, match.set_name];
  if (match.set_code) parts.push(match.set_code);
  if (match.rarity) parts.push(match.rarity);
  if (match.language) parts.push(match.language);
  if (typeof match.copy_count === "number") {
    parts.push(match.copy_count === 1 ? "1 copy" : `${match.copy_count} copies`);
  }
  return parts.join(" · ");
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
  locked = false,
}: {
  draft: WrittenDraft;
  onChange: (next: WrittenDraft) => void;
  includePrinting: boolean;
  autoFocusName?: boolean;
  locked?: boolean;
}) {
  function patch(partial: Partial<WrittenDraft>) {
    if (locked) return;
    onChange({ ...draft, ...partial });
  }

  return (
    <div className="written-identity">
      <label>
        Card name
        <input
          type="text"
          value={draft.name}
          maxLength={80}
          autoComplete="off"
          autoFocus={autoFocusName}
          disabled={locked}
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
          disabled={locked}
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
          disabled={locked}
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
          disabled={locked || draft.noNumber}
          onChange={(event) => patch({ number: event.target.value })}
        />
      </label>
      <label className="written-check">
        <input
          type="checkbox"
          checked={draft.noNumber}
          disabled={locked}
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
          disabled={locked}
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
          disabled={locked}
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
          disabled={locked}
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
    </div>
  );
}

function WriteCardFields({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const conflictRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<WrittenDraft>(emptyWrittenDraft);
  const [conflict, setConflict] = useState<WrittenConflict | null>(null);
  const [lockedBody, setLockedBody] = useState<WrittenIdentityBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (conflict) conflictRef.current?.scrollIntoView({ block: "nearest" });
  }, [conflict]);

  function clearConflict() {
    setConflict(null);
    setLockedBody(null);
  }

  function copyBody() {
    return {
      availability: draft.availability,
      condition: draft.condition || null,
      printing: blankToNull(draft.printing),
    };
  }

  async function submit(flags?: Pick<WrittenCreateBody, "add_copy" | "different_card" | "same_card_id">) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const identity = lockedBody ?? identityBody(draft);
    try {
      const res = await createWrittenCard({
        ...identity,
        ...copyBody(),
        ...flags,
      });
      clearConflict();
      setDraft(emptyWrittenDraft());
      onSaved(successSentence(res.card));
    } catch (err) {
      const found = writtenConflict(err);
      if (found) {
        setConflict(found);
        setLockedBody(identity);
        setError(null);
      } else {
        clearConflict();
        setError(err instanceof ApiError ? err.message : "The note was not saved.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function addCopyFromConflict() {
    if (busy || conflict?.code !== "already_written") return;
    setBusy(true);
    setError(null);
    try {
      const res = await addWrittenCopy(conflict.card_id, copyBody());
      clearConflict();
      setDraft(emptyWrittenDraft());
      onSaved(successSentence(res.card));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The copy was not added.");
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
      <WrittenIdentityFields
        draft={draft}
        onChange={setDraft}
        includePrinting
        autoFocusName
        locked={conflict !== null}
      />
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
          <p className="muted small">Cancel to change the name, game, set, or number.</p>
          {conflict.code === "already_written" ? (
            <div className="written-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void addCopyFromConflict()}>
                Add another physical copy
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={clearConflict}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <ul className="written-matches">
                {conflict.matches.map((match) => (
                  <li key={match.id}>
                    <p>
                      <strong>{match.name}</strong> <span className="muted">{writtenMatchLine(match)}</span>
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
                <button type="button" className="secondary" disabled={busy} onClick={clearConflict}>
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
