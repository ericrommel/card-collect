export type HighlightAction = "view" | "review" | "propose" | "ask";

/**
 * Home can open an exchange that already exists, or propose one when every
 * card is on the card. A shortened preview goes to the match page instead,
 * so a trade is not proposed from cards the person has not seen.
 */
export function highlightAction(item: {
  open_exchange_id?: string;
  type: string;
  you_receive_count: number;
  you_give_count: number;
  you_receive_preview: readonly unknown[];
  you_give_preview: readonly unknown[];
}): HighlightAction {
  if (item.open_exchange_id) return "view";
  if (item.you_receive_count > item.you_receive_preview.length || item.you_give_count > item.you_give_preview.length) {
    return "review";
  }
  return item.type === "DONATION" ? "ask" : "propose";
}

/** Says how many cards a side has, and when the home card is only a preview. */
export function previewCountSentence(verb: string, count: number, shown: number): string {
  const cards = `${count} ${count === 1 ? "card" : "cards"}`;
  if (shown < count) return `${verb} ${cards}. ${shown} shown here.`;
  return `${verb} ${cards}.`;
}
