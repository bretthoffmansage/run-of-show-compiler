# SAGE Playbook Template — Structure & Conventions

**Source of truth:** "Playbook Empty" — Google Sheet `1-ccUVXjoJXwTyZT4JQlMHrlHgS5aAgdsPWFSL9kQYMM`
(studio@poweredbysage Drive). Surveyed visually tab-by-tab on 2026-10-29. The compiler fills
this template; it never reinvents it. This doc is the working reference for the sheet writer
(`lib/google-sheets-writer.ts`, planned) until the writer reads the template live via the API.

## Workbook tabs

| Tab | Title | What it holds | Likely source documents |
|---|---|---|---|
| 0.0 | Index | Linked table of contents: Tab # / Tab Title / Notes, with section bands "On-Site and Offer Tabs" and "SAGE Admin" | generated |
| 1.0 | Call Roadmap | Client & SAGE call schedule. Header: Date, Time · Call Topic · Agenda · Call Notes & Recording. Top rows: "Call Link (Always the Same): <link>" | call agendas, meeting notes |
| 1.1 | Team: Roles & Responsibilites | Sections **SAGE Team / Client Team / Enrollment Lobby Team**. Columns: First Name · Last Name · Phone · Email · Role (During Event) · Onsite (Yes/No) · Hotel Room Booked · Reservation Dates. SAGE Team rows come prefilled. Title carries the event code in brackets, e.g. `Roles & Responsibilities: [ROZ TRSS25]` | staffing docs, contact sheets |
| 1.2 | AV Asset Checklist | "AV Assets" checklist: Checklist · Link · Uploaded (checkbox). Teal section rows: Slides/Speakers, Fonts, Files for Vibe Board, Props, Videos; bold subgroups (Remote / In-person), indented sub-items | client asset lists |
| 1.4 | **PAG/ROS** | **The run of show.** See below — this is the core compiled output | agendas, scripts, run-of-shows |
| 1.7 | Catering Manifest | Per-day bands ("Catering Day 1 …"). Columns: Meal · Set · Start · Strike · Menu · Printed? Y/N · Number of People · Location | catering orders, BEOs |
| 2.0 | Schedule & Locations | Room/link registry: Room Type · Shortlink · Purpose (orange fill = team-only, "DO NOT GIVE TO ATTENDEES"); second table: Text Thread (Internal Use Only) · Shortlink · Team | zoom/room docs |
| 4.2 | Obvio/Tech FAQ | Scenario · Approved Solution / Answer, with gray section bands (Zoom Monitor / General / Tech Questions). Mostly static SAGE admin content | static |

Some playbook variants also carry **1.5 Speaker Tracking** and **1.6 Sponsor Tracking** (referenced
by the Index's summary block); not present in the empty template. Treat as optional tabs.

## 1.4 PAG/ROS layout (the tab that matters most)

- **Row 1:** merged date header per day — `Wednesday, August 13th`, `Thursday, August 14th`, …
- **Row 2:** teal day band — `Day 1` + theme lines (e.g. "Content, Connection, Community / Seize the Opportunity"); col C holds `Day 0`.
- **Row 3:** dark gray band — `Theme: <event theme>`.
- **Columns A/B:** Start Time / End Time, 30-minute grid rows.
- **Two columns per day:** the day's program column **plus a paired "Day N AV Cues" column**
  holding production cues aligned to the same time rows. `Day 0` is a bare program column
  (no cues) left empty as fill-in space.
- Blocks are vertically merged cells spanning their time range.
- **Block text convention:** bold title line, then time range in **both ET and PT** (`11:00am - 12:30pm ET / 8:00am - 9:30am PT`).
- **Session code convention:** `D1S2: General Session 2` (Day 1, Session 2); full header pattern
  `D3S1: General Session 11 (90 min): Re-pitch: sales`.
- **Session block body** (from the filled exemplars): segment-by-segment beats — bold speaker
  name + `(duration)`, bullet lines (`•`, `o`, `-`), `**` for emphasis/seeding notes, guest names
  highlighted, closing beats like `Dave: HSKP (5 minutes)`.
- **AV Cues block body**: per-segment field lines — `Timer:`, `Audio:`, `Slides:`, `Video:`,
  `Dashboard:`, `B/O:` (breakout Y/N), `Shares:`, `Set/Props:` — one group per speaker segment.
- **Block fill colors carry block-type semantics** (do not repurpose):
  - **Yellow/cream** — general sessions
  - **Orange/amber** — re-pitch/sales-day sessions (Day 3 exemplar)
  - **Cyan** — attendee-facing transitions: Doors Open, Breaks, Lunch
  - **Gray** — internal: Team Meetings, Sound Test, Rehearsals, Client Team Meetings, Help Desk; also the AV Cues columns
  - **Salmon** — Registration / Tech Checks
  - **Teal** — day header bands
- **Red text is already the template's own convention for unknowns**: the empty template ships with
  `D1S1: General Session 1 ( -- min):` in red — a missing duration rendered as red text on the
  yellow session block. The compiler's red/pink marking extends an existing SAGE convention.

### Existing colored-TEXT usage inside filled content (observed in the exemplars)

SAGE already uses font colors editorially inside hand-authored block text:

- **Magenta/pink** — crew & dashboard cues: `Dashboard: show 7 levels deep (under workbook) before breakout`, `Blue: Pull laser coaching spreadsheet for Bari` (Blue = dashboard operator per 1.1), song/audio callouts, `Survey, Testimonials`.
- **Blue** — ops notes and access notes: `2:40pm ET: Chuck signs on to the speaker line`, `Make sure the FC existing and renewal are tagged and have access via dashboard`.
- **Red** — timing corrections (`change to 2:35 if on time`), scripted handoff lines (`Leads to Michael: "Dave...ready to go?"`), year-flagged revision notes (`2026: re-review the MTTM in Michael's voice`), flagged content.
- **Orange/amber** — audio in/out cues (`Intro Audio for MR/RR: Sweet Child of Mine…`), `ADD:` notes.

**Collision risk — flagged as an open question in the spec:** compiler marks (red = inconsistency,
pink = change) will share the page with this hand-authored color language. Proposed resolution:
compiler marks apply only to **compiler-written values** (session titles, times, durations,
room/logistics lines — the structured layer), never re-coloring hand-authored cue text; the
per-cell mark state in Convex stays the machine-readable record of which red/pink is a compiler mark.

## Fill-in targets (cells Brett cleared, 2026-10-29)

The template now distinguishes **exemplar content** (left filled, shows how SAGE fills and
styles things) from **fill-in targets** (cleared). Observed pattern:

- **1.0 Call Roadmap:** yellow-filled rows with cleared Date/Time + Call Topic (and fully cleared
  yellow rows below) = future calls to append. Yellow fill on this tab means "fill in as needed."
- **1.4 PAG/ROS:** the `Day 0` column is empty fill-in space; the exemplar days (TopGun/ROZ
  content) show the target fill density and style.
- **1.1 Team R&R:** Client Team / Enrollment Lobby Team rows blank (SAGE Team prefilled).
- **1.2 AV Assets:** Link column + Uploaded checkboxes to be filled per event.
- **1.7 Catering:** all meal rows blank.
- **2.0 Schedule & Locations:** Shortlink column blank.

The compiler should treat exemplar content as **style reference, not data** — a generated
playbook starts from the empty template structure and writes event-specific values in the same
shapes the exemplars demonstrate.

## Global style conventions

- **Teal bands** (white bold text) for tab titles and major section headers; Index title carries
  `© SAGE Event Management` right-aligned.
- **Dark gray rows** (white bold text) for column headers and sub-section bands.
- **Fonts vary by tab** (Calibri on most; Poppins on 1.2 and 1.7) — the writer must *inherit* each
  cell's existing format and change **only** `textFormat.foregroundColor` when marking, never
  font/size/fill.
- **Checkboxes** for binary tracking (Uploaded, Onsite, Hotel Room Booked); **Yes/No dropdown chips**
  with green/red fill on 1.1 SAGE Team.
- **Hyperlinks** (blue underline) for recordings, shortlinks, decks, tab cross-references.
- The template self-documents in placeholder text ("Date with this font and boldness",
  "Follow same as above") — placeholder instructions are to be **replaced**, not kept.

## Compiler marking rules (restated against the real template)

- **Red text** (`#CC0000` proposed) — inconsistency between sources, or unknown/missing required
  value. Matches the template's native red-for-unknown usage. Marks go **on the PAG/ROS (and any
  other tab) exactly where the value lives** — e.g. a session block whose two source agendas
  disagree on its start time gets its time line in red inside that block.
- **Pink text** (`#E91E8C` proposed) — value changed by a client edit to a live source since the
  last compile.
- **Black text** — settled, consistent.
- **Never** cell fills/highlights for marks (fills mean block type on the PAG), and never any
  approval UI — marks are the cue for the humans running the event to seek clarification.
