import { CONDITION_GRADES, type ConditionGrade } from "../lib/api";

/**
 * The grades a person can record on one physical copy.
 * Not set is a real choice: it clears a note rather than leaving the old one.
 */
export function ConditionChoices({
  value,
  onChange,
  disabled = false,
  label = "Condition",
}: {
  value: string | null;
  onChange: (next: ConditionGrade | null) => void;
  disabled?: boolean;
  /** Names the group for one copy, for example "Condition for Cedar Keeper, copy 1". */
  label?: string;
}) {
  const current: ConditionGrade | null | undefined = value ? CONDITION_GRADES.find((grade) => grade === value) : null;

  function choose(next: ConditionGrade | null) {
    if (disabled || next === current) return;
    onChange(next);
  }

  return (
    <div className="condition-choices">
      <p className="condition-choices-label">Condition</p>
      <div className="condition-choices-grid" role="group" aria-label={label}>
        <button type="button" aria-pressed={current === null} disabled={disabled} onClick={() => choose(null)}>
          Not set
        </button>
        {CONDITION_GRADES.map((grade) => (
          <button
            key={grade}
            type="button"
            aria-pressed={current === grade}
            disabled={disabled}
            onClick={() => choose(grade)}
          >
            {grade}
          </button>
        ))}
      </div>
    </div>
  );
}
