import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, prepareCardPhoto } from "../../src/modules/images/preparePhoto.js";

function segment(marker: number, data: Uint8Array): Buffer {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(2 + data.length);
  return Buffer.concat([Buffer.from([0xff, marker]), length, data]);
}

function jpegWith(app0: boolean, secret: string): Buffer {
  const parts: Uint8Array[] = [Buffer.from([0xff, 0xd8])];
  if (app0) parts.push(segment(0xe0, Buffer.from("JFIF\0", "binary")));
  parts.push(segment(0xe1, Buffer.from(`Exif\0\0${secret}`, "binary")));
  parts.push(segment(0xc0, Buffer.from([0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00])));
  parts.push(segment(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])));
  parts.push(Buffer.from([0x12, 0xff, 0xd9]));
  return Buffer.concat(parts);
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
}

describe("prepareCardPhoto", () => {
  it("drops JPEG location metadata and keeps the picture markers", () => {
    const prepared = prepareCardPhoto(jpegWith(true, "GPS-SECRET"));
    expect(prepared.contentType).toBe("image/jpeg");
    expect(prepared.bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(prepared.bytes.includes(Buffer.from("GPS-SECRET"))).toBe(false);
    expect(prepared.bytes.includes(Buffer.from("Exif"))).toBe(false);
    expect(prepared.bytes.includes(Buffer.from("JFIF"))).toBe(true);
    expect(prepared.bytes.includes(Buffer.from([0xff, 0xda]))).toBe(true);
    expect(prepared.bytes.subarray(prepared.bytes.length - 2)).toEqual(Buffer.from([0xff, 0xd9]));
  });

  it("drops bytes after the JPEG end marker and keeps a stuffed FF", () => {
    const jpeg = Buffer.concat([jpegWith(false, "GPS-SECRET"), Buffer.from("TRAILING-SECRET")]);
    const prepared = prepareCardPhoto(jpeg);
    expect(prepared.bytes.includes(Buffer.from("TRAILING-SECRET"))).toBe(false);
    expect(prepared.bytes.includes(Buffer.from("GPS-SECRET"))).toBe(false);
    expect(prepared.bytes.subarray(prepared.bytes.length - 2)).toEqual(Buffer.from([0xff, 0xd9]));

    const stuffed = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      segment(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
      Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd9, 0x99]),
    ]);
    const kept = prepareCardPhoto(stuffed);
    expect(kept.bytes.includes(Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd9]))).toBe(true);
    expect(kept.bytes[kept.bytes.length - 1]).toBe(0xd9);
    expect(kept.bytes.includes(Buffer.from([0x99]))).toBe(false);

    const endless = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      segment(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
      Buffer.from([0x12, 0x34]),
    ]);
    expect(() => prepareCardPhoto(endless)).toThrow(/JPEG or PNG/);
  });

  it("drops PNG text chunks", () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", Buffer.from("header")),
      pngChunk("tEXt", Buffer.from("GPS\0GPS-SECRET")),
      pngChunk("IDAT", Buffer.from("pixels")),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    const prepared = prepareCardPhoto(png);
    expect(prepared.contentType).toBe("image/png");
    expect(prepared.bytes.includes(Buffer.from("GPS-SECRET"))).toBe(false);
    expect(prepared.bytes.includes(Buffer.from("IHDR"))).toBe(true);
    expect(prepared.bytes.includes(Buffer.from("IDAT"))).toBe(true);
    expect(prepared.bytes.includes(Buffer.from("IEND"))).toBe(true);
  });

  it("rejects other file types and oversized photos", () => {
    expect(() => prepareCardPhoto(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toThrow(/JPEG or PNG/);
    const huge = Buffer.alloc(MAX_PHOTO_BYTES + 1);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    expect(() => prepareCardPhoto(huge)).toThrow(/too large/);
  });
});
