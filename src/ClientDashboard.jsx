const displayDate = value => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`)) : '—'

function Arrow() {
  return <span aria-hidden="true">→</span>
}

export default function ClientDashboard({ dashboard, bodyEntries, workout, navigate }) {
  const body = dashboard.body
  const trend = (body.trend ?? []).filter(entry => Number.isFinite(entry.weight_kg)).slice(-7)
  const current = body.current_weight_kg ?? bodyEntries[0]?.weight ?? null
  const progress = body.target_progress_percent == null ? null : Math.max(0, Math.min(100, body.target_progress_percent))
  const change = body.change_from_start_kg
  const volume = dashboard.training_volume
  const daily = volume.daily_kg ?? []
  const maxVolume = Math.max(1, ...daily.map(day => day.volume_kg))
  const weights = trend.map(entry => entry.weight_kg)
  const low = Math.min(...weights), high = Math.max(...weights)
  const points = trend.map((entry, index) => `${24 + index * 592 / Math.max(1, trend.length - 1)},${high === low ? 94 : 155 - (entry.weight_kg - low) / (high - low) * 120}`)
  const exercises = workout?.exercises ?? []

  return <section className="precision-dashboard" aria-labelledby="dashboard-title">
    <header className="precision-greeting">
      <div><p className="kicker">YOUR PERSONAL COACHING WORKSPACE</p><h2 id="dashboard-title">Progress, <span>in motion.</span></h2><p>Your body signal, training and next steps. One clear view.</p></div>
      <button className="lime-button" onClick={() => navigate('Body Tracker')}><span aria-hidden="true">+</span> Log body entry</button>
    </header>
    <div className="precision-dashboard-grid">
      <div className="precision-main-column">
        <article className="panel precision-body-panel">
          <header><h3>Body progress</h3><button className="quiet-link" onClick={() => navigate('Body Tracker')}>View history <Arrow /></button></header>
          <div className="precision-body-summary">
            <div><p className="precision-weight">{current == null ? '—' : current.toFixed(1)}<small>{current != null && 'kg'}</small></p><p className="precision-change">{change == null ? 'Your first entry starts your signal.' : <><strong>{change > 0 ? '+' : change < 0 ? '−' : ''}{Math.abs(change).toFixed(1)} kg</strong> since your first entry</>}</p></div>
            <div className="precision-target"><div><span>YOUR WEIGHT TARGET</span><strong>{progress ?? '—'}{progress != null && <small>%</small>}</strong></div>
              <div className="precision-segments" role="progressbar" aria-label="Weight target progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined} aria-valuetext={progress == null ? 'No target progress available' : `${progress}%`}>
                {Array.from({ length: 10 }, (_, index) => <i key={index} style={{ '--segment-fill': `${Math.max(0, Math.min(100, ((progress ?? 0) - index * 10) * 10))}%` }} />)}
              </div><small>{progress == null ? 'Add entries and a target in your profile.' : 'Progress toward your personal target'}</small>
            </div>
          </div>
          {trend.length ? <div className="precision-chart-wrap">
            <div className="precision-chart-label"><span>Weight · kg</span><span>{trend.length} logged {trend.length === 1 ? 'entry' : 'entries'}</span></div>
            <svg className="precision-weight-chart" viewBox="0 0 640 190" preserveAspectRatio="none" role="img" aria-label={`Weight trend: ${weights.join(', ')} kilograms`}>
              <path className="grid-line" d="M20 35H620M20 95H620M20 155H620" />
              {trend.length > 1 && <polyline points={points.join(' ')} />}
              {points.map((point, index) => { const [cx, cy] = point.split(','); return <circle key={index} cx={cx} cy={cy} r="3.5" /> })}
            </svg>
            <div className="precision-chart-label"><span>{displayDate(trend[0].date)}</span><span>{displayDate(trend.at(-1).date)}</span></div>
          </div> : <div className="precision-chart-empty"><strong>No body entries yet.</strong><p>Log your first entry to see your progress.</p></div>}
          <footer className="precision-panel-footer"><span>{bodyEntries.length} recorded body entries</span><span>Daily fluctuations are normal.</span></footer>
        </article>
        <div className="precision-metric-pair">
          <article className="panel"><p className="kicker">LATEST WAIST</p><strong>{body.latest_waist_cm?.toFixed(1) ?? '—'}<small>{body.latest_waist_cm != null && 'cm'}</small></strong><p>Most recent measurement</p></article>
          <article className="panel"><p className="kicker">CHECK-IN HISTORY</p><strong>{dashboard.check_ins.count}<small>submitted</small></strong><p>Your shared progress updates</p></article>
        </div>
        <article className="panel precision-volume">
          <div><p className="kicker">LAST 30 DAYS</p><h3>Training volume</h3><strong>{volume.total_kg.toLocaleString()}<small>kg</small></strong></div>
          <div className="precision-volume-detail">
            <div className="precision-volume-bars" role="img" aria-label={daily.length ? `Daily training volume: ${daily.map(day => `${day.date}, ${day.volume_kg} kg`).join('; ')}` : 'No recorded training volume'}>
              {daily.length ? daily.map(day => <i key={day.date} style={{ height: `${day.volume_kg / maxVolume * 100}%` }} title={`${day.date}: ${day.volume_kg} kg`} />) : <span>No training logged yet</span>}
            </div><p>{volume.sessions} sessions · {volume.training_days} training days · {volume.best_day_kg.toLocaleString()} kg best day</p>
          </div>
        </article>
      </div>
      <aside className="precision-side-column" aria-label="Your training and next steps">
        <article className="panel precision-training">
          <div className="precision-training-hero"><p className="kicker">YOUR TRAINING</p><h3>Show up.<br />Build strength.</h3></div>
          <div className="precision-training-body"><p className="kicker">{workout ? 'COACH-ASSIGNED SESSION' : 'YOUR NEXT CHAPTER'}</p><h3>{workout?.title ?? 'Your plan starts here.'}</h3>
            <p>{workout ? `${exercises.length} exercises · ${workout.estimated_duration_minutes} minutes` : 'Your coach’s assigned session will appear here when it’s ready.'}</p>
            {exercises.length > 0 && <ol>{exercises.slice(0, 4).map((exercise, index) => <li key={exercise.id ?? exercise.plan_exercise_id ?? index}><span>{exercise.name}</span><small>{String(index + 1).padStart(2, '0')}</small></li>)}</ol>}
            <button className="lime-button" onClick={() => navigate('Workout')}>{workout ? 'View workout' : 'Open workout'} <Arrow /></button>
          </div>
        </article>
        {[['Nutrition', 'Your nutrition plan', 'Open meals, portions and targets.'], ['Progress Photos', 'Progress photos', 'View your personal progress gallery.'], ['Health Summary', 'Your health context', 'Read your coach-approved guidance.']].map(([page, title, description]) => <button className="panel precision-shortcut" key={page} onClick={() => navigate(page)}><span><strong>{title}</strong><small>{description}</small></span><Arrow /></button>)}
      </aside>
    </div>
    <footer className="precision-workspace-footer">Your records and photos stay private to you and your assigned coach.</footer>
  </section>
}
