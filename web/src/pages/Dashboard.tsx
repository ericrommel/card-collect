import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { OfferCards } from "../components/OfferCards";
import { SetCover } from "../components/SetCover";
import type { DashboardHighlight, DashboardSetSummary } from "../lib/api";
import { proposeExchange } from "../lib/api";
import { AVAILABILITY_LABEL, EXCHANGE_STATUS_LABEL } from "../lib/labels";
import { useAuth } from "../state/AuthContext";
import { useDashboard } from "../lib/useDashboard";

function groupSets(sets: DashboardSetSummary[]) {
  const groups: { id: string; name: string; notice: string | null; sets: DashboardSetSummary[] }[] = [];
  for (const set of sets) {
    const existing = groups.find((group) => group.id === set.universe_id);
    if (existing) existing.sets.push(set);
    else groups.push({ id: set.universe_id, name: set.universe_name, notice: set.notice, sets: [set] });
  }
  return groups;
}

function HighlightCard({
  item,
  busy,
  onPropose,
}: {
  item: DashboardHighlight;
  busy: boolean;
  onPropose: (item: DashboardHighlight) => void;
}) {
  const donation = item.type === "DONATION";
  return (
    <article className="card highlight-card">
      <div className="match-header">
        <span className={`score-badge ${donation ? "donation" : "trade"}`}>
          {item.score}% {donation ? "Donation" : "Trade"}
        </span>
        <h3>{item.collector.display_name}</h3>
      </div>
      <p className="muted small">
        <Link to={`/sets/${item.set.id}`}>{item.set.name}</Link>
      </p>
      <p>
        You receive <strong>{item.you_receive_count}</strong>
        {item.you_receive_count > item.you_receive_preview.length ? `, showing ${item.you_receive_preview.length}` : ""}
      </p>
      <OfferCards items={item.you_receive_preview} limit={3} />
      {donation ? (
        <p className="muted small">No cards go back. A donation is not a trade.</p>
      ) : (
        <>
          <p>
            You give <strong>{item.you_give_count}</strong>
            {item.you_give_count > item.you_give_preview.length ? `, showing ${item.you_give_preview.length}` : ""}
          </p>
          <OfferCards items={item.you_give_preview} limit={3} />
        </>
      )}
      <p className="small">
        Your set {item.your_completion_before}% → <strong>{item.your_completion_after}%</strong>
        {item.their_completion_after !== undefined && (
          <>
            {" "}
            · Theirs {item.their_completion_before}% → <strong>{item.their_completion_after}%</strong>
          </>
        )}
      </p>
      <div className="match-actions">
        <button type="button" className="primary small" disabled={busy} onClick={() => onPropose(item)}>
          {item.open_exchange_id ? "View exchange" : donation ? "Ask for these" : "Propose trade"}
        </button>
        <Link to={`/sets/${item.set.id}/matches`} className="secondary small">
          All matches
        </Link>
      </div>
    </article>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error } = useDashboard();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPropose(item: DashboardHighlight) {
    if (item.open_exchange_id) {
      navigate(`/exchanges#${item.open_exchange_id}`);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await proposeExchange({ set_id: item.set.id, collector_ref: item.collector.ref, type: item.type });
      navigate(`/exchanges#${res.exchange.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not propose this exchange");
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading your collection…</p>;
  if (error || !data) return <p className="error">{error ?? "Could not load your collection."}</p>;

  const { totals } = data;
  const groups = groupSets(data.sets);
  const highlights = [...data.highlights.trades, ...data.highlights.donations];
  const firstName = user?.display_name.split(" ")[0] ?? "there";

  return (
    <div className="page-stack">
      <section className="dash-hero">
        <div>
          <p className="eyebrow">Your collection</p>
          <h1>Hello, {firstName}</h1>
          {totals.started_set_count === 0 ? (
            <p>
              Pick a set and mark the cards you have. You can select many at once — no need to edit them one by one.
            </p>
          ) : (
            <p>
              {totals.completion_percentage}% of {totals.total_count} catalogued cards. {totals.started_set_count} of{" "}
              {totals.set_count} sets started. Untouched sets count as missing, so this number stays honest.
            </p>
          )}
        </div>
        <div
          className="progress-bar-track hero-bar"
          role="progressbar"
          aria-valuenow={totals.completion_percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overall catalog completion"
        >
          <div className="progress-bar-fill" style={{ width: `${totals.completion_percentage}%` }} />
        </div>
      </section>

      {data.exchanges.needs_action_count > 0 && (
        <Link to="/exchanges" className="attention-banner">
          {data.exchanges.needs_action_count === 1
            ? "1 exchange needs you"
            : `${data.exchanges.needs_action_count} exchanges need you`}
        </Link>
      )}

      <ul className="stat-row">
        <li>
          <Link to="/collection/owned" className="stat-link">
            <strong>{totals.owned_count}</strong>
            <span>Owned</span>
          </Link>
        </li>
        <li>
          <Link to="/collection/missing" className="stat-link">
            <strong>{totals.missing_count}</strong>
            <span>Missing</span>
          </Link>
        </li>
        <li>
          <Link to="/collection/duplicates" className="stat-link">
            <strong>{totals.duplicate_count}</strong>
            <span>Extras</span>
          </Link>
        </li>
        <li>
          <Link to="/collection/trade" className="stat-link">
            <strong>{totals.trade_copies}</strong>
            <span>For trade</span>
          </Link>
        </li>
        <li>
          <Link to="/collection/donations" className="stat-link">
            <strong>{totals.donation_copies}</strong>
            <span>Donations</span>
          </Link>
        </li>
        <li>
          <Link to="/collection/sale" className="stat-link">
            <strong>{totals.sell_copies}</strong>
            <span>For sale</span>
          </Link>
        </li>
        {totals.reserved_copies > 0 && (
          <li>
            <Link to="/exchanges" className="stat-link">
              <strong>{totals.reserved_copies}</strong>
              <span>In an exchange</span>
            </Link>
          </li>
        )}
      </ul>

      {groups.map((group) => (
        <section key={group.id} className="page-stack">
          <div className="section-heading">
            <h2>{group.name}</h2>
          </div>
          {group.notice && <p className="notice-line">{group.notice}</p>}
          <div className="set-grid">
            {group.sets.map((set) => (
              <SetCover key={set.id} set={set} />
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <div className="card empty-state">
          <h2>No sets yet</h2>
          <p className="muted">When a catalog is loaded, your sets will show up here.</p>
        </div>
      )}

      <div className="dash-columns">
        <section>
          <div className="section-heading">
            <h2>Matches</h2>
          </div>
          <p className="muted small">
            Ranked by how much a trade or donation helps finish a set you have started. The score is not a price.
          </p>
          {actionError && <p className="error">{actionError}</p>}
          {highlights.length === 0 ? (
            <div className="card empty-state">
              <p>No trades or donations to show yet.</p>
              <p className="muted small">
                Mark duplicate copies as For trade or Donation inside a set. Matches for a set you have not started stay
                on that set's Matches page.
              </p>
            </div>
          ) : (
            <div className="stack">
              {highlights.map((item) => (
                <HighlightCard
                  key={`${item.type}:${item.set.id}:${item.collector.ref}`}
                  item={item}
                  busy={busy}
                  onPropose={onPropose}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="section-heading">
            <h2>Exchanges</h2>
            <Link to="/exchanges">See all</Link>
          </div>
          {data.exchanges.recent.length === 0 ? (
            <div className="card empty-state">
              <p>No exchanges yet.</p>
              <p className="muted small">
                When you propose a trade or ask for a donation, it shows up here. Nothing moves until both people
                confirm.
              </p>
            </div>
          ) : (
            <div className="stack">
              {data.exchanges.recent.map((exchange) => (
                <Link key={exchange.id} to={`/exchanges#${exchange.id}`} className="card exchange-row">
                  <span className={`status-badge status-${exchange.status.toLowerCase()}`}>
                    {EXCHANGE_STATUS_LABEL[exchange.status]}
                  </span>
                  <strong>{exchange.type === "DONATION" ? "Donation" : "Trade"}</strong>
                  <span>{exchange.other_collector.display_name}</span>
                  <span className="muted small">
                    Give {exchange.you_give.length} · Receive {exchange.you_receive.length} · {exchange.set.code}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {data.recent_copies.length > 0 && (
            <>
              <div className="section-heading">
                <h2>Recently added</h2>
              </div>
              <ul className="recent-list">
                {data.recent_copies.map((copy) => (
                  <li key={copy.id}>
                    <Link to={`/sets/${copy.set_id}?q=${encodeURIComponent(copy.collectible_number)}`}>
                      <span className="card-number">{copy.collectible_number}</span> {copy.collectible_name}
                    </Link>
                    <span className="muted small">
                      {copy.set_code} · {AVAILABILITY_LABEL[copy.availability]}
                      {copy.condition ? ` · ${copy.condition}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
