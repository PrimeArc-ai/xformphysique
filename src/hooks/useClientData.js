import { useCallback, useEffect, useState } from 'react'
import { clientApi, resourceUrl, setAccessToken } from '../api/client'

const today = new Date().toISOString().slice(0, 10)

const initialData = {
  dashboard: null,
  bodyEntries: [],
  checkIns: [],
  photos: [],
  nutrition: null,
  workout: null,
  health: null,
  profile: null,
}

const toBodyEntry = (entry) => ({
  id: entry.id,
  date: entry.date,
  weight: entry.weight_kg,
  waist: entry.waist_cm,
})

const toCheckIn = (entry) => ({
  ...entry,
  date: entry.period_start,
  energy: entry.energy_score,
  sleep: entry.sleep_score,
})

const toPhoto = (photo) => ({
  ...photo,
  date: photo.captured_on,
  url: resourceUrl(photo.content_url),
})

export default function useClientData({ enabled, accessToken }) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!enabled || !accessToken) {
      setData(initialData)
      setLoading(false)
      setError('')
      return
    }
    setLoading(true)
    setError('')
    try {
      const [dashboard, body, checkIns, photos, nutrition, workout, health, profile] = await Promise.all([
        clientApi.getDashboard(),
        clientApi.getBodyEntries(),
        clientApi.getCheckIns(),
        clientApi.getPhotos(),
        clientApi.getNutritionPlan(today),
        clientApi.getWorkout(today),
        clientApi.getHealthSummary(),
        clientApi.getProfile(),
      ])
      setData({
        dashboard,
        bodyEntries: body.items.map(toBodyEntry),
        checkIns: checkIns.items.map(toCheckIn),
        photos: photos.items.map(toPhoto),
        nutrition,
        workout,
        health,
        profile,
      })
    } catch (requestError) {
      setError(requestError.message || 'Could not connect to client API.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, enabled])

  useEffect(() => {
    setAccessToken(accessToken)
    load()
    return () => setAccessToken(null)
  }, [accessToken, load])

  const saveBodyEntry = useCallback(async (entry) => {
    const saved = await clientApi.saveBodyEntry(entry)
    const [dashboard, body] = await Promise.all([clientApi.getDashboard(), clientApi.getBodyEntries()])
    setData((current) => ({ ...current, dashboard, bodyEntries: body.items.map(toBodyEntry) }))
    return saved
  }, [])

  const saveCheckIn = useCallback(async (checkIn) => {
    const saved = await clientApi.saveCheckIn(checkIn)
    const [dashboard, checkIns, health] = await Promise.all([
      clientApi.getDashboard(),
      clientApi.getCheckIns(),
      clientApi.getHealthSummary(),
    ])
    setData((current) => ({
      ...current,
      dashboard,
      checkIns: checkIns.items.map(toCheckIn),
      health,
    }))
    return saved
  }, [])

  const uploadPhoto = useCallback(async (file, view) => {
    const saved = await clientApi.uploadPhoto(file, view, today)
    setData((current) => ({ ...current, photos: [toPhoto(saved), ...current.photos] }))
    return saved
  }, [])

  const saveMealAdherence = useCallback(async (mealId, status) => {
    const saved = await clientApi.saveMealAdherence(mealId, status, today)
    const nutrition = await clientApi.getNutritionPlan(today)
    setData((current) => ({ ...current, nutrition }))
    return saved
  }, [])

  const getRecipeGuide = useCallback((mealId) => clientApi.getRecipeGuide(mealId), [])

  const saveWorkout = useCallback(async (sessionId, payload) => {
    const saved = await clientApi.saveWorkout(sessionId, payload)
    const [workout, dashboard] = await Promise.all([
      clientApi.getWorkout(today),
      clientApi.getDashboard(),
    ])
    setData((current) => ({ ...current, workout, dashboard }))
    return saved
  }, [])

  const saveProfile = useCallback(async (profile) => {
    const saved = await clientApi.saveProfile(profile)
    const profileResponse = await clientApi.getProfile()
    setData((current) => ({ ...current, profile: profileResponse }))
    return saved
  }, [])

  return {
    ...data,
    loading,
    error,
    reload: load,
    saveBodyEntry,
    saveCheckIn,
    uploadPhoto,
    saveMealAdherence,
    getRecipeGuide,
    saveWorkout,
    saveProfile,
  }
}
