function emptyIngredient(position = 1) {
  return {
    position,
    food_library_item_id: null,
    ingredient_name: '',
    quantity: 100,
    unit: 'g',
  }
}

function emptyMeal(position) {
  const defaultTimes = ['08:00', '13:00', '16:00', '19:00', '21:00']
  return {
    position,
    meal_time: defaultTimes[position - 1] || '12:00',
    name: `Meal ${position}`,
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    coach_instructions: '',
    preparation: '',
    ingredients: [emptyIngredient()],
  }
}

function normalizePlan(plan) {
  return {
    ...plan,
    meals: plan.meals.map((meal, mealIndex) => ({
      ...meal,
      position: mealIndex + 1,
      ingredients: meal.ingredients.map((ingredient, ingredientIndex) => ({
        ...ingredient,
        position: ingredientIndex + 1,
      })),
    })),
  }
}

export function emptyPlan(startDate) {
  return {
    name: '',
    active_from: startDate,
    calories_kcal: 1800,
    protein_g: 120,
    carbs_g: 200,
    fat_g: 60,
    restrictions: [],
    meals: [emptyMeal(1), emptyMeal(2)],
  }
}

function validateNonNegativeInteger(value, message) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? '' : message
}

export function validatePlan(plan) {
  const errors = {}
  const name = String(plan.name ?? '').trim()
  if (!name) errors.name = 'Plan name is required.'
  else if (name.length > 180) errors.name = 'Plan name must be 1–180 characters.'
  if (!plan.active_from) errors.active_from = 'Start date is required.'

  const calories = Number(plan.calories_kcal)
  if (!Number.isInteger(calories) || calories <= 0) errors.calories_kcal = 'Daily calories must be a whole number greater than 0.'
  ;['protein_g', 'carbs_g', 'fat_g'].forEach(field => {
    const message = validateNonNegativeInteger(plan[field], 'Daily macros must be whole numbers of 0 or more.')
    if (message) errors[field] = message
  })

  if (!Array.isArray(plan.meals) || plan.meals.length < 1 || plan.meals.length > 8) {
    errors.meals = 'Choose 1–8 meals.'
  }
  ;(plan.meals || []).forEach((meal, mealIndex) => {
    const prefix = `meals.${mealIndex}`
    const mealName = String(meal.name ?? '').trim()
    if (!mealName) errors[`${prefix}.name`] = 'Meal name is required.'
    else if (mealName.length > 180) errors[`${prefix}.name`] = 'Meal name must be 1–180 characters.'
    if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(String(meal.meal_time ?? ''))) {
      errors[`${prefix}.meal_time`] = 'Meal time is required.'
    }
    ;['calories_kcal', 'protein_g', 'carbs_g', 'fat_g'].forEach(field => {
      const message = validateNonNegativeInteger(meal[field], 'Meal macros must be whole numbers of 0 or more.')
      if (message) errors[`${prefix}.${field}`] = message
    })
    if (!Array.isArray(meal.ingredients) || meal.ingredients.length < 1 || meal.ingredients.length > 12) {
      errors[`${prefix}.ingredients`] = 'Add 1–12 ingredients.'
    }
    ;(meal.ingredients || []).forEach((ingredient, ingredientIndex) => {
      const ingredientPrefix = `${prefix}.ingredients.${ingredientIndex}`
      const ingredientName = String(ingredient.ingredient_name ?? '').trim()
      if (!ingredientName) errors[`${ingredientPrefix}.name`] = 'Ingredient name is required.'
      else if (ingredientName.length > 180) errors[`${ingredientPrefix}.name`] = 'Ingredient name must be 1–180 characters.'
      const quantity = Number(ingredient.quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) errors[`${ingredientPrefix}.quantity`] = 'Quantity must be greater than 0.'
      const unit = String(ingredient.unit ?? '').trim()
      if (!unit) errors[`${ingredientPrefix}.unit`] = 'Unit is required.'
      else if (unit.length > 30) errors[`${ingredientPrefix}.unit`] = 'Unit must be 30 characters or fewer.'
    })
  })
  return errors
}

export function addPlanMeal(plan) {
  if (plan.meals.length >= 8) return plan
  return normalizePlan({ ...plan, meals: [...plan.meals, emptyMeal(plan.meals.length + 1)] })
}

export function removePlanMeal(plan, mealIndex) {
  if (plan.meals.length <= 1) return plan
  return normalizePlan({ ...plan, meals: plan.meals.filter((_, index) => index !== mealIndex) })
}

export function addMealIngredient(plan, mealIndex) {
  const meal = plan.meals[mealIndex]
  if (!meal || meal.ingredients.length >= 12) return plan
  return normalizePlan({
    ...plan,
    meals: plan.meals.map((item, index) => index === mealIndex
      ? { ...item, ingredients: [...item.ingredients, emptyIngredient(item.ingredients.length + 1)] }
      : item),
  })
}

export function removeMealIngredient(plan, mealIndex, ingredientIndex) {
  const meal = plan.meals[mealIndex]
  if (!meal || meal.ingredients.length <= 1) return plan
  return normalizePlan({
    ...plan,
    meals: plan.meals.map((item, index) => index === mealIndex
      ? { ...item, ingredients: item.ingredients.filter((_, currentIndex) => currentIndex !== ingredientIndex) }
      : item),
  })
}

export function moveIngredient(plan, mealIndex, fromIndex, toIndex) {
  const meal = plan.meals[mealIndex]
  if (!meal || fromIndex < 0 || fromIndex >= meal.ingredients.length || toIndex < 0 || toIndex >= meal.ingredients.length) {
    return plan
  }
  const ingredients = [...meal.ingredients]
  const [ingredient] = ingredients.splice(fromIndex, 1)
  ingredients.splice(toIndex, 0, ingredient)
  return normalizePlan({
    ...plan,
    meals: plan.meals.map((item, index) => index === mealIndex ? { ...item, ingredients } : item),
  })
}
