/**
 * Deterministic seed data for local development and demos.
 *
 * Card names/numbers here are original, thematically "One Piece-style"
 * synthetic content (not copied from the official card list) to avoid
 * any dependency on licensed catalog text or artwork — see
 * docs/risks.md "Catalog Data Licensing" / "Official Card Image Rights".
 *
 * The demo collections for Alice and Bob are deliberately crafted so
 * that running `npm run seed` always produces:
 *  - duplicates for both users
 *  - a mutual trade match between Alice and Bob
 *  - a one-way donation opportunity (card #24, GIVE_AWAY)
 *  - a third user (Carol) with no offerable copies, so match filtering
 *    can be demonstrated (she never appears as a match).
 */
import { prisma } from "../src/db.js";
import { generateOpaqueId } from "../src/lib/opaqueId.js";
import { hashPassword } from "../src/modules/auth/password.js";
import {
  DEMO_COMPLETED_TRADE,
  HARBOR_UNIVERSE,
  buildHarborSets,
  planDemoCopies,
  type DemoCollector,
} from "../src/catalog/sampleCatalog.js";
import { proposeExchange } from "../src/modules/exchanges/service.js";

interface CardSeed {
  number: string;
  name: string;
  rarity: string;
  extraVariant?: string;
}

const CARDS: CardSeed[] = [
  { number: "SV01-001", name: "Straw Hat Captain", rarity: "L" },
  { number: "SV01-002", name: "Deputy Captain's Blade", rarity: "C" },
  { number: "SV01-003", name: "Sniper's Steady Aim", rarity: "C" },
  { number: "SV01-004", name: "Navigator's Storm Chart", rarity: "C" },
  { number: "SV01-005", name: "Cook's Fiery Kick", rarity: "C" },
  { number: "SV01-006", name: "Shipwright's Iron Hull", rarity: "UC" },
  { number: "SV01-007", name: "Doctor's Miracle Cure", rarity: "UC" },
  { number: "SV01-008", name: "Archaeologist's Ancient Text", rarity: "UC" },
  { number: "SV01-009", name: "Musician's Soul King Tune", rarity: "UC" },
  { number: "SV01-010", name: "Helmsman's Steady Hand", rarity: "C" },
  { number: "SV01-011", name: "Pirate Crew Banner", rarity: "C" },
  { number: "SV01-012", name: "Grand Line Current", rarity: "C" },
  { number: "SV01-013", name: "Den Den Mushi Call", rarity: "C" },
  { number: "SV01-014", name: "Marine Pursuit Ship", rarity: "UC" },
  { number: "SV01-015", name: "Revolutionary Signal", rarity: "R" },
  { number: "SV01-016", name: "Ancient Weapon Fragment", rarity: "R" },
  { number: "SV01-017", name: "Devil Fruit Awakening", rarity: "R" },
  { number: "SV01-018", name: "Legendary Swordsman's Duel", rarity: "SR", extraVariant: "Manga Rare" },
  { number: "SV01-019", name: "King of the Pirates' Ambition", rarity: "SR", extraVariant: "Manga Rare" },
  { number: "SV01-020", name: "Voyage's End Treasure", rarity: "SEC", extraVariant: "Manga Rare" },
  { number: "SV01-021", name: "Island Guardian Beast", rarity: "C" },
  { number: "SV01-022", name: "Bounty Poster Reveal", rarity: "C" },
  { number: "SV01-023", name: "Cross Crew Alliance", rarity: "UC" },
  { number: "SV01-024", name: "Final Island Map", rarity: "R" },
];

async function reset() {
  await prisma.exchangeLine.deleteMany();
  await prisma.userCopy.deleteMany();
  await prisma.exchange.deleteMany();
  await prisma.collectionShare.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.collectible.deleteMany();
  await prisma.set.deleteMany();
  await prisma.collectibleUniverse.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await reset();

  const universe = await prisma.collectibleUniverse.create({
    data: { name: "One Piece Card Game", slug: "one-piece-card-game" },
  });

  const set = await prisma.set.create({
    data: {
      universeId: universe.id,
      name: "Starter Voyage",
      code: "SV-01",
      releaseDate: new Date("2022-07-08"),
      providerId: null,
    },
  });

  const variantByNumber = new Map<string, { defaultId: string }>();

  for (const card of CARDS) {
    const collectible = await prisma.collectible.create({
      data: {
        setId: set.id,
        number: card.number,
        name: card.name,
        rarity: card.rarity,
      },
    });

    const base = await prisma.variant.create({
      data: { collectibleId: collectible.id, name: "Base", isDefault: true },
    });

    if (card.extraVariant) {
      await prisma.variant.create({
        data: { collectibleId: collectible.id, name: card.extraVariant, isDefault: false },
      });
    }

    variantByNumber.set(card.number, { defaultId: base.id });
  }

  const passwordHash = await hashPassword("password123");

  const alice = await prisma.user.create({
    data: {
      email: "alice@example.com",
      displayName: "Alice (Luffy Fan)",
      passwordHash,
      publicId: generateOpaqueId(),
    },
  });
  const bob = await prisma.user.create({
    data: {
      email: "bob@example.com",
      displayName: "Bob (Zoro Fan)",
      passwordHash,
      publicId: generateOpaqueId(),
    },
  });
  const carol = await prisma.user.create({
    data: {
      email: "carol@example.com",
      displayName: "Carol (Nami Fan)",
      passwordHash,
      publicId: generateOpaqueId(),
    },
  });

  const variantId = (number: string) => {
    const entry = variantByNumber.get(number);
    if (!entry) throw new Error(`Unknown card number in seed: ${number}`);
    return entry.defaultId;
  };

  async function addCopy(
    ownerId: string,
    number: string,
    availability: "KEEP" | "TRADE" | "SELL" | "GIVE_AWAY" = "KEEP",
    condition: string | null = null,
  ) {
    await prisma.userCopy.create({
      data: { ownerId, variantId: variantId(number), availability, condition },
    });
  }

  // --- Alice: owns 1-16, with a few duplicates offered for trade/donation.
  for (let n = 1; n <= 16; n++) {
    await addCopy(alice.id, CARDS[n - 1].number, "KEEP");
  }
  await addCopy(alice.id, "SV01-003", "TRADE", "Excellent"); // duplicate #3
  await addCopy(alice.id, "SV01-007", "TRADE", "Good"); // duplicate #7
  await addCopy(alice.id, "SV01-010", "TRADE", "Near Mint"); // duplicate #10 — what Bob needs in the mutual trade
  await addCopy(alice.id, "SV01-012", "GIVE_AWAY", "Played"); // duplicate #12, given away

  // --- Bob: owns 1-8 and 17-24, with duplicates offered for trade/donation.
  for (let n = 1; n <= 8; n++) {
    await addCopy(bob.id, CARDS[n - 1].number, "KEEP");
  }
  for (let n = 17; n <= 24; n++) {
    await addCopy(bob.id, CARDS[n - 1].number, "KEEP");
  }
  await addCopy(bob.id, "SV01-019", "TRADE", "Near Mint"); // duplicate #19
  await addCopy(bob.id, "SV01-021", "TRADE", "Excellent"); // duplicate #21
  await addCopy(bob.id, "SV01-024", "GIVE_AWAY", "Good"); // extra #24, given away

  // --- Carol: a small starter collection with nothing offerable, so she
  // never appears in anyone's match list (demonstrates no-false-positive filtering).
  for (let n = 1; n <= 5; n++) {
    await addCopy(carol.id, CARDS[n - 1].number, "KEEP");
  }

  const harbor = await seedHarborAtlas({
    alice: alice.id,
    bob: bob.id,
    carol: carol.id,
    bobRef: bob.publicId,
  });

  console.log("Seed complete:");
  console.log(`  Universe: ${universe.name}`);
  console.log(`  Set: ${set.name} (${set.code}) — ${CARDS.length} collectibles`);
  console.log(`  Universe: ${harbor.universeName}`);
  for (const sample of harbor.sets) {
    console.log(`  Set: ${sample.name} (${sample.code}) — ${sample.cards} collectibles`);
  }
  console.log(`  Pending trade: ${harbor.pendingExchangeId}`);
  console.log(`  Completed trade: ${harbor.completedExchangeId}`);
  console.log("  Users: alice@example.com / bob@example.com / carol@example.com (password: password123)");
}

function chunks<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function seedHarborAtlas(users: Record<DemoCollector, string> & { bobRef: string }) {
  const universe = await prisma.collectibleUniverse.create({
    data: { name: HARBOR_UNIVERSE.name, slug: HARBOR_UNIVERSE.slug },
  });
  const samples = buildHarborSets();
  const variantIdByKey = new Map<string, string>();

  for (const sample of samples) {
    const set = await prisma.set.create({
      data: {
        universeId: universe.id,
        providerId: `sample:${sample.code}`,
        name: sample.name,
        code: sample.code,
        releaseDate: new Date(sample.releaseDate),
      },
    });
    for (const batch of chunks(sample.cards, 60)) {
      await prisma.collectible.createMany({
        data: batch.map((card) => ({
          setId: set.id,
          providerId: `sample:${card.number}`,
          number: card.number,
          name: card.name,
          rarity: card.rarity,
          metadata: JSON.stringify(card.metadata),
        })),
      });
    }
    const collectibles = await prisma.collectible.findMany({
      where: { setId: set.id },
      select: { id: true, number: true },
    });
    for (const batch of chunks(collectibles, 80)) {
      await prisma.variant.createMany({
        data: batch.map((collectible) => ({
          collectibleId: collectible.id,
          name: "Base",
          isDefault: true,
        })),
      });
    }
    const variants = await prisma.variant.findMany({
      where: { collectible: { setId: set.id }, isDefault: true },
      select: { id: true, collectible: { select: { number: true } } },
    });
    for (const variant of variants) {
      variantIdByKey.set(`${sample.code}:${variant.collectible.number}`, variant.id);
    }
  }

  const plan = planDemoCopies();
  const copyRows = plan.map((item) => {
    const variantId = variantIdByKey.get(`${item.setCode}:${item.number}`);
    if (!variantId) throw new Error(`Missing sample variant ${item.setCode} ${item.number}`);
    return {
      ownerId: users[item.owner],
      variantId,
      availability: item.availability,
      condition: item.condition,
    };
  });
  for (const batch of chunks(copyRows, 80)) {
    await prisma.userCopy.createMany({ data: batch });
  }

  const completedExchangeId = await recordCompletedHarborTrade(users.alice, users.bob);
  const harbor = await prisma.set.findUniqueOrThrow({ where: { code: "HA-01" } });
  const pending = await proposeExchange(users.alice, {
    setId: harbor.id,
    collectorRef: users.bobRef,
    type: "MUTUAL_TRADE",
  });

  return {
    universeName: universe.name,
    sets: samples.map((sample) => ({ name: sample.name, code: sample.code, cards: sample.cards.length })),
    pendingExchangeId: pending.id,
    completedExchangeId,
  };
}

async function loadDemoCopy(ownerId: string, number: string) {
  const copy = await prisma.userCopy.findFirst({
    where: {
      ownerId,
      availability: "KEEP",
      variant: { collectible: { number, set: { code: DEMO_COMPLETED_TRADE.setCode } } },
    },
    include: { variant: { include: { collectible: true } } },
  });
  if (!copy) throw new Error(`Missing completed-trade copy ${number} for ${ownerId}`);
  return copy;
}

async function recordCompletedHarborTrade(aliceId: string, bobId: string) {
  const aliceReceived = await loadDemoCopy(aliceId, DEMO_COMPLETED_TRADE.aliceReceivedNumber);
  const bobReceived = await loadDemoCopy(bobId, DEMO_COMPLETED_TRADE.bobReceivedNumber);
  const set = await prisma.set.findUniqueOrThrow({ where: { code: DEMO_COMPLETED_TRADE.setCode } });
  const agreed = new Date("2026-09-12T15:00:00.000Z");
  const created = await prisma.exchange.create({
    data: {
      type: "MUTUAL_TRADE",
      status: "COMPLETED",
      setId: set.id,
      proposerId: aliceId,
      counterpartyId: bobId,
      proposerConfirmedAt: agreed,
      counterpartyConfirmedAt: agreed,
      closedAt: agreed,
      createdAt: new Date("2026-09-12T14:40:00.000Z"),
      lines: {
        create: [
          {
            copyId: aliceReceived.id,
            fromUserId: bobId,
            toUserId: aliceId,
            collectibleNumber: aliceReceived.variant.collectible.number,
            collectibleName: aliceReceived.variant.collectible.name,
            rarity: aliceReceived.variant.collectible.rarity,
            condition: aliceReceived.condition,
          },
          {
            copyId: bobReceived.id,
            fromUserId: aliceId,
            toUserId: bobId,
            collectibleNumber: bobReceived.variant.collectible.number,
            collectibleName: bobReceived.variant.collectible.name,
            rarity: bobReceived.variant.collectible.rarity,
            condition: bobReceived.condition,
          },
        ],
      },
    },
  });
  return created.id;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
