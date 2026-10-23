/**
 * Revision Service
 *
 * Creates immutable snapshots of content entries.
 * Each save creates a revision. Restoring a revision copies its data
 * back to the entry and creates a new revision (so history is never lost).
 */

import { prisma } from "@nextpress/db";
import { Prisma } from "@prisma/client";
import { NotFoundError } from "../errors/cms-error";
import { toJsonInput } from "../prisma-helpers";
import type { RevisionDto } from "./revision-types";

/** The root client or an interactive-transaction client. */
type Db = Prisma.TransactionClient;

export const revisionService = {
  /**
   * Create a revision snapshot of the current entry state.
   * Called internally by contentService on every save.
   */
  async create(
    contentEntryId: string,
    authorId: string,
    changeNote?: string,
    db: Db = prisma,
  ): Promise<RevisionDto> {
    // Fetch current entry state
    const entry = await db.contentEntry.findUnique({
      where: { id: contentEntryId },
      include: {
        fieldValues: {
          include: { fieldDefinition: { select: { key: true } } },
        },
      },
    });
    if (!entry) throw new NotFoundError("ContentEntry", contentEntryId);

    // Get next version number
    const lastRevision = await db.revision.findFirst({
      where: { contentEntryId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (lastRevision?.version ?? 0) + 1;

    // Snapshot field values as { key: value }
    const fieldSnapshot: Record<string, unknown> = {};
    for (const fv of entry.fieldValues) {
      fieldSnapshot[fv.fieldDefinition.key] = fv.value;
    }

    const revision = await db.revision.create({
      data: {
        contentEntryId,
        version: nextVersion,
        title: entry.title,
        blocks: entry.blocks ?? Prisma.JsonNull,
        excerpt: entry.excerpt,
        fieldValues: toJsonInput(fieldSnapshot),
        authorId,
        changeNote: changeNote ?? null,
      },
      include: {
        author: { select: { id: true, name: true, displayName: true } },
      },
    });

    return toDto(revision as Parameters<typeof toDto>[0]);
  },

  /** List revisions for a content entry, newest first */
  async list(contentEntryId: string): Promise<RevisionDto[]> {
    const revisions = await prisma.revision.findMany({
      where: { contentEntryId },
      orderBy: { version: "desc" },
      include: {
        author: { select: { id: true, name: true, displayName: true } },
      },
    });
    return revisions.map(toDto);
  },

  /** Get a specific revision */
  async getById(revisionId: string): Promise<RevisionDto> {
    const rev = await prisma.revision.findUnique({
      where: { id: revisionId },
      include: {
        author: { select: { id: true, name: true, displayName: true } },
      },
    });
    if (!rev) throw new NotFoundError("Revision", revisionId);
    return toDto(rev);
  },

  /**
   * Restore a revision: copy its data back to the entry.
   * Creates a NEW revision capturing the state before restore.
   */
  async restore(
    revisionId: string,
    authorId: string,
  ): Promise<{ entryId: string; restoredVersion: number }> {
    const rev = await prisma.revision.findUnique({
      where: { id: revisionId },
    });
    if (!rev) throw new NotFoundError("Revision", revisionId);

    const entry = await prisma.contentEntry.findUnique({
      where: { id: rev.contentEntryId },
      select: { siteId: true, contentTypeId: true },
    });
    if (!entry) throw new NotFoundError("ContentEntry", rev.contentEntryId);

    // All-or-nothing: snapshot, entry update, field upserts and the marker
    // revision must not be left half-applied.
    await prisma.$transaction(async (tx) => {
      // Create a revision of the CURRENT state before restoring
      await this.create(rev.contentEntryId, authorId, `Before restore to v${rev.version}`, tx);
  
      // Restore: update entry with revision data
      await tx.contentEntry.update({
        where: { id: rev.contentEntryId },
        data: {
          title: rev.title,
          blocks: rev.blocks ?? Prisma.JsonNull,
          excerpt: rev.excerpt,
        },
      });
  
      // Restore field values — batch lookup to avoid N+1
      const fieldValues = rev.fieldValues as Record<string, unknown>;
      const fieldKeys = Object.keys(fieldValues);
  
      if (fieldKeys.length > 0) {
        // Single query: all field definitions by key
        const fieldDefs = await tx.fieldDefinition.findMany({
          // Scoped to the entry's site and content type (plus site-wide
          // fields): keys are only unique within that scope.
          where: {
            key: { in: fieldKeys },
            siteId: entry.siteId,
            OR: [{ contentTypeId: entry.contentTypeId }, { contentTypeId: null }],
          },
          select: { id: true, key: true },
        });
        const defMap = new Map(fieldDefs.map((fd) => [fd.key, fd.id]));
  
        for (const [key, value] of Object.entries(fieldValues)) {
          const defId = defMap.get(key);
          if (!defId) continue;
  
          const jsonValue = value as Parameters<typeof prisma.fieldValue.create>[0]["data"]["value"];
          await tx.fieldValue.upsert({
            where: {
              contentEntryId_fieldDefinitionId: {
                contentEntryId: rev.contentEntryId,
                fieldDefinitionId: defId,
              },
            },
            update: { value: jsonValue },
            create: {
              contentEntryId: rev.contentEntryId,
              fieldDefinitionId: defId,
              value: jsonValue,
            },
          });
        }
      }
  
      // Create a revision marking the restore
      await this.create(rev.contentEntryId, authorId, `Restored to v${rev.version}`, tx);
  
      });

    return { entryId: rev.contentEntryId, restoredVersion: rev.version };
  },

  /** Prune old revisions beyond the retention limit */
  async prune(
    contentEntryId: string,
    keepCount: number = 25,
  ): Promise<number> {
    const revisions = await prisma.revision.findMany({
      where: { contentEntryId },
      orderBy: { version: "desc" },
      select: { id: true },
    });

    if (revisions.length <= keepCount) return 0;

    const toDelete = revisions.slice(keepCount).map((r) => r.id);
    const { count } = await prisma.revision.deleteMany({
      where: { id: { in: toDelete } },
    });

    return count;
  },
};

function toDto(rev: {
  id: string;
  contentEntryId: string;
  version: number;
  title: string;
  blocks: unknown;
  excerpt: string | null;
  fieldValues: unknown;
  changeNote: string | null;
  createdAt: Date;
  author: { id: string; name: string | null; displayName: string | null };
}): RevisionDto {
  return {
    id: rev.id,
    contentEntryId: rev.contentEntryId,
    version: rev.version,
    title: rev.title,
    blocks: rev.blocks as RevisionDto["blocks"],
    excerpt: rev.excerpt,
    fieldValues: rev.fieldValues as Record<string, unknown>,
    author: rev.author,
    changeNote: rev.changeNote,
    createdAt: rev.createdAt,
  };
}
