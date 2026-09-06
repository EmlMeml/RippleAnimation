type InformedConsentProps = {
  participantCode: string;
  participationConsent: boolean;
  dataConsent: boolean;
  onParticipantCodeChange: (value: string) => void;
  onParticipationConsentChange: (value: boolean) => void;
  onDataConsentChange: (value: boolean) => void;
};

// Replace these values before participant recruitment begins.
const PRINCIPAL_INVESTIGATOR = {
  name: "Andreas Butz",
  email: "andreas.butz@ifi.lmu.de",
};

const RESEARCHERS = [
  { name: "Melanie Kitze", email: "melanie.kitze@campus.lmu.de" },
  { name: "Rifat Mehreen Amin", email: "rifat.amin@ifi.lmu.de" },
];

function Contact({ name, email }: { name: string; email: string }) {
  const hasEmail = !email.startsWith("[");
  return (
    <span>
      {name} ({hasEmail ? <a href={`mailto:${email}`}>{email}</a> : email})
    </span>
  );
}

export default function InformedConsent({
  participantCode,
  participationConsent,
  dataConsent,
  onParticipantCodeChange,
  onParticipationConsentChange,
  onDataConsentChange,
}: InformedConsentProps) {
  return (
    <>
      <header className="consent-header">
        <p className="study-eyebrow">User Study</p>
        <h1>Informed Consent of Participation</h1>
        <p className="consent-study-title">
          Animate It: Using Animations to Support Inconsistency Revision
        </p>
        <p>
          You are invited to participate in this online study, initiated and conducted by{" "}
          {RESEARCHERS.map((researcher) => researcher.name).join(" and ")}. The research is
          supervised by {PRINCIPAL_INVESTIGATOR.name} at LMU Munich.
        </p>
      </header>

      <section className="consent-summary" aria-labelledby="consent-summary-heading">
        <h2 id="consent-summary-heading">Key information</h2>
        <ul>
          <li>Your participation is voluntary and will take approximately 60 minutes.</li>
          <li>We record demographics: age, gender, occupation, and level of education.</li>
          <li>We record video, audio, your screen, notes, browser metadata, and interaction data such as clicks and timings.</li>
          <li>You receive either one study-course credit point per hour or EUR 12 per hour.</li>
          <li>Results and anonymized data may be published or shared publicly.</li>
          <li>You may withdraw at any time without penalty or loss of compensation.</li>
        </ul>
        <p>
          Please take as much time as you need. If you do not fully agree or your questions
          have not been answered to your satisfaction, do not provide consent.
        </p>
      </section>

      <div className="consent-sections">
        <details open>
          <summary>1. Purpose and Goal of this Research</summary>
          <div className="consent-section-content">
            <p>
              The purpose of this study is to gather information regarding the support
              animations offer to writers in solving inconsistencies. The goal is to analyze
              whether animations support writers in solving inconsistencies. Your participation
              will help us achieve this goal.
            </p>
            <p>
              The results may be presented at scientific or professional meetings or published
              in scientific proceedings and journals.
            </p>
          </div>
        </details>

        <details>
          <summary>2. Participation and Compensation</summary>
          <div className="consent-section-content">
            <p>
              Your participation is voluntary. You will be one of approximately 12 people
              participating in this research. You will receive EUR 12 per hour or one credit
              point per hour required for your study course at LMU Munich.
            </p>
            <p>
              You may withdraw and discontinue participation at any time without penalty or
              losing compensation. Where possible, you may refuse to answer any question.
            </p>
            <p>
              At any time and without giving a reason, you can withdraw your consent (GDPR
              Art. 7(3)). In case of withdrawal, data stored on the basis of your consent will
              be deleted or anonymized where legally permissible (GDPR Art. 17). If deletion is
              impossible or requires unreasonable technical effort, personal identifiers will
              be removed. Once data have been anonymized, deletion is no longer possible because
              we will no longer be able to identify which data are yours. Anonymization cannot
              entirely exclude the possibility of tracing information to you through other sources.
            </p>
          </div>
        </details>

        <details>
          <summary>3. Procedure</summary>
          <div className="consent-section-content">
            <p>After giving consent, you will be guided through the following steps:</p>
            <ol>
              <li>Complete the demographics survey.</li>
              <li>Complete Task 1 and the subsequent survey.</li>
              <li>Complete Task 2 and the subsequent survey.</li>
              <li>Participate in an interview.</li>
            </ol>
            <p>The complete procedure will last approximately 60 minutes.</p>
          </div>
        </details>

        <details>
          <summary>4. Risks and Benefits</summary>
          <div className="consent-section-content">
            <p>
              There are no anticipated risks associated with this study. Discomfort or
              inconvenience should be minor and unlikely. If you feel uncomfortable, you may
              discontinue participation. Your direct benefit is the compensation described
              above; the research will also advance knowledge in this field.
            </p>
          </div>
        </details>

        <details>
          <summary>5. Data Protection and Confidentiality</summary>
          <div className="consent-section-content">
            <p>
              Data collection is governed by the EU General Data Protection Regulation (GDPR).
              The legal basis for processing personal data is your consent pursuant to GDPR
              Art. 6(1)(a).
            </p>
            <p>You have the right to:</p>
            <ul>
              <li>access your personal data (GDPR Art. 15);</li>
              <li>correct inaccurate personal data (GDPR Art. 16);</li>
              <li>have your personal data deleted (GDPR Art. 17);</li>
              <li>restrict the processing of your personal data (GDPR Art. 18);</li>
              <li>receive a copy and transfer it to another organization (GDPR Art. 20); and</li>
              <li>object to the processing of your personal data (GDPR Art. 21).</li>
            </ul>
            <p>To exercise these rights, please contact the researchers.</p>
            <p>
              We record demographics, audio, video, screen recordings, notes, interaction logs,
              and browser metadata. Data will be handled in compliance with the GDPR. Reports
              will not identify you by your real name, and information that could identify you
              will be removed or coded before publication using current scientific standards
              and known anonymization methods. Despite these measures, complete anonymity cannot
              be guaranteed.
            </p>
            <p>
              This site may use cookies and other tracking technologies to conduct the research,
              improve the user experience and interaction with the system, and provide third-party
              content. Despite careful control of content, the researchers assume no liability for
              damage arising directly or indirectly from use of this online application.
            </p>
            <p>
              Non-anonymized data will be stored securely for a maximum of 10 years from the date
              of consent, unless you withdraw earlier, and will be accessible only to the researchers
              involved. Anonymized data may be shared publicly. Data that have not been made public
              will be deleted after the research ends.
            </p>
            <p>
              As with any online activity or publication, a breach of confidentiality remains
              possible. In accordance with the GDPR, the researchers will inform participants if
              a breach of confidential data is detected.
            </p>
          </div>
        </details>

        <details>
          <summary>6. Identification of Investigators</summary>
          <div className="consent-section-content">
            <p>If you have questions or concerns about the research, please contact:</p>
            <ol>
              {RESEARCHERS.map((researcher) => (
                <li key={researcher.name}><Contact {...researcher} /></li>
              ))}
            </ol>
            <p>
              Principal Investigator: <Contact {...PRINCIPAL_INVESTIGATOR} />
            </p>
            <p>
              For questions about the informed-consent process or your rights as a research
              participant, please contact the Principal Investigator.
            </p>
          </div>
        </details>

        <details open>
          <summary>7. Informed Consent and Agreement</summary>
          <div className="consent-section-content">
            <p>
              This consent form will be retained securely and in compliance with the GDPR for no
              longer than necessary.
            </p>
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

      <fieldset className="consent-agreements">
        <legend>Your consent</legend>
        <label className="study-consent">
          <input
            type="checkbox"
            checked={participationConsent}
            onChange={(event) => onParticipationConsentChange(event.target.checked)}
            required
          />
          <span>
            I understand the explanation provided to me. I was able to save a copy of
            this form. I had the opportunity to contact the listed researchers and have
            had all my questions answered to my satisfaction. I voluntarily agree to
            participate in this online study.
          </span>
        </label>
        <label className="study-consent">
          <input
            type="checkbox"
            checked={dataConsent}
            onChange={(event) => onDataConsentChange(event.target.checked)}
            required
          />
          <span>
            I voluntarily consent to my data being recorded and subsequently processed
            in accordance with the GDPR. I have been informed about the consequences of
            withdrawing my consent.
          </span>
        </label>
      </fieldset>
    </>
  );
}
