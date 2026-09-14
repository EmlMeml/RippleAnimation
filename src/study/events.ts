export type StudyEventType =
  | "study_started"
  | "document_loaded"
  | "analysis_started"
  | "analysis_finished"
  | "inconsistency_selected"
  | "editor_marker_clicked"
  | "editor_marker_hovered"
  | "location_marker_created"
  | "location_marker_size_changed"
  | "location_marker_clicked"
  | "location_marker_hovered"
  | "navigation_marker_clicked"
  | "navigation_marker_hovered"
  | "context_preview_clicked"
  | "card_interaction"
  | "inconsistency_panel_interaction"
  | "inconsistency_work_started"
  | "inconsistency_work_finished"
  | "change_accepted"
  | "change_rejected"
  | "passage_confirmed"
  | "passage_change_submitted"
  | "reanalysis_started"
  | "reanalysis_finished"
  | "manual_edit_finished"
  | "page_changed"
  | "zoom_changed"
  | "undo"
  | "study_completed"
  | "error";

export type StudyEventPayload = Record<
  string,
  string | number | boolean | null | string[] | number[]
>;

export type StudyEvent = {
  session_id: string;
  participant_code: string | null;
  event_type: StudyEventType;
  sequence_number: number;
  client_timestamp: string;
  app_version: string | null;
  payload: StudyEventPayload;
};
