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
  if (!program.name.trim()) errors.name = 'Program name is required.'
  if (!program.active_from) errors.active_from = 'Start date is required.'
  if (program.days.length < 2 || program.days.length > 6) errors.days = 'Choose 2–6 training days.'
  const weekdays = program.days.map(day => Number(day.weekday))
  if (new Set(weekdays).size !== weekdays.length) errors.weekdays = 'Each training day needs a unique weekday.'
  program.days.forEach((day, dayIndex) => {
    if (!day.name.trim()) errors[`days.${dayIndex}.name`] = 'Day name is required.'
    if (day.exercises.length < 1 || day.exercises.length > 12) errors[`days.${dayIndex}.exercises`] = 'Add 1–12 exercises.'
    day.exercises.forEach((exercise, exerciseIndex) => {
      if (!exercise.name.trim()) errors[`days.${dayIndex}.exercises.${exerciseIndex}.name`] = 'Exercise name is required.'
      if (exercise.prescribed_sets < 1 || exercise.prescribed_sets > 20) errors[`days.${dayIndex}.exercises.${exerciseIndex}.sets`] = 'Sets must be 1–20.'
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
