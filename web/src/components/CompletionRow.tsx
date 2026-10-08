/** Before and after for one collection. The numbers stay with the label. */
export function CompletionRow({ label, before, after }: { label: string; before: number; after: number }) {
  return (
    <div className="completion-row">
      <span className="muted small">{label}</span>
      <span className="completion-values">
        {before}% <span className="arrow">&rarr;</span> <strong>{after}%</strong>
      </span>
    </div>
  );
}
