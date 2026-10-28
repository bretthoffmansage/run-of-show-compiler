"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { parseConvexId } from "../lib/convex-id";
import { authorizedConvex } from "../lib/server-session";

async function clientOrDeny() {
  const client = await authorizedConvex();
  if (!client) redirect("/");
  return client;
}

function field(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== "string") throw new Error("Invalid form input");
  return value;
}

function id<T extends "organizations" | "events" | "masterProposals">(form: FormData, key: string): Id<T> {
  const value = parseConvexId<T>(form.get(key));
  if (!value) throw new Error("Invalid record identifier");
  return value;
}

export async function createOrganization(form: FormData) {
  const client = await clientOrDeny();
  const organizationId = await client.mutation(api.organizations.create, { name: field(form, "name") });
  revalidatePath("/");
  redirect(`/?organization=${organizationId}`);
}

export async function createEvent(form: FormData) {
  const client = await clientOrDeny();
  const organizationId = id<"organizations">(form, "organizationId");
  const eventId = await client.mutation(api.events.create, { organizationId, name: field(form, "name") });
  revalidatePath("/");
  redirect(`/events/${eventId}`);
}

export async function addManualSource(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  const { snapshotId } = await client.mutation(api.sources.createManualWithSnapshot, { eventId, name: field(form, "name"), content: field(form, "content") });
  await client.mutation(api.master.proposeManualSnapshot, { snapshotId });
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

export async function approveProposal(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  await client.mutation(api.master.approve, { proposalId: id<"masterProposals">(form, "proposalId") });
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

export async function rejectProposal(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  await client.mutation(api.master.reject, { proposalId: id<"masterProposals">(form, "proposalId") });
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

export async function editMaster(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  await client.mutation(api.master.manualEdit, { eventId, entryKey: field(form, "entryKey"), fieldKey: "title", value: field(form, "value") });
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}
