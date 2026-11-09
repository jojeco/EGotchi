// Timestamped activity log, built by diffing a pet's state before/after a tick, action or load.
// CommonJS, no imports — kept standalone like game/achievements.js, so callers (App.js, tests)
// pass the pet objects straight in and this module never requires game/petState.js.
// Sick/evolved events carry the real offline moment they happened (not the load-time `now`),
// and the returned batch is time-sorted ascending.
'use strict'

const MAX_EVENTS = 50
const EVENT_TYPES = ['feed', 'play', 'rest', 'sick', 'recovered', 'evolved', 'achievement']

// Duplicated (not required) from game/petState.js, same approach as MAX_EVENTS above, so this
// module stays import-free. Used to recover the real offline moment a sick/evolved event
// happened, matching the timing applyDecay itself uses.
const SICK_AFTER_MS = 2 * 60e3
const STAGE_AGE_MS = { egg: 0, baby: 2 * 60e3, child: 10 * 60e3, teen: 30 * 60e3, adult: 60 * 60e3 }

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

// Clamps `t` into [lo, hi]; falls back to `fallback` when `t` isn't a finite number (a missing
// or garbage source field on the pet).
function clampAt(t, lo, hi, fallback) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return fallback
  return Math.min(Math.max(t, lo), hi)
}

// Pure: never throws. Sick/evolved events carry the real offline moment they happened (derived
// from zeroSince/ageMs, same as applyDecay), not the load-time `now` — clamped into
// [prev.updatedAt, now] so a bad/missing timestamp can't escape that window. The returned batch
// is sorted by `at` ascending before it's handed back.
function diffEvents(prev, next, now) {
  const events = []
  const prevHistory = historyOf(prev)
  const nextHistory = historyOf(next)

  for (const [key, type] of HISTORY_EVENT_MAP) {
    const delta = Math.max((nextHistory[key] || 0) - (prevHistory[key] || 0), 0)
    for (let i = 0; i < delta; i++) events.push({ type, at: now })
  }

  // Lower clamp bound for the real-time calcs below: the start of this diff's window.
  const lo = (prev && typeof prev.updatedAt === 'number' && Number.isFinite(prev.updatedAt)) ? prev.updatedAt : now

  const sickDelta = Math.max((nextHistory.timesSick || 0) - (prevHistory.timesSick || 0), 0)
  if (sickDelta > 0) {
    const zeroSince = next && typeof next.zeroSince === 'number' && Number.isFinite(next.zeroSince) ? next.zeroSince : null
    const sickAt = zeroSince === null ? now : clampAt(zeroSince + SICK_AFTER_MS, lo, now, now)
    for (let i = 0; i < sickDelta; i++) events.push({ type: 'sick', at: sickAt })
  }

  // Recovery can't be derived from decay alone (it depends on care actions taken after the
  // zero-crossing), so it stays stamped at `now`.
  const recoveredDelta = Math.max((nextHistory.recoveries || 0) - (prevHistory.recoveries || 0), 0)
  for (let i = 0; i < recoveredDelta; i++) events.push({ type: 'recovered', at: now })

  // A missing/garbage `stage` counts as the zero stage ('egg'), same as petState's own
  // STAGES.indexOf(...) || 0 fallback — not as "no stage", or a hand-built pet fixture that
  // never set `stage` would look like it "evolved" the first time it gets one.
  const prevStage = prev && typeof prev.stage === 'string' ? prev.stage : 'egg'
  const nextStage = next && typeof next.stage === 'string' ? next.stage : 'egg'
  if (nextStage !== prevStage) {
    const adultForm = nextStage === 'adult' && next.adultForm ? next.adultForm : null
    const prevAgeMs = prev ? prev.ageMs : undefined
    const nextAgeMs = next ? next.ageMs : undefined
    // Only derive a real-time boundary crossing when ageMs actually advanced (a genuine offline
    // gap). A stage-only reassignment with no age change (e.g. a direct updateStage call in a
    // test) has no decay window to anchor on, so it keeps the `now` stamp.
    const agesAdvanced = typeof prevAgeMs === 'number' && Number.isFinite(prevAgeMs) &&
      typeof nextAgeMs === 'number' && Number.isFinite(nextAgeMs) && nextAgeMs > prevAgeMs &&
      Object.prototype.hasOwnProperty.call(STAGE_AGE_MS, nextStage)
    const evolvedAt = agesAdvanced
      ? clampAt(prev.updatedAt + (STAGE_AGE_MS[nextStage] - prevAgeMs), lo, now, now)
      : now
    events.push({ type: 'evolved', at: evolvedAt, detail: { stage: nextStage, adultForm } })
  }

  const prevAchievements = achievementsOf(prev)
  const nextAchievements = achievementsOf(next)
  for (const id of Object.keys(nextAchievements)) {
    if (prevAchievements[id] !== undefined) continue
    const at = typeof nextAchievements[id] === 'number' ? nextAchievements[id] : now
    events.push({ type: 'achievement', at, detail: { id } })
  }

  events.sort((a, b) => a.at - b.at)
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
  SICK_AFTER_MS,
  STAGE_AGE_MS,
  diffEvents,
  appendEvents,
  recordTransition,
  coerceEvents,
  describeEvent,
  formatAgo,
  getRecentEvents,
}
