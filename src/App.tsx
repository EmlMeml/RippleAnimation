import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import './App.css'
import RichTextEditor from './custom/editor/Editor';
import type { StoryContext } from "./types/story";
import { useEffect, useState, type FormEvent } from "react";
import {
  completeStudyLogging,
  beginStudySession,
  initializeStudyLogging,
} from "./study/logger";
import InformedConsent from "./study/InformedConsent";

type StudyPhase = "consent" | "running" | "confirming" | "completed";

function App() {
  const [phase, setPhase] = useState<StudyPhase>("consent");
  const [participantCode, setParticipantCode] = useState("");
  const [participationConsent, setParticipationConsent] = useState(false);
  const [dataConsent, setDataConsent] = useState(false);
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
    if (!normalizedCode || !participationConsent || !dataConsent) return;
    beginStudySession(normalizedCode);
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
          <InformedConsent
            participantCode={participantCode}
            participationConsent={participationConsent}
            dataConsent={dataConsent}
            onParticipantCodeChange={setParticipantCode}
            onParticipationConsentChange={setParticipationConsent}
            onDataConsentChange={setDataConsent}
          />

          <button
            className="study-primary-button"
            type="submit"
            disabled={!participantCode.trim() || !participationConsent || !dataConsent}
          >
            Start study
          </button>
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
