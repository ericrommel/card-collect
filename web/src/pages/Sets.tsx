import { CardSearch } from "../components/CardSearch";
import { SetCover } from "../components/SetCover";
import type { DashboardSetSummary } from "../lib/api";
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

export function SetsPage() {
  const { data, loading, error, reload } = useDashboard();
  if (loading) return <p className="muted">Loading catalog…</p>;
  if (error || !data) return <p className="error">{error ?? "Could not load the catalog."}</p>;

  const groups = groupSets(data.sets);

  return (
    <div className="page-stack catalog-page">
      <div>
        <p className="eyebrow">Catalog</p>
        <h1>Sets</h1>
        <p className="muted">Choose a set to search, filter, and update the cards you own.</p>
      </div>
      <CardSearch onAdded={reload} />
      {groups.length === 0 && (
        <div className="card empty-state">
          <p>No sets are loaded yet.</p>
        </div>
      )}
      {groups.map((group) => (
        <section key={group.id} className="page-stack">
          <h2>{group.name}</h2>
          {group.notice && <p className="notice-line">{group.notice}</p>}
          <div className="set-grid">
            {group.sets.map((set) => (
              <SetCover key={set.id} set={set} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
