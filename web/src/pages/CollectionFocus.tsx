import { Link, useParams } from "react-router-dom";
import { SetCover } from "../components/SetCover";
import { FOCUS_COPY, focusHref, isCollectionView, setsForFocus } from "../lib/collectionFocus";
import { useDashboard } from "../lib/useDashboard";

export function CollectionFocusPage() {
  const { view: raw } = useParams();
  const { data, loading, error } = useDashboard();

  if (!isCollectionView(raw)) {
    return (
      <div className="page-stack">
        <h1>That list isn't here</h1>
        <p className="muted">Home has the lists for missing cards, extras, and offers.</p>
        <Link to="/" className="secondary">
          Back home
        </Link>
      </div>
    );
  }

  if (loading) return <p className="muted">Loading your collection…</p>;
  if (error || !data) return <p className="error">{error ?? "Could not load your collection."}</p>;

  const copy = FOCUS_COPY[raw];
  const sets = setsForFocus(data.sets, raw);

  return (
    <div className="page-stack">
      <div>
        <p className="eyebrow">
          <Link to="/">Home</Link>
        </p>
        <h1>{copy.title}</h1>
        <p className="muted">{copy.intro}</p>
      </div>
      {sets.length === 0 ? (
        <div className="card empty-state">
          <p>{copy.empty}</p>
          <Link to="/sets" className="secondary">
            Browse the catalog
          </Link>
        </div>
      ) : (
        <div className="set-grid">
          {sets.map((set) => (
            <SetCover key={set.id} set={set} openTo={focusHref(set.id, raw)} hideJump={raw} />
          ))}
        </div>
      )}
    </div>
  );
}
