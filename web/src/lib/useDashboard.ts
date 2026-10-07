import { useCallback, useEffect, useState } from "react";
import { getDashboard, type Dashboard } from "./api";

export function useDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    return getDashboard()
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load your collection");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
