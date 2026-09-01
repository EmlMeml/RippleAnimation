import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import './App.css'
import RichTextEditor from './custom/editor/Editor';
import type { StoryContext } from "./types/story";
import { useEffect, useState, type FormEvent } from "react";
import {
  completeStudyLogging,
  initializeStudyLogging,
  setStudyParticipantCode,
} from "./study/logger";

type StudyPhase = "consent" | "running" | "confirming" | "completed";

function App() {
  const [phase, setPhase] = useState<StudyPhase>("consent");
  const [participantCode, setParticipantCode] = useState("");
  const [consented, setConsented] = useState(false);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [completionError, setCompletionError] = useState("");

  useEffect(() => {
    if (phase !== "running" && phase !== "confirming") return;
    return initializeStudyLogging();
  }, [phase]);

  const storyContext: StoryContext = {
    referenceDate: "2026-08-14",
  };

  function startStudy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = participantCode.trim();
    if (!normalizedCode || !consented) return;
    setStudyParticipantCode(normalizedCode);
    setPhase("running");
  }

  async function completeStudy() {
    setCompletionSaving(true);
    setCompletionError("");
    const uploaded = await completeStudyLogging();
    setCompletionSaving(false);
    if (uploaded) {
      setPhase("completed");
    } else {
      setCompletionError(
        "The study data could not be uploaded. Please check your connection and try again."
      );
    }
  }

  if (phase === "consent") {
    return (
      <main className="study-gate">
        <form className="study-gate-card" onSubmit={startStudy}>
          <p className="study-eyebrow">User Study</p>
          <h1>Welcome to the study</h1>
          <p>
            This study investigates how the tool is used to identify and resolve
            inconsistencies. Your interactions with the tool will be recorded under
            a pseudonymous participant code.
          </p>

          <section className="study-information" aria-labelledby="logging-heading">
            <h2 id="logging-heading">What data will be recorded?</h2>
            <ul>
              <li>The start, end, and duration of the session</li>
              <li>Document imports and initiated analyses</li>
              <li>Clicks on markers, navigation items, and inconsistency cards</li>
              <li>Accepted, rejected, and manually edited suggestions</li>
              <li>Time spent and number of interactions per inconsistency</li>
              <li>Technical errors encountered while using the tool</li>
            </ul>
            <p>
              This form does not collect names or email addresses. The participant
              code is used only to associate interactions within this study.
            </p>
          </section>

          <label className="study-field">
            <span>Participant code</span>
            <input
              value={participantCode}
              onChange={(event) => setParticipantCode(event.target.value)}
              maxLength={40}
              autoComplete="off"
              required
              placeholder="e.g. P014"
            />
          </label>

          <label className="study-consent">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
              required
            />
            <span>
              I have read the information above and consent to the described recording
              of my interactions for this study.
            </span>
          </label>

          <button
            className="study-primary-button"
            type="submit"
            disabled={!participantCode.trim() || !consented}
          >
            Start study
          </button>
          <p className="study-legal-note">
            Note for the study team: This text is a technical placeholder. Before the
            study begins, align it with the participant information sheet and add the
            relevant contact, retention period, and withdrawal procedure.
          </p>
        </form>
      </main>
    );
  }

  if (phase === "completed") {
    return (
      <main className="study-gate">
        <section className="study-gate-card study-completed-card">
          <p className="study-complete-icon" aria-hidden="true">✓</p>
          <h1>Thank you!</h1>
          <p>The study has been completed and your interactions have been saved.</p>
          <p>You may now close this browser window.</p>
        </section>
      </main>
    );
  }

  return (
    <>
    <header className="study-session-bar">
      <span>Study in progress · Code {participantCode.trim()}</span>
      <button type="button" onClick={() => setPhase("confirming")}>
        Complete study
      </button>
    </header>
    <Box sx={{flowGrow: 1}}>
      <Grid container spacing={2}>
        <Grid size={12} sx={{display: 'flex', justifyContent: 'center', alignItems:'center', minHeight:'100vh'}}>
          <RichTextEditor context={storyContext}></RichTextEditor>
        </Grid>
      </Grid>
    </Box>
    {phase === "confirming" && (
      <div className="study-modal-backdrop" role="presentation">
        <section className="study-modal" role="dialog" aria-modal="true" aria-labelledby="complete-study-title">
          <h2 id="complete-study-title">Complete the study?</h2>
          <p>Once completed, this session can no longer be edited.</p>
          {completionError && (
            <p className="study-completion-error" role="alert">{completionError}</p>
          )}
          <div className="study-modal-actions">
            <button type="button" onClick={() => setPhase("running")} disabled={completionSaving}>
              Continue working
            </button>
            <button type="button" className="study-primary-button" onClick={completeStudy} disabled={completionSaving}>
              {completionSaving ? "Saving…" : "Complete study"}
            </button>
          </div>
        </section>
      </div>
    )}
     
    </>
  )
}

export default App
