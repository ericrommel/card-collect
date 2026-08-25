import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "../lib/api";
import type { CatalogSet, CollectorMatch, MatchCollectibleRef } from "../lib/api";

function CardChips({ items }: { items: MatchCollectibleRef[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="offer-list">
      {items.map((item) => (
        <li key={item.id}>
          <span className="card-number">{item.number}</span> {item.name}
          {item.rarity && <span className="badge small">{item.rarity}</span>}
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

function MatchCard({ match }: { match: CollectorMatch }) {
  const isDonation = match.type === "DONATION";

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
        Ranked by how much closer each trade or donation gets you (and, for trades, them) to completing the set.
      </p>

      {matches.length === 0 && (
        <p className="muted">No matches yet. Add more copies or mark duplicates as TRADE / GIVE_AWAY.</p>
      )}

      <div className="matches">
        {matches.map((match, i) => (
          <MatchCard key={`${match.collector.display_name}-${match.type}-${i}`} match={match} />
        ))}
      </div>
    </div>
  );
}
