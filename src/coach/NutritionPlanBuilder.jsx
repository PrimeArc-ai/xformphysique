import { useCallback, useEffect, useRef, useState } from 'react'
import { coachApi } from '../api/coach'
import {
  addMealIngredient,
  addPlanMeal,
  emptyPlan,
  moveIngredient,
  removeMealIngredient,
  removePlanMeal,
  validatePlan,
} from './nutritionPlanModel'

function localDate() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function snapshotPlan(source) {
  return {
    name: source.name || '',
    active_from: source.active_from || localDate(),
    calories_kcal: Number(source.calories_kcal),
    protein_g: Number(source.protein_g),
    carbs_g: Number(source.carbs_g),
    fat_g: Number(source.fat_g),
    restrictions: [...(source.restrictions || [])],
    meals: [...(source.meals || [])].sort((left, right) => left.position - right.position).map((meal, mealIndex) => ({
      position: mealIndex + 1,
      meal_time: String(meal.meal_time || '').slice(0, 5),
      name: meal.name || '',
      calories_kcal: Number(meal.calories_kcal),
      protein_g: Number(meal.protein_g),
      carbs_g: Number(meal.carbs_g),
      fat_g: Number(meal.fat_g),
      coach_instructions: meal.coach_instructions || '',
      preparation: meal.preparation || '',
      ingredients: [...(meal.ingredients || [])].sort((left, right) => left.position - right.position).map((ingredient, ingredientIndex) => ({
        position: ingredientIndex + 1,
        food_library_item_id: ingredient.food_library_item_id || null,
        ingredient_name: ingredient.ingredient_name || '',
        quantity: Number(ingredient.quantity),
        unit: ingredient.unit || '',
      })),
    })),
  }
}

function FieldError({ children }) {
  return children ? <small className="program-field-error">{children}</small> : null
}

export default function NutritionPlanBuilder({ client, accessToken }) {
  const [plan, setPlan] = useState(() => emptyPlan(localDate()))
  const [workspace, setWorkspace] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadedClientId, setLoadedClientId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const publishKey = useRef(null)
  const loadRequest = useRef(0)
  const clientIdentity = useRef(client.id)
  const clientGeneration = useRef(0)
  if (clientIdentity.current !== client.id) {
    clientIdentity.current = client.id
    clientGeneration.current += 1
  }

  const operationIsCurrent = useCallback((clientId, generation) => (
    clientIdentity.current === clientId && clientGeneration.current === generation
  ), [])

  const loadWorkspace = useCallback(async () => {
    const requestId = ++loadRequest.current
    const requestedClientId = client.id
    const generation = clientGeneration.current
    setLoading(true)
    setLoadError('')
    setNotice('')
    setErrors({})
    try {
      const result = await coachApi.getNutritionPlan(requestedClientId, accessToken)
      if (requestId !== loadRequest.current || !operationIsCurrent(requestedClientId, generation)) return
      setWorkspace(result)
      setPlan(result.draft
        ? snapshotPlan(result.draft)
        : result.active_plan
          ? snapshotPlan(result.active_plan)
          : emptyPlan(localDate()))
      setLoadedClientId(requestedClientId)
    } catch (error) {
      if (requestId !== loadRequest.current || !operationIsCurrent(requestedClientId, generation)) return
      setWorkspace(null)
      setLoadedClientId(requestedClientId)
      setLoadError(error.message || 'Could not load this nutrition plan workspace.')
    } finally {
      if (requestId === loadRequest.current && operationIsCurrent(requestedClientId, generation)) setLoading(false)
    }
  }, [accessToken, client.id, operationIsCurrent])

  useEffect(() => {
    setBusy('')
    setConfirming(false)
    publishKey.current = null
    loadWorkspace()
    return () => { loadRequest.current += 1 }
  }, [loadWorkspace])

  const editPlan = updater => {
    publishKey.current = null
    setPlan(current => typeof updater === 'function' ? updater(current) : updater)
    setErrors({})
    setNotice('')
  }

  const updatePlanField = (field, value) => {
    editPlan(current => ({ ...current, [field]: value }))
  }

  const updateMeal = (mealIndex, field, value) => {
    editPlan(current => ({
      ...current,
      meals: current.meals.map((meal, index) => index === mealIndex ? { ...meal, [field]: value } : meal),
    }))
  }

  const updateIngredient = (mealIndex, ingredientIndex, field, value) => {
    editPlan(current => ({
      ...current,
      meals: current.meals.map((meal, index) => index === mealIndex ? {
        ...meal,
        ingredients: meal.ingredients.map((ingredient, currentIndex) => currentIndex === ingredientIndex
          ? { ...ingredient, [field]: value }
          : ingredient),
      } : meal),
    }))
  }

  const selectLibraryFood = (mealIndex, ingredientIndex, libraryId) => {
    const selected = workspace.food_library.find(item => item.id === libraryId)
    editPlan(current => ({
      ...current,
      meals: current.meals.map((meal, index) => index === mealIndex ? {
        ...meal,
        ingredients: meal.ingredients.map((ingredient, currentIndex) => currentIndex === ingredientIndex
          ? {
            ...ingredient,
            food_library_item_id: selected?.id || null,
            ingredient_name: selected?.name || ingredient.ingredient_name,
          }
          : ingredient),
      } : meal),
    }))
  }

  const validPlan = () => {
    const nextErrors = validatePlan(plan)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setNotice('')
      return false
    }
    return true
  }

  const saveDraft = async () => {
    if (!validPlan()) return
    const requestedClientId = client.id
    const generation = clientGeneration.current
    publishKey.current = null
    setBusy('draft')
    setNotice('')
    try {
      const result = await coachApi.saveNutritionPlanDraft(requestedClientId, plan, accessToken)
      if (!operationIsCurrent(requestedClientId, generation)) return
      setWorkspace(current => ({ ...current, draft: result.plan }))
      setPlan(snapshotPlan(result.plan))
      setNotice('Draft saved.')
    } catch (error) {
      if (operationIsCurrent(requestedClientId, generation)) setNotice(error.message || 'Draft could not be saved. Your entries are still here.')
    } finally {
      if (operationIsCurrent(requestedClientId, generation)) setBusy('')
    }
  }

  const requestPublish = () => {
    if (!validPlan()) return
    setConfirming(true)
  }

  const publish = async () => {
    const nextErrors = validatePlan(plan)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setConfirming(false)
      return
    }
    publishKey.current ||= crypto.randomUUID()
    const requestedClientId = client.id
    const generation = clientGeneration.current
    const requestedPublishKey = publishKey.current
    setBusy('publish')
    setNotice('')
    try {
      const result = await coachApi.publishNutritionPlan(requestedClientId, requestedPublishKey, plan, accessToken)
      if (!operationIsCurrent(requestedClientId, generation)) return
      setWorkspace(current => ({ ...current, active_plan: result.plan, draft: null }))
      setPlan(snapshotPlan(result.plan))
      setNotice('Plan published')
      setConfirming(false)
      publishKey.current = null
    } catch (error) {
      if (operationIsCurrent(requestedClientId, generation)) setNotice(error.message || 'Publish failed. Your entries are still here; retry safely.')
    } finally {
      if (operationIsCurrent(requestedClientId, generation)) setBusy('')
    }
  }

  if (loadedClientId !== client.id || loading) {
    return <section className="coach-empty program-builder-loading"><strong>Loading nutrition plan…</strong><span>Checking the saved draft and active version.</span></section>
  }

  if (loadError) {
    return <section className="coach-empty program-builder-loading"><strong>Nutrition plan unavailable</strong><span>{loadError}</span><button className="coach-secondary" type="button" onClick={loadWorkspace}>Retry loading nutrition plan</button></section>
  }

  const activePlan = workspace?.active_plan

  return <div className="nutrition-plan-workspace">
    <article className="panel workout-program-active">
      <header>
        <div><p className="kicker">PUBLISHED PLAN</p><span>The current immutable client version.</span></div>
        {activePlan && <span className="coach-status good">ACTIVE</span>}
      </header>
      {activePlan
        ? <div className="workout-program-active-summary"><div><strong>{activePlan.name}</strong><span>Starts {activePlan.active_from} · {activePlan.meals.length} meals</span></div><b>Version {activePlan.version}</b></div>
        : <div className="workout-program-empty"><strong>No published nutrition plan</strong><span>Save a draft or publish the controlled daily plan below.</span></div>}
    </article>

    <section className="workout-program-editor" aria-label={`Nutrition plan editor for ${client.name}`}>
      <header className="workout-program-editor-heading">
        <div><p className="kicker">NUTRITION BUILDER</p><h3>{workspace?.draft ? 'Continue saved draft' : 'Daily meal plan'}</h3><p>Configure 1–8 ordered meals with controlled ingredient portions.</p></div>
        <span className="coach-status good">{workspace?.draft ? 'DRAFT RESTORED' : 'CONTROLLED'}</span>
      </header>

      <div className="workout-program-fields nutrition-plan-fields">
        <label>Plan name
          <input value={plan.name} maxLength="180" onChange={event => updatePlanField('name', event.target.value)} />
          <FieldError>{errors.name}</FieldError>
        </label>
        <label>Start date
          <input type="date" value={plan.active_from} onChange={event => updatePlanField('active_from', event.target.value)} />
          <FieldError>{errors.active_from}</FieldError>
        </label>
        <label>Daily calories
          <input type="number" min="1" value={plan.calories_kcal} onChange={event => updatePlanField('calories_kcal', Number(event.target.value))} />
          <FieldError>{errors.calories_kcal}</FieldError>
        </label>
        <label>Daily protein
          <input type="number" min="0" value={plan.protein_g} onChange={event => updatePlanField('protein_g', Number(event.target.value))} />
          <FieldError>{errors.protein_g}</FieldError>
        </label>
        <label>Daily carbs
          <input type="number" min="0" value={plan.carbs_g} onChange={event => updatePlanField('carbs_g', Number(event.target.value))} />
          <FieldError>{errors.carbs_g}</FieldError>
        </label>
        <label>Daily fat
          <input type="number" min="0" value={plan.fat_g} onChange={event => updatePlanField('fat_g', Number(event.target.value))} />
          <FieldError>{errors.fat_g}</FieldError>
        </label>
        <label className="program-wide-field">Restrictions
          <input value={plan.restrictions.join(', ')} placeholder="Comma-separated tags" onChange={event => updatePlanField('restrictions', [...new Set(event.target.value.split(',').map(item => item.trim()).filter(Boolean))])} />
        </label>
      </div>

      {Object.keys(errors).length > 0 && <p className="program-validation-summary" role="alert">Please fix the highlighted fields.</p>}

      <div className="workout-days-toolbar">
        <div><h3>Meals</h3><span>{plan.meals.length} of 8 meals</span></div>
        <button className="coach-secondary" type="button" disabled={plan.meals.length >= 8 || Boolean(busy)} onClick={() => editPlan(addPlanMeal)}>Add meal</button>
      </div>
      <FieldError>{errors.meals}</FieldError>

      <div className="nutrition-plan-meals">
        {plan.meals.map((meal, mealIndex) => <article className="panel nutrition-plan-meal" key={meal.position}>
          <header>
            <div><p className="kicker">MEAL {String(mealIndex + 1).padStart(2, '0')}</p><h3>{meal.name || `Meal ${mealIndex + 1}`}</h3></div>
            <button className="program-danger-button" type="button" disabled={plan.meals.length <= 1 || Boolean(busy)} onClick={() => editPlan(current => removePlanMeal(current, mealIndex))}>Remove Meal {mealIndex + 1}</button>
          </header>
          <div className="workout-day-fields nutrition-meal-fields">
            <label>Meal {mealIndex + 1} name
              <input maxLength="180" value={meal.name} onChange={event => updateMeal(mealIndex, 'name', event.target.value)} />
              <FieldError>{errors[`meals.${mealIndex}.name`]}</FieldError>
            </label>
            <label>Meal {mealIndex + 1} time
              <input type="time" value={meal.meal_time} onChange={event => updateMeal(mealIndex, 'meal_time', event.target.value)} />
              <FieldError>{errors[`meals.${mealIndex}.meal_time`]}</FieldError>
            </label>
            {[
              ['calories_kcal', 'calories'],
              ['protein_g', 'protein'],
              ['carbs_g', 'carbs'],
              ['fat_g', 'fat'],
            ].map(([field, label]) => <label key={field}>Meal {mealIndex + 1} {label}
              <input type="number" min="0" value={meal[field]} onChange={event => updateMeal(mealIndex, field, Number(event.target.value))} />
              <FieldError>{errors[`meals.${mealIndex}.${field}`]}</FieldError>
            </label>)}
            <label className="program-wide-field">Meal {mealIndex + 1} preparation
              <textarea rows="2" value={meal.preparation} onChange={event => updateMeal(mealIndex, 'preparation', event.target.value)} />
            </label>
            <label className="program-wide-field">Meal {mealIndex + 1} coach instructions
              <textarea rows="2" value={meal.coach_instructions} onChange={event => updateMeal(mealIndex, 'coach_instructions', event.target.value)} />
            </label>
          </div>

          <div className="nutrition-ingredient-list">
            {meal.ingredients.map((ingredient, ingredientIndex) => <section className="workout-program-exercise" aria-label={`Meal ${mealIndex + 1} ingredient ${ingredientIndex + 1}`} key={ingredient.position}>
              <header><strong>Ingredient {ingredientIndex + 1}</strong><div className="exercise-order-actions">
                <button type="button" disabled={ingredientIndex === 0 || Boolean(busy)} onClick={() => editPlan(current => moveIngredient(current, mealIndex, ingredientIndex, ingredientIndex - 1))}>Move Meal {mealIndex + 1} ingredient {ingredientIndex + 1} up</button>
                <button type="button" disabled={ingredientIndex === meal.ingredients.length - 1 || Boolean(busy)} onClick={() => editPlan(current => moveIngredient(current, mealIndex, ingredientIndex, ingredientIndex + 1))}>Move Meal {mealIndex + 1} ingredient {ingredientIndex + 1} down</button>
                <button className="program-danger-button" type="button" disabled={meal.ingredients.length <= 1 || Boolean(busy)} onClick={() => editPlan(current => removeMealIngredient(current, mealIndex, ingredientIndex))}>Remove Meal {mealIndex + 1} ingredient {ingredientIndex + 1}</button>
              </div></header>
              <div className="workout-exercise-fields nutrition-ingredient-fields">
                <label>Meal {mealIndex + 1} ingredient {ingredientIndex + 1} library item
                  <select value={ingredient.food_library_item_id || ''} onChange={event => selectLibraryFood(mealIndex, ingredientIndex, event.target.value)}>
                    <option value="">Custom ingredient</option>
                    {workspace.food_library.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label>Meal {mealIndex + 1} ingredient {ingredientIndex + 1} name
                  <input maxLength="180" value={ingredient.ingredient_name} onChange={event => updateIngredient(mealIndex, ingredientIndex, 'ingredient_name', event.target.value)} />
                  <FieldError>{errors[`meals.${mealIndex}.ingredients.${ingredientIndex}.name`]}</FieldError>
                </label>
                <label>Meal {mealIndex + 1} ingredient {ingredientIndex + 1} quantity
                  <input type="number" min="0.01" step="any" value={ingredient.quantity} onChange={event => updateIngredient(mealIndex, ingredientIndex, 'quantity', Number(event.target.value))} />
                  <FieldError>{errors[`meals.${mealIndex}.ingredients.${ingredientIndex}.quantity`]}</FieldError>
                </label>
                <label>Meal {mealIndex + 1} ingredient {ingredientIndex + 1} unit
                  <input maxLength="30" value={ingredient.unit} onChange={event => updateIngredient(mealIndex, ingredientIndex, 'unit', event.target.value)} />
                  <FieldError>{errors[`meals.${mealIndex}.ingredients.${ingredientIndex}.unit`]}</FieldError>
                </label>
              </div>
            </section>)}
          </div>
          <div className="workout-exercise-actions">
            <FieldError>{errors[`meals.${mealIndex}.ingredients`]}</FieldError>
            <button className="coach-secondary" type="button" disabled={meal.ingredients.length >= 12 || Boolean(busy)} onClick={() => editPlan(current => addMealIngredient(current, mealIndex))}>Add ingredient to Meal {mealIndex + 1}</button>
          </div>
        </article>)}
      </div>

      <footer className="workout-program-actions">
        <p className={notice === 'Plan published' ? 'program-success' : ''} role="status">{notice || 'Drafts are not visible to the client.'}</p>
        <div><button className="coach-secondary" type="button" disabled={Boolean(busy)} onClick={saveDraft}>{busy === 'draft' ? 'Saving draft…' : 'Save draft'}</button><button className="coach-primary" type="button" disabled={Boolean(busy)} onClick={requestPublish}>Publish nutrition plan</button></div>
      </footer>
    </section>

    {confirming && <div className="modal-backdrop"><section className="signal-modal coach-modal workout-publish-confirmation" role="dialog" aria-modal="true" aria-labelledby="nutrition-publish-title">
      <p className="kicker">PUBLISH NUTRITION PLAN</p>
      <h2 id="nutrition-publish-title">Confirm nutrition plan</h2>
      <p>This publishes <strong>{plan.meals.length} meals</strong> from {plan.active_from}. The published version is immutable.</p>
      <div className="publish-confirmation-summary"><span>CLIENT<strong>{client.name}</strong></span><span>PLAN<strong>{plan.name}</strong></span><span>MEALS<strong>{plan.meals.length} meals</strong></span></div>
      <footer className="coach-modal-footer"><button className="coach-secondary" type="button" disabled={Boolean(busy)} onClick={() => setConfirming(false)}>Cancel</button><button className="coach-primary" type="button" disabled={Boolean(busy)} onClick={publish}>{busy === 'publish' ? 'Publishing…' : 'Confirm publish'}</button></footer>
    </section></div>}
  </div>
}
