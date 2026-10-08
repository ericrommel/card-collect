import { describe, expect, it } from "vitest";
import { exchangeNeedsYou, openExchangeSummary, orderOpenExchanges } from "../../../web/src/lib/exchangeQueue.ts";

function exchange(status: string, role: string, youConfirmed = false) {
  return { id: `${status}-${role}-${youConfirmed}`, status, role, you_confirmed: youConfirmed };
}

describe("exchangeNeedsYou", () => {
  it("is a proposal you received or an accepted exchange you have not confirmed", () => {
    expect(exchangeNeedsYou(exchange("PROPOSED", "counterparty"))).toBe(true);
    expect(exchangeNeedsYou(exchange("ACCEPTED", "proposer"))).toBe(true);
    expect(exchangeNeedsYou(exchange("ACCEPTED", "counterparty"))).toBe(true);
    expect(exchangeNeedsYou(exchange("PROPOSED", "proposer"))).toBe(false);
    expect(exchangeNeedsYou(exchange("ACCEPTED", "proposer", true))).toBe(false);
    expect(exchangeNeedsYou(exchange("COMPLETED", "counterparty"))).toBe(false);
    expect(exchangeNeedsYou(exchange("DECLINED", "counterparty"))).toBe(false);
    expect(exchangeNeedsYou(exchange("CANCELLED", "proposer"))).toBe(false);
  });
});

describe("orderOpenExchanges", () => {
  it("puts exchanges that need you first and keeps the API order inside each group", () => {
    const waitingFirst = exchange("PROPOSED", "proposer");
    const needsLater = exchange("PROPOSED", "counterparty");
    const waitingSecond = exchange("ACCEPTED", "proposer", true);
    const needsEarlier = exchange("ACCEPTED", "counterparty");
    const input = [waitingFirst, needsLater, waitingSecond, needsEarlier];
    expect(orderOpenExchanges(input).map((item) => item.id)).toEqual([
      needsLater.id,
      needsEarlier.id,
      waitingFirst.id,
      waitingSecond.id,
    ]);
    expect(input.map((item) => item.id)).toEqual([waitingFirst.id, needsLater.id, waitingSecond.id, needsEarlier.id]);
  });
});

describe("openExchangeSummary", () => {
  it("says who the open exchanges are waiting on", () => {
    expect(openExchangeSummary(0, 0)).toBeNull();
    expect(openExchangeSummary(1, 0)).toBe("1 exchange needs you.");
    expect(openExchangeSummary(2, 0)).toBe("2 exchanges need you.");
    expect(openExchangeSummary(0, 1)).toBe("1 is waiting on the other person.");
    expect(openExchangeSummary(0, 3)).toBe("3 are waiting on the other person.");
    expect(openExchangeSummary(1, 2)).toBe("1 exchange needs you. 2 are waiting on the other person.");
  });
});
