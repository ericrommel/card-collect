/** Catalog labels the face knows how to draw. Anything else stays off the wire. */
const KINDS = ["Person", "Place", "Object", "Event"] as const;
const INKS = ["Sea", "Ember", "Leaf", "Stone"] as const;

export interface CatalogFace {
  kind: (typeof KINDS)[number] | null;
  ink: (typeof INKS)[number] | null;
}

function asRecord(metadata: unknown): Record<string, unknown> | null {
  if (typeof metadata === "string") {
    try {
      return asRecord(JSON.parse(metadata) as unknown);
    } catch {
      return null;
    }
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return metadata as Record<string, unknown>;
}

/**
 * Reads the kind and ink the sample catalog stores on a card.
 * A value outside the known lists is dropped, and every other metadata
 * key is ignored, so a note or a link on the catalog row cannot ride
 * along on a search result, a match, or a public page.
 */
export function catalogFace(metadata: unknown): CatalogFace {
  const record = asRecord(metadata);
  const kind = KINDS.find((item) => item === record?.kind) ?? null;
  const ink = INKS.find((item) => item === record?.ink) ?? null;
  return { kind, ink };
}
