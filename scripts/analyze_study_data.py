#!/usr/bin/env python3
"""Create reproducible analysis tables from a Supabase study_events CSV export."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


KNOWN_EVENTS = {
    "study_started",
    "document_loaded",
    "analysis_started",
    "analysis_finished",
    "inconsistency_selected",
    "editor_marker_clicked",
    "editor_marker_hovered",
    "navigation_marker_clicked",
    "navigation_marker_hovered",
    "context_preview_clicked",
    "card_interaction",
    "inconsistency_work_started",
    "inconsistency_work_finished",
    "suggestion_accepted",
    "suggestion_rejected",
    "manual_edit_finished",
    "undo",
    "study_completed",
    "error",
}

REQUIRED_COLUMNS = {
    "session_id",
    "participant_code",
    "event_type",
    "sequence_number",
    "payload",
}


@dataclass(frozen=True)
class Event:
    row_number: int
    received_at: str
    client_timestamp: str
    session_id: str
    participant_code: str
    event_type: str
    sequence_number: int
    app_version: str
    payload: dict[str, Any]


def parse_timestamp(value: str) -> datetime | None:
    if not value:
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def numeric(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return int(value)
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def issue(
    issues: list[dict[str, Any]],
    severity: str,
    code: str,
    message: str,
    *,
    session_id: str = "",
    participant_code: str = "",
    sequence_number: int | str = "",
    row_number: int | str = "",
) -> None:
    issues.append({
        "severity": severity,
        "code": code,
        "session_id": session_id,
        "participant_code": participant_code,
        "sequence_number": sequence_number,
        "source_row_number": row_number,
        "message": message,
    })


def read_events(input_path: Path) -> tuple[list[Event], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    events: list[Event] = []

    with input_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = sorted(REQUIRED_COLUMNS - columns)
        if missing:
            raise ValueError(f"Missing required CSV columns: {', '.join(missing)}")

        for row_number, row in enumerate(reader, start=2):
            try:
                sequence_number = int(row.get("sequence_number", ""))
            except ValueError:
                issue(
                    issues, "error", "invalid_sequence_number",
                    "The sequence number is not an integer.",
                    session_id=row.get("session_id", ""),
                    participant_code=row.get("participant_code", ""),
                    row_number=row_number,
                )
                continue

            try:
                payload = json.loads(row.get("payload") or "{}")
                if not isinstance(payload, dict):
                    raise ValueError("payload is not a JSON object")
            except (json.JSONDecodeError, ValueError) as error:
                issue(
                    issues, "error", "invalid_payload_json", str(error),
                    session_id=row.get("session_id", ""),
                    participant_code=row.get("participant_code", ""),
                    sequence_number=sequence_number,
                    row_number=row_number,
                )
                payload = {}

            event_type = (row.get("event_type") or "").strip()
            if event_type not in KNOWN_EVENTS:
                issue(
                    issues, "warning", "unknown_event_type",
                    f"Unknown event type: {event_type or '<empty>'}",
                    session_id=row.get("session_id", ""),
                    participant_code=row.get("participant_code", ""),
                    sequence_number=sequence_number,
                    row_number=row_number,
                )

            events.append(Event(
                row_number=row_number,
                received_at=(row.get("received_at") or "").strip(),
                client_timestamp=(row.get("client_timestamp") or "").strip(),
                session_id=(row.get("session_id") or "").strip(),
                participant_code=(row.get("participant_code") or "").strip(),
                event_type=event_type,
                sequence_number=sequence_number,
                app_version=(row.get("app_version") or "").strip(),
                payload=payload,
            ))

    return events, issues


def elapsed_ms(events: list[Event]) -> int | None:
    timestamps = [parse_timestamp(event.received_at or event.client_timestamp) for event in events]
    valid = [timestamp for timestamp in timestamps if timestamp is not None]
    if len(valid) < 2:
        return None
    return max(0, round((max(valid) - min(valid)).total_seconds() * 1000))


def analyze_sessions(
    events: list[Event], issues: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, list[Event]]]:
    grouped: dict[str, list[Event]] = defaultdict(list)
    for event in events:
        grouped[event.session_id].append(event)

    output: list[dict[str, Any]] = []
    for session_id, session_events in sorted(grouped.items()):
        ordered = sorted(session_events, key=lambda event: (event.sequence_number, event.row_number))
        participant = next((event.participant_code for event in ordered if event.participant_code), "")
        counts = Counter(event.event_type for event in ordered)
        sequences = [event.sequence_number for event in ordered]
        duplicate_sequences = sorted(sequence for sequence, count in Counter(sequences).items() if count > 1)
        expected = set(range(min(sequences), max(sequences) + 1)) if sequences else set()
        gaps = sorted(expected - set(sequences))
        starts = [event for event in ordered if event.event_type == "inconsistency_work_started"]
        finishes = [event for event in ordered if event.event_type == "inconsistency_work_finished"]
        start_ids = {str(event.payload.get("work_session_id", "")) for event in starts}
        finish_ids = {str(event.payload.get("work_session_id", "")) for event in finishes}
        unpaired_starts = sorted(identifier for identifier in start_ids - finish_ids if identifier)
        orphan_finishes = sorted(identifier for identifier in finish_ids - start_ids if identifier)
        completion_events = [event for event in ordered if event.event_type == "study_completed"]
        completion_outcome = str(completion_events[-1].payload.get("outcome", "")) if completion_events else ""
        work_ms = sum(max(0, numeric(event.payload.get("duration_ms"))) for event in finishes)
        participant_codes = sorted({event.participant_code for event in ordered if event.participant_code})
        app_versions = sorted({event.app_version for event in ordered if event.app_version})

        if not session_id:
            issue(issues, "error", "missing_session_id", "Session ID is empty.", participant_code=participant)
        if len(participant_codes) > 1:
            issue(
                issues, "error", "multiple_participant_codes",
                f"Session contains multiple participant codes: {participant_codes}",
                session_id=session_id, participant_code=participant,
            )
        if len(app_versions) > 1:
            issue(
                issues, "warning", "multiple_app_versions",
                f"Session contains multiple app versions: {app_versions}",
                session_id=session_id, participant_code=participant,
            )
        if duplicate_sequences:
            issue(
                issues, "error", "duplicate_sequence_numbers",
                f"Duplicate sequence numbers: {duplicate_sequences}",
                session_id=session_id, participant_code=participant,
            )
        if gaps:
            issue(
                issues, "error", "sequence_gaps", f"Missing sequence numbers: {gaps}",
                session_id=session_id, participant_code=participant,
            )
        if sequences and min(sequences) != 0:
            issue(
                issues, "warning", "sequence_does_not_start_at_zero",
                f"First sequence number is {min(sequences)}.",
                session_id=session_id, participant_code=participant,
            )
        if counts["study_started"] != 1:
            issue(
                issues, "error", "invalid_study_started_count",
                f"Expected one study_started event, found {counts['study_started']}.",
                session_id=session_id, participant_code=participant,
            )
        if counts["study_completed"] != 1:
            issue(
                issues, "warning", "invalid_study_completed_count",
                f"Expected one study_completed event, found {counts['study_completed']}.",
                session_id=session_id, participant_code=participant,
            )
        if completion_events and ordered[-1].event_type != "study_completed":
            issue(
                issues, "warning", "completion_not_last_event",
                "study_completed is not the final event in the session.",
                session_id=session_id, participant_code=participant,
            )
        if unpaired_starts:
            issue(
                issues, "error", "unpaired_work_starts",
                f"Work sessions without finish: {unpaired_starts}",
                session_id=session_id, participant_code=participant,
            )
        if orphan_finishes:
            issue(
                issues, "error", "orphan_work_finishes",
                f"Work finishes without start: {orphan_finishes}",
                session_id=session_id, participant_code=participant,
            )
        for event in finishes:
            if numeric(event.payload.get("duration_ms"), -1) < 0:
                issue(
                    issues, "error", "invalid_work_duration",
                    "Work duration is missing or negative.",
                    session_id=session_id, participant_code=participant,
                    sequence_number=event.sequence_number, row_number=event.row_number,
                )

        issue_count = sum(item["session_id"] == session_id for item in issues)
        duration = elapsed_ms(ordered)
        output.append({
            "session_id": session_id,
            "participant_code": participant,
            "app_versions": "|".join(app_versions),
            "started_at": ordered[0].received_at if ordered else "",
            "last_event_at": ordered[-1].received_at if ordered else "",
            "session_duration_ms": duration if duration is not None else "",
            "session_duration_seconds": round(duration / 1000, 3) if duration is not None else "",
            "total_events": len(ordered),
            "minimum_sequence": min(sequences) if sequences else "",
            "maximum_sequence": max(sequences) if sequences else "",
            "sequence_gap_count": len(gaps),
            "duplicate_sequence_count": len(duplicate_sequences),
            "study_started_count": counts["study_started"],
            "study_completed_count": counts["study_completed"],
            "completion_outcome": completion_outcome,
            "completed_successfully": completion_outcome == "completed",
            "work_sessions_started": len(starts),
            "work_sessions_finished": len(finishes),
            "unpaired_work_session_count": len(unpaired_starts) + len(orphan_finishes),
            "total_work_ms": work_ms,
            "total_work_seconds": round(work_ms / 1000, 3),
            "editor_marker_clicks": counts["editor_marker_clicked"],
            "navigation_marker_clicks": counts["navigation_marker_clicked"],
            "editor_marker_hovers": counts["editor_marker_hovered"],
            "navigation_marker_hovers": counts["navigation_marker_hovered"],
            "context_preview_clicks": counts["context_preview_clicked"],
            "card_interactions": counts["card_interaction"],
            "suggestions_accepted": counts["suggestion_accepted"],
            "suggestions_rejected": counts["suggestion_rejected"],
            "manual_edits_finished": counts["manual_edit_finished"],
            "undo_count": counts["undo"],
            "error_count": counts["error"],
            "quality_issue_count": issue_count,
            "quality_status": "review" if issue_count else "valid",
        })

    return output, grouped


def analyze_inconsistencies(grouped: dict[str, list[Event]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for session_id, session_events in grouped.items():
        by_id: dict[str, list[Event]] = defaultdict(list)
        for event in session_events:
            inconsistency_id = event.payload.get("inconsistency_id")
            if isinstance(inconsistency_id, str) and inconsistency_id:
                by_id[inconsistency_id].append(event)

        for inconsistency_id, items in sorted(by_id.items()):
            ordered = sorted(items, key=lambda event: (event.sequence_number, event.row_number))
            counts = Counter(event.event_type for event in ordered)
            finishes = [event for event in ordered if event.event_type == "inconsistency_work_finished"]
            work_ms = sum(max(0, numeric(event.payload.get("duration_ms"))) for event in finishes)
            editor_hover_ms = sum(
                max(0, numeric(event.payload.get("duration_ms")))
                for event in ordered if event.event_type == "editor_marker_hovered"
            )
            navigation_hover_ms = sum(
                max(0, numeric(event.payload.get("duration_ms")))
                for event in ordered if event.event_type == "navigation_marker_hovered"
            )
            card_actions = Counter(
                str(event.payload.get("action", "unknown"))
                for event in ordered if event.event_type == "card_interaction"
            )
            context_preview_directions = Counter(
                str(event.payload.get("direction", "unknown"))
                for event in ordered if event.event_type == "context_preview_clicked"
            )
            outcomes = Counter(str(event.payload.get("outcome", "unknown")) for event in finishes)
            participant = next((event.participant_code for event in ordered if event.participant_code), "")
            output.append({
                "session_id": session_id,
                "participant_code": participant,
                "inconsistency_id": inconsistency_id,
                "inconsistency_group": "character" if inconsistency_id.startswith("character-") else "story",
                "first_sequence": ordered[0].sequence_number,
                "last_sequence": ordered[-1].sequence_number,
                "total_related_events": len(ordered),
                "work_session_count": len(finishes),
                "total_work_ms": work_ms,
                "total_work_seconds": round(work_ms / 1000, 3),
                "average_work_session_ms": round(work_ms / len(finishes), 3) if finishes else "",
                "resolved_work_sessions": outcomes["resolved"],
                "selection_changed_work_sessions": outcomes["selection_changed"],
                "deselected_work_sessions": outcomes["deselected"],
                "editor_marker_clicks": counts["editor_marker_clicked"],
                "navigation_marker_clicks": counts["navigation_marker_clicked"],
                "editor_marker_hovers": counts["editor_marker_hovered"],
                "editor_marker_hover_ms": editor_hover_ms,
                "navigation_marker_hovers": counts["navigation_marker_hovered"],
                "navigation_marker_hover_ms": navigation_hover_ms,
                "context_preview_clicks": counts["context_preview_clicked"],
                "context_preview_direction_counts_json": json.dumps(
                    dict(sorted(context_preview_directions.items())), sort_keys=True
                ),
                "card_interactions": counts["card_interaction"],
                "card_action_counts_json": json.dumps(dict(sorted(card_actions.items())), sort_keys=True),
                "suggestions_accepted": counts["suggestion_accepted"],
                "suggestions_rejected": counts["suggestion_rejected"],
                "manual_edits_finished": counts["manual_edit_finished"],
                "undo_count": counts["undo"],
                "work_outcomes_json": json.dumps(dict(sorted(outcomes.items())), sort_keys=True),
            })
    return sorted(output, key=lambda row: (row["participant_code"], row["session_id"], row["first_sequence"]))


def analyze_participants(session_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in session_rows:
        grouped[str(row["participant_code"])].append(row)

    output: list[dict[str, Any]] = []
    sum_fields = [
        "total_events", "total_work_ms", "editor_marker_clicks", "navigation_marker_clicks",
        "editor_marker_hovers", "navigation_marker_hovers", "context_preview_clicks",
        "card_interactions",
        "suggestions_accepted", "suggestions_rejected", "manual_edits_finished",
        "undo_count", "error_count", "quality_issue_count",
    ]
    for participant, rows in sorted(grouped.items()):
        result: dict[str, Any] = {
            "participant_code": participant,
            "session_count": len(rows),
            "completed_session_count": sum(bool(row["completed_successfully"]) for row in rows),
            "abandoned_or_incomplete_session_count": sum(not bool(row["completed_successfully"]) for row in rows),
            "total_session_duration_ms": sum(numeric(row["session_duration_ms"]) for row in rows),
        }
        result["total_session_duration_seconds"] = round(result["total_session_duration_ms"] / 1000, 3)
        for field in sum_fields:
            result[field] = sum(numeric(row[field]) for row in rows)
        result["total_work_seconds"] = round(result["total_work_ms"] / 1000, 3)
        output.append(result)
    return output


def analyze_event_counts(events: list[Event]) -> list[dict[str, Any]]:
    grouped: dict[str, list[Event]] = defaultdict(list)
    for event in events:
        grouped[event.event_type].append(event)
    return [{
        "event_type": event_type,
        "event_count": len(items),
        "participant_count": len({item.participant_code for item in items}),
        "session_count": len({item.session_id for item in items}),
    } for event_type, items in sorted(grouped.items())]


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: Iterable[str] | None = None) -> None:
    columns = list(fieldnames or (rows[0].keys() if rows else []))
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_csv", type=Path, help="Supabase study_events CSV export")
    parser.add_argument("--output-dir", type=Path, help="Output directory")
    args = parser.parse_args()

    input_path = args.input_csv.expanduser().resolve()
    if not input_path.is_file():
        parser.error(f"Input file does not exist: {input_path}")
    output_dir = (args.output_dir or input_path.parent / f"analysis_{input_path.stem}").expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        events, issues = read_events(input_path)
        session_rows, grouped = analyze_sessions(events, issues)
    except (OSError, ValueError) as error:
        print(f"Analysis failed: {error}", file=sys.stderr)
        return 1

    inconsistency_rows = analyze_inconsistencies(grouped)
    participant_rows = analyze_participants(session_rows)
    event_count_rows = analyze_event_counts(events)

    write_csv(output_dir / "sessions.csv", session_rows)
    write_csv(output_dir / "inconsistency_metrics.csv", inconsistency_rows)
    write_csv(output_dir / "participant_metrics.csv", participant_rows)
    write_csv(output_dir / "event_counts.csv", event_count_rows)
    write_csv(
        output_dir / "quality_issues.csv",
        issues,
        ["severity", "code", "session_id", "participant_code", "sequence_number", "source_row_number", "message"],
    )

    summary = {
        "source_file": str(input_path),
        "event_count": len(events),
        "session_count": len(session_rows),
        "participant_count": len(participant_rows),
        "inconsistency_record_count": len(inconsistency_rows),
        "completed_session_count": sum(bool(row["completed_successfully"]) for row in session_rows),
        "quality_issue_count": len(issues),
        "quality_error_count": sum(item["severity"] == "error" for item in issues),
        "quality_warning_count": sum(item["severity"] == "warning" for item in issues),
        "notes": [
            "Hover duration overlaps work duration and must not be added to it.",
            "Multiple visits to one inconsistency remain separate work sessions and are also aggregated per inconsistency.",
            "The source CSV is read-only and is never modified by this script.",
        ],
    }
    (output_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"Analyzed {len(events)} events from {len(session_rows)} sessions.")
    print(f"Quality issues: {len(issues)}")
    print(f"Output: {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
