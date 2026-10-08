import { useEffect, useState } from "react";
import { NARROW_EXPLORER_QUERY } from "./explorerDetail";

/** True when the set page would cover the grid with a card sheet. */
export function useNarrowViewport(query = NARROW_EXPLORER_QUERY): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
