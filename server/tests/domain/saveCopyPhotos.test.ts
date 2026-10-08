import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../web/src/lib/api.ts", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
  uploadCopyPhoto: vi.fn(),
}));

import { ApiError, uploadCopyPhoto } from "../../../web/src/lib/api.ts";
import { saveCopyPhotos } from "../../../web/src/lib/saveCopyPhotos.ts";

const upload = vi.mocked(uploadCopyPhoto);
const front = { name: "front.jpg" } as File;
const back = { name: "back.jpg" } as File;

describe("saveCopyPhotos", () => {
  beforeEach(() => {
    upload.mockReset();
    upload.mockResolvedValue({ image: { side: "front", content_type: "image/jpeg" } });
  });

  it("uploads only the sides that were chosen", async () => {
    await expect(saveCopyPhotos("copy-1", { front, back: null })).resolves.toBeNull();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[0]).toBe("copy-1");
    expect(upload.mock.calls[0]?.[1]).toBe("front");
    expect(upload.mock.calls[0]?.[2]).toBe(front);
  });

  it("names a failed side and still tries the other", async () => {
    upload.mockRejectedValueOnce(new ApiError(413, "That photo is too large."));
    upload.mockRejectedValueOnce(new Error("offline"));
    await expect(saveCopyPhotos("copy-1", { front, back })).resolves.toBe(
      "The front photo was not saved. That photo is too large. The back photo was not saved.",
    );
    expect(upload.mock.calls.map((call) => call[1])).toEqual(["front", "back"]);
  });

  it("does nothing when neither photo was chosen", async () => {
    await expect(saveCopyPhotos("copy-1", { front: null, back: null })).resolves.toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });
});
