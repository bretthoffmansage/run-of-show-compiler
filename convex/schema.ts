import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
  }).index("by_org", ["organizationId"]),
  sources: defineTable({
    organizationId: v.id("organizations"),
    eventId: v.id("events"),
    name: v.string(),
    provider: v.union(v.literal("google_docs"), v.literal("google_sheets"), v.literal("manual")),
    url: v.string(),
    state: v.union(v.literal("not_connected"), v.literal("paused"), v.literal("static")),
    archived: v.optional(v.boolean()),
    createdBy: v.string(),
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
