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
    provider: v.union(v.literal("google_docs"), v.literal("google_sheets")),
    url: v.string(),
    state: v.union(v.literal("not_connected"), v.literal("paused")),
    createdBy: v.string(),
  }).index("by_event", ["eventId"]),
});
