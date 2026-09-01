create table if not exists public.study_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  session_id uuid not null,
  participant_code text,
  event_type text not null,
  sequence_number integer not null,
  client_timestamp timestamptz not null,
  app_version text,
  payload jsonb not null default '{}'::jsonb,
  constraint study_events_event_type_length
    check (char_length(event_type) between 1 and 80),
  constraint study_events_participant_code_length
    check (participant_code is null or char_length(participant_code) <= 40),
  constraint study_events_sequence_number
    check (sequence_number >= 0),
  constraint study_events_payload_size
    check (pg_column_size(payload) <= 16384)
);

alter table public.study_events enable row level security;

revoke all on table public.study_events from anon, authenticated;
grant insert on table public.study_events to anon, authenticated;

drop policy if exists "participants can submit study events"
  on public.study_events;

create policy "participants can submit study events"
on public.study_events
for insert
to anon, authenticated
with check (
  char_length(event_type) between 1 and 80
  and sequence_number >= 0
  and pg_column_size(payload) <= 16384
);

create index if not exists study_events_session_sequence_idx
  on public.study_events (session_id, sequence_number);

create index if not exists study_events_type_idx
  on public.study_events (event_type);
