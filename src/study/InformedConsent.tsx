import { consentIntroduction, consentMetadata, consentSections } from "./consentContent";

type InformedConsentProps = {
  participantCode: string;
  onParticipantCodeChange: (value: string) => void;
};

function ConsentText({ text }: { text: string }) {
  return text.split(/\n\n+/).map((paragraph, index) => (
    <p key={index} style={{ whiteSpace: "pre-line" }}>
      {paragraph.split(/([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g).map((part, partIndex) =>
        partIndex % 2 === 1
          ? <a key={partIndex} href={`mailto:${part}`}>{part}</a>
          : part
      )}
    </p>
  ));
}

export default function InformedConsent({
  participantCode,
  onParticipantCodeChange,
}: InformedConsentProps) {
  return (
    <>
      <header className="consent-header">
        <p className="study-eyebrow">User Study</p>
        <h1>Welcome to the Study</h1>
        <p className="consent-study-title">{consentMetadata.title}</p>
        <p>Please complete the initial survey, including the informed consent form, before starting.</p>
        <p>Your interactions with this tool, such as clicks, edits, and timings, will be recorded for the study. You may stop participating at any time.</p>
        <p>Enter the participant code provided to you and wait for the researcher’s instructions before starting.</p>
      </header>

      <div className="consent-sections">
        <details>
          <summary>View Informed Consent</summary>
          <div className="consent-section-content">
            <ConsentText text={consentIntroduction} />
            {consentSections.map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                <ConsentText text={section.text} />
              </section>
            ))}
            <button className="consent-copy-button" type="button" onClick={() => window.print()}>
              Print or save a copy
            </button>
          </div>
        </details>
      </div>

      <label className="study-field">
        <span>Participant code</span>
        <input
          value={participantCode}
          onChange={(event) => onParticipantCodeChange(event.target.value)}
          maxLength={40}
          autoComplete="off"
          required
          placeholder="e.g. P014"
        />
      </label>

    </>
  );
}
