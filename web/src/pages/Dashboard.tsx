import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CardFace } from "../components/CardFace";
import { CardSearch } from "../components/CardSearch";
import { OfferCards } from "../components/OfferCards";
import { SetCover } from "../components/SetCover";
import type { DashboardHighlight, DashboardSetSummary, Exchange, WrittenList } from "../lib/api";
import { listWrittenCards, proposeExchange } from "../lib/api";
import { cardMotif } from "../lib/cardMotif";
import { highlightAction, previewCountSentence } from "../lib/highlightAction";
import { AVAILABILITY_LABEL, EXCHANGE_STATUS_LABEL } from "../lib/labels";
import { useAuth } from "../state/AuthContext";
import { orderDashboardSets } from "../lib/dashboardSets";
import { useDashboard } from "../lib/useDashboard";
import { writtenCountSentence } from "../lib/writtenCount";

/** Faces for the short home row. Prefer cards you would receive. */
function exchangeRowFaces(exchange: Exchange) {
  const cards = exchange.you_receive.length > 0 ? exchange.you_receive : exchange.you_give;
  return cards.slice(0, 3);
}

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
  const action = highlightAction(item);
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
      <p>{previewCountSentence("You receive", item.you_receive_count, item.you_receive_preview.length)}</p>
      <OfferCards items={item.you_receive_preview} limit={3} showCondition />
      {donation ? (
        <p className="muted small">No cards go back. A donation is not a trade.</p>
      ) : (
        <>
          <p>{previewCountSentence("You give", item.you_give_count, item.you_give_preview.length)}</p>
          <OfferCards items={item.you_give_preview} limit={3} showCondition />
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
        {(item.your_completion_after < item.your_completion_before ||
          (item.their_completion_after !== undefined &&
            item.their_completion_after < (item.their_completion_before ?? item.their_completion_after))) &&
          " A card without another copy would leave."}
      </p>
      <div className="match-actions">
        {action === "review" ? (
          <Link to={`/sets/${item.set.id}/matches`} className="primary small">
            Review this match
          </Link>
        ) : (
          <button type="button" className="primary small" disabled={busy} onClick={() => onPropose(item)}>
            {action === "view" ? "View exchange" : action === "ask" ? "Ask for these" : "Propose trade"}
          </button>
        )}
        {action !== "review" && (
          <Link to={`/sets/${item.set.id}/matches`} className="secondary small">
            All matches
          </Link>
        )}
      </div>
    </article>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useDashboard();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState<WrittenList | null>(null);

  useEffect(() => {
    let cancelled = false;
    listWrittenCards()
      .then((next) => {
        if (!cancelled) setWritten(next);
      })
      .catch(() => {
        if (!cancelled) setWritten(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const groups = groupSets(orderDashboardSets(data.sets));
  const highlights = [...data.highlights.trades, ...data.highlights.donations];
  const firstName = user?.display_name.split(" ")[0] ?? "there";

  return (
    <div className="page-stack dash-home">
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
          <p className="muted">
            Cards you write down stay on this account. They are not part of the sample catalog and are not matched.
          </p>
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

      <CardSearch onAdded={reload} />

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

      {written && written.note_count > 0 && (
        <section className="written-home">
          <div className="section-heading">
            <h2>Cards you wrote down</h2>
            <Link to="/written">See them</Link>
          </div>
          <p>{writtenCountSentence(written.note_count, written.extra_count)}</p>
          <ul className="written-home-list">
            {written.notes.slice(0, 4).map((card) => (
              <li key={card.id}>
                <Link to={`/written#written-${card.id}`} className="written-home-link">
                  <CardFace size="sm" number={card.number ?? ""} name={card.name} rarity={card.rarity} />
                  <span className="row-copy">
                    <strong>{card.name}</strong>
                    <span className="muted small">
                      {card.game} · {card.set_name}
                      {card.no_number ? " · No number on this card" : ` · ${card.number}`}
                      {card.copy_count === 1 ? " · 1 copy" : ` · ${card.copy_count} copies`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="dash-sets">
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
      </div>

      <div className="dash-columns">
        <section>
          <div className="section-heading">
            <h2>Matches</h2>
          </div>
          <p className="muted small">
            Ranked by how much a trade or donation helps finish a set you have started. The score is not a price. A
            condition is the copy that would change hands, not a grade.
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
              {data.exchanges.recent.map((exchange) => {
                const faces = exchangeRowFaces(exchange);
                return (
                  <Link key={exchange.id} to={`/exchanges#${exchange.id}`} className="card exchange-row">
                    <span className={`status-badge status-${exchange.status.toLowerCase()}`}>
                      {EXCHANGE_STATUS_LABEL[exchange.status]}
                    </span>
                    <strong>{exchange.type === "DONATION" ? "Donation" : "Trade"}</strong>
                    <span>{exchange.other_collector.display_name}</span>
                    <span className="muted small">
                      Give {exchange.you_give.length} · Receive {exchange.you_receive.length} · {exchange.set.code}
                    </span>
                    {faces.length > 0 && (
                      <span className="exchange-faces">
                        {faces.map((card, index) => (
                          <CardFace
                            key={`${card.number}-${index}`}
                            number={card.number}
                            name={card.name}
                            rarity={card.rarity}
                            kind={card.kind}
                            ink={card.ink}
                            size="sm"
                          />
                        ))}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {data.recent_copies.length > 0 && (
            <>
              <div className="section-heading">
                <h2>Recently added</h2>
              </div>
              <ul className="recent-list">
                {data.recent_copies.map((copy) => {
                  const kind = cardMotif(copy.kind);
                  const detail = [
                    `${copy.set_code} ${copy.collectible_number}`,
                    kind,
                    AVAILABILITY_LABEL[copy.availability],
                    copy.condition,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={copy.id}>
                      <Link
                        className="recent-card"
                        to={`/sets/${copy.set_id}?q=${encodeURIComponent(copy.collectible_number)}`}
                      >
                        <CardFace
                          number={copy.collectible_number}
                          name={copy.collectible_name}
                          rarity={copy.rarity}
                          kind={copy.kind}
                          ink={copy.ink}
                          size="sm"
                        />
                        <span className="recent-card-text">
                          <span>{copy.collectible_name}</span>
                          <span className="muted small">{detail}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
