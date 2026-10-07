import { Link } from "react-router-dom";
import type { Availability, ConditionGrade } from "../lib/api";
import { CONDITION_GRADES } from "../lib/api";
import type { ExplorerEntry } from "../lib/explorerQuery";
import { defaultVariant } from "../lib/explorerQuery";
import { AVAILABILITY_LABEL, AVAILABILITY_OPTIONS, rarityLabel, titleCaseKey } from "../lib/labels";
import { CardFace, inkFromMetadata } from "./CardFace";

function CopyEditor({
  entry,
  busy,
  onAvailability,
  onCondition,
  onRemove,
}: {
  entry: ExplorerEntry;
  busy: boolean;
  onAvailability: (copyId: string, availability: Availability) => void;
  onCondition: (copyId: string, condition: ConditionGrade | null) => void;
  onRemove: (copyId: string) => void;
}) {
  const collectible = entry.collectible;
  if (entry.copies.length === 0) {
    return <p className="muted small">You don't have a physical copy of this card yet.</p>;
  }

  return (
    <ul className="copy-editor-list">
      {entry.copies.map((copy, index) => (
        <li key={copy.id} className={copy.reserved ? "copy-editor reserved" : "copy-editor"}>
          <p className="copy-editor-title">
            Copy {index + 1}
            {copy.variant.name !== "Base" ? ` · ${copy.variant.name}` : ""}
          </p>
          <div
            className="segmented"
            role="group"
            aria-label={`Availability for ${collectible.name}, copy ${index + 1}`}
          >
            {AVAILABILITY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={copy.availability === option}
                disabled={busy || copy.reserved}
                onClick={() => onAvailability(copy.id, option)}
              >
                {AVAILABILITY_LABEL[option]}
              </button>
            ))}
          </div>
          <label className="condition-field">
            Condition
            <select
              aria-label={`Condition for ${collectible.name}, copy ${index + 1}`}
              value={copy.condition ?? ""}
              disabled={busy || copy.reserved}
              onChange={(event) =>
                onCondition(copy.id, event.target.value === "" ? null : (event.target.value as ConditionGrade))
              }
            >
              <option value="">Not set</option>
              {CONDITION_GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>
          {copy.reserved && copy.exchange_id ? (
            <Link to={`/exchanges#${copy.exchange_id}`} className="reserved-note">
              In an exchange
            </Link>
          ) : (
            <button type="button" className="link-danger" disabled={busy} onClick={() => onRemove(copy.id)}>
              Remove this copy
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function CardColumn({
  entry,
  busy,
  onAdd,
  onAvailability,
  onCondition,
  onRemove,
}: {
  entry: ExplorerEntry;
  busy: boolean;
  onAdd: (variantId: string) => void;
  onAvailability: (copyId: string, availability: Availability) => void;
  onCondition: (copyId: string, condition: ConditionGrade | null) => void;
  onRemove: (copyId: string) => void;
}) {
  const collectible = entry.collectible;
  const metadata = Object.entries(collectible.metadata ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  const fallback = defaultVariant(collectible);

  return (
    <div className="detail-column">
      <CardFace
        number={collectible.number}
        name={collectible.name}
        rarity={collectible.rarity}
        ink={inkFromMetadata(collectible.metadata)}
      />
      <h3>{collectible.name}</h3>
      <p className="muted small">
        {collectible.number}
        {collectible.rarity ? ` · ${rarityLabel(collectible.rarity)}` : ""}
      </p>
      <p className="detail-ownership">
        {!entry.isOwned && "Missing"}
        {entry.isOwned && entry.duplicateQuantity === 0 && "Owned · 1 copy"}
        {entry.duplicateQuantity > 0 && `Owned · ${entry.ownedQuantity} copies (${entry.duplicateQuantity} extra)`}
      </p>
      {metadata.length > 0 && (
        <dl className="meta-list">
          {metadata.map(([key, value]) => (
            <div key={key}>
              <dt>{titleCaseKey(key)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <CopyEditor
        entry={entry}
        busy={busy}
        onAvailability={onAvailability}
        onCondition={onCondition}
        onRemove={onRemove}
      />
      <div className="detail-add">
        {(collectible.variants.length > 0 ? collectible.variants : fallback ? [fallback] : []).map((variant) => (
          <button
            key={variant.id}
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => onAdd(variant.id)}
          >
            {variant.isDefault && collectible.variants.length === 1 ? "Add a copy" : `Add ${variant.name}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CardDetail({
  entries,
  mode,
  selectedCount,
  busy,
  onClose,
  onAdd,
  onAvailability,
  onCondition,
  onRemove,
}: {
  entries: ExplorerEntry[];
  mode: "single" | "compare" | "bulk";
  selectedCount: number;
  busy: boolean;
  onClose: () => void;
  onAdd: (variantId: string) => void;
  onAvailability: (copyId: string, availability: Availability) => void;
  onCondition: (copyId: string, condition: ConditionGrade | null) => void;
  onRemove: (copyId: string) => void;
}) {
  return (
    <aside className={`detail-panel detail-${mode}`} aria-label={mode === "compare" ? "Compare cards" : "Card details"}>
      <div className="detail-toolbar">
        <h2>{mode === "compare" ? "Compare" : mode === "bulk" ? "Selected cards" : "Card"}</h2>
        <button type="button" className="secondary small" onClick={onClose}>
          Close
        </button>
      </div>
      {mode === "bulk" ? (
        <p>Use the bar to update all {selectedCount} selected cards together. Open one or two cards to edit a copy.</p>
      ) : (
        <div className={mode === "compare" ? "detail-compare" : "detail-single"}>
          {entries.map((entry) => (
            <CardColumn
              key={entry.collectible.id}
              entry={entry}
              busy={busy}
              onAdd={onAdd}
              onAvailability={onAvailability}
              onCondition={onCondition}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
      <p className="muted small">
        Condition is your note about that physical copy. It is not a professional grade, and it does not change the
        match score. Two copies of the same card can have different conditions.
      </p>
    </aside>
  );
}
