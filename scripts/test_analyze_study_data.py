import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("analyze_study_data.py")
SPEC = importlib.util.spec_from_file_location("analyze_study_data", MODULE_PATH)
assert SPEC and SPEC.loader
analysis = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = analysis
SPEC.loader.exec_module(analysis)


class StudyDataAnalysisTests(unittest.TestCase):
    def event(self, sequence, event_type, payload=None):
        return analysis.Event(
            row_number=sequence + 2,
            received_at=f"2026-09-01T12:00:{sequence:02d}+00:00",
            client_timestamp="",
            session_id="11111111-1111-4111-8111-111111111111",
            participant_code="P1",
            event_type=event_type,
            sequence_number=sequence,
            app_version="abc123",
            payload=payload or {},
        )

    def test_valid_session_and_work_metrics(self):
        work_id = "22222222-2222-4222-8222-222222222222"
        events = [
            self.event(0, "study_started"),
            self.event(1, "inconsistency_work_started", {
                "inconsistency_id": "inconsistency-0", "work_session_id": work_id,
            }),
            self.event(2, "editor_marker_hovered", {
                "inconsistency_id": "inconsistency-0", "duration_ms": 500,
            }),
            self.event(3, "context_preview_clicked", {
                "inconsistency_id": "inconsistency-0", "direction": "above",
                "target_index": 0, "preview_key": "preview-0",
            }),
            self.event(4, "inconsistency_work_finished", {
                "inconsistency_id": "inconsistency-0", "work_session_id": work_id,
                "duration_ms": 2500, "outcome": "resolved", "interaction_count": 1,
            }),
            self.event(5, "study_completed", {"outcome": "completed"}),
        ]
        issues = []
        sessions, grouped = analysis.analyze_sessions(events, issues)
        inconsistencies = analysis.analyze_inconsistencies(grouped)

        self.assertEqual([], issues)
        self.assertEqual("valid", sessions[0]["quality_status"])
        self.assertEqual(2500, sessions[0]["total_work_ms"])
        self.assertEqual(2500, inconsistencies[0]["total_work_ms"])
        self.assertEqual(500, inconsistencies[0]["editor_marker_hover_ms"])
        self.assertEqual(1, sessions[0]["context_preview_clicks"])
        self.assertEqual(1, inconsistencies[0]["context_preview_clicks"])
        self.assertEqual(
            '{"above": 1}', inconsistencies[0]["context_preview_direction_counts_json"]
        )

    def test_quality_checks_find_gaps_and_unpaired_work(self):
        events = [
            self.event(0, "study_started"),
            self.event(2, "inconsistency_work_started", {
                "inconsistency_id": "inconsistency-0",
                "work_session_id": "33333333-3333-4333-8333-333333333333",
            }),
        ]
        issues = []
        sessions, _ = analysis.analyze_sessions(events, issues)
        codes = {item["code"] for item in issues}

        self.assertIn("sequence_gaps", codes)
        self.assertIn("invalid_study_completed_count", codes)
        self.assertIn("unpaired_work_starts", codes)
        self.assertEqual("review", sessions[0]["quality_status"])

    def test_csv_writer_keeps_header_for_empty_quality_table(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "quality.csv"
            columns = ["severity", "code", "message"]
            analysis.write_csv(path, [], columns)
            self.assertEqual("severity,code,message", path.read_text(encoding="utf-8-sig").strip())


if __name__ == "__main__":
    unittest.main()
