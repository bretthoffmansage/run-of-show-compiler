# Porting Rules — filling a SAGE playbook from client sources

**Approved direction (Brett, 2026-10-30).** Derived from a cell-by-cell survey of the
"Playbook Empty" template; amended per Brett's edits. This is the contract for
`lib/playbook-writer.ts` and the compiler.

## Rule zero

**The template is a style guide, not content.** The empty playbook shows *how* SAGE
formats things; its exemplar content is never kept or imitated with invented data.
The compiler ports what the uploaded documents actually say — in the template's
style — and writes **only what it sees**. No conversions, no inferences, no
enrichment. Anything required-but-absent renders as a red unknown, not a guess.

## Global

1. Fill the template; never rebuild it. Every playbook is a copy of all 8 tabs; the compiler writes into cells and never changes layout, column widths, frozen rows, or tab order.
2. Tab numbering is canonical and gapped (0.0, 1.0, 1.1, 1.2, 1.4, 1.7, 2.0, 4.2). Never renumber. 1.5 Speaker Tracking / 1.6 Sponsor Tracking are optional tabs some playbooks carry.
3. Fonts are per-tab (Calibri on most; Poppins on 1.2 and 1.7). Inherit each cell's existing font/size/fill; the compiler changes text (and text color) only.
4. Teal bands = titles and major sections; dark gray bands = column headers and sub-sections. Structure, never overwritten.
5. Fill colors carry meaning (block types, team-only rows), so compiler marking is **text color only** — never highlight/fill.
6. **Times are ported exactly as the source wrote them.** No dual-timezone conversion, no zone normalization, no reformatting beyond trimming. One timezone in the source = one timezone in the playbook.
7. Yellow-filled empty rows/areas are append zones; new records land there in the shape of the rows above.
8. Placeholder/self-documenting template text is replaced, not kept ("Date with this font and boldness", "Day of Week(ET)"). **Daily-theme placeholder lines are deleted** — the day band carries `Day N` (and a theme only if a source states one).
9. The event code rides the 1.1 title: `Roles & Responsibilities: [<EVENT CODE>]`.
10. URLs port as live links (blue), not plain text.

## Existing text-color language (respected, never re-colored)

11. **Red** = unknown / TBD / needs attention — including the template's own `( -- min)` and `INSERT DB LINK` conventions. Compiler red (inconsistency/unknown) extends this and applies only to compiler-written values.
12. **Magenta/pink** = crew/production cues and adjusted-time parentheticals. Hand-authored; the compiler never writes these (only write what you see — if a source contains such a cue verbatim, port it as plain text in place). Compiler pink (fresh change) applies only to compiler-written values.
13. **Blue** = ops/access notes and `cancelled` markers.
14. **Orange/amber text** = audio cues and `ADD:` notes. **Purple names** = featured guests. *Italics* = editorial notes. All hand-authored; port verbatim if a source literally contains them, otherwise never generated.

## 1.4 PAG/ROS

15. Columns: A = Start Time, B = End Time (15/30-min grid, ~7am–8pm); per event day a program column **plus a paired "Day N AV Cues" column**; pre-event day(s) = registration/tech-check column + ops column under one date header.
16. Row 1 = merged date headers exactly as the source names the days. Row 2 = teal `Day N` band (no theme line unless a source provides one). Row 3 `Theme:` band: filled only from a source, else left empty.
17. Blocks are vertically merged cells spanning their time range on the A/B grid.
18. Block fill by type: yellow = general sessions · orange = sales/re-pitch sessions · cyan = attendee transitions (doors, breaks, lunch) · gray = internal (team meetings, rehearsals, sound tests; AV Cues column background) · salmon = registration/tech checks. Type comes from what the source calls the block; unclassifiable blocks default to yellow with the title red-marked only if sources disagree about it.
19. Session header `D#S#: <title> (<duration>): <topic>` **only when the source provides those parts**; whatever part the source lacks is omitted (duration unknown → `( -- min)` in red only when a duration is expected by conflicting sources). Session numbers come from sources, never auto-generated.
20. Times inside blocks: exactly as the source wrote them (rule 6).
21. Body text ports the source's own beats/bullets, preserving SAGE shorthand verbatim when the source uses it (`HSKP`, `B/O`, `Tieback:`, `**` seeds). Housekeeping/emcee attribution is written only when a source states it.
22. AV Cues columns: filled only from sources that explicitly carry production data (`Timer:` `Audio:` `Slides:` `Video:` `Dashboard:` `B/O:` `Shares:` `Set/Props:` groups per segment). Existing hand-authored cues are never deleted or re-colored.
23. Cancelled items stay visible (ported as the source marks them), never removed by the compiler.

## Other tabs

24. **0.0 Index**: structure fixed; compiler may refresh Notes text only. `© SAGE Event Management` stays.
25. **1.0 Call Roadmap**: Date/Time (date bold, times beneath) · Call Topic (bold) · Agenda (bold group headers, `•` bullets, `o` sub-bullets) · Call Notes & Recording (`Link to Recording` as link). Sources: call agendas/notes. New calls append into the yellow zone (columns A–C; notes column stays white).
26. **1.1 Team R&R**: SAGE Team section is prefilled and **never overwritten by client data**. Client Team / Enrollment Lobby Team fill from client staffing docs: First, Last, Phone, Email, Role; checkboxes untouched. Unknown fields stay blank (red only when sources conflict).
27. **1.2 AV Assets**: the checklist rows are fixed — never added/removed. **When an uploaded document references an asset, put it here in the appropriate section**: its link in the Link column beside the matching checklist row; tick Uploaded only when a source confirms delivery. Asset references that match no row are flagged red in the nearest section rather than given new rows.
28. **1.7 Catering**: per-day bands; Meal · Set · Start · Strike · Menu · Printed? · Number of People · Location from BEOs/catering orders; times as written (rule 6).
29. **2.0 Schedule & Locations**: **compiler writes nothing on this tab. Human-only.**
30. **4.2 Obvio/Tech FAQ**: static SAGE knowledge base — compiler touches only the red `INSERT DB LINK` placeholder, and only when a source provides the event's dashboard link.

## Conflicts & unknowns

31. Inconsistencies never block: compile anyway; the conflicting/unresolved value renders in red text at the exact cell where it lives. The marks are cues for the humans running the event.
32. Values changed by a client edit render pink, settling to black after 24h of stability.
33. Compiler marks apply only to compiler-written values; hand-authored colors are never re-colored (rules 11–14).
34. Every ported value traces to a verbatim snippet in a source snapshot. Untraceable → not written.
