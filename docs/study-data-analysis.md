# Study data analysis

The analysis script reads a Supabase CSV export without modifying it and creates separate machine-readable result tables.

## Recommended Supabase export

```sql
select
  received_at,
  client_timestamp,
  session_id,
  participant_code,
  event_type,
  sequence_number,
  app_version,
  payload
from public.study_events
order by received_at, session_id, sequence_number
limit 100000;
```

Export the query result as CSV. Always include `session_id`; participant codes alone are not guaranteed to identify one run.

## Run the analysis

From the RippleAnimation project directory:

```powershell
python scripts/analyze_study_data.py "C:\path\to\study_events.csv"
```

Choose a specific output directory if required:

```powershell
python scripts/analyze_study_data.py "C:\path\to\study_events.csv" `
  --output-dir "C:\path\to\analysis-output"
```

The default output directory is created next to the input CSV.

## Outputs

- `sessions.csv`: one row per session with completion, timing, event counts, and quality status.
- `inconsistency_metrics.csv`: one row per session and inconsistency with work, click, hover, card, and outcome metrics.
- `participant_metrics.csv`: participant-level totals across sessions.
- `event_counts.csv`: overall counts per event type.
- `quality_issues.csv`: explicit data-quality errors and warnings.
- `summary.json`: compact machine-readable overview and methodological notes.

CSV outputs use UTF-8 with a byte-order mark for reliable opening in Microsoft Excel. Durations are provided in milliseconds and seconds. See `docs/study-event-codebook.md` for definitions.
