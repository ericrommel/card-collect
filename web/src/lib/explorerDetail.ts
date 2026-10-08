/** Matches the set-page sheet breakpoint in styles.css. */
export const NARROW_EXPLORER_QUERY = "(max-width: 959px)";

export type ExplorerDetailMode = "single" | "compare";

export interface ExplorerDetail<T> {
  mode: ExplorerDetailMode;
  entries: T[];
}

/**
 * Which card panel to show over or beside the set.
 *
 * A wide layout opens the editor for one selected card and a comparison for two.
 * A narrow layout does not cover the grid while someone is still selecting.
 * They ask for the card or the comparison. Opening one card outside select mode
 * still shows it on either layout.
 */
export function explorerDetail<T>(input: {
  selecting: boolean;
  narrow: boolean;
  inspect: boolean;
  selected: T[];
  focus: T | null;
}): ExplorerDetail<T> | null {
  if (!input.selecting) {
    return input.focus ? { mode: "single", entries: [input.focus] } : null;
  }
  if (input.narrow && !input.inspect) return null;
  if (input.selected.length === 2) return { mode: "compare", entries: input.selected };
  if (input.selected.length === 1) return { mode: "single", entries: input.selected };
  return null;
}
