-- Run this only after the log-study-events Edge Function has been deployed
-- and the GitHub Pages frontend has been updated to call it successfully.

revoke all on table public.study_events from anon, authenticated;

drop policy if exists "participants can submit study events"
  on public.study_events;

-- Makes client retries idempotent: the same event cannot be stored twice.
create unique index if not exists study_events_session_sequence_unique_idx
  on public.study_events (session_id, sequence_number);
