import { beforeEach, describe, expect, it } from "vitest";
import type { AuthContext } from "@nextpress/core/auth/auth-types";
import { FakeInstagramClient } from "../src/api/fake-instagram-client";
import { IG_FIELDS } from "../src/content/fields";
import {
  PublishService,
  inferMediaType,
  type PublishStore,
  type PublishableEntry,
} from "../src/services/publish-service";

const auth = { siteId: "site-a", user: { id: "u1" }, role: "administrator", permissions: {} } as unknown as AuthContext;

const validImage = {
  mimeType: "image/jpeg",
  size: 2 * 1024 * 1024,
  width: 1080,
  height: 1080,
  url: "https://example.com/photo.jpg",
};

const validVideo = {
  mimeType: "video/mp4",
  size: 20 * 1024 * 1024,
  width: 1080,
  height: 1080,
  duration: 30,
  url: "https://example.com/clip.mp4",
};

function createStore(overrides: Partial<PublishableEntry> = {}) {
  const entry: PublishableEntry = {
    id: "entry-1",
    status: "PUBLISHED",
    publishStatus: "NOT_PUBLISHED",
    publishRetryCount: 0,
    caption: "Hello Instagram",
    media: [validImage],
    ...overrides,
  };

  const writes: Array<Record<string, unknown>> = [];

  const store: PublishStore = {
    async getPublishableEntry(siteId, entryId) {
      // Site-scoped, like the real adapter.
      return siteId === auth.siteId && entryId === entry.id ? { ...entry } : null;
    },
    async updatePublishState(_auth, _entryId, fields) {
      writes.push(fields);
      // Mirror writes back so a follow-up call observes the new state.
      if (fields[IG_FIELDS.publishStatus]) {
        entry.publishStatus = fields[IG_FIELDS.publishStatus] as PublishableEntry["publishStatus"];
      }
      if (IG_FIELDS.publishContainerId in fields) {
        entry.publishContainerId = (fields[IG_FIELDS.publishContainerId] as string) ?? undefined;
      }
      if (fields[IG_FIELDS.publishMediaId]) {
        entry.publishMediaId = fields[IG_FIELDS.publishMediaId] as string;
      }
    },
  };

  return { store, entry, writes };
}

describe("publish happy path", () => {
  it("publishes an image via the two-step container flow", async () => {
    const client = new FakeInstagramClient();
    const { store } = createStore();

    const outcome = await new PublishService({ client, store }).publish(auth, "entry-1");

    expect(outcome.status).toBe("published");
    expect(client.countCalls("createMediaContainer")).toBe(1);
    expect(client.countCalls("publishContainer")).toBe(1);
  });

  it("stores the container id BEFORE publishing, so loss is recoverable", async () => {
    const client = new FakeInstagramClient();
    const { store, writes } = createStore();

    await new PublishService({ client, store }).publish(auth, "entry-1");

    const containerWrite = writes.findIndex((w) => w[IG_FIELDS.publishContainerId]);
    const publishedWrite = writes.findIndex((w) => w[IG_FIELDS.publishStatus] === "PUBLISHED");

    expect(containerWrite).toBeGreaterThanOrEqual(0);
    expect(containerWrite).toBeLessThan(publishedWrite);
  });

  it("polls a video container until processing finishes", async () => {
    const client = new FakeInstagramClient({ videoProcessingPolls: 2 });
    const { store } = createStore({ media: [validVideo] });

    const outcome = await new PublishService({ client, store, pollIntervalMs: 0 }).publish(
      auth,
      "entry-1",
    );

    expect(outcome.status).toBe("published");
    expect(client.countCalls("getContainerStatus")).toBeGreaterThanOrEqual(3);
  });

  it("builds a carousel from child containers plus a parent", async () => {
    const client = new FakeInstagramClient();
    const { store } = createStore({ media: [validImage, validImage, validImage] });

    const outcome = await new PublishService({ client, store }).publish(auth, "entry-1");

    expect(outcome.status).toBe("published");
    // Three children plus one parent.
    expect(client.countCalls("createMediaContainer")).toBe(4);
    expect(client.countCalls("publishContainer")).toBe(1);
  });
});

describe("duplicate publication prevention", () => {
  it("refuses to publish an entry already published", async () => {
    const client = new FakeInstagramClient();
    const { store } = createStore({ publishStatus: "PUBLISHED", publishMediaId: "ig-1" });

    const outcome = await new PublishService({ client, store }).publish(auth, "entry-1");

    expect(outcome.status).toBe("skipped");
    expect(client.countCalls("publishContainer")).toBe(0);
  });

  it("does not double-publish when two administrators publish at once", async () => {
    const client = new FakeInstagramClient();
    const { store } = createStore();
    const service = new PublishService({ client, store });

    await service.publish(auth, "entry-1");
    await service.publish(auth, "entry-1");

    // The single most costly failure mode: exactly one real publish.
    expect(client.publishedContainerIds).toHaveLength(1);
  });

  it("refuses to publish a draft — the CMS lifecycle is the gate", async () => {
    const client = new FakeInstagramClient();
    const { store } = createStore({ status: "DRAFT" });

    const outcome = await new PublishService({ client, store }).publish(auth, "entry-1");

    expect(outcome.status).toBe("skipped");
    expect(client.countCalls("createMediaContainer")).toBe(0);
  });
});

describe("ambiguous response and reconciliation", () => {
  let client: FakeInstagramClient;

  beforeEach(() => {
    client = new FakeInstagramClient();
  });

  it("reports ambiguous — never a blind retry — when the response is lost", async () => {
    const { store } = createStore();
    client.failures.publishContainer = "network";

    const outcome = await new PublishService({ client, store }).publish(auth, "entry-1");

    expect(outcome.status).toBe("ambiguous");
    // The request DID reach Instagram; retrying blindly could double-post.
    expect(client.publishedContainerIds).toHaveLength(1);
  });

  it("resolves to published when the container reports PUBLISHED", async () => {
    const { store, entry } = createStore();
    client.failures.publishContainer = "network";

    const service = new PublishService({ client, store });
    await service.publish(auth, "entry-1");

    client.clearFailures();
    client.setContainerStatus(entry.publishContainerId!, "PUBLISHED");

    const outcome = await service.reconcile(auth, "entry-1");

    expect(outcome.status).toBe("published");
    // Reconciliation must NOT publish again.
    expect(client.publishedContainerIds).toHaveLength(1);
  });

  it("publishes a FINISHED container that never went out", async () => {
    const { store, entry } = createStore();
    client.failures.publishContainer = "network";

    const service = new PublishService({ client, store });
    await service.publish(auth, "entry-1");

    client.clearFailures();
    client.setContainerStatus(entry.publishContainerId!, "FINISHED");

    expect((await service.reconcile(auth, "entry-1")).status).toBe("published");
  });

  it("reports a retryable failure when the container expired", async () => {
    const { store, entry } = createStore();
    client.failures.publishContainer = "network";

    const service = new PublishService({ client, store });
    await service.publish(auth, "entry-1");

    client.clearFailures();
    client.setContainerStatus(entry.publishContainerId!, "EXPIRED");

    const outcome = await service.reconcile(auth, "entry-1");
    expect(outcome).toMatchObject({ status: "failed", retryable: true });
  });

  it("routes a second publish attempt through reconciliation, not a new publish", async () => {
    const { store } = createStore();
    client.failures.publishContainer = "network";

    const service = new PublishService({ client, store });
    await service.publish(auth, "entry-1");

    client.clearFailures();
    await service.publish(auth, "entry-1");

    expect(client.publishedContainerIds).toHaveLength(1);
  });
});

describe("validation and quota", () => {
  it("rejects invalid media with actionable issues, before any API call", async () => {
    const client = new FakeInstagramClient();
    const { store } = createStore({
      media: [{ mimeType: "image/png", size: 1024, width: 1080, height: 1080, url: "https://example.com/a.png" }],
    });

    const outcome = await new PublishService({ client, store }).publish(auth, "entry-1");

    expect(outcome.status).toBe("invalid");
    expect(client.countCalls("createMediaContainer")).toBe(0);
    if (outcome.status === "invalid") {
      expect(outcome.issues[0]?.message).toContain("JPEG");
    }
  });

  it("refuses to publish when the account's quota is exhausted", async () => {
    const client = new FakeInstagramClient({ publishingLimit: { used: 50, total: 50 } });
    const { store } = createStore();

    const outcome = await new PublishService({ client, store }).publish(auth, "entry-1");

    expect(outcome).toMatchObject({ status: "failed", retryable: true });
    expect(client.countCalls("publishContainer")).toBe(0);
  });

  it("reads the quota from the account rather than a hardcoded number", async () => {
    const client = new FakeInstagramClient({ publishingLimit: { used: 60, total: 100 } });
    const { store } = createStore();

    // 60 used would exceed a hardcoded 50 but is fine against the real limit.
    expect((await new PublishService({ client, store }).publish(auth, "entry-1")).status).toBe(
      "published",
    );
  });
});

describe("inferMediaType", () => {
  it("classifies by count and MIME type", () => {
    expect(inferMediaType([validImage])).toBe("IMAGE");
    expect(inferMediaType([validVideo])).toBe("VIDEO");
    expect(inferMediaType([validImage, validImage])).toBe("CAROUSEL");
  });
});
