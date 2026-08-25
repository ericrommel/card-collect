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
import { hashPassword } from "../src/modules/auth/password.js";

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
  await prisma.userCopy.deleteMany();
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
    },
  });
  const bob = await prisma.user.create({
    data: {
      email: "bob@example.com",
      displayName: "Bob (Zoro Fan)",
      passwordHash,
    },
  });
  const carol = await prisma.user.create({
    data: {
      email: "carol@example.com",
      displayName: "Carol (Nami Fan)",
      passwordHash,
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
  ) {
    await prisma.userCopy.create({
      data: { ownerId, variantId: variantId(number), availability },
    });
  }

  // --- Alice: owns 1-16, with a few duplicates offered for trade/donation.
  for (let n = 1; n <= 16; n++) {
    await addCopy(alice.id, CARDS[n - 1].number, "KEEP");
  }
  await addCopy(alice.id, "SV01-003", "TRADE"); // duplicate #3
  await addCopy(alice.id, "SV01-007", "TRADE"); // duplicate #7
  await addCopy(alice.id, "SV01-012", "GIVE_AWAY"); // duplicate #12, given away

  // --- Bob: owns 1-8 and 17-24, with duplicates offered for trade/donation.
  for (let n = 1; n <= 8; n++) {
    await addCopy(bob.id, CARDS[n - 1].number, "KEEP");
  }
  for (let n = 17; n <= 24; n++) {
    await addCopy(bob.id, CARDS[n - 1].number, "KEEP");
  }
  await addCopy(bob.id, "SV01-019", "TRADE"); // duplicate #19
  await addCopy(bob.id, "SV01-021", "TRADE"); // duplicate #21
  await addCopy(bob.id, "SV01-024", "GIVE_AWAY"); // extra #24, given away

  // --- Carol: a small starter collection with nothing offerable, so she
  // never appears in anyone's match list (demonstrates no-false-positive filtering).
  for (let n = 1; n <= 5; n++) {
    await addCopy(carol.id, CARDS[n - 1].number, "KEEP");
  }

  console.log("Seed complete:");
  console.log(`  Universe: ${universe.name}`);
  console.log(`  Set: ${set.name} (${set.code}) — ${CARDS.length} collectibles`);
  console.log("  Users: alice@example.com / bob@example.com / carol@example.com (password: password123)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
