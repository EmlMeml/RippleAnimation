# Study event codebook

This document defines the events and derived metrics used for the study data analysis. Raw Supabase exports must remain unchanged; all calculations are produced in separate output files.

## Event definitions

| Event | Meaning | Important payload fields |
|---|---|---|
| `study_started` | Participant explicitly started a study run. | `path` |
| `document_loaded` | A document or example text was loaded. | `source`, `format`, `character_count` |
| `analysis_started` | Consistency analysis was requested. | `character_count` |
| `analysis_finished` | Analysis ended successfully or with a recorded outcome. | `outcome`, `duration_ms` |
| `inconsistency_selected` | An inconsistency became the explicit focus. | `inconsistency_id`, `source` |
| `editor_marker_clicked` | A highlighted marker in the editor was clicked. | `inconsistency_id`, `role` |
| `editor_marker_hovered` | An editor marker was hovered for at least 300 ms. | `inconsistency_id`, `duration_ms` |
| `navigation_marker_clicked` | A marker in the left navigation was clicked. | `inconsistency_id`, `page`, `severity` |
| `navigation_marker_hovered` | A left-navigation marker was hovered for at least 300 ms. | `inconsistency_id`, `page`, `duration_ms` |
| `card_interaction` | A relevant control inside a right-side inconsistency card was used. | `inconsistency_id`, `action` |
| `inconsistency_work_started` | A timed work segment for one inconsistency began. | `inconsistency_id`, `work_session_id`, `source` |
| `inconsistency_work_finished` | A timed work segment ended. | `inconsistency_id`, `work_session_id`, `outcome`, `duration_ms`, `interaction_count` |
| `suggestion_accepted` | A direct replacement was applied with **Add change**. | `inconsistency_id`, `source`, `occurrence_count`, `replacement_character_count` |
| `suggestion_rejected` | A tracked change was removed or rejected. | `inconsistency_id`, `source`, `occurrence_count` |
| `manual_edit_finished` | A free edit was submitted for review. It does not end work timing. | `inconsistency_id`, `paragraph_count` |
| `undo` | The participant invoked Ctrl/Cmd+Z. | `inconsistency_id`, `source` |
| `study_completed` | The run ended explicitly or because the page was closed. | `outcome` (`completed` or `page_closed`) |
| `error` | A technical error occurred. | `operation`, `message` |

## Derived metrics

- **Session duration:** difference between the first and last available received timestamp in one `session_id`.
- **Active inconsistency work time:** sum of `duration_ms` from `inconsistency_work_finished` events.
- **Total work for one inconsistency:** sum of all of its completed work segments, including repeated visits.
- **Successful completion:** exactly one `study_completed` event with `outcome = completed`.
- **Abandoned or interrupted run:** missing completion or `outcome = page_closed`.
- **Hover count:** number of completed hover events meeting the 300 ms threshold.
- **Hover duration:** sum of hover-event durations. Hover time overlaps active work time and must never be added to it.
- **Resolved work segment:** a work finish with `outcome = resolved`.
- **Navigation away:** a work finish with `outcome = selection_changed` or `deselected`; this is not a resolution.

## Quality rules

A session should normally contain:

1. Sequence numbers starting at zero without gaps or duplicates.
2. Exactly one `study_started` event.
3. Exactly one `study_completed` event as the final event.
4. One matching finish for every `inconsistency_work_started` event, matched by `work_session_id`.
5. No negative or missing work duration.
6. One stable `session_id` and participant code throughout the run.

Quality warnings do not automatically justify excluding a session. Exclusion rules should be defined in the study protocol before the final statistical analysis.
