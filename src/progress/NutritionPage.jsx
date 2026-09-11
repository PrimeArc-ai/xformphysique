import { useState } from 'react'
import './progress.css'

export default function NutritionPage({ nutrition, onSetAdherence, onGetRecipe }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [guides, setGuides] = useState({})
  const action = async (mealId, fn) => { setBusy(mealId); setMessage(''); try { await fn() } catch (e) { setMessage(e.message) } finally { setBusy('') } }
  return <section className="client-page progress-workspace"><div className="client-page-heading"><p className="kicker">CLIENT / NUTRITION</p><h2>{nutrition ? 'Your meals. Your rhythm.' : 'Nutrition plan pending.'}</h2><p>{nutrition ? `${nutrition.name} · ${nutrition.date}` : 'Your coach has not assigned a nutrition plan yet.'}</p></div>
    {nutrition && <><p className="progress-caption">Dietary restrictions: {nutrition.restrictions?.join(' · ') || 'None recorded'}</p>
      {(nutrition.meals ?? []).map(meal => <article className="panel progress-panel meal-first-card" key={meal.id}><header><div><p className="kicker">ASSIGNED MEAL</p><h2>{meal.name}</h2></div><span>{meal.time}</span></header><div className="progress-body"><h3>Food & portions</h3><ul className="meal-portions">{meal.ingredients.map((item, index) => <li key={index}><strong>{item.name}</strong><span>{item.quantity} {item.unit}</span></li>)}</ul><p><strong>Timing:</strong> {meal.time}</p><section><h3>Recipe & preparation</h3><p>{meal.preparation || guides[meal.id] || 'No preparation instructions assigned yet.'}</p><button disabled={busy === meal.id} onClick={() => action(meal.id, async () => { const result = await onGetRecipe(meal.id); setGuides(g => ({ ...g, [meal.id]: result.guide })) })}>View preparation guide</button><small>Basic guide uses assigned ingredients. Not an AI-generated recipe.</small></section><section><h3>Coach instructions</h3><p>{meal.coach_instructions || 'No additional instructions recorded.'}</p></section><div className="progress-actions" role="group" aria-label={`${meal.name} adherence`}>{[['followed', 'Followed'], ['partly', 'Partly'], ['missed', 'Missed']].map(([status, label]) => <button key={status} aria-pressed={meal.adherence_status === status} disabled={busy === meal.id} onClick={() => action(meal.id, async () => { await onSetAdherence(meal.id, status); setMessage('Meal status saved.') })}>{label}</button>)}</div><details><summary>Nutrition reference</summary><p>{meal.calories_kcal} kcal · Protein {meal.macros?.protein_g} g · Carbohydrate {meal.macros?.carbs_g} g · Fat {meal.macros?.fat_g} g</p></details></div></article>)}
      <details className="panel progress-panel"><summary>Daily nutrition reference — coach-assigned targets</summary><p>{nutrition.daily_targets?.calories_kcal} kcal · Protein {nutrition.daily_targets?.protein_g} g · Carbohydrate {nutrition.daily_targets?.carbs_g} g · Fat {nutrition.daily_targets?.fat_g} g</p></details></>}
    <p role="status">{message}</p>
  </section>
}
