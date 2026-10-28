import type { Doc } from "../../convex/_generated/dataModel";

type Props = {
  revisions: Doc<"masterRevisions">[];
  decisions: Doc<"masterDecisions">[];
  proposals: Doc<"masterProposals">[];
};

function timestamp(value: number) { return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC"; }

export function RevisionHistory({ revisions, decisions, proposals }: Props) {
  const byId = new Map(proposals.map(proposal => [proposal._id, proposal]));
  return <section className="dashboard-panel history-panel" aria-labelledby="history-title">
    <p className="eyebrow">06 / AUDIT</p><h2 id="history-title">Change history</h2>
    {decisions.length ? <ol className="history-list">{decisions.map(decision => {
      const proposal = decision.proposalId ? byId.get(decision.proposalId) : null;
      return <li key={decision._id}><strong>{decision.kind.replaceAll("_", " ")}</strong> · {proposal ? `${proposal.fieldKey.replaceAll("_", " ")}: ${proposal.proposedValue}` : "operator-authored value"}<small>{timestamp(decision.at)} · {decision.actor}</small></li>;
    })}</ol> : <p className="muted">No decisions recorded yet.</p>}
    {revisions.length ? <details><summary>View {revisions.length} immutable master {revisions.length === 1 ? "revision" : "revisions"}</summary><ol className="history-list">{revisions.map(revision => <li key={revision._id}><strong>Revision {revision.number}</strong><small>{timestamp(revision.createdAt)} · {revision.approvedBy}</small><ul>{revision.fields.map(field => <li key={`${field.entryKey}:${field.fieldKey}`}>{field.fieldKey.replaceAll("_", " ")}: {field.value} <span className="muted">({field.origin})</span></li>)}</ul></li>)}</ol></details> : null}
  </section>;
}
