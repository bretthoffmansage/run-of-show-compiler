import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const sourceState = v.union(
  v.literal("not_connected"),
  v.literal("connected"),
  v.literal("paused"),
  v.literal("static"),
  v.literal("needs_reauthorization"),
  v.literal("access_removed"),
  v.literal("error"),
);

export default defineSchema({
  organizations: defineTable({
    name: v.string(),
    archived: v.boolean(),
    createdBy: v.string(),
  }),
  memberships: defineTable({
    organizationId: v.id("organizations"),
    userId: v.string(),
    role: v.union(v.literal("admin"), v.literal("operator"), v.literal("viewer")),
  })
    .index("by_user", ["userId"])
    .index("by_org_user", ["organizationId", "userId"]),
  events: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    archived: v.boolean(),
    timeZone: v.optional(v.string()),
  }).index("by_org", ["organizationId"]),
  sources: defineTable({
    organizationId: v.id("organizations"),
    eventId: v.id("events"),
    name: v.string(),
    provider: v.union(v.literal("google_docs"), v.literal("google_sheets"), v.literal("manual")),
    url: v.string(),
    state: sourceState,
    archived: v.optional(v.boolean()),
    createdBy: v.string(),
    lastCheckedAt: v.optional(v.number()),
    lastSyncAt: v.optional(v.number()),
    lastRevision: v.optional(v.string()),
    lastError: v.optional(v.string()),
  }).index("by_event", ["eventId"]),
  sourceSnapshots: defineTable({
    sourceId: v.id("sources"),
    revision: v.string(),
    content: v.string(),
    capturedAt: v.number(),
    changedLines: v.number(),
  })
    .index("by_source", ["sourceId"])
    .index("by_source_revision", ["sourceId", "revision"]),
  playbooks: defineTable({
    eventId: v.id("events"),
    /** Empty string marks a stub row: creation was attempted and failed (see lastError). */
    spreadsheetId: v.string(),
    url: v.string(),
    templateId: v.string(),
    pagSheetId: v.optional(v.number()),
    createdAt: v.number(),
    lastWriteAt: v.optional(v.number()),
    lastRevisionNumber: v.optional(v.number()),
    lastError: v.optional(v.string()),
    /** Link-sharing applied, so the in-app embed and team links work. */
    shared: v.optional(v.boolean()),
  }).index("by_event", ["eventId"]),
  googleConnections: defineTable({
    accountEmail: v.string(),
    encryptedRefreshToken: v.string(),
    scopes: v.string(),
    connectedBy: v.string(),
    connectedAt: v.number(),
    status: v.union(v.literal("active"), v.literal("revoked")),
    lastRefreshAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }).index("by_status", ["status"]),
  extractionRuns: defineTable({
    eventId: v.id("events"),
    snapshotId: v.id("sourceSnapshots"),
    status: v.union(v.literal("running"), v.literal("succeeded"), v.literal("failed")),
    engine: v.union(v.literal("gateway"), v.literal("anthropic"), v.literal("fallback")),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    itemCount: v.optional(v.number()),
    proposalCount: v.optional(v.number()),
  })
    .index("by_event", ["eventId"])
    .index("by_snapshot", ["snapshotId"]),
  masterProposals: defineTable({
    eventId: v.id("events"),
    snapshotId: v.id("sourceSnapshots"),
    entryKey: v.string(),
    fieldKey: v.string(),
    proposedValue: v.string(),
    snippet: v.string(),
    origin: v.union(v.literal("source_exact"), v.literal("inferred")),
    confidence: v.number(),
    state: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    createdAt: v.number(),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
  }).index("by_event", ["eventId"]).index("by_snapshot", ["snapshotId"]),
  masterRevisions: defineTable({
    eventId: v.id("events"),
    number: v.number(),
    fields: v.array(v.object({
      entryKey: v.string(),
      fieldKey: v.string(),
      value: v.string(),
      origin: v.union(v.literal("source"), v.literal("operator")),
      snapshotId: v.optional(v.id("sourceSnapshots")),
      /** Sources disagree about this value (or it is unresolved): render in red. */
      conflict: v.optional(v.boolean()),
      /** When the value last changed due to a source edit: recent changes render in pink. */
      changedAt: v.optional(v.number()),
    })),
    createdAt: v.number(),
    approvedBy: v.string(),
  }).index("by_event", ["eventId"]),
  masterDecisions: defineTable({
    eventId: v.id("events"),
    proposalId: v.optional(v.id("masterProposals")),
    kind: v.union(v.literal("approve"), v.literal("reject"), v.literal("manual_edit")),
    actor: v.string(),
    at: v.number(),
    masterRevisionId: v.optional(v.id("masterRevisions")),
  }).index("by_event", ["eventId"]),
});
