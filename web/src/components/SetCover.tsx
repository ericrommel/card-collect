import { Link } from "react-router-dom";
import type { DashboardSetSummary } from "../lib/api";

export function SetCover({ set }: { set: DashboardSetSummary }) {
  return (
    <Link to={`/sets/${set.id}`} className="set-cover">
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
          {set.missing_count > 0 && <span>{set.missing_count} missing</span>}
          {set.duplicate_count > 0 && <span>{set.duplicate_count} extra</span>}
        </p>
        {(set.trade_copies > 0 || set.donation_copies > 0 || set.sell_copies > 0) && (
          <p className="set-offer-line">
            {set.trade_copies > 0 && <span>{set.trade_copies} for trade</span>}
            {set.donation_copies > 0 && <span>{set.donation_copies} to donate</span>}
            {set.sell_copies > 0 && <span>{set.sell_copies} for sale</span>}
          </p>
        )}
        {set.owned_count === 0 && <p className="small notice-line">Not started</p>}
      </div>
    </Link>
  );
}
