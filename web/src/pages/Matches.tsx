import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "../lib/api";
import type { CatalogSet, CollectorMatch, MatchOffer } from "../lib/api";

function OfferList({ offers, emptyLabel }: { offers: MatchOffer[]; emptyLabel: string }) {
  if (offers.length === 0) return <p className="muted small">{emptyLabel}</p>;
  return (
    <ul className="offer-list">
      {offers.map((offer) => (
        <li key={offer.collectible.id}>
          <span className="card-number">{offer.collectible.number}</span> {offer.collectible.name}
          <span className={`badge small ${offer.availability === "GIVE_AWAY" ? "give-away" : "trade"}`}>
            {offer.availability}
          </span>
        </li>
      ))}
    </ul>
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
        Other collectors whose duplicates or give-aways cover what you're missing, and vice versa.
      </p>

      {matches.length === 0 && (
        <p className="muted">No matches yet. Add more copies or mark duplicates as TRADE / GIVE_AWAY.</p>
      )}

      <div className="matches">
        {matches.map((match) => (
          <div key={match.collector.display_name} className="card match-card">
            <div className="match-header">
              <h3>{match.collector.display_name}</h3>
              {match.is_mutual_match && <span className="badge mutual">Mutual match</span>}
            </div>

            <div className="match-columns">
              <div>
                <h4>You can receive</h4>
                <OfferList offers={match.you_can_receive} emptyLabel="Nothing yet" />
              </div>
              <div>
                <h4>You can offer</h4>
                <OfferList offers={match.you_can_offer} emptyLabel="Nothing yet" />
              </div>
            </div>

            {match.donation_opportunities.length > 0 && (
              <div className="donation-callout">
                <h4>Donation opportunity</h4>
                <OfferList offers={match.donation_opportunities} emptyLabel="" />
              </div>
            )}

            <p className="muted small">
              Your completion: {(match.set_completion_before * 100).toFixed(1)}% &rarr;{" "}
              {(match.set_completion_after_estimate * 100).toFixed(1)}% if you receive everything above
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
