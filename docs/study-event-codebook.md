# Study event codebook

This document defines the events and derived metrics used for the study data analysis. Raw Supabase exports must remain unchanged; all calculations are produced in separate output files.

## Event definitions

| Event | Meaning | Important payload fields |
|---|---|---|
| `study_started` | Participant explicitly started a study run. | `path` |
| `document_loaded` | A document or example text was loaded. | `source`, `format`, `character_count` |
| `analysis_started` | Consistency analysis was requested. | `character_count` |
| `analysis_finished` | Analysis ended successfully or with a recorded outcome. | `outcome`, `duration_ms` |
| `inconsistency_selected` | A different inconsistency became the explicit focus. Repeated navigation within the already selected inconsistency does not emit another selection event. | `inconsistency_id`, `source` |
| `editor_marker_clicked` | A highlighted marker in the editor was clicked. | `inconsistency_id`, `role` |
| `editor_marker_hovered` | An editor marker was hovered for at least 300 ms. | `inconsistency_id`, `duration_ms` |
| `location_marker_created` | An offscreen location marker was observed for the first time in one direction during the current full analysis. Re-renders and opacity/position changes are ignored. | `inconsistency_id`, `direction`, `severity`, `category`, `detail`, `passage_count`, `successful`, `resolution_ready`, `opacity`, `edge_offset_px`, `marker_size_px`, `selected` |
| `location_marker_size_changed` | A previously recorded location marker changed size. Opacity and position changes do not trigger this event. | `inconsistency_id`, `direction`, `passage_count`, `previous_marker_size_px`, `marker_size_px`, `size_change`, status fields |
| `location_marker_clicked` | An offscreen location marker was selected and used for navigation. | Same marker-state fields as `location_marker_created`, plus `selected_before_click` and `selected_after_click` |
| `location_marker_hovered` | A location marker was hovered for at least 300 ms. A qualifying hover is also completed when the marker is clicked and disappears during navigation. | `inconsistency_id`, `direction`, `severity`, `passage_count`, `successful`, `duration_ms` |
| `navigation_marker_clicked` | A marker in the left navigation was clicked. | `inconsistency_id`, `page`, `severity` |
| `navigation_marker_hovered` | A left-navigation marker was hovered for at least 300 ms. | `inconsistency_id`, `page`, `duration_ms` |
| `context_preview_clicked` | An off-screen context preview above or below the editor viewport was clicked. | `inconsistency_id`, `direction`, `target_index`, `preview_key` |
| `card_interaction` | A specific control inside a right-side inconsistency card was used. | `inconsistency_id`, `inconsistency_type`, `action`, `control_label`, `change_id` |
| `inconsistency_panel_interaction` | A global or category-level panel control was used. | `action`, `category`, `control_label` |
| `inconsistency_work_started` | A timed work segment for one inconsistency began. | `inconsistency_id`, `work_session_id`, `source` |
| `inconsistency_work_finished` | A timed work segment ended. | `inconsistency_id`, `work_session_id`, `outcome`, `duration_ms`, `interaction_count` |
| `change_accepted` | A direct or tracked change was applied or accepted. | `inconsistency_id`, `source`, `change_type`, `removed_texts`, `added_text` or `added_texts`, `occurrence_count` |
| `change_rejected` | A change or author decision was removed or reverted. | `inconsistency_id`, `source`, `change_type`, `removed_texts`, `added_texts`, `occurrence_count` |
| `passage_confirmed` | A passage was explicitly marked as **Looks good**. | `inconsistency_id`, `inconsistency_type`, `source`, `confirmation_id`, `confirmed_text`, passage/evidence location |
| `passage_change_submitted` | A direct editor change was captured as a consolidated diff when **Reanalyze** was selected. | `inconsistency_id`, `inconsistency_type`, `reanalysis_attempt_id`, `change_id`, `change_type`, `before_text`, `after_text`, `removed_texts`, `added_texts`, `paragraph_index` |
| `reanalysis_started` | A changed passage began reanalysis, including direct replacements and character-continuity changes. | `inconsistency_id`, `inconsistency_type`, `reanalysis_attempt_id`, `source`, `change_count` |
| `reanalysis_finished` | A matching reanalysis attempt completed, remained inconsistent, failed, or used the prototype quota fallback. `assumed_correct_quota` means the change was accepted without AI verification and must not be counted as an AI-confirmed resolution. | `inconsistency_id`, `inconsistency_type`, `reanalysis_attempt_id`, `source`, `outcome`, `duration_ms`, `change_count`, `returned_evidence_count`, `result_message`, `error_message` |
| `manual_edit_finished` | A free edit was submitted for review. It does not end work timing. | `inconsistency_id`, `paragraph_count`, `change_types`, `removed_texts`, `added_texts` |
| `page_changed` | Page navigation was requested through the page controls or document overview. | `source`, `from_page`, `to_page`, `direction`, `page_count`, `zoom_percent` |
| `zoom_changed` | The editor zoom was increased, decreased, or reset. | `source`, `previous_zoom_percent`, `new_zoom_percent` |
| `undo` | The participant invoked Ctrl/Cmd+Z. | `inconsistency_id`, `source` |
| `study_completed` | The run ended explicitly or because the page was closed. | `outcome` (`completed` or `page_closed`) |
| `error` | A technical error occurred. | `operation`, `message` |

The legacy event `text_edited` may occur in data recorded with an older frontend. The current frontend no longer logs individual Slate text operations; it records consolidated text differences when a tracked change is submitted instead.

## Derived metrics

- **Session duration:** difference between the first and last available received timestamp in one `session_id`.
- **Active inconsistency work time:** sum of `duration_ms` from `inconsistency_work_finished` events.
- **Total work for one inconsistency:** sum of all of its completed work segments, including repeated visits.
- **Successful completion:** exactly one `study_completed` event with `outcome = completed`.
- **Abandoned or interrupted run:** missing completion or `outcome = page_closed`.
- **Hover count:** number of completed hover events meeting the 300 ms threshold.
- **Hover duration:** sum of hover-event durations. Hover time overlaps active work time and must never be added to it.
- **Interaction count:** counts concrete controls used during an active work segment. The accompanying `inconsistency_selected` state event is excluded so that one selection click is not counted twice.
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
