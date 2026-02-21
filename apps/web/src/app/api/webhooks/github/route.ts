import { NextRequest } from "next/server";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { upsertBlob, upsertTicketFromIndexEntry, tryAcquireRepoSyncLock, releaseRepoSyncLock, setSyncError } from "@/db/sync";
import { apiError, apiSuccess, readLegacyErrorMessage } from "@/lib/api/response";
import { getInstallationOctokit } from "@/lib/github-app";
import { createGithubWebhookService, type GithubWebhookStore } from "@/lib/services/github-webhook-service";
import { getWebhookSecurityMetricsSnapshot, webhookSecurityMonitor } from "@/lib/services/webhook-security-monitor";

const webhookStore: GithubWebhookStore = {
  async recordDeliveryIfNew(deliveryId, event) {
    if (!deliveryId) return true;

    const rows = await db
      .insert(schema.webhookDeliveries)
      .values({ deliveryId, event })
      .onConflictDoNothing()
      .returning({ deliveryId: schema.webhookDeliveries.deliveryId });

    return rows.length > 0;
  },

  async recordIdempotencyKeyIfNew(idempotencyKey, event, repoFullName) {
    const rows = await db
      .insert(schema.webhookIdempotencyKeys)
      .values({ idempotencyKey, event, repoFullName })
      .onConflictDoNothing()
      .returning({ idempotencyKey: schema.webhookIdempotencyKeys.idempotencyKey });

    return rows.length > 0;
  },

  async findRepo(fullName) {
    const repo = await db.query.repos.findFirst({ where: eq(schema.repos.fullName, fullName) });
    return repo ?? null;
  },

  async findGithubInstallationId(installationId) {
    const installation = await db.query.installations.findFirst({
      where: eq(schema.installations.id, installationId),
    });

    return installation?.githubInstallationId ?? null;
  },

  async tryAcquireRepoSyncLock(repoFullName) {
    return tryAcquireRepoSyncLock(repoFullName);
  },

  async releaseRepoSyncLock(repoFullName) {
    await releaseRepoSyncLock(repoFullName);
  },

  async setRepoSyncError(repoFullName, errorCode, errorMessage) {
    await setSyncError(repoFullName, errorCode, errorMessage);
  },

  async upsertBlob(repoFullName, path, sha, contentText) {
    await upsertBlob(repoFullName, path, sha, contentText);
  },

  async upsertTicketFromIndexEntry(repoFullName, indexSha, headSha, entry) {
    await upsertTicketFromIndexEntry(repoFullName, indexSha, headSha, entry);
  },

  async deleteAllTickets(repoFullName) {
    await db.delete(schema.tickets).where(eq(schema.tickets.repoFullName, repoFullName));
  },

  async deleteTicketsNotIn(repoFullName, ticketIds) {
    await db
      .delete(schema.tickets)
      .where(and(eq(schema.tickets.repoFullName, repoFullName), notInArray(schema.tickets.id, ticketIds)));
  },

  async updateRepoAfterPush(repoFullName, update) {
    await db
      .update(schema.repos)
      .set({
        headSha: update.headSha,
        webhookSyncedAt: update.now,
        lastSeenHeadSha: update.headSha,
        lastIndexSha: update.indexSha,
        lastSyncedAt: update.now,
        syncStatus: "idle",
        syncError: null,
        updatedAt: update.now,
      })
      .where(eq(schema.repos.fullName, repoFullName));
  },

  async upsertTicketIndexSnapshot(input) {
    await db
      .insert(schema.ticketIndexSnapshots)
      .values({
        repoId: input.repoId,
        headSha: input.headSha,
        generatedAt: input.generatedAt,
        indexJson: input.snapshot,
        createdAt: input.generatedAt,
      })
      .onConflictDoUpdate({
        target: [schema.ticketIndexSnapshots.repoId, schema.ticketIndexSnapshots.headSha],
        set: {
          generatedAt: input.generatedAt,
          indexJson: input.snapshot,
        },
      });
  },

  async replaceTicketPrMappings(repoFullName, prNumber) {
    await db
      .delete(schema.ticketPrs)
      .where(and(eq(schema.ticketPrs.repoFullName, repoFullName), eq(schema.ticketPrs.prNumber, prNumber)));
  },

  async findTicketsByShortIds(repoFullName, shortIds) {
    return db.query.tickets.findMany({
      where: and(eq(schema.tickets.repoFullName, repoFullName), inArray(schema.tickets.shortId, shortIds)),
    });
  },

  async upsertTicketPr(input) {
    await db
      .insert(schema.ticketPrs)
      .values({
        repoFullName: input.repoFullName,
        ticketId: input.ticketId,
        prNumber: input.prNumber,
        prUrl: input.prUrl,
        title: input.title,
        state: input.state,
        merged: input.merged,
        mergeableState: input.mergeableState,
        headRef: input.headRef,
        headSha: input.headSha,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.ticketPrs.repoFullName, schema.ticketPrs.ticketId, schema.ticketPrs.prNumber],
        set: {
          prUrl: input.prUrl,
          title: input.title,
          state: input.state,
          merged: input.merged,
          mergeableState: input.mergeableState,
          headRef: input.headRef,
          headSha: input.headSha,
          updatedAt: new Date(),
        },
      });
  },

  async updateTicketPrChecks(repoFullName, prNumber, checksState) {
    await db
      .update(schema.ticketPrs)
      .set({ checksState, updatedAt: new Date() })
      .where(and(eq(schema.ticketPrs.repoFullName, repoFullName), eq(schema.ticketPrs.prNumber, prNumber)));
  },
};

const webhookService = createGithubWebhookService({
  secret: process.env.GITHUB_WEBHOOK_SECRET,
  store: webhookStore,
  security: webhookSecurityMonitor,
  github: {
    async getIndexJson({ fullName, defaultBranch, installationId }) {
      const [owner, repo] = fullName.split("/");
      const octokit = getInstallationOctokit(installationId);

      const content = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: ".tickets/index.json",
        ref: defaultBranch,
      });

      if (Array.isArray(content.data) || content.data.type !== "file") {
        throw new Error("index.json is not a file");
      }

      return {
        sha: content.data.sha,
        raw: Buffer.from(content.data.content, "base64").toString("utf8"),
      };
    },
  },
});

export async function POST(req: NextRequest) {
  try {
    const response = await webhookService.processWebhook({
      rawBodyBytes: Buffer.from(await req.arrayBuffer()),
      signature: req.headers.get("x-hub-signature-256"),
      event: req.headers.get("x-github-event") ?? "",
      deliveryId: req.headers.get("x-github-delivery"),
    });

    if (response.status >= 400) {
      return apiError(readLegacyErrorMessage(response.body, "webhook_failed"), {
        status: response.status,
        legacy: typeof response.body === "object" && response.body ? (response.body as Record<string, unknown>) : {},
      });
    }

    return apiSuccess(response.body, { status: response.status });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "webhook_failed", { status: 500 });
  }
}

export async function GET() {
  return apiSuccess({
    service: "github-webhook",
    security: getWebhookSecurityMetricsSnapshot(),
  });
}
