import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../lib/api";
import type { CatalogSet, CollectorMatch, MatchCollectibleRef } from "../lib/api";
import { rarityLabel } from "../lib/labels";

function CardChips({ items }: { items: MatchCollectibleRef[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="offer-list">
      {items.map((item) => (
        <li key={item.id}>
          <span className="card-number">{item.number}</span> {item.name}
          {item.rarity && <span className="badge small">{rarityLabel(item.rarity)}</span>}
        </li>
      ))}
    </ul>
  );
}

function CompletionRow({ label, before, after }: { label: string; before: number; after: number }) {
  return (
    <div className="completion-row">
      <span className="muted small">{label}</span>
      <span className="completion-values">
        {before}% <span className="arrow">&rarr;</span> <strong>{after}%</strong>
      </span>
    </div>
  );
}

function MatchCard({ match, setId }: { match: CollectorMatch; setId: string }) {
  const navigate = useNavigate();
  const isDonation = match.type === "DONATION";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function propose() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.proposeExchange({
        set_id: setId,
        collector_ref: match.collector.ref,
        type: match.type,
      });
      navigate(`/exchanges#${res.exchange.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not propose this exchange");
      setBusy(false);
    }
  }

  return (
    <div className="card match-card">
      <div className="match-header">
        <span className={`score-badge ${isDonation ? "donation" : "trade"}`}>
          {match.score}% {isDonation ? "Donation Match" : "Match"}
        </span>
        <h3>{match.collector.display_name}</h3>
      </div>

      <div className="match-columns">
        <div>
          <p>
            {isDonation ? "You can receive" : "You receive"} <strong>{match.current_user.cards_received}</strong>{" "}
            missing {match.current_user.cards_received === 1 ? "card" : "cards"}
          </p>
          <CardChips items={match.proposed_exchange.you_receive} />
        </div>
        <div>
          {isDonation ? (
            <p className="muted">No return cards required</p>
          ) : (
            <>
              <p>
                They receive <strong>{match.other_collector?.cards_received}</strong> missing{" "}
                {match.other_collector?.cards_received === 1 ? "card" : "cards"}
              </p>
              <CardChips items={match.proposed_exchange.they_receive} />
            </>
          )}
        </div>
      </div>

      <div className="match-completion">
        <CompletionRow
          label="Your collection"
          before={match.current_user.completion_before}
          after={match.current_user.completion_after}
        />
        {!isDonation && match.other_collector && (
          <CompletionRow
            label="Their collection"
            before={match.other_collector.completion_before}
            after={match.other_collector.completion_after}
          />
        )}
      </div>

      {error && <p className="error">{error}</p>}
      <div className="match-actions">
        {match.open_exchange_id ? (
          <Link to={`/exchanges#${match.open_exchange_id}`} className="secondary">
            View exchange
          </Link>
        ) : (
          <button className="primary" disabled={busy} onClick={propose}>
            {busy ? "Proposing..." : isDonation ? "Ask for these cards" : "Propose this trade"}
          </button>
        )}
      </div>
    </div>
  );
}

export function MatchesPage() {
  const { setId } = useParams<{ setId: string }>();
  const [set, setSet] = useState<CatalogSet | null>(null);
  const [matches, setMatches] = useState<CollectorMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setId) return;
    Promise.all([api.listSets(), api.myMatches(setId)])
      .then(([setsRes, matchesRes]) => {
        setSet(setsRes.sets.find((s) => s.id === setId) ?? null);
        setMatches(matchesRes.matches);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [setId]);

  if (loading) return <p className="muted">Finding matches...</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <div>
      <p>
        <Link to={`/sets/${setId}`}>&larr; Back to checklist</Link>
      </p>
      <h2>Matches for {set?.name ?? "this set"}</h2>
      <p className="muted">
        Ranked by how much closer each trade or donation gets you (and, for trades, them) to completing the set. The
        score is about finishing the set, not about card value or a fair price.
      </p>

      {matches.length === 0 && (
        <p className="muted">No matches yet. Add more copies or mark duplicates as TRADE / GIVE_AWAY.</p>
      )}

      <div className="matches">
        {matches.map((match) => (
          <MatchCard key={`${match.collector.ref}-${match.type}`} match={match} setId={setId ?? ""} />
        ))}
      </div>
    </div>
  );
}
