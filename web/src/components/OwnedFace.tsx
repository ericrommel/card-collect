import { useState } from "react";
import { copyImageUrl, type UserCopy } from "../lib/api";
import { frontPhotoCopy } from "../lib/ownedPhoto";
import { CardFace } from "./CardFace";

/**
 * The owner's card in their own set. A front photo replaces the sample drawing.
 * If the photo cannot be loaded, the sample drawing comes back. This is not shown
 * on a public page, and it is not proof the person holds the card.
 */
export function OwnedFace({
  number,
  name,
  rarity,
  ink,
  kind,
  copies,
  size = "md",
  photoRevision = 0,
}: {
  number: string;
  name: string;
  rarity: string | null;
  ink?: string | null;
  kind?: string | null;
  copies: UserCopy[];
  size?: "sm" | "md";
  /** Bumped after a photo is saved or removed, so a replacement is not the cached picture. */
  photoRevision?: number;
}) {
  const photo = frontPhotoCopy(copies);
  const token = photo ? `${photo.id}:${photoRevision}` : "";
  const [failedToken, setFailedToken] = useState<string | null>(null);
  if (photo && failedToken !== token) {
    return (
      <img
        className={size === "sm" ? "owned-photo owned-photo-sm" : "owned-photo"}
        src={copyImageUrl(photo.id, "front", photoRevision)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailedToken(token)}
      />
    );
  }
  return <CardFace number={number} name={name} rarity={rarity} ink={ink} kind={kind} size={size} />;
}
