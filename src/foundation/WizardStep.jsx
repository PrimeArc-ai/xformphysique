export default function WizardStep({ title, stepLabel, children, footer, actions, summary }) {
  return (
    <section className="foundation-step-card">
      <header className="foundation-step-header">
        <div>
          <p className="foundation-step-kicker">{stepLabel}</p>
          <h2>{title}</h2>
          {summary ? <p>{summary}</p> : null}
        </div>
      </header>
      <div className="foundation-step-body">{children}</div>
      <footer className="foundation-step-footer">
        <p>{footer}</p>
        <div className="foundation-step-actions">{actions}</div>
      </footer>
    </section>
  )
}
