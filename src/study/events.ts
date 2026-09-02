export type StudyEventType =
  | "study_started"
  | "document_loaded"
  | "analysis_started"
  | "analysis_finished"
  | "inconsistency_selected"
  | "editor_marker_clicked"
  | "editor_marker_hovered"
  | "navigation_marker_clicked"
  | "navigation_marker_hovered"
  | "context_preview_clicked"
  | "card_interaction"
  | "inconsistency_work_started"
  | "inconsistency_work_finished"
  | "suggestion_accepted"
  | "suggestion_rejected"
  | "manual_edit_finished"
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
