/** Catalog kinds that have a shared face mark. Anything else keeps the pattern. */
const MOTIFS = ["Person", "Place", "Object", "Event"] as const;

export type CardMotif = (typeof MOTIFS)[number];

export function cardMotif(kind: string | null | undefined): CardMotif | null {
  return MOTIFS.find((motif) => motif === kind) ?? null;
}

export function kindFromMetadata(metadata: Record<string, unknown> | null | undefined): CardMotif | null {
  const kind = metadata?.kind;
  return cardMotif(typeof kind === "string" ? kind : null);
}
