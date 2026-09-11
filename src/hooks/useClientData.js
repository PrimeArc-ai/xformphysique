import { useCallback, useEffect, useRef, useState } from 'react'
import { clientApi, setAccessToken } from '../api/client'

const today = new Date().toISOString().slice(0, 10)

const initialData = {
  dashboard: null,
  bodyEntries: [],
  checkIns: [],
  checkInSchedule: null,
  photos: [],
  nutrition: null,
  workout: null,
  health: null,
  profile: null,
  profilePhoto: null,
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

const toPhoto = async (photo) => ({
  ...photo,
  date: photo.captured_on,
  url: await clientApi.getPrivatePhotoUrl(photo.content_url),
})

export default function useClientData({ enabled, accessToken }) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const photoUrls = useRef([])

  const releasePhotoUrls = useCallback(() => {
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url))
    photoUrls.current = []
  }, [])

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
      const [dashboard, body, checkIns, photos, nutrition, workout, health, profile, profilePhotoResponse] = await Promise.all([
        clientApi.getDashboard(),
        clientApi.getBodyEntries(),
        clientApi.getCheckIns(),
        clientApi.getPhotos(),
        clientApi.getNutritionPlan(),
        clientApi.getWorkout(),
        clientApi.getHealthSummary(),
        clientApi.getProfile(),
        clientApi.getProfilePhoto(),
      ])
      const hydratedPhotos = photos.items
      const profilePhoto = profilePhotoResponse.photo
        ? { ...profilePhotoResponse.photo, url: await clientApi.getPrivateProfilePhotoUrl(profilePhotoResponse.photo.content_url) }
        : null
      releasePhotoUrls()
      photoUrls.current = [...hydratedPhotos.map((photo) => photo.url), profilePhoto?.url].filter(Boolean)
      setData({
        dashboard,
        bodyEntries: body.items.map(toBodyEntry),
        checkIns: checkIns.items.map(toCheckIn),
        checkInSchedule: checkIns.schedule,
        photos: hydratedPhotos,
        nutrition,
        workout,
        health,
        profile,
        profilePhoto,
      })
    } catch (requestError) {
      setError(requestError.message || 'Could not connect to client API.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, enabled, releasePhotoUrls])

  useEffect(() => {
    setAccessToken(accessToken)
    load()
    return () => {
      setAccessToken(null)
      releasePhotoUrls()
    }
  }, [accessToken, load, releasePhotoUrls])

  useEffect(() => {
    if (!enabled || !data.checkInSchedule?.today) return undefined
    const checkDay = () => {
      const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: data.profile?.timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      if (localDay !== data.checkInSchedule.today) load()
    }
    const timer = setInterval(checkDay, 30000)
    window.addEventListener('focus', checkDay)
    return () => { clearInterval(timer); window.removeEventListener('focus', checkDay) }
  }, [enabled, data.checkInSchedule?.today, data.profile?.timezone, load])

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
      checkInSchedule: checkIns.schedule,
      health,
    }))
    return saved
  }, [])

  const uploadPhoto = useCallback(async (file, view) => {
    const saved = await clientApi.uploadPhoto(file, view, today)
    const photo = await toPhoto(saved)
    photoUrls.current.push(photo.url)
    setData((current) => ({ ...current, photos: [photo, ...current.photos] }))
    return saved
  }, [])

  const saveMealAdherence = useCallback(async (mealId, status) => {
    const mealDay = data.nutrition?.date || today
    const saved = await clientApi.saveMealAdherence(mealId, status, mealDay)
    const nutrition = await clientApi.getNutritionPlan()
    setData((current) => ({ ...current, nutrition }))
    return saved
  }, [data.nutrition?.date])

  const getRecipeGuide = useCallback((mealId) => clientApi.getRecipeGuide(mealId), [])

  const saveWorkout = useCallback(async (sessionId, payload) => {
    const saved = await clientApi.saveWorkout(sessionId, payload)
    const [workout, dashboard] = await Promise.all([
      clientApi.getWorkout(),
      clientApi.getDashboard(),
    ])
    setData((current) => ({ ...current, workout, dashboard }))
    return saved
  }, [])

  const saveProfile = useCallback(async (profile) => {
    const saved = await clientApi.saveProfile(profile)
    const [profileResponse, checkIns] = await Promise.all([clientApi.getProfile(), clientApi.getCheckIns()])
    setData((current) => ({ ...current, profile: profileResponse, checkInSchedule: checkIns.schedule }))
    return saved
  }, [])

  const uploadProfilePhoto = useCallback(async (file) => {
    const response = await clientApi.uploadProfilePhoto(file)
    const nextPhoto = {
      ...response.photo,
      url: await clientApi.getPrivateProfilePhotoUrl(response.photo.content_url),
    }
    setData((current) => {
      if (current.profilePhoto?.url) {
        URL.revokeObjectURL(current.profilePhoto.url)
        photoUrls.current = photoUrls.current.filter((url) => url !== current.profilePhoto.url)
      }
      photoUrls.current.push(nextPhoto.url)
      return { ...current, profilePhoto: nextPhoto }
    })
    return nextPhoto
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
    uploadProfilePhoto,
  }
}
