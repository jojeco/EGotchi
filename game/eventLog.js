// Timestamped activity log, built by diffing a pet's state before/after a tick, action or load.
// CommonJS, no imports — kept standalone like game/achievements.js, so callers (App.js, tests)
// pass the pet objects straight in and this module never requires game/petState.js.
'use strict'

const MAX_EVENTS = 50
const EVENT_TYPES = ['feed', 'play', 'rest', 'sick', 'recovered', 'evolved', 'achievement']

// Mirrors the counter -> event-type mapping App.js cares about. Order here also drives the
// "actions first" ordering within a single diffEvents batch.
const HISTORY_EVENT_MAP = [
  ['feeds', 'feed'],
  ['plays', 'play'],
  ['rests', 'rest'],
]

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

// Defensive like achievements.js's historyOf: a pet missing `history` (or with a garbage value)
// counts as all-zero counters rather than throwing.
function historyOf(pet) {
  return pet && isPlainObject(pet.history) ? pet.history : {}
}

function achievementsOf(pet) {
  return pet && isPlainObject(pet.achievements) ? pet.achievements : {}
}

function capitalize(s) {
  return typeof s === 'string' && s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// Pure: never throws. Order within one batch: actions, sick/recovered, evolved, achievements.
function diffEvents(prev, next, now) {
  const events = []
  const prevHistory = historyOf(prev)
  const nextHistory = historyOf(next)

  for (const [key, type] of HISTORY_EVENT_MAP) {
    const delta = Math.max((nextHistory[key] || 0) - (prevHistory[key] || 0), 0)
    for (let i = 0; i < delta; i++) events.push({ type, at: now })
  }

  const sickDelta = Math.max((nextHistory.timesSick || 0) - (prevHistory.timesSick || 0), 0)
  for (let i = 0; i < sickDelta; i++) events.push({ type: 'sick', at: now })

  const recoveredDelta = Math.max((nextHistory.recoveries || 0) - (prevHistory.recoveries || 0), 0)
  for (let i = 0; i < recoveredDelta; i++) events.push({ type: 'recovered', at: now })

  // A missing/garbage `stage` counts as the zero stage ('egg'), same as petState's own
  // STAGES.indexOf(...) || 0 fallback — not as "no stage", or a hand-built pet fixture that
  // never set `stage` would look like it "evolved" the first time it gets one.
  const prevStage = prev && typeof prev.stage === 'string' ? prev.stage : 'egg'
  const nextStage = next && typeof next.stage === 'string' ? next.stage : 'egg'
  if (nextStage !== prevStage) {
    const adultForm = nextStage === 'adult' && next.adultForm ? next.adultForm : null
    events.push({ type: 'evolved', at: now, detail: { stage: nextStage, adultForm } })
  }

  const prevAchievements = achievementsOf(prev)
  const nextAchievements = achievementsOf(next)
  for (const id of Object.keys(nextAchievements)) {
    if (prevAchievements[id] !== undefined) continue
    const at = typeof nextAchievements[id] === 'number' ? nextAchievements[id] : now
    events.push({ type: 'achievement', at, detail: { id } })
  }

  return events
}

// Pure: same contract as evaluateAchievements — returns the exact same `pet` reference when
// there's nothing to append, so callers can skip a state update.
function appendEvents(pet, events) {
  if (!events || events.length === 0) return pet
  const existing = Array.isArray(pet.events) ? pet.events : []
  const merged = existing.concat(events)
  const trimmed = merged.length > MAX_EVENTS ? merged.slice(merged.length - MAX_EVENTS) : merged
  return { ...pet, events: trimmed }
}

function recordTransition(prev, next, now) {
  return appendEvents(next, diffEvents(prev, next, now))
}

// Canonical coercion rule, duplicated (not required) inline in petState.js's deserialize so that
// file stays import-free. A test cross-checks the two stay in sync. Unknown types are preserved,
// following the precedent that unknown achievement ids survive a round trip.
function coerceEvents(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const e of raw) {
    if (!isPlainObject(e)) continue
    if (typeof e.type !== 'string' || e.type.length === 0) continue
    if (typeof e.at !== 'number' || !Number.isFinite(e.at)) continue
    const entry = { type: e.type, at: e.at }
    if (isPlainObject(e.detail)) entry.detail = e.detail
    out.push(entry)
  }
  return out.length > MAX_EVENTS ? out.slice(out.length - MAX_EVENTS) : out
}

// Display text for one event. Kept import-free by having the caller pass an optional labels map
// for achievement ids, instead of requiring game/achievements.js.
function describeEvent(event, opts) {
  const achievementLabels = (opts && opts.achievementLabels) || {}
  const detail = (event && isPlainObject(event.detail)) ? event.detail : {}
  switch (event && event.type) {
    case 'feed': return 'Fed'
    case 'play': return 'Played'
    case 'rest': return 'Rested'
    case 'sick': return 'Got sick'
    case 'recovered': return 'Recovered'
    case 'evolved':
      if (detail.adultForm) return 'Evolved into Adult (' + capitalize(detail.adultForm) + ')'
      return 'Evolved into ' + capitalize(detail.stage)
    case 'achievement': {
      const label = achievementLabels[detail.id] || detail.id
      return 'Unlocked: ' + label
    }
    default:
      return (event && event.type) || ''
  }
}

// Relative "Xm ago"-style formatting. Negative values (clock skew) clamp to "just now".
function formatAgo(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 5000) return 'just now'
  if (ms < 60000) return Math.floor(ms / 1000) + 's ago'
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago'
  if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago'
  return Math.floor(ms / 86400000) + 'd ago'
}

// Newest-first, safe on a pet with no `events`.
function getRecentEvents(pet, limit) {
  const lim = typeof limit === 'number' ? limit : MAX_EVENTS
  const events = (pet && Array.isArray(pet.events)) ? pet.events : []
  const newestFirst = events.slice().reverse()
  return newestFirst.length > lim ? newestFirst.slice(0, lim) : newestFirst
}

module.exports = {
  MAX_EVENTS,
  EVENT_TYPES,
  diffEvents,
  appendEvents,
  recordTransition,
  coerceEvents,
  describeEvent,
  formatAgo,
  getRecentEvents,
}
