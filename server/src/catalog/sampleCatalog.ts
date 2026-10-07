/**
 * Original sample catalog used when a licensed card list is not available.
 *
 * Names, numbers, and groupings are invented for this app. They are not
 * official One Piece, Pokémon, Panini, or any other publisher's cards,
 * and they must not be described as such. See docs/decisions.md.
 */
import { CONDITION_GRADES, type ConditionGrade } from "../domain/condition.js";

export const HARBOR_UNIVERSE = {
  name: "Harbor Atlas",
  slug: "harbor-atlas",
} as const;

export const VOYAGE_SAMPLE_SLUG = "one-piece-card-game";

const SAMPLE_NOTICES: Record<string, string> = {
  [VOYAGE_SAMPLE_SLUG]:
    "Synthetic sample with original names. These are not official cards, and the app does not include official artwork.",
  [HARBOR_UNIVERSE.slug]:
    "Original sample catalog for trying a large collection. Not an official set, and not affiliated with any publisher.",
};

/** Short label shown next to a sample universe. Null for catalogs without this disclaimer. */
export function sampleNoticeForSlug(slug: string): string | null {
  return SAMPLE_NOTICES[slug] ?? null;
}

export type SampleRarity = "Common" | "Uncommon" | "Rare" | "Legendary";
export type SampleKind = "Place" | "Person" | "Object" | "Event";
export type SampleInk = "Sea" | "Ember" | "Leaf" | "Stone";

export interface SampleCard {
  number: string;
  name: string;
  rarity: SampleRarity;
  metadata: { kind: SampleKind; ink: SampleInk };
}

export interface SampleSet {
  code: string;
  name: string;
  releaseDate: string;
  cards: SampleCard[];
}

const PLACES = [
  "Lantern",
  "Cedar",
  "Marble",
  "Quill",
  "Ferry",
  "Orchard",
  "Kiln",
  "Linen",
  "Beacon",
  "Cinder",
  "Moss",
  "Harbor",
  "Amber",
  "Willow",
  "Copper",
  "Ivy",
  "Salt",
  "Glass",
  "North",
  "Braid",
] as const;

const NOUNS = [
  "Keeper",
  "Bridge",
  "Market",
  "Archive",
  "Signal",
  "Gate",
  "Well",
  "Loom",
  "Chart",
  "Bell",
  "Steps",
  "Window",
  "Key",
  "Map",
  "Door",
  "Clock",
  "Ribbon",
  "Field",
  "Post",
  "Yard",
] as const;

const KINDS = ["Place", "Person", "Object", "Event"] as const;
const INKS = ["Sea", "Ember", "Leaf", "Stone"] as const;

const SET_SPECS = [
  { code: "HA-01", prefix: "HA01", name: "Lantern Harbor", releaseDate: "2024-03-04", count: 180, salt: 0 },
  { code: "HA-02", prefix: "HA02", name: "Glass Market", releaseDate: "2024-09-16", count: 120, salt: 180 },
  { code: "HA-03", prefix: "HA03", name: "North Archive", releaseDate: "2025-02-03", count: 96, salt: 300 },
] as const;

function rarityFor(index: number): SampleRarity {
  const slot = index % 20;
  if (slot === 19) return "Legendary";
  if (slot >= 17) return "Rare";
  if (slot >= 12) return "Uncommon";
  return "Common";
}

function cardAt(spec: (typeof SET_SPECS)[number], index: number): SampleCard {
  const n = index + spec.salt;
  const place = PLACES[n % PLACES.length];
  const noun = NOUNS[Math.floor(n / PLACES.length) % NOUNS.length];
  return {
    number: `${spec.prefix}-${String(index + 1).padStart(3, "0")}`,
    name: `${place} ${noun}`,
    rarity: rarityFor(index),
    metadata: {
      kind: KINDS[index % KINDS.length],
      ink: INKS[Math.floor(index / KINDS.length) % INKS.length],
    },
  };
}

export function buildHarborSets(): SampleSet[] {
  return SET_SPECS.map((spec) => ({
    code: spec.code,
    name: spec.name,
    releaseDate: spec.releaseDate,
    cards: Array.from({ length: spec.count }, (_, index) => cardAt(spec, index)),
  }));
}

export type DemoCollector = "alice" | "bob" | "carol";
export type DemoAvailability = "KEEP" | "TRADE" | "SELL" | "GIVE_AWAY";

export interface PlannedCopy {
  setCode: string;
  number: string;
  owner: DemoCollector;
  availability: DemoAvailability;
  condition: ConditionGrade | null;
}

/**
 * Two physical copies the seed records as an already completed trade.
 * Current ownership matches the exchange: each card sits with the person
 * who received it, as a single Keep copy.
 */
export const DEMO_COMPLETED_TRADE = {
  setCode: "HA-02",
  /** Index 3. Alice owns it, Bob does not. */
  aliceReceivedNumber: "HA02-004",
  /** Index 2. Bob owns it, Alice does not. */
  bobReceivedNumber: "HA02-003",
} as const;

function conditionFor(index: number, availability: DemoAvailability): ConditionGrade | null {
  if (availability === "KEEP") {
    return index % 4 === 0 ? CONDITION_GRADES[index % CONDITION_GRADES.length] : null;
  }
  const shift = availability === "TRADE" ? 1 : availability === "SELL" ? 2 : 3;
  return CONDITION_GRADES[(index + shift) % CONDITION_GRADES.length];
}

function push(copies: PlannedCopy[], item: Omit<PlannedCopy, "condition"> & { condition?: ConditionGrade | null }) {
  copies.push({ ...item, condition: item.condition === undefined ? null : item.condition });
}

/**
 * Deterministic collections for the three demo accounts.
 *
 * Invariants (enforced by tests, not by the moduli themselves):
 * - HA-01 and HA-02 each have a mutual trade between Alice and Bob.
 * - HA-03 is untouched for Alice, with donation copies on Bob's side.
 * - Carol has no TRADE, SELL, or GIVE_AWAY copy, so she is never a match.
 * - The two DEMO_COMPLETED_TRADE cards each have exactly one Keep copy,
 *   owned by the collector who received them.
 */
export function planDemoCopies(): PlannedCopy[] {
  const copies: PlannedCopy[] = [];

  for (let i = 0; i < 180; i++) {
    const number = `HA01-${String(i + 1).padStart(3, "0")}`;
    if (i % 5 !== 0) {
      push(copies, {
        setCode: "HA-01",
        number,
        owner: "alice",
        availability: "KEEP",
        condition: conditionFor(i, "KEEP"),
      });
      if (i % 11 === 0) {
        push(copies, {
          setCode: "HA-01",
          number,
          owner: "alice",
          availability: "TRADE",
          condition: conditionFor(i, "TRADE"),
        });
      } else if (i % 29 === 0) {
        push(copies, {
          setCode: "HA-01",
          number,
          owner: "alice",
          availability: "GIVE_AWAY",
          condition: conditionFor(i, "GIVE_AWAY"),
        });
      } else if (i % 19 === 0) {
        push(copies, {
          setCode: "HA-01",
          number,
          owner: "alice",
          availability: "SELL",
          condition: conditionFor(i, "SELL"),
        });
      }
    }
    if (i % 5 !== 1) {
      push(copies, {
        setCode: "HA-01",
        number,
        owner: "bob",
        availability: "KEEP",
        condition: conditionFor(i, "KEEP"),
      });
      if (i % 13 === 0) {
        push(copies, {
          setCode: "HA-01",
          number,
          owner: "bob",
          availability: "TRADE",
          condition: conditionFor(i, "TRADE"),
        });
      } else if (i % 31 === 0) {
        push(copies, {
          setCode: "HA-01",
          number,
          owner: "bob",
          availability: "GIVE_AWAY",
          condition: conditionFor(i, "GIVE_AWAY"),
        });
      }
    }
    if (i < 12) {
      push(copies, {
        setCode: "HA-01",
        number,
        owner: "carol",
        availability: "KEEP",
        condition: i % 2 === 0 ? "Near Mint" : null,
      });
    }
  }

  for (let i = 0; i < 120; i++) {
    const number = `HA02-${String(i + 1).padStart(3, "0")}`;
    if (i % 3 !== 2) {
      push(copies, {
        setCode: "HA-02",
        number,
        owner: "alice",
        availability: "KEEP",
        condition: conditionFor(i, "KEEP"),
      });
      if (i % 10 === 0) {
        push(copies, {
          setCode: "HA-02",
          number,
          owner: "alice",
          availability: "TRADE",
          condition: conditionFor(i, "TRADE"),
        });
      }
    }
    if (i % 3 !== 0) {
      push(copies, {
        setCode: "HA-02",
        number,
        owner: "bob",
        availability: "KEEP",
        condition: conditionFor(i, "KEEP"),
      });
      if (i % 10 === 1) {
        push(copies, {
          setCode: "HA-02",
          number,
          owner: "bob",
          availability: "TRADE",
          condition: conditionFor(i, "TRADE"),
        });
      }
    }
    if (i < 8) {
      push(copies, { setCode: "HA-02", number, owner: "carol", availability: "KEEP", condition: null });
    }
  }

  for (let i = 0; i < 96; i++) {
    const number = `HA03-${String(i + 1).padStart(3, "0")}`;
    if (i % 5 === 0) {
      push(copies, {
        setCode: "HA-03",
        number,
        owner: "bob",
        availability: "KEEP",
        condition: conditionFor(i, "KEEP"),
      });
      if (i % 10 === 0) {
        push(copies, {
          setCode: "HA-03",
          number,
          owner: "bob",
          availability: "GIVE_AWAY",
          condition: conditionFor(i, "GIVE_AWAY"),
        });
      }
    }
    if (i % 7 === 0) {
      push(copies, { setCode: "HA-03", number, owner: "carol", availability: "KEEP", condition: "Good" });
    }
  }

  return copies;
}
