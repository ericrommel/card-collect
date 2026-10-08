import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CompletionRow } from "../components/CompletionRow";
import { OfferCards } from "../components/OfferCards";
import * as api from "../lib/api";
import type { Exchange, ExchangeAction } from "../lib/api";
import { confirmationProgress, exchangeNeedsYou, openExchangeSummary, orderOpenExchanges } from "../lib/exchangeQueue";
import { EXCHANGE_STATUS_LABEL } from "../lib/labels";

const ACTION_LABEL: Record<ExchangeAction, string> = {
  accept: "Accept",
  decline: "Decline",
  cancel: "Cancel",
  confirm: "Confirm cards changed hands",
};

function statusSentence(exchange: Exchange): string {
  if (exchange.status === "PROPOSED" && exchange.role === "proposer") {
    return "Waiting for them to accept or decline. Nothing has moved.";
  }
  if (exchange.status === "PROPOSED") {
    return "Nothing changes unless you accept.";
  }
  if (exchange.status === "ACCEPTED" && !exchange.you_confirmed) {
    return "You both agreed. Confirm only after the cards have actually changed hands.";
  }
  if (exchange.status === "ACCEPTED" && exchange.you_confirmed) {
    return "You confirmed. Collections update only after they confirm too.";
  }
  if (exchange.status === "COMPLETED") return "Completed. These cards have moved in both collections.";
  if (exchange.status === "DECLINED") return "Declined. No cards moved.";
  return "Cancelled. No cards moved.";
}

function ExchangeCardView({ exchange, onChanged }: { exchange: Exchange; onChanged: (updated: Exchange) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function run(action: ExchangeAction) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.actOnExchange(exchange.id, action);
      setConfirming(false);
      onChanged(res.exchange);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this exchange");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article id={exchange.id} className="card exchange-card">
      <div className="match-header">
        <span className={`score-badge ${exchange.type === "DONATION" ? "donation" : "trade"}`}>
          {exchange.type === "DONATION" ? "Donation" : "Trade"}
        </span>
        <span className={`status-badge status-${exchange.status.toLowerCase()}`}>
          {EXCHANGE_STATUS_LABEL[exchange.status]}
        </span>
        <h3>{exchange.other_collector.display_name}</h3>
      </div>
      <p className="muted small">
        <Link to={`/sets/${exchange.set.id}`}>{exchange.set.name}</Link>
        {" · "}
        {exchange.role === "proposer" ? "You proposed this" : "They proposed this"}
      </p>
      <p>{statusSentence(exchange)}</p>
      <div className="match-columns">
        <div>
          <p>
            You give <strong>{exchange.you_give.length}</strong> {exchange.you_give.length === 1 ? "card" : "cards"}
          </p>
          <OfferCards items={exchange.you_give} showCondition />
        </div>
        <div>
          <p>
            You receive <strong>{exchange.you_receive.length}</strong>{" "}
            {exchange.you_receive.length === 1 ? "card" : "cards"}
          </p>
          <OfferCards items={exchange.you_receive} showCondition />
        </div>
      </div>
      {exchange.projected_completion && (
        <div className="match-completion">
          <CompletionRow
            label="Your collection"
            before={exchange.projected_completion.yours.before}
            after={exchange.projected_completion.yours.after}
          />
          {exchange.type !== "DONATION" && (
            <CompletionRow
              label="Their collection"
              before={exchange.projected_completion.theirs.before}
              after={exchange.projected_completion.theirs.after}
            />
          )}
        </div>
      )}
      {exchange.projected_completion &&
        (exchange.projected_completion.yours.after < exchange.projected_completion.yours.before ||
          (exchange.type !== "DONATION" &&
            exchange.projected_completion.theirs.after < exchange.projected_completion.theirs.before)) && (
          <p className="muted small">A card without another copy would leave, so that set does not go up.</p>
        )}
      {exchange.status === "ACCEPTED" && (
        <p className="small">{confirmationProgress(exchange.you_confirmed, exchange.they_confirmed)}</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="match-actions">
        <p className="match-tally">
          You give {exchange.you_give.length} {exchange.you_give.length === 1 ? "card" : "cards"}. You receive{" "}
          {exchange.you_receive.length} {exchange.you_receive.length === 1 ? "card" : "cards"}.
        </p>
        {exchange.actions.map((action) =>
          action === "confirm" && !confirming ? (
            <button key={action} className="primary" disabled={busy} onClick={() => setConfirming(true)}>
              {ACTION_LABEL[action]}
            </button>
          ) : action === "confirm" ? null : (
            <button
              key={action}
              className={
                action === "accept" ? "primary" : action === "decline" || action === "cancel" ? "secondary" : "primary"
              }
              disabled={busy}
              onClick={() => run(action)}
            >
              {ACTION_LABEL[action]}
            </button>
          ),
        )}
      </div>
      {confirming && (
        <div className="confirm-panel">
          <p>
            Confirm only if these cards have already changed hands. Both collections update once you have both
            confirmed.
          </p>
          <div className="match-actions">
            <button className="primary" disabled={busy} onClick={() => run("confirm")}>
              Yes, the cards changed hands
            </button>
            <button className="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              Not yet
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function ExchangesPage() {
  const location = useLocation();
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "past">("open");

  function load() {
    setError(null);
    return api
      .listExchanges()
      .then((res) => setExchanges(res.exchanges))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load exchanges"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (loading || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [loading, location.hash, exchanges]);

  const open = exchanges.filter((exchange) => exchange.status === "PROPOSED" || exchange.status === "ACCEPTED");
  const needsYou = open.filter(exchangeNeedsYou).length;
  const past = exchanges.filter((exchange) => exchange.status !== "PROPOSED" && exchange.status !== "ACCEPTED");
  const visible = filter === "open" ? orderOpenExchanges(open) : past;
  const summary = filter === "open" ? openExchangeSummary(needsYou, open.length - needsYou) : null;

  return (
    <div className="page-stack page-intro">
      <div className="explorer-heading">
        <div>
          <p className="eyebrow">Your collection</p>
          <h1>Exchanges</h1>
          <p className="muted">
            Trades and donations you have proposed or been asked about. Cards move only after both people confirm the
            handover. Your email and location stay private. This app does not message the other person or arrange a
            meeting.
          </p>
        </div>
      </div>
      {loading && <p className="muted">Loading exchanges…</p>}
      {!loading && error && exchanges.length === 0 && <p className="error">{error}</p>}
      {!loading && (exchanges.length > 0 || !error) && (
        <>
          <div className="filters">
            <button
              type="button"
              className={filter === "open" ? "tab active" : "tab"}
              onClick={() => setFilter("open")}
            >
              Open
            </button>
            <button
              type="button"
              className={filter === "past" ? "tab active" : "tab"}
              onClick={() => setFilter("past")}
            >
              Past
            </button>
          </div>
          {summary && (
            <p className="notice-line" role="status">
              {summary}
            </p>
          )}
          {error && <p className="error">{error}</p>}
          {visible.length === 0 && (
            <p className="muted">
              {filter === "open"
                ? "No open exchanges. Propose one from a set's Matches page."
                : "No past exchanges yet."}
            </p>
          )}
          <div className="matches">
            {visible.map((exchange) => (
              <ExchangeCardView
                key={exchange.id}
                exchange={exchange}
                onChanged={(updated) => {
                  if (updated.status !== "PROPOSED" && updated.status !== "ACCEPTED") setFilter("past");
                  load();
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
