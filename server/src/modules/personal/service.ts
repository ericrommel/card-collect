import { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import {
  parsePersonalIdentity,
  parsePersonalPrinting,
  personalNormalizedKey,
  type PersonalIdentity,
} from "../../domain/personalCard.js";
import { ApiError } from "../../middleware/apiError.js";

type Availability = "KEEP" | "TRADE" | "SELL" | "GIVE_AWAY";

export type WrittenCardInput = {
  name: string;
  game: string;
  setName: string;
  number?: string | null;
  noNumber: boolean;
  setCode?: string | null;
  rarity?: string | null;
  language?: string | null;
  printing?: string | null;
  availability: Availability;
  condition?: string | null;
  addCopy?: boolean;
  differentCard?: boolean;
  sameCardId?: string | null;
};

const cardInclude = {
  copies: { orderBy: { createdAt: "asc" as const } },
};

type CardWithCopies = Prisma.PersonalCardGetPayload<{ include: typeof cardInclude }>;

function toCopy(copy: CardWithCopies["copies"][number]) {
  return {
    id: copy.id,
    availability: copy.availability,
    condition: copy.condition,
    printing: copy.printing,
    created_at: copy.createdAt.toISOString(),
    updated_at: copy.updatedAt.toISOString(),
  };
}

export function toWrittenCard(card: CardWithCopies) {
  return {
    id: card.id,
    name: card.name,
    game: card.game,
    set_name: card.setName,
    number: card.number,
    no_number: card.noNumber,
    set_code: card.setCode,
    rarity: card.rarity,
    language: card.language,
    copies: card.copies.map(toCopy),
    copy_count: card.copies.length,
  };
}

export function writtenSummary(cards: CardWithCopies[]) {
  const copyCount = cards.reduce((sum, card) => sum + card.copies.length, 0);
  return {
    note_count: cards.length,
    extra_count: copyCount - cards.length,
  };
}

function alreadyWritten(card: CardWithCopies): never {
  throw new ApiError(409, "You already wrote this down. Add another physical copy?", {
    code: "already_written",
    card_id: card.id,
    card: toWrittenCard(card),
  });
}

function matchSummary(card: CardWithCopies) {
  return {
    id: card.id,
    name: card.name,
    game: card.game,
    set_name: card.setName,
    set_code: card.setCode,
    rarity: card.rarity,
    language: card.language,
    copy_count: card.copies.length,
  };
}

function confirmSame(cards: CardWithCopies[]): never {
  const ordered = [...cards].sort(
    (a, b) => a.disambiguator - b.disambiguator || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  throw new ApiError(409, "You already wrote down a card with this name and no number.", {
    code: "confirm_same",
    matches: ordered.map(matchSummary),
  });
}

function isUniqueConflict(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

type CardDb = Prisma.TransactionClient | typeof prisma;

function notesWithKey(db: CardDb, ownerId: string, key: string, exceptId?: string) {
  return db.personalCard.findMany({
    where: {
      ownerId,
      normalizedKey: key,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    include: cardInclude,
    orderBy: [{ disambiguator: "asc" }, { createdAt: "asc" }],
  });
}

function newCardData(
  ownerId: string,
  identity: PersonalIdentity,
  key: string,
  disambiguator: number,
  availability: Availability,
  condition: string | null,
  printing: string | null,
): Prisma.PersonalCardUncheckedCreateInput {
  return {
    ownerId,
    rawName: identity.name,
    rawGame: identity.game,
    rawSetName: identity.setName,
    rawNumber: identity.number,
    noNumber: identity.noNumber,
    name: identity.name,
    game: identity.game,
    setName: identity.setName,
    number: identity.number,
    rawSetCode: identity.setCode,
    setCode: identity.setCode,
    rawRarity: identity.rarity,
    rarity: identity.rarity,
    rawLanguage: identity.language,
    language: identity.language,
    normalizedKey: key,
    disambiguator,
    copies: {
      create: {
        // ownerId comes from the note. The relation does not accept a second owner.
        availability,
        condition,
        printing,
        rawPrinting: printing,
      },
    },
  };
}

function requireIdentity(input: WrittenCardInput): PersonalIdentity {
  const parsed = parsePersonalIdentity(input);
  if (!parsed.ok) throw ApiError.badRequest(parsed.error);
  return parsed.value;
}

function requirePrinting(value: string | null | undefined): string | null {
  const parsed = parsePersonalPrinting(value);
  if (!parsed.ok) throw ApiError.badRequest(parsed.error);
  return parsed.value;
}

async function loadOwnedCard(ownerId: string, cardId: string) {
  const card = await prisma.personalCard.findUnique({ where: { id: cardId }, include: cardInclude });
  if (!card || card.ownerId !== ownerId) throw ApiError.notFound("Not found");
  return card;
}

function copyBelongsToOwner<T extends { ownerId: string; personalCard: { ownerId: string } }>(
  copy: T | null,
  ownerId: string,
): copy is T {
  return copy !== null && copy.ownerId === ownerId && copy.personalCard.ownerId === ownerId;
}

async function addCopyOn(
  cardId: string,
  ownerId: string,
  availability: Availability,
  condition: string | null,
  printing: string | null,
) {
  await prisma.personalCopy.create({
    data: {
      personalCardId: cardId,
      ownerId,
      availability,
      condition,
      printing,
      rawPrinting: printing,
    },
  });
  return loadOwnedCard(ownerId, cardId);
}

function nextDisambiguator(cards: { disambiguator: number }[]): number {
  if (cards.length === 0) return 0;
  return Math.max(...cards.map((card) => card.disambiguator)) + 1;
}

export async function listWrittenCards(ownerId: string) {
  const cards = await prisma.personalCard.findMany({
    where: { ownerId },
    include: cardInclude,
    orderBy: { createdAt: "asc" },
  });
  return { notes: cards.map(toWrittenCard), ...writtenSummary(cards) };
}

export async function createWrittenCard(ownerId: string, input: WrittenCardInput) {
  const identity = requireIdentity(input);
  const printing = requirePrinting(input.printing);
  const key = personalNormalizedKey(identity);
  const condition = input.condition ?? null;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.personalCard.findMany({
        where: { ownerId, normalizedKey: key },
        include: cardInclude,
        orderBy: { disambiguator: "asc" },
      });

      if (!identity.noNumber) {
        const found = existing[0];
        if (found && !input.addCopy) alreadyWritten(found);
        if (found && input.addCopy) {
          await tx.personalCopy.create({
            data: {
              personalCardId: found.id,
              ownerId,
              availability: input.availability,
              condition,
              printing,
              rawPrinting: printing,
            },
          });
          return tx.personalCard.findUniqueOrThrow({ where: { id: found.id }, include: cardInclude });
        }
      } else if (existing.length > 0 && !input.differentCard && !input.sameCardId) {
        confirmSame(existing);
      } else if (input.sameCardId) {
        const found = existing.find((card) => card.id === input.sameCardId);
        if (!found) throw ApiError.badRequest("That note does not match what you typed.");
        await tx.personalCopy.create({
          data: {
            personalCardId: found.id,
            ownerId,
            availability: input.availability,
            condition,
            printing,
            rawPrinting: printing,
          },
        });
        return tx.personalCard.findUniqueOrThrow({ where: { id: found.id }, include: cardInclude });
      }

      return tx.personalCard.create({
        data: newCardData(
          ownerId,
          identity,
          key,
          identity.noNumber ? nextDisambiguator(existing) : 0,
          input.availability,
          condition,
          printing,
        ),
        include: cardInclude,
      });
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (!isUniqueConflict(error)) throw error;
    // Two no-number saves can pick the same disambiguator. Ask again, or retry one
    // "different card" insert. A numbered collision is the one note for that key.
    if (identity.noNumber && input.differentCard) {
      try {
        return await insertDifferentNote(ownerId, identity, key, input.availability, condition, printing);
      } catch (retryError) {
        if (retryError instanceof ApiError) throw retryError;
        if (!isUniqueConflict(retryError)) throw retryError;
      }
    }
    const matches = await notesWithKey(prisma, ownerId, key);
    const found = matches[0];
    if (!found) throw error;
    if (identity.noNumber) confirmSame(matches);
    alreadyWritten(found);
  }
}

async function insertDifferentNote(
  ownerId: string,
  identity: PersonalIdentity,
  key: string,
  availability: Availability,
  condition: string | null,
  printing: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.personalCard.findMany({
      where: { ownerId, normalizedKey: key },
      select: { disambiguator: true },
    });
    return tx.personalCard.create({
      data: newCardData(ownerId, identity, key, nextDisambiguator(existing), availability, condition, printing),
      include: cardInclude,
    });
  });
}

export async function correctWrittenCard(
  ownerId: string,
  cardId: string,
  input: Omit<WrittenCardInput, "availability" | "condition" | "printing" | "addCopy" | "differentCard" | "sameCardId">,
) {
  const current = await loadOwnedCard(ownerId, cardId);
  const identity = requireIdentity({ ...input, availability: "KEEP" });
  const key = personalNormalizedKey(identity);
  const sameKey = key === current.normalizedKey;
  // A numbered note is one row per key, so a former no-number sibling takes disambiguator 0.
  // An unchanged no-number key keeps its own disambiguator and is not a clash with its sibling.
  const disambiguator = identity.noNumber ? current.disambiguator : 0;

  try {
    return await prisma.$transaction(async (tx) => {
      if (!sameKey) {
        const clashes = await notesWithKey(tx, ownerId, key, current.id);
        if (clashes.length > 1) confirmSame(clashes);
        if (clashes.length === 1) alreadyWritten(clashes[0]);
      }
      return tx.personalCard.update({
        where: { id: current.id },
        data: {
          name: identity.name,
          game: identity.game,
          setName: identity.setName,
          number: identity.number,
          noNumber: identity.noNumber,
          setCode: identity.setCode,
          rarity: identity.rarity,
          language: identity.language,
          normalizedKey: key,
          disambiguator,
        },
        include: cardInclude,
      });
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (!isUniqueConflict(error)) throw error;
    const clashes = await notesWithKey(prisma, ownerId, key, current.id);
    const exact = clashes.find((card) => card.disambiguator === disambiguator);
    if (exact) alreadyWritten(exact);
    if (clashes.length > 1) confirmSame(clashes);
    if (clashes.length === 1) alreadyWritten(clashes[0]);
    throw error;
  }
}

export async function addWrittenCopy(
  ownerId: string,
  cardId: string,
  availability: Availability,
  condition: string | null,
  printing: string | null | undefined,
) {
  await loadOwnedCard(ownerId, cardId);
  const parsedPrinting = requirePrinting(printing);
  return addCopyOn(cardId, ownerId, availability, condition, parsedPrinting);
}

export async function updateWrittenCopy(
  ownerId: string,
  copyId: string,
  input: { availability?: Availability; condition?: string | null; printing?: string | null },
) {
  const copy = await prisma.personalCopy.findUnique({
    where: { id: copyId },
    include: { personalCard: { select: { ownerId: true } } },
  });
  if (!copyBelongsToOwner(copy, ownerId)) throw ApiError.notFound("Not found");
  const printing = input.printing === undefined ? undefined : requirePrinting(input.printing);
  await prisma.personalCopy.update({
    where: { id: copy.id },
    data: {
      availability: input.availability,
      condition: input.condition,
      printing,
    },
  });
  return loadOwnedCard(ownerId, copy.personalCardId);
}

export async function deleteWrittenCopy(ownerId: string, copyId: string) {
  return prisma.$transaction(async (tx) => {
    const copy = await tx.personalCopy.findUnique({
      where: { id: copyId },
      include: { personalCard: { select: { ownerId: true } } },
    });
    if (!copyBelongsToOwner(copy, ownerId)) throw ApiError.notFound("Not found");
    await tx.personalCopy.delete({ where: { id: copy.id } });
    const remaining = await tx.personalCopy.count({ where: { personalCardId: copy.personalCardId } });
    if (remaining === 0) {
      await tx.personalCard.delete({ where: { id: copy.personalCardId } });
      return { deleted_copy_id: copy.id, deleted_card: true };
    }
    return { deleted_copy_id: copy.id, deleted_card: false };
  });
}
