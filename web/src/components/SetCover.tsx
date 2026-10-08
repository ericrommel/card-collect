import { Link } from "react-router-dom";
import type { DashboardSetSummary } from "../lib/api";
import { focusHref, focusLabel, type CollectionView } from "../lib/collectionFocus";

export function SetCover({ set }: { set: DashboardSetSummary }) {
  const jumps = (
    [
      { view: "missing", count: set.missing_count },
      { view: "duplicates", count: set.duplicate_count },
      { view: "trade", count: set.trade_copies },
      { view: "donations", count: set.donation_copies },
      { view: "sale", count: set.sell_copies },
    ] as { view: CollectionView; count: number }[]
  ).filter((jump) => jump.count > 0);

  return (
    <article className="set-cover">
      <Link to={`/sets/${set.id}`} className="set-cover-open">
        <div className="set-monogram" data-universe={set.universe_slug}>
          <span>{set.code}</span>
        </div>
        <div className="set-cover-body">
          <h3>{set.name}</h3>
          <p className="muted small">{set.universe_name}</p>
          <div
            className="progress-bar-track"
            role="progressbar"
            aria-valuenow={set.completion_percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${set.name} is ${set.completion_percentage} percent complete`}
          >
            <div className="progress-bar-fill" style={{ width: `${set.completion_percentage}%` }} />
          </div>
          <p className="small set-cover-stats">
            <strong>{set.completion_percentage}%</strong>
            <span>
              {set.owned_count} of {set.total_count}
            </span>
          </p>
          {set.owned_count === 0 && <p className="small notice-line">Not started</p>}
        </div>
      </Link>
      {jumps.length > 0 && (
        <div className="set-cover-jumps">
          {jumps.map((jump) => (
            <Link key={jump.view} to={focusHref(set.id, jump.view)}>
              {focusLabel(jump.count, jump.view)}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
