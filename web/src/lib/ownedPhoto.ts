/** The caller's own front photo, if one of their copies has one. Back photos stay in the editor. */
export function frontPhotoCopy<T extends { has_front_image: boolean }>(copies: T[]): T | null {
  return copies.find((copy) => copy.has_front_image) ?? null;
}
