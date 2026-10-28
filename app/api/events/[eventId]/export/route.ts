import { api } from "../../../../../convex/_generated/api";
import { parseConvexId } from "../../../../../lib/convex-id";
import { formatApprovedMasterHtml } from "../../../../../lib/master-export";
import { authorizedConvex } from "../../../../../lib/server-session";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const client = await authorizedConvex();
  if (!client) return new Response("Unauthorized", { status: 401 });
  const eventId = parseConvexId<"events">((await params).eventId);
  if (!eventId) return new Response("Not found", { status: 404 });
  try {
    const [event, revision] = await Promise.all([
      client.query(api.events.get, { eventId }),
      client.query(api.master.latest, { eventId }),
    ]);
    if (!revision) return new Response("No approved master", { status: 409 });
    const html = formatApprovedMasterHtml({
      status: "approved", eventName: event.name, revisionNumber: revision.number,
      approvedBy: revision.approvedBy,
      fields: revision.fields.map(field => ({ entryKey: field.entryKey, fieldKey: field.fieldKey, value: field.value, origin: field.origin })),
    });
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": "attachment; filename=approved-run-of-show.html", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
