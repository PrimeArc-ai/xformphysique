function emptyExercise(position = 1) {
  return {
    position,
    exercise_library_item_id: null,
    name: '',
    prescribed_sets: 3,
    prescribed_reps: '8-10',
    rest_seconds: 90,
    coach_note: '',
  }
}

function normalizeProgram(program) {
  return {
    ...program,
    days: program.days.map((day, dayIndex) => ({
      ...day,
      position: dayIndex + 1,
      exercises: day.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        position: exerciseIndex + 1,
      })),
    })),
  }
}

export function emptyProgram(startDate) {
  return {
    name: '',
    active_from: startDate,
    notes: '',
    days: [1, 3].map((weekday, index) => ({
      position: index + 1,
      weekday,
      name: `Day ${index + 1}`,
      coach_note: '',
      exercises: [emptyExercise()],
    })),
  }
}

export function validateProgram(program) {
  const errors = {}
  const programName = String(program.name ?? '').trim()
  if (!programName) errors.name = 'Program name is required.'
  else if (programName.length > 160) errors.name = 'Program name must be 1–160 characters.'
  if (!program.active_from) errors.active_from = 'Start date is required.'
  if (String(program.notes ?? '').length > 2000) errors.notes = 'Program notes must be 2000 characters or fewer.'
  if (program.days.length < 2 || program.days.length > 6) errors.days = 'Choose 2–6 training days.'
  const weekdays = program.days.map(day => Number(day.weekday))
  if (new Set(weekdays).size !== weekdays.length) errors.weekdays = 'Each training day needs a unique weekday.'
  program.days.forEach((day, dayIndex) => {
    const weekday = Number(day.weekday)
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) errors[`days.${dayIndex}.weekday`] = 'Weekday must be 1–7.'
    const dayName = String(day.name ?? '').trim()
    if (!dayName) errors[`days.${dayIndex}.name`] = 'Day name is required.'
    else if (dayName.length > 160) errors[`days.${dayIndex}.name`] = 'Day name must be 1–160 characters.'
    if (String(day.coach_note ?? '').length > 2000) errors[`days.${dayIndex}.coach_note`] = 'Day notes must be 2000 characters or fewer.'
    if (day.exercises.length < 1 || day.exercises.length > 12) errors[`days.${dayIndex}.exercises`] = 'Add 1–12 exercises.'
    day.exercises.forEach((exercise, exerciseIndex) => {
      const prefix = `days.${dayIndex}.exercises.${exerciseIndex}`
      const exerciseName = String(exercise.name ?? '').trim()
      if (!exerciseName) errors[`${prefix}.name`] = 'Exercise name is required.'
      else if (exerciseName.length > 160) errors[`${prefix}.name`] = 'Exercise name must be 1–160 characters.'
      const sets = Number(exercise.prescribed_sets)
      if (!Number.isInteger(sets) || sets < 1 || sets > 20) errors[`${prefix}.sets`] = 'Sets must be a whole number from 1–20.'
      const repsValue = String(exercise.prescribed_reps ?? '')
      const reps = repsValue.trim()
      if (reps.length < 1 || reps.length > 40) errors[`${prefix}.reps`] = 'Reps must be 1–40 characters.'
      else if (repsValue !== reps) errors[`${prefix}.reps`] = 'Reps must be 1–40 characters without outer spaces.'
      const rest = exercise.rest_seconds
      if (rest !== null && (!Number.isInteger(Number(rest)) || Number(rest) < 0 || Number(rest) > 1800)) {
        errors[`${prefix}.rest_seconds`] = 'Rest must be empty or a whole number from 0–1800.'
      }
      if (String(exercise.coach_note ?? '').length > 1000) errors[`${prefix}.coach_note`] = 'Exercise notes must be 1000 characters or fewer.'
    })
  })
  return errors
}

export function moveExercise(program, dayIndex, fromIndex, toIndex) {
  const day = program.days[dayIndex]
  if (!day || fromIndex < 0 || fromIndex >= day.exercises.length || toIndex < 0 || toIndex >= day.exercises.length) {
    return program
  }
  const exercises = [...day.exercises]
  const [exercise] = exercises.splice(fromIndex, 1)
  exercises.splice(toIndex, 0, exercise)
  return normalizeProgram({
    ...program,
    days: program.days.map((item, index) => index === dayIndex ? { ...item, exercises } : item),
  })
}

export function addProgramDay(program) {
  if (program.days.length >= 6) return program
  const usedWeekdays = new Set(program.days.map(day => Number(day.weekday)))
  const weekday = [1, 2, 3, 4, 5, 6, 7].find(value => !usedWeekdays.has(value)) ?? 1
  const position = program.days.length + 1
  return normalizeProgram({
    ...program,
    days: [...program.days, {
      position,
      weekday,
      name: `Day ${position}`,
      coach_note: '',
      exercises: [emptyExercise()],
    }],
  })
}

export function addDayExercise(program, dayIndex) {
  const day = program.days[dayIndex]
  if (!day || day.exercises.length >= 12) return program
  return normalizeProgram({
    ...program,
    days: program.days.map((item, index) => index === dayIndex
      ? { ...item, exercises: [...item.exercises, emptyExercise(item.exercises.length + 1)] }
      : item),
  })
}

export function removeProgramDay(program, dayIndex) {
  if (program.days.length <= 2) return program
  return normalizeProgram({ ...program, days: program.days.filter((_, index) => index !== dayIndex) })
}

export function removeDayExercise(program, dayIndex, exerciseIndex) {
  const day = program.days[dayIndex]
  if (!day || day.exercises.length <= 1) return program
  return normalizeProgram({
    ...program,
    days: program.days.map((item, index) => index === dayIndex
      ? { ...item, exercises: item.exercises.filter((_, currentIndex) => currentIndex !== exerciseIndex) }
      : item),
  })
}
