import { ApiError } from "../../middleware/apiError.js";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TOO_LARGE = "That image is too large. Use a photo under 5 MB.";
export const PHOTO_TYPE = "Use a JPEG or PNG photo.";

export type PhotoContentType = "image/jpeg" | "image/png";

/**
 * Checks the file type from the bytes and drops metadata segments.
 * This does not re-encode the picture, so it is not a guarantee against
 * every malformed file. SVG and other types are rejected. Location data
 * that lives in JPEG EXIF/XMP or PNG text chunks is removed.
 */
export function prepareCardPhoto(input: Buffer): { bytes: Buffer; contentType: PhotoContentType } {
  if (input.length === 0) throw ApiError.badRequest(PHOTO_TYPE);
  if (input.length > MAX_PHOTO_BYTES) throw ApiError.payloadTooLarge(PHOTO_TOO_LARGE);
  if (isJpeg(input)) return { bytes: stripJpeg(input), contentType: "image/jpeg" };
  if (isPng(input)) return { bytes: stripPng(input), contentType: "image/png" };
  throw ApiError.badRequest(PHOTO_TYPE);
}

function isJpeg(input: Buffer): boolean {
  return input.length >= 4 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
}

function isPng(input: Buffer): boolean {
  return input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function stripJpeg(input: Buffer): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let offset = 2;
  while (offset < input.length) {
    if (input[offset] !== 0xff) throw ApiError.badRequest(PHOTO_TYPE);
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    if (offset >= input.length) throw ApiError.badRequest(PHOTO_TYPE);
    const marker = input[offset];
    offset += 1;
    if (marker === 0xd9) {
      parts.push(Buffer.from([0xff, 0xd9]));
      return Buffer.concat(parts);
    }
    if (marker === 0xda) {
      parts.push(Buffer.from([0xff, 0xda]), input.subarray(offset));
      return Buffer.concat(parts);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(Buffer.from([0xff, marker]));
      continue;
    }
    if (offset + 2 > input.length) throw ApiError.badRequest(PHOTO_TYPE);
    const segmentLength = input.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > input.length) throw ApiError.badRequest(PHOTO_TYPE);
    const dropMetadata = marker === 0xfe || (marker >= 0xe1 && marker <= 0xef && marker !== 0xe2 && marker !== 0xee);
    // Keep APP0 (JFIF) and APP2 (color profile) and APP14 (Adobe). Drop EXIF, XMP, IPTC, and comments.
    if (!dropMetadata) {
      parts.push(Buffer.from([0xff, marker]), input.subarray(offset, offset + segmentLength));
    }
    offset += segmentLength;
  }
  throw ApiError.badRequest(PHOTO_TYPE);
}

const PNG_TEXT_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(input: Buffer): Buffer {
  const parts: Buffer[] = [input.subarray(0, 8)];
  let offset = 8;
  let sawHeader = false;
  let sawEnd = false;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    if (length > MAX_PHOTO_BYTES || offset + 12 + length > input.length) throw ApiError.badRequest(PHOTO_TYPE);
    const type = input.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = input.subarray(offset, offset + 12 + length);
    if (type === "IHDR") sawHeader = true;
    if (type === "IEND") sawEnd = true;
    if (!PNG_TEXT_CHUNKS.has(type)) parts.push(chunk);
    offset += 12 + length;
    if (sawEnd) break;
  }
  if (!sawHeader || !sawEnd || offset !== input.length) throw ApiError.badRequest(PHOTO_TYPE);
  return Buffer.concat(parts);
}
