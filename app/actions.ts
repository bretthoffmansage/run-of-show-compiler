"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { parseConvexId } from "../lib/convex-id";
import { authorizedConvex } from "../lib/server-session";

async function clientOrDeny() {
  const client = await authorizedConvex();
  if (!client) redirect("/sign-in");
  return client;
}

function field(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== "string") throw new Error("Invalid form input");
  return value;
}

function id<T extends "organizations" | "events" | "sources" | "masterProposals">(form: FormData, key: string): Id<T> {
  const value = parseConvexId<T>(form.get(key));
  if (!value) throw new Error("Invalid record identifier");
  return value;
}

function cleanError(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed";
  const index = error.message.indexOf("Uncaught Error: ");
  const message = index >= 0 ? error.message.slice(index + "Uncaught Error: ".length) : error.message;
  return message.split("\n")[0].slice(0, 300);
}

function backToEvent(eventId: string, notice?: string): never {
  revalidatePath(`/events/${eventId}`);
  redirect(notice ? `/events/${eventId}?notice=${encodeURIComponent(notice)}` : `/events/${eventId}`);
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

export async function addGoogleSource(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  const url = field(form, "url").trim();
  const provider = url.includes("/spreadsheets/") ? "google_sheets" as const : "google_docs" as const;
  let notice: string | undefined;
  try {
    await client.mutation(api.sources.create, { eventId, name: field(form, "name"), provider, url });
  } catch (error) {
    notice = cleanError(error);
  }
  backToEvent(eventId, notice);
}

export async function addManualSource(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  let notice: string | undefined;
  try {
    await client.mutation(api.sources.createManualWithSnapshot, { eventId, name: field(form, "name"), content: field(form, "content") });
  } catch (error) {
    notice = cleanError(error);
  }
  backToEvent(eventId, notice);
}

export async function refreshSource(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  let notice: string | undefined;
  try {
    await client.action(api.sync.refreshSource, { sourceId: id<"sources">(form, "sourceId") });
  } catch (error) {
    notice = cleanError(error);
  }
  backToEvent(eventId, notice);
}

export async function setSourcePaused(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  let notice: string | undefined;
  try {
    await client.mutation(api.sources.pause, { sourceId: id<"sources">(form, "sourceId"), paused: field(form, "paused") === "true" });
  } catch (error) {
    notice = cleanError(error);
  }
  backToEvent(eventId, notice);
}

export async function removeSource(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  let notice: string | undefined;
  try {
    await client.mutation(api.sources.remove, { sourceId: id<"sources">(form, "sourceId") });
  } catch (error) {
    notice = cleanError(error);
  }
  backToEvent(eventId, notice);
}

export async function approveProposal(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  let notice: string | undefined;
  try {
    await client.mutation(api.master.approve, { proposalId: id<"masterProposals">(form, "proposalId") });
  } catch (error) {
    notice = cleanError(error);
  }
  backToEvent(eventId, notice);
}

export async function rejectProposal(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  let notice: string | undefined;
  try {
    await client.mutation(api.master.reject, { proposalId: id<"masterProposals">(form, "proposalId") });
  } catch (error) {
    notice = cleanError(error);
  }
  backToEvent(eventId, notice);
}

/** Approves every pending field that has no competing pending value. */
export async function approveNonConflicting(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  let notice: string | undefined;
  try {
    const proposals = await client.query(api.master.listProposals, { eventId });
    const pending = proposals.filter(proposal => proposal.state === "pending");
    const valuesByField = new Map<string, Set<string>>();
    for (const proposal of pending) {
      const key = `${proposal.entryKey}\u0000${proposal.fieldKey}`;
      valuesByField.set(key, (valuesByField.get(key) ?? new Set()).add(proposal.proposedValue));
    }
    const safe = pending.filter(proposal => valuesByField.get(`${proposal.entryKey}\u0000${proposal.fieldKey}`)!.size === 1);
    if (!safe.length) {
      notice = pending.length ? "Only conflicting fields remain; decide them individually" : "Nothing pending to approve";
    } else {
      await client.mutation(api.master.approveMany, { eventId, proposalIds: safe.map(proposal => proposal._id) });
      notice = `Approved ${safe.length} fields${safe.length < pending.length ? `; ${pending.length - safe.length} conflicting left for review` : ""}`;
    }
  } catch (error) {
    notice = cleanError(error);
  }
  backToEvent(eventId, notice);
}

export async function rejectAllPending(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  let notice: string | undefined;
  try {
    const proposals = await client.query(api.master.listProposals, { eventId });
    const pending = proposals.filter(proposal => proposal.state === "pending");
    if (!pending.length) {
      notice = "Nothing pending to reject";
    } else {
      await client.mutation(api.master.rejectMany, { eventId, proposalIds: pending.map(proposal => proposal._id) });
      notice = `Rejected ${pending.length} pending fields`;
    }
  } catch (error) {
    notice = cleanError(error);
  }
  backToEvent(eventId, notice);
}

export async function editMaster(form: FormData) {
  const client = await clientOrDeny();
  const eventId = id<"events">(form, "eventId");
  let notice: string | undefined;
  try {
    await client.mutation(api.master.manualEdit, { eventId, entryKey: field(form, "entryKey"), fieldKey: "title", value: field(form, "value") });
  } catch (error) {
    notice = cleanError(error);
  }
  backToEvent(eventId, notice);
}

export async function disconnectGoogle() {
  const client = await clientOrDeny();
  try {
    await client.action(api.google.disconnect, {});
  } catch {
    revalidatePath("/settings");
    redirect(`/settings?google=${encodeURIComponent("Disconnect failed; try again")}`);
  }
  revalidatePath("/settings");
  redirect("/settings?google=disconnected");
}
