import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { OfferCards } from "../components/OfferCards";
import * as api from "../lib/api";
import type { Exchange, ExchangeAction } from "../lib/api";
import { exchangeNeedsYou, openExchangeSummary, orderOpenExchanges } from "../lib/exchangeQueue";
import { EXCHANGE_STATUS_LABEL, completionShift } from "../lib/labels";

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
    return "They proposed this. Nothing changes unless you accept.";
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
  const isOpen = exchange.status === "PROPOSED" || exchange.status === "ACCEPTED";

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
      {isOpen && (
        <p className="muted small">
          Your email and location stay private. This app does not message the other collector or arrange a meeting. The
          match score is about finishing the set, not about card value.
        </p>
      )}
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
        <p className="small">
          If this finishes,{" "}
          {completionShift(
            "your set",
            exchange.projected_completion.yours.before,
            exchange.projected_completion.yours.after,
          )}{" "}
          {completionShift(
            "Theirs",
            exchange.projected_completion.theirs.before,
            exchange.projected_completion.theirs.after,
          )}
        </p>
      )}
      {exchange.status === "ACCEPTED" && (
        <p className="small">
          You: {exchange.you_confirmed ? "confirmed" : "not yet"} · Them:{" "}
          {exchange.they_confirmed ? "confirmed" : "not yet"}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="match-actions">
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

  if (loading) return <p className="muted">Loading exchanges...</p>;
  if (error && exchanges.length === 0) return <p className="error">{error}</p>;

  const open = exchanges.filter((exchange) => exchange.status === "PROPOSED" || exchange.status === "ACCEPTED");
  const needsYou = open.filter(exchangeNeedsYou).length;
  const past = exchanges.filter((exchange) => exchange.status !== "PROPOSED" && exchange.status !== "ACCEPTED");
  const visible = filter === "open" ? orderOpenExchanges(open) : past;
  const summary = filter === "open" ? openExchangeSummary(needsYou, open.length - needsYou) : null;

  return (
    <div>
      <h2>Exchanges</h2>
      <p className="muted">
        Trades and donations you have proposed or been asked about. Cards move only after both people confirm the
        handover.
      </p>
      <div className="filters">
        <button type="button" className={filter === "open" ? "tab active" : "tab"} onClick={() => setFilter("open")}>
          Open
        </button>
        <button type="button" className={filter === "past" ? "tab active" : "tab"} onClick={() => setFilter("past")}>
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
          {filter === "open" ? "No open exchanges. Propose one from a set's Matches page." : "No past exchanges yet."}
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
    </div>
  );
}
