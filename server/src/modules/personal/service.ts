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

function alreadyWritten(card: CardWithCopies) {
  throw new ApiError(409, "You already wrote this down. Add another physical copy?", {
    code: "already_written",
    card_id: card.id,
    card: toWrittenCard(card),
  });
}

function confirmSame(cards: CardWithCopies[]) {
  throw new ApiError(409, "You already wrote down a card with this name and no number.", {
    code: "confirm_same",
    matches: cards.map((card) => ({
      id: card.id,
      name: card.name,
      game: card.game,
      set_name: card.setName,
    })),
  });
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

      const created = await tx.personalCard.create({
        data: {
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
          disambiguator: identity.noNumber ? nextDisambiguator(existing) : 0,
          copies: {
            create: {
              ownerId,
              availability: input.availability,
              condition,
              printing,
              rawPrinting: printing,
            },
          },
        },
        include: cardInclude,
      });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const found = await prisma.personalCard.findFirst({
        where: { ownerId, normalizedKey: key },
        include: cardInclude,
      });
      if (found) alreadyWritten(found);
    }
    throw error;
  }
}

export async function correctWrittenCard(
  ownerId: string,
  cardId: string,
  input: Omit<WrittenCardInput, "availability" | "condition" | "printing" | "addCopy" | "differentCard" | "sameCardId">,
) {
  const current = await loadOwnedCard(ownerId, cardId);
  const identity = requireIdentity({ ...input, availability: "KEEP" });
  const key = personalNormalizedKey(identity);
  const clash = await prisma.personalCard.findFirst({
    where: { ownerId, normalizedKey: key, NOT: { id: current.id } },
    include: cardInclude,
  });
  if (clash) alreadyWritten(clash);

  const updated = await prisma.personalCard.update({
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
    },
    include: cardInclude,
  });
  return updated;
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
  const copy = await prisma.personalCopy.findUnique({ where: { id: copyId } });
  if (!copy || copy.ownerId !== ownerId) throw ApiError.notFound("Not found");
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
    const copy = await tx.personalCopy.findUnique({ where: { id: copyId } });
    if (!copy || copy.ownerId !== ownerId) throw ApiError.notFound("Not found");
    await tx.personalCopy.delete({ where: { id: copy.id } });
    const remaining = await tx.personalCopy.count({ where: { personalCardId: copy.personalCardId } });
    if (remaining === 0) {
      await tx.personalCard.delete({ where: { id: copy.personalCardId } });
      return { deleted_copy_id: copy.id, deleted_card: true };
    }
    return { deleted_copy_id: copy.id, deleted_card: false };
  });
}
