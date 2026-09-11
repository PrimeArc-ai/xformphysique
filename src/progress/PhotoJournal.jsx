import { useCallback, useEffect, useRef, useState } from 'react'
import { clientApi } from '../api/client'
import { coachApi } from '../api/coach'
import './progress.css'

const poses = [['front', 'Front'], ['back', 'Back'], ['side', 'Side'], ['front_double_bicep', 'Front Double Bicep'], ['back_double_bicep', 'Back Double Bicep']]
const emptyCheckIns = []
const isoDay = zone => new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const weekOf = day => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10) }

function ProtectedImage({ photo, load, onOpen }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true, objectUrl
    setUrl(null); setError('')
    if (photo) load(photo.content_url).then(value => { objectUrl = value; if (active) setUrl(value); else URL.revokeObjectURL(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [photo, load])
  if (!photo) return <div className="photo-placeholder">No photo for this pose and week.</div>
  if (!url) return <div className="photo-placeholder">{error || 'Loading private photo…'}</div>
  return <button type="button" className="photo-image-button" onClick={() => onOpen({ photo, url })} aria-label={`Zoom ${photo.view.replaceAll('_', ' ')} captured ${photo.captured_on}`}><img src={url} alt={`${photo.view.replaceAll('_', ' ')} progress, ${photo.captured_on}`} /></button>
}

export default function PhotoJournal({ clientId, token, profile, checkIns = emptyCheckIns, feedbackRevision = 0 }) {
  const [photos, setPhotos] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [pose, setPose] = useState('front')
  const [week, setWeek] = useState('')
  const [comparison, setComparison] = useState('')
  const [capturedOn, setCapturedOn] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(null)
  const [scale, setScale] = useState(1)
  const [weekNotes, setWeekNotes] = useState(null)
  const dialog = useRef(null)
  const zone = profile?.timezone || 'UTC'
  const today = isoDay(zone)
  const currentWeek = weekOf(today)
  const load = useCallback(offset => clientId ? coachApi.getPhotos(clientId, token, offset) : clientApi.getPhotos(offset), [clientId, token])
  const loadImage = useCallback(path => clientId ? coachApi.getPrivatePhotoUrl(path, token) : clientApi.getPrivatePhotoUrl(path), [clientId, token])
  const refresh = useCallback(async () => {
    const result = await load(0); setPhotos(result.items); setHasMore(result.has_more)
  }, [load])
  useEffect(() => { let active = true; load(0).then(r => { if (active) { setPhotos(r.items); setHasMore(r.has_more) } }).catch(e => { if (active) setMessage(e.message) }); return () => { active = false } }, [load])
  useEffect(() => { if (zoom) { setScale(1); dialog.current?.showModal() } }, [zoom])
  const weeks = [...new Set([currentWeek, ...photos.map(p => p.period_start || weekOf(p.captured_on))])].sort().reverse()
  const chosenWeek = week || currentWeek
  const priorDate = new Date(`${chosenWeek}T12:00:00Z`); priorDate.setUTCDate(priorDate.getUTCDate() - 7)
  const priorWeek = priorDate.toISOString().slice(0, 10)
  const compareWeek = comparison || priorWeek
  const matching = period => photos.filter(p => (p.period_start || weekOf(p.captured_on)) === period && p.view === pose).sort((a, b) => (b.uploaded_at || b.captured_on).localeCompare(a.uploaded_at || a.captured_on))
  const current = matching(chosenWeek)[0], previous = matching(compareWeek)[0]
  useEffect(() => {
    let active = true
    setWeekNotes(null)
    const read = async () => {
      let offset = 0
      while (active) {
        const result = await (clientId ? coachApi.getCheckIns(clientId, token, offset) : clientApi.getCheckIns(offset))
        const match = result.items.find(c => c.period_start === chosenWeek)
        if (match || !result.has_more || result.items.at(-1)?.period_start < chosenWeek) {
          if (active) setWeekNotes(match?.feedback || null)
          return
        }
        offset += result.items.length
      }
    }
    read().catch(() => { if (active) setWeekNotes({ observations: 'Coach notes could not be loaded. Try the weekly check-in history.' }) })
    return () => { active = false }
  }, [chosenWeek, clientId, token, checkIns, feedbackRevision])
  const upload = async e => {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    const capture = capturedOn || (chosenWeek === currentWeek ? today : chosenWeek)
    if (weekOf(capture) !== chosenWeek) { setMessage('Capture date must belong to the selected week. Select a matching date first.'); return }
    if (current && !window.confirm('Replace this pose for the selected week? Its old image will be removed. Other weeks stay unchanged.')) return
    setBusy(true); setMessage('')
    try { const result = await clientApi.uploadPhoto(file, pose, capture, current?.id); await refresh(); setMessage(result.cleanup_pending ? 'Photo saved. Cleanup of its old private image is pending.' : 'Photo saved privately to the selected week.') } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const remove = async photo => {
    if (!window.confirm(`Delete ${photo.view.replaceAll('_', ' ')} captured ${photo.captured_on}? This removes that image only.`)) return
    setBusy(true)
    try { const result = await (clientId ? coachApi.deletePhoto(clientId, photo.id, token) : clientApi.deletePhoto(photo.id)); await refresh(); setMessage(result.cleanup_pending ? 'Photo hidden. Private object cleanup is pending; contact your administrator.' : 'Photo deleted. Other weeks are unchanged.') } catch (e) { setMessage(e.message) } finally { setBusy(false) }
  }
  const more = async () => { setBusy(true); try { const r = await load(photos.length); setPhotos(p => [...p, ...r.items]); setHasMore(r.has_more) } catch (e) { setMessage(e.message) } finally { setBusy(false) } }
  return <section className="panel progress-panel photo-journal" aria-label="Weekly progress photos"><header><div><p className="kicker">PRIVATE / WEEKLY PHOTOS</p><h2>Progress, in perspective.</h2><span>Five poses. Exact photo IDs. Visible only to this client and their assigned coach.</span></div></header>
    <div className="pose-tabs" role="group" aria-label="Photo pose">{poses.map(([key, label]) => <button key={key} aria-pressed={pose === key} onClick={() => setPose(key)}>{label}</button>)}</div>
    <div className="photo-week-controls"><label>Review week<select value={chosenWeek} onChange={e => { setWeek(e.target.value); setComparison(''); setCapturedOn('') }}>{weeks.map(w => <option key={w} value={w}>Week of {w}{w === currentWeek ? ' · current' : ''}</option>)}</select></label><label>Compare with<select value={compareWeek} onChange={e => setComparison(e.target.value)}>{[...new Set([priorWeek, ...weeks.filter(w => w < chosenWeek)])].sort().reverse().map(w => <option key={w} value={w}>Week of {w}{w === priorWeek ? ' · previous' : ''}</option>)}</select></label></div>
    <div className="weekly-photo-pair">{[[previous, compareWeek, 'Comparison'], [current, chosenWeek, 'Selected']].map(([photo, period, label]) => <figure key={label}><figcaption><strong>{label} · {poses.find(([key]) => key === pose)[1]}</strong><span>Week of {period}</span></figcaption><ProtectedImage photo={photo} load={loadImage} onOpen={setZoom} /><p>{photo ? `Captured ${photo.captured_on} · uploaded ${photo.uploaded_at ? new Date(photo.uploaded_at).toLocaleString(undefined, { timeZone: zone }) : 'time not recorded'}` : 'No upload recorded'}</p>{photo && <><small className="photo-record-id">Photo ID: {photo.id}</small><button type="button" disabled={busy} onClick={() => remove(photo)}>Delete this photo</button></>}</figure>)}</div>
    {!clientId && <div className="photo-upload-row"><label>Capture date<input type="date" required max={today} value={capturedOn || (chosenWeek === currentWeek ? today : chosenWeek)} onChange={e => setCapturedOn(e.target.value)} /></label><label className="progress-upload">{current ? 'Replace selected pose' : 'Upload selected pose'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={upload} /></label></div>}
    {hasMore && <button disabled={busy} onClick={more}>Load older photo weeks</button>}
    {matching(chosenWeek).length > 1 && <details><summary>Other uploads in this week</summary>{matching(chosenWeek).slice(1).map(photo => <div key={photo.id}><ProtectedImage photo={photo} load={loadImage} onOpen={setZoom} /><small>{photo.captured_on} · {photo.id}</small><button onClick={() => remove(photo)} disabled={busy}>Delete this photo</button></div>)}</details>}
    <div className="photo-week-notes"><strong>Coach notes · week {chosenWeek}</strong><p>{weekNotes?.observations || 'No coach observations recorded for this week.'}</p>{weekNotes?.instructions && <p>Instructions: {weekNotes.instructions}</p>}{weekNotes?.adjustments && <p>Adjustments: {weekNotes.adjustments}</p>}{weekNotes?.next_week_priorities && <p>Next week: {weekNotes.next_week_priorities}</p>}</div>
    <p role="status">{message}</p><p className="progress-caption">Private images load only when viewed. No public bucket URLs are shared. Deletion removes image bytes; minimal ID/audit metadata is retained.</p>
    <dialog ref={dialog} className="photo-zoom-dialog" onClose={() => setZoom(null)}><div className="progress-actions"><button onClick={() => dialog.current.close()}>Close image</button><button onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await dialog.current.requestFullscreen() } catch { setMessage('Fullscreen unavailable in this browser. The expanded image remains available.') } }}>Toggle fullscreen</button><label>Zoom<input type="range" min="1" max="3" step="0.25" value={scale} onChange={e => setScale(Number(e.target.value))} /></label></div>{zoom && <><p>{zoom.photo.view.replaceAll('_', ' ')} · {zoom.photo.captured_on}</p><div className="photo-zoom-scroll"><img src={zoom.url} alt={`Expanded ${zoom.photo.view}`} style={{ width: `${scale * 100}%`, maxWidth: 'none' }} /></div></>}</dialog>
  </section>
}
