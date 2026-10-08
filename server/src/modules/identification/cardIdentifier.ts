export interface IdentificationCandidate {
  set_code: string;
  number: string;
  name: string;
  /** 0 to 1. A guess, never a confirmation that this is the card. */
  confidence: number;
}

export type IdentificationResult =
  | { status: "unavailable"; candidates: []; message: string }
  | { status: "candidates"; candidates: IdentificationCandidate[]; message: string };

export interface CardIdentifier {
  identify(bytes: Buffer, contentType: string): Promise<IdentificationResult>;
}

export const IDENTIFY_UNAVAILABLE_MESSAGE =
  "Automatic recognition is not available. Search for the card and confirm it yourself.";

export const IDENTIFY_CANDIDATES_MESSAGE = "These are guesses. Confirm the right card before adding a copy.";

/** Used until a recognition provider is configured. It never invents a card. */
export const unavailableCardIdentifier: CardIdentifier = {
  identify() {
    return Promise.resolve({
      status: "unavailable",
      candidates: [],
      message: IDENTIFY_UNAVAILABLE_MESSAGE,
    });
  },
};

let current: CardIdentifier = unavailableCardIdentifier;

export function getCardIdentifier(): CardIdentifier {
  return current;
}

export function setCardIdentifier(next: CardIdentifier): void {
  current = next;
}
