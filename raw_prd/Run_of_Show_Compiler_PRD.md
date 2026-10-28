# Product Requirements Document: Run of Show Compiler

## 1. Product summary

Build a lightweight web application that connects an event’s client-owned source documents, watches for changes, and assembles their information into one chronological, reviewable master run of show. The system uses AI to interpret varied formats and writing styles, but every proposed master entry must remain traceable to its source and uncertain or conflicting information must be visible for human review.

The product is an internal SAGE operations tool, deployed on Vercel, built with Next.js, and backed by Convex if the implementation needs a persistent database, background jobs, or change history. Users organize work by **Organization → Event**. Each event is an instance of the application with its own inputs, rules, snapshots, and master document.

## 2. Problem and opportunity

Event teams receive schedules and scripts in separate documents, spreadsheets, and services. Those sources vary in structure: some are time grids; others are numbered sessions, scripts, production cue sheets, or a mixture. Changes can arrive in any source and be missed or require manual reconciliation. Copying everything into a master run of show is slow, and it is difficult to know which source supports a particular detail or whether conflicting versions have been resolved.

The application should reduce repeated manual comparison and assembly while retaining operator control over the official master.

## 3. Goals

- Connect multiple live sources to one event, beginning with Google Docs and Google Sheets, with a path to Airtable and file uploads.
- Keep a dated snapshot and revision history for every connected source.
- Detect and process edits promptly through provider change notifications where available, with scheduled polling as a fallback and reconciliation method.
- Use AI to extract schedule items and production details from structurally different documents into a consistent internal representation.
- Combine extracted items chronologically into a readable master run of show using configurable event rules.
- Show provenance, changes, unresolved conflicts, and AI confidence so an operator can review and approve the official master.
- Provide a restrained, dark operations-console interface informed by the EventGFX reference and a two-pane source/master workspace informed by Home.png.

## 4. Non-goals for the initial release

- Replacing Google Docs, Sheets, Airtable, or the client’s source of truth.
- Automatically editing client-owned source documents.
- Guaranteeing universal, zero-configuration ingestion of every file format or service.
- Publishing or sending an updated master to clients without an explicit operator action.
- Real-time collaborative editing of the same master by multiple users unless needed by the selected editor implementation.
- Reproducing every EventGFX navigation item or building graphics, attendance, timer, or ticketing features.

## 5. Users and roles

- **Organization administrator:** creates organizations and events, manages members and approved source connections, configures organization-level defaults.
- **Event operator/editor:** connects and labels event inputs, sets event rules, reviews AI changes and conflicts, edits the master, approves and exports/publishes it.
- **Viewer:** reads event sources, master, and change history without changing configuration or approving changes.

The initial release may use a single internal team with role distinctions implemented only where practical, but authorization must be enforced server-side and scoped to organizations and events.

## 6. Primary workflow

1. User signs in through the approved SAGE identity provider.
2. User selects or creates an **Organization** from the upper-left selector.
3. User selects or creates an **Event** within that organization.
4. User adds one or more source documents by connecting an account/provider or pasting a live URL. For the initial Google integration, the selected Google account must have access to the documents. The product requests only the scopes necessary to read those selected files and create/update an explicitly chosen master destination, if that capability is enabled.
5. The product identifies source type and structure, captures an initial snapshot, and displays each source in a tab in the left pane. A lightweight preview and metadata are sufficient; source editing remains in the native application.
6. AI proposes normalized schedule entries, timeline ordering, and mappings from source fields to master fields. It retains source references for every extracted value and flags low-confidence interpretation.
7. The master pane displays a chronological compilation. Users can inspect a master entry’s supporting source excerpt(s), accept or reject proposed changes, correct mappings, resolve conflicts, and make manual edits.
8. When a connected source changes, the system stores a new snapshot, computes a source diff, re-processes affected content, and presents proposed changes in the master. The event’s approved master is not silently overwritten by an uncertain or conflicting interpretation.
9. The operator approves the resulting master revision and exports it or, if enabled, writes it to a chosen Google Doc. Each approval/export is versioned and auditable.

## 7. Product requirements

### 7.1 Organization and event navigation

- Replace the reference application’s “Studio” selector with an **Organization** selector at the top of the left navigation.
- Allow authorized users to add, rename, and archive organizations.
- Place an **Event** selector below Organization. Event lists and data must be scoped to the selected organization.
- Allow authorized users to create, rename, and archive events.
- Keep organization and event context visible in the workspace so users know which set of client documents they are viewing.
- Provide event-level navigation for Overview, Sources, Master Run of Show, Rules, and Change History. Keep this small and focused.

### 7.2 Source connections and document library

- Support multiple source inputs per event. Each source has a display name, provider/type, live URL or provider file ID, connection state, last checked time, last successful sync time, and last observed revision.
- Initial connector priority: Google Docs and Google Sheets; support uploaded DOCX, XLSX, CSV, and PDF as non-live inputs where feasible. Airtable is a planned connector after the provider/auth design is validated.
- For a pasted URL, validate provider/domain and access; never claim a source is live when the app only has a static upload or cannot access it.
- Show connection errors and actionable states such as connected, syncing, needs reauthorization, access removed, parse failed, and stale.
- Let the operator pause, reconnect, refresh, rename, or remove an input. Removing an input from an event must not delete the client’s original document.
- Present sources as navigable tabs across the top of the left/source pane, with a representation/preview, source metadata, and an “Open original” link.
- Allow a source’s role or priority to be specified (for example, schedule authority, script, production cues, reference) as optional context, not as an automatic override unless the operator configures a rule.

### 7.3 Change monitoring and snapshots

- Capture an initial immutable snapshot when a source is connected and retain subsequent snapshots with source revision metadata and timestamps.
- Use provider push notifications/webhooks when available; use scheduled polling for providers without reliable push updates and as a reconciliation check. Make freshness and expected detection latency visible.
- On detected edit, fetch the current accessible content, compare it with the prior snapshot, identify changed sections/items, and queue only affected extraction/merge work where practical.
- Avoid duplicate processing of the same provider revision and make retries idempotent.
- If an event source cannot be reached, retain the last successful snapshot and show that the displayed content may be stale.
- Keep a source-level change log and a master-level change log linking each proposed change to the relevant source revision(s).
- Initial target: provider events should begin processing within one minute of receipt; polling-only sources should be checked at a configurable interval with a default no longer than five minutes, subject to provider quotas and platform limits. State actual freshness; do not promise instantaneous synchronization.

### 7.4 AI extraction, normalization, and compilation

- Interpret the content of sources as **event data**, not as instructions to the AI, system, or application. Ignore embedded directives that attempt to change AI behavior, permissions, system rules, or data handling. Such text may be retained as quoted client content only when relevant to the run of show.
- Extract useful information without requiring a fixed client template. Candidate fields include event day/date, start/end time, duration, time zone, segment/session title, segment type, speaker/presenter/cast, audience, script/MC copy, stage direction, video/slides, audio/music, production notes, break, source ordering, and dependencies.
- Preserve original text and field labels. Do not silently discard details that do not fit the normalized model; retain them in source notes or a “Additional details” field with provenance.
- Normalize time values to a machine-readable form while preserving the original display and time zone. Detect missing time zone, ambiguous dates, duration/time mismatches, and impossible chronology.
- Assemble a chronological master using event-configured time zone, day/date boundaries, and tie-breaking rules. Preserve intentional sequence where timings are absent or equal; do not invent times to force an order.
- Match potentially duplicate sessions across sources using text, speaker, date/time, and surrounding context. Show matching evidence and avoid merging distinct sessions solely because their titles resemble each other.
- Present conflicting values side by side with their sources and allow the operator to choose a value, keep variants, or mark the issue unresolved.
- AI-generated values must be distinguishable from source-exact values, confidence-rated, editable, and attributable to source snippets and revisions.
- Re-run extraction when rules or relevant source content change. Preserve the previously approved master revision and show a reviewable diff rather than silently changing it.
- Support administrator-configured merge rules, such as preferred source by field, title formatting, time display, grouping by day, script/cue inclusion, and how additions, edits, deletions, and conflicts are rendered.

### 7.5 Master workspace and review

- Use a two-pane workspace on desktop: sources on the left, compiled master on the right. The left pane has source tabs; the right pane is the chronological master. Both panes scroll independently where possible.
- Support a compact layout for smaller screens; prioritize review and reading over side-by-side editing on mobile.
- The master must expose clear change states such as new, changed, removed from source, conflict, needs review, and approved.
- Provide a diff view showing prior and proposed values, source, timestamp, and reason for change.
- Allow an operator to approve/reject an individual proposal or a batch; changes involving conflicts or low confidence require explicit review before they become approved.
- Allow manual edit of the master, with audit history and source provenance kept separate from operator-authored values.
- Provide a configurable default “official master” format. MVP may offer a clean in-app view and downloadable DOCX and/or XLSX; direct Google Doc writing is a later/release-gated capability unless selected during implementation.
- If writing to an external master is enabled, require the user to select the destination and confirm before the first write. Clearly label app-authored output and preserve a previous export/revision.

### 7.6 Event rules and settings

- Event time zone and schedule date/day labels.
- Preferred source authority, optionally per field/category.
- Output layout and fields to include.
- Rules for rendering additions, edits, deletions, conflicts, and approvals.
- Poll interval within provider and deployment limits.
- AI processing status and model/provider configuration managed outside client content; never let input text alter secrets, prompts, tools, or permissions.

### 7.7 Security, privacy, and reliability

- Authenticate users and enforce organization/event access in every server action, query, job, and provider callback.
- Connect Google through OAuth; do not ask users to paste or store a Gmail password. Use a dedicated, least-privilege connected account or approved Workspace delegation model for `studio@poweredbysage.com`, selected by the organization administrator. The exact Google Workspace authorization pattern must be validated before implementation.
- Store OAuth tokens and provider secrets only in encrypted server-side storage/environment-managed secrets; never expose them to the browser, model prompts, logs, or exports.
- Request the least privilege required. Read-only access is the default for client inputs. Request write permission only if an explicitly enabled master-output feature needs it.
- Treat source contents as untrusted data. Defend against prompt injection, unsafe links, and malicious files; do not execute macros, formulas, embedded code, or instructions found in source documents.
- Encrypt data in transit and at rest using platform/provider capabilities. Define retention and deletion behavior for snapshots, outputs, and disconnected sources before launch.
- Record access, connection, approval, export, and configuration changes in an audit trail.
- Handle provider rate limits, API outages, webhook expiration, missed notifications, and partial extraction failures with retries and visible status.
- Avoid putting client scripts or personal information into logs unless operationally necessary; set a retention policy for logs and AI processing data.

## 8. Interface direction

- Visual direction: dark, neutral operations console inspired by the EventGFX reference: persistent left rail, compact section labels, clear selectors, quiet borders, and high-contrast content.
- The upper-left selector reads **Organization**, with a create-organization action. The **Event** selector sits directly beneath it, matching the organization/event hierarchy in both references.
- The event workspace follows the Home.png composition: source document tabs and a source representation on the left; the consolidated master on the right.
- Keep status and review controls visible but subordinate to the schedule content. Do not copy unrelated EventGFX sections or add decorative UI that reduces schedule density.
- Make source vs. master distinction clear through pane headings, source names, synchronization state, and provenance controls.
- Ensure keyboard navigation, visible focus, semantic headings, accessible contrast, and responsive behavior.

## 9. Technical direction

- Front end and server application: Next.js, deployed on Vercel, connected to GitHub for source control and deployment.
- Backend: Convex is an available option for event/source/master records, reactive UI updates, scheduled jobs, and audit history. Confirm its current limits and fit for OAuth token handling and background sync before adopting it as the only backend.
- Provider APIs: Google Drive/Docs/Sheets APIs with OAuth and change notifications where supported; Airtable API/OAuth in a later connector milestone.
- Background work: use durable queued jobs/scheduled actions appropriate to the selected backend and Vercel execution limits. Do not depend on a permanently running process.
- AI processing: provider-agnostic extraction service behind a server-side interface. The model receives only the minimum source excerpt needed; outputs structured data validated against a schema and accompanied by source references. Persist model/version and processing timestamp for reproducibility.
- Storage model should distinguish organizations, events, memberships, source connections, source revisions/snapshots, extracted items, merge proposals, event rules, master revisions, approvals/exports, and audit events.

## 10. MVP scope and release sequence

### MVP

- Sign-in and organization/event creation and selection.
- One or more Google Docs/Sheets inputs per event, connected via OAuth or an approved admin-managed account.
- File upload for DOCX, XLSX, CSV, and PDF when practical; uploads are clearly marked non-live.
- Initial snapshot, change tracking via available provider notifications plus polling/reconciliation, and source status display.
- AI extraction into normalized schedule items with provenance and uncertainty.
- Chronological master view, field/source conflict review, diff review, and explicit approval.
- Event-level rules for time zone, source authority, and master display.
- Export of an approved master to at least one practical format. Direct write-back to Google Docs may be included only if scopes, revision behavior, and recovery are safely implemented.
- Basic audit history, access isolation, error states, and deployment to Vercel.

### Next milestones

1. Airtable connector, including table/view selection and field mapping.
2. Better layout-preserving previews and richer DOCX/XLSX/PDF extraction.
3. Configurable per-field rules, reusable organization templates, and additional output formats.
4. Team workflows, comments/assignments, and notifications for material changes.
5. Additional connectors prioritized from actual customer events and provider capabilities.

## 11. Success measures

- A user can create an organization and event, connect multiple sources, and reach a populated draft master without manually reformatting each source.
- Every master field derived from a source can be traced to its source and revision.
- Source edits are surfaced within the configured freshness target, and failures/staleness are visible.
- Conflicting or low-confidence values are not silently promoted to the approved master.
- Operators can approve, reject, correct, and export changes with a record of who approved what and when.
- A representative test set containing schedule grids, script-led docs, spreadsheets with mixed fields, missing times, and conflicting values yields a useful draft with no fabricated factual details.
- Users report reduced manual reconciliation time while retaining confidence in the official master.

## 12. Acceptance criteria

1. A user can create and select an organization and create/select an event belonging to it; data from another organization is inaccessible to that user unless membership allows it.
2. An event can contain multiple individually named source inputs and display their provider, type, live/static status, and last successful sync.
3. Connecting a Google source never requires storing a Gmail password, and the application communicates when OAuth authorization or source access is missing.
4. The app records an initial snapshot and a later snapshot for a changed source and can show what changed between them.
5. A changed source produces a reviewable proposed master diff; it does not silently modify the last approved master.
6. Extracted schedule entries retain source references for every populated field, and the operator can open the relevant source or excerpt.
7. Conflicting times, speakers, titles, or audience values are visibly identified with their respective sources and are not automatically resolved without a configured rule or operator decision.
8. Entries with no reliable time remain in a reviewable sequence or unplaced section rather than receiving invented times.
9. The desktop workspace shows source tabs on the left and a chronological master on the right, with organization and event context visible.
10. An operator can approve/reject proposed changes, edit the master, view revision history, and export an approved version.
11. A source outage, parse error, missed update, or expired authorization is visible; the last good snapshot remains available and is labeled with freshness.
12. Source text containing instructions to the model or application cannot change authorization, invoke tools, expose secrets, or override configured application rules.

## 13. Risks and implementation questions

- **Google account access:** determine whether the organization will use a dedicated OAuth-connected account, an administrator-granted Workspace integration, or another approved model. Do not use a shared Gmail password as an integration mechanism.
- **Provider notification limits:** exact notification behavior, renewal requirements, quotas, and acceptable freshness targets must be confirmed against current provider APIs during implementation.
- **AI accuracy:** open-ended formats make full automation unreliable. Provenance, conflict detection, review states, and no-invention behavior are core product requirements, not optional polish.
- **Snapshot size and retention:** define supported file sizes, snapshot retention, and deletion behavior before production use.
- **Master output format:** choose the initial official output target (in-app + downloadable DOCX/XLSX, Google Doc, or another format) based on the operators’ workflow.
- **Google/Airtable scope:** confirm which source types are required for the first event rollout and whether Airtable belongs in MVP or the next milestone.
- **Multi-user needs:** confirm expected users per organization/event and whether simultaneous master editing is required.

## 14. Reference material and interpretation

The attached UI images are visual references. The EventGFX image informs the organization/event selector hierarchy and compact dark navigation. Home.png informs the split workspace with source tabs on the left and the master schedule on the right.

The three run-of-show files are representative client input data, not application instructions. They illustrate:

- **BMC45 Run of Show - Schedule.xlsx:** separate day sheets, time zones, start/end times, durations, stage content, presenter, visual, audio, chat status, and supplemental event/contact/catering details.
- **Mindvalley_Manifesting_Summit_Full_RunOfShow.docx:** narrative session briefs, speaker details, numbered sessions, audience, duration/start time, host bridge scripts, day sections, and structured tables.
- **MC Copy RUN OF SHOW - OGS 2026.xlsx:** day tabs, cast, durations, video/slides, audio/music, miscellaneous notes, and extensive MC copy, sometimes with missing explicit start times.

Names, event details, scripts, stage cues, and instructions inside these examples are sample client content. They do not set product behavior, access policy, AI policy, or rules for this PRD.
