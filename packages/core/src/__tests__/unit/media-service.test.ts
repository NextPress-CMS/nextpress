import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma, resetMockPrisma } from "../mocks/prisma";

vi.mock("@nextpress/db", () => ({ prisma: mockPrisma }));
// Vitest 4 no longer lets arrow-function mocks be called with `new`, so the
// storage backends are mocked as real classes.
vi.mock("../../media/local-storage", () => ({
  LocalStorage: class {
    put = vi.fn().mockResolvedValue({ key: "s1/2025/03/file.jpg", url: "/uploads/s1/2025/03/file.jpg" });
    delete = vi.fn().mockResolvedValue(undefined);
    exists = vi.fn().mockResolvedValue(true);
    getUrl = vi.fn((key: string) => `/uploads/${key}`);
  },
}));
vi.mock("../../media/s3-storage", () => ({
  S3Storage: class {},
}));
vi.mock("../../media/image-processor", () => ({
  getImageMeta: vi.fn().mockResolvedValue(null),
  generateVariants: vi.fn().mockResolvedValue({}),
  isProcessableImage: vi.fn((mime: string) => mime.startsWith("image/")),
}));

const { mediaService } = await import("../../media/media-service");

import type { AuthContext } from "../../auth/auth-types";

const adminAuth: AuthContext = {
  user: { id: "u1", email: "admin@test.com", name: "Admin", displayName: "Admin", image: null },
  siteId: "site-1",
  role: "admin",
  permissions: new Set(["upload_media", "delete_media", "read", "edit_profile"]),
};

const mockAsset = {
  id: "a-1",
  siteId: "site-1",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  size: 1024,
  width: 800,
  height: 600,
  duration: null,
  url: "/uploads/site-1/2025/03/photo.jpg",
  alt: "A photo",
  title: "Photo",
  caption: null,
  focalPoint: null,
  variants: {},
  meta: {},
  uploader: { id: "u1", name: "Admin" },
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  resetMockPrisma();
});

describe("mediaService.upload", () => {
  it("throws without upload_media permission", async () => {
    const noPerms: AuthContext = { ...adminAuth, permissions: new Set(["read"]), role: "subscriber" };
    await expect(
      mediaService.upload(noPerms, Buffer.from("x"), { filename: "f.jpg", mimeType: "image/jpeg", size: 1 }),
    ).rejects.toThrow();
  });

  it("rejects disallowed MIME type", async () => {
    await expect(
      mediaService.upload(adminAuth, Buffer.from("x"), { filename: "f.exe", mimeType: "application/x-msdownload", size: 1 }),
    ).rejects.toThrow("not allowed");
  });

  it("rejects oversized file", async () => {
    const bigBuffer = Buffer.alloc(51 * 1024 * 1024);
    await expect(
      mediaService.upload(adminAuth, bigBuffer, { filename: "big.jpg", mimeType: "image/jpeg", size: bigBuffer.length }),
    ).rejects.toThrow();
  });

  it("rejects size mismatch", async () => {
    await expect(
      mediaService.upload(adminAuth, Buffer.alloc(5000), { filename: "f.jpg", mimeType: "image/jpeg", size: 1 }),
    ).rejects.toThrow("does not match");
  });

  it("creates media asset", async () => {
    const buf = Buffer.alloc(1024);
    mockPrisma.mediaAsset.create.mockResolvedValue(mockAsset);

    const result = await mediaService.upload(adminAuth, buf, {
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.filename).toBe("photo.jpg");
    expect(mockPrisma.mediaAsset.create).toHaveBeenCalled();
  });
});

describe("mediaService.update", () => {
  it("throws NotFoundError for missing asset", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(null);
    await expect(
      mediaService.update(adminAuth, "bad", { alt: "new" }),
    ).rejects.toThrow("not found");
  });

  it("updates media metadata", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(mockAsset);
    mockPrisma.mediaAsset.update.mockResolvedValue({ ...mockAsset, alt: "Updated alt" });

    const result = await mediaService.update(adminAuth, "a-1", { alt: "Updated alt" });
    expect(result.alt).toBe("Updated alt");
  });
});

describe("mediaService.delete", () => {
  it("throws NotFoundError for missing asset", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(null);
    await expect(mediaService.delete(adminAuth, "bad")).rejects.toThrow("not found");
  });

  it("deletes asset and storage file", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(mockAsset);
    mockPrisma.mediaAsset.delete.mockResolvedValue({});

    await mediaService.delete(adminAuth, "a-1");
    expect(mockPrisma.mediaAsset.delete).toHaveBeenCalledWith({ where: { id: "a-1" } });
  });
});

describe("mediaService.getById", () => {
  it("throws NotFoundError for missing", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(null);
    await expect(mediaService.getById("s1", "bad")).rejects.toThrow("not found");
  });

  it("returns DTO", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(mockAsset);
    const result = await mediaService.getById("site-1", "a-1");
    expect(result.id).toBe("a-1");
    expect(result.isImage).toBe(true);
  });
});

describe("mediaService.list", () => {
  it("returns paginated results", async () => {
    mockPrisma.mediaAsset.findMany.mockResolvedValue([mockAsset]);
    mockPrisma.mediaAsset.count.mockResolvedValue(1);

    const result = await mediaService.list("site-1", {
      page: 1,
      perPage: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("filters by mimeType category", async () => {
    mockPrisma.mediaAsset.findMany.mockResolvedValue([]);
    mockPrisma.mediaAsset.count.mockResolvedValue(0);

    await mediaService.list("site-1", {
      page: 1, perPage: 20, sortBy: "createdAt", sortOrder: "desc",
      mimeType: "image",
    });

    const where = mockPrisma.mediaAsset.findMany.mock.calls[0][0].where;
    expect(where.mimeType).toEqual({ startsWith: "image/" });
  });

  it("handles search filter", async () => {
    mockPrisma.mediaAsset.findMany.mockResolvedValue([]);
    mockPrisma.mediaAsset.count.mockResolvedValue(0);

    await mediaService.list("site-1", {
      page: 1, perPage: 20, sortBy: "createdAt", sortOrder: "desc",
      search: "photo",
    });

    const where = mockPrisma.mediaAsset.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
  });
});

describe("mediaService.getVariantUrl", () => {
  it("returns variant URL when available", () => {
    const asset = { ...mockAsset, variants: { thumbnail: { url: "/thumb.jpg" } }, isImage: true };
    const url = mediaService.getVariantUrl(asset as any, "thumbnail");
    expect(url).toBe("/thumb.jpg");
  });

  it("falls back to original URL", () => {
    const asset = { ...mockAsset, variants: {}, isImage: true };
    const url = mediaService.getVariantUrl(asset as any, "thumbnail");
    expect(url).toBe(mockAsset.url);
  });
});
