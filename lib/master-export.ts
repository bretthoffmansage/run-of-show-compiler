/** Server-use formatter. Caller must first authorize access to an approved master revision. */
export interface ApprovedMasterExport {
  status: "approved";
  eventName: string;
  revisionNumber: number;
  approvedBy: string;
  fields: Array<{ entryKey: string; fieldKey: string; value: string; origin: "source" | "operator" }>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function formatApprovedMasterHtml(revision: ApprovedMasterExport): string {
  if (revision.status !== "approved" || !Number.isSafeInteger(revision.revisionNumber) || revision.revisionNumber < 1 || !revision.approvedBy || !revision.eventName) {
    throw new Error("Approved master revision required");
  }
  const rows = revision.fields.map(field => `<tr><td>${escapeHtml(field.entryKey)}</td><td>${escapeHtml(field.fieldKey.replaceAll("_", " "))}</td><td>${escapeHtml(field.value)}</td><td>${escapeHtml(field.origin)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(revision.eventName)} — approved run of show</title><style>body{font:14px/1.5 Arial,sans-serif;color:#17212a;margin:32px}h1{margin-bottom:4px}p{color:#52616b}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ccd5db;padding:10px}th{background:#edf2f4}</style></head><body><h1>${escapeHtml(revision.eventName)}</h1><p>Approved run of show · Revision ${revision.revisionNumber} · Approved by ${escapeHtml(revision.approvedBy)}</p><table><thead><tr><th>Entry</th><th>Field</th><th>Value</th><th>Origin</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}
