// Pure pet simulation logic. CommonJS, no imports, so it can be unit-tested with plain node.
'use strict'

const STAT_MIN = 0
const STAT_MAX = 100
const MOOD_COUNT = 5
const MAX_OFFLINE_MS = 12 * 3600e3
const SAVE_VERSION = 1
const STAT_KEYS = ['fullness', 'energy', 'fun']

// Neglect/sickness: a stat sitting at 0 this long makes the pet sick; it stays sick until every
// stat is brought back up to RECOVER_THRESHOLD, even if the zeroed stat is lifted off 0 first.
const SICK_AFTER_MS = 2 * 60e3
const RECOVER_THRESHOLD = 40
const SICK_MOOD_CAP = 1

// Points lost per minute for each stat.
const DECAY_PER_MINUTE = { fullness: 6, energy: 4, fun: 5 }

// Evolution: stage is driven by cumulative care-time (ageMs), which only advances via
// applyDecay's capped `elapsed` so it respects MAX_OFFLINE_MS the same as everything else. The
// adult form is a one-time snapshot of the long-run care average (careSum/ageMs) taken at the
// Teen->Adult transition; once set it never changes again, even if the pet is neglected after.
const STAGES = ['egg', 'baby', 'child', 'teen', 'adult']
const STAGE_AGE_MS = { egg: 0, baby: 2 * 60e3, child: 10 * 60e3, teen: 30 * 60e3, adult: 60 * 60e3 }
const ADULT_FORMS = [
  { id: 'radiant', label: 'Radiant', minCare: 70 },
  { id: 'steady', label: 'Steady', minCare: 40 },
  { id: 'scruffy', label: 'Scruffy', minCare: 0 },
]
// While sick, each care sample feeding into the long-run average is capped low so a pet can't
// coast into a good adult form just by being topped-up right at the Teen->Adult instant.
const SICK_CARE_CAP = 20

const ACTIONS = {
  feed: { id: 'feed', label: 'Feed', cooldownMs: 20000, effects: { fullness: 25, energy: -2, fun: 2 } },
  play: { id: 'play', label: 'Play', cooldownMs: 15000, effects: { fullness: -8, energy: -12, fun: 25 } },
  rest: { id: 'rest', label: 'Rest', cooldownMs: 45000, effects: { fullness: -5, energy: 35, fun: -5 } },
}
const ACTION_IDS = Object.keys(ACTIONS)
// Which history counter each action bumps, for applyAction.
const ACTION_HISTORY_KEY = { feed: 'feeds', play: 'plays', rest: 'rests' }

// History/achievements: counters + a care streak used by game/achievements.js to unlock
// milestones. Kept on the pet itself (like every other stat) so they persist and migrate the
// same way ageMs/careSum do.
const HISTORY_KEYS = ['feeds', 'plays', 'rests', 'timesSick', 'recoveries', 'careStreakMs', 'bestCareStreakMs']

// Pure: coerces a possibly-missing/garbage raw history blob into a fully-populated history
// object, defaulting any missing or invalid (non-finite, negative, wrong type) field to 0
// independently of the others, so one bad field never resets the rest.
function coerceHistory(raw) {
  const history = {}
  for (const key of HISTORY_KEYS) {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw[key] : undefined
    history[key] = (typeof value === 'number' && Number.isFinite(value) && value >= 0) ? value : 0
  }
  return history
}

function clampStat(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return STAT_MIN
  return Math.min(Math.max(n, STAT_MIN), STAT_MAX)
}

function createPet(now = Date.now()) {
  return {
    fullness: 70,
    energy: 70,
    fun: 70,
    updatedAt: now,
    lastActionAt: { feed: 0, play: 0, rest: 0 },
    zeroSince: null,
    sick: false,
    ageMs: 0,
    careSum: 0,
    stage: 'egg',
    adultForm: null,
    history: { feeds: 0, plays: 0, rests: 0, timesSick: 0, recoveries: 0, careStreakMs: 0, bestCareStreakMs: 0 },
    achievements: {},
    events: [],
  }
}

// Event-log cap, duplicated (not required) from game/eventLog.js's MAX_EVENTS so this file stays
// import-free. A test cross-checks the two constants stay in sync.
const MAX_EVENTS = 50

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

// Pure: canonical event-list coercion, identical to game/eventLog.js's coerceEvents. A non-array
// gives []. Otherwise keep plain-object entries with a non-empty string `type` and a finite `at`;
// `detail` is kept only if it's a plain object. Trimmed to the newest MAX_EVENTS. Unknown types
// are preserved, same precedent as unknown achievement ids surviving a round trip.
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

// Pure: derives zeroSince/sick from the stats already on `pet`. Sickness is sticky — it only
// clears once every stat has climbed back up to RECOVER_THRESHOLD, never just because zeroSince
// reset to null.
function updateHealth(pet, now) {
  const anyZero = STAT_KEYS.some(k => pet[k] <= STAT_MIN)
  let zeroSince = anyZero ? (typeof pet.zeroSince === 'number' ? pet.zeroSince : now) : null
  let sick = pet.sick === true || (zeroSince !== null && now - zeroSince >= SICK_AFTER_MS)
  if (STAT_KEYS.every(k => pet[k] >= RECOVER_THRESHOLD)) sick = false
  // Coerced (not just copied) so a hand-built pet missing `history` still gets zeroed counters
  // instead of poisoning them with NaN; real pets always already have a valid history object.
  const history = coerceHistory(pet.history)
  if (pet.sick !== true && sick === true) history.timesSick += 1
  else if (pet.sick === true && sick === false) history.recoveries += 1
  return { ...pet, zeroSince, sick, history }
}

// Pure: derives stage/adultForm from ageMs (and, once, the long-run care average). Stage never
// moves backwards — it's the max of the pet's current stage index and whatever ageMs alone
// implies. adultForm is computed exactly once, the first time `stage` reaches 'adult' while
// adultForm is still null; after that it's left untouched no matter what the pet does next.
function updateStage(pet) {
  const currentIndex = Math.max(STAGES.indexOf(pet.stage), 0)
  let computedIndex = 0
  for (let i = 1; i < STAGES.length; i++) {
    if (pet.ageMs >= STAGE_AGE_MS[STAGES[i]]) computedIndex = i
  }
  const index = Math.max(currentIndex, computedIndex)
  const stage = STAGES[index]
  // A non-adult can't already have a form (only reachable via a tampered save); drop it so the
  // real care average decides the form at the Teen->Adult transition.
  let adultForm = stage === 'adult' ? pet.adultForm : null
  if (stage === 'adult' && (adultForm === null || adultForm === undefined)) {
    const avgCare = getAverageCare(pet)
    const form = ADULT_FORMS.find(f => avgCare >= f.minCare) || ADULT_FORMS[ADULT_FORMS.length - 1]
    adultForm = form.id
  }
  return { ...pet, stage, adultForm }
}

// Pure: the long-run average care level over the pet's whole life so far.
function getAverageCare(pet) {
  return pet.ageMs === 0 ? getAverage(pet) : pet.careSum / pet.ageMs
}

// Pure: a render-friendly summary of where the pet is in its lifecycle.
function getStageInfo(pet) {
  const index = Math.max(STAGES.indexOf(pet.stage), 0)
  const stage = STAGES[index]
  const adultForm = pet.adultForm || null
  let label = stage.charAt(0).toUpperCase() + stage.slice(1)
  if (stage === 'adult' && adultForm) {
    const form = ADULT_FORMS.find(f => f.id === adultForm)
    if (form) label = label + ' · ' + form.label
  }
  const nextStage = index < STAGES.length - 1 ? STAGES[index + 1] : null
  const msToNext = nextStage === null ? null : Math.max(STAGE_AGE_MS[nextStage] - pet.ageMs, 0)
  return { stage, index, label, adultForm, nextStage, msToNext }
}

function applyDecay(pet, now) {
  const elapsed = Math.min(Math.max(now - pet.updatedAt, 0), MAX_OFFLINE_MS)
  const next = {
    ...pet,
    lastActionAt: { ...pet.lastActionAt },
    history: coerceHistory(pet.history),
    achievements: { ...pet.achievements },
    updatedAt: now,
  }
  let earliestCrossing = null
  for (const k of STAT_KEYS) {
    const rate = DECAY_PER_MINUTE[k] / 60000
    next[k] = clampStat(pet[k] - rate * elapsed)
    if (next[k] <= STAT_MIN && rate > 0) {
      // Exact moment this stat crossed zero, anchored on pet.updatedAt (not `now`) so a capped
      // offline gap can't shift it. A stat already at 0 before this tick gives offset 0.
      const offsetMs = Math.min(pet[k] / rate, elapsed)
      const crossing = pet.updatedAt + offsetMs
      if (earliestCrossing === null || crossing < earliestCrossing) earliestCrossing = crossing
    }
  }
  if (typeof pet.zeroSince !== 'number' && earliestCrossing !== null) {
    next.zeroSince = earliestCrossing
  }
  // Integrate care (trapezoid of the average stat level across this tick) into ageMs/careSum.
  // When elapsed is 0 (including now < updatedAt) this is a no-op: ageMs gets +0 and careSum
  // gets +0, same as every other field in that case.
  const sickCapped = pet.sick === true
  const avgBefore = sickCapped ? Math.min(getAverage(pet), SICK_CARE_CAP) : getAverage(pet)
  const avgAfter = sickCapped ? Math.min(getAverage(next), SICK_CARE_CAP) : getAverage(next)
  next.ageMs = pet.ageMs + elapsed
  next.careSum = pet.careSum + ((avgBefore + avgAfter) / 2) * elapsed
  const healed = updateHealth(updateStage(next), now)
  // Care streak: grows by this tick's (already-capped) elapsed time as long as the pet came out
  // of this tick with no zeroed stat and not sick; any zero-crossing or sickness resets it. The
  // best streak is a running max, so it survives later resets.
  const stayedHealthy = healed.zeroSince === null && !healed.sick
  const careStreakMs = stayedHealthy ? healed.history.careStreakMs + elapsed : 0
  const bestCareStreakMs = Math.max(healed.history.bestCareStreakMs, careStreakMs)
  return { ...healed, history: { ...healed.history, careStreakMs, bestCareStreakMs } }
}

function getCooldownRemaining(pet, actionId, now) {
  const action = ACTIONS[actionId]
  if (!action) return 0
  const last = (pet.lastActionAt && pet.lastActionAt[actionId]) || 0
  // Capped at cooldownMs so a stored timestamp from the future (clock skew) can't lock the button.
  return Math.min(action.cooldownMs, Math.max(last + action.cooldownMs - now, 0))
}

function canDoAction(pet, actionId, now) {
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, actionId)) {
    return { allowed: false, reason: 'unknown-action', remainingMs: 0 }
  }
  const remainingMs = getCooldownRemaining(pet, actionId, now)
  if (remainingMs > 0) return { allowed: false, reason: 'cooldown', remainingMs }
  return { allowed: true, reason: 'ok', remainingMs: 0 }
}

function applyAction(pet, actionId, now) {
  const check = canDoAction(pet, actionId, now)
  if (!check.allowed) return { pet, applied: false, reason: check.reason }
  const action = ACTIONS[actionId]
  const decayed = applyDecay(pet, now)
  const historyKey = ACTION_HISTORY_KEY[actionId]
  const next = {
    ...decayed,
    lastActionAt: { ...decayed.lastActionAt },
    history: { ...decayed.history, [historyKey]: decayed.history[historyKey] + 1 },
    achievements: { ...decayed.achievements },
  }
  for (const k of STAT_KEYS) {
    next[k] = clampStat(next[k] + action.effects[k])
  }
  next.lastActionAt[actionId] = now
  return { pet: updateHealth(next, now), applied: true, reason: 'ok' }
}

function getAverage(pet) {
  return STAT_KEYS.reduce((sum, k) => sum + pet[k], 0) / STAT_KEYS.length
}

function getMoodIndex(pet) {
  const idx = Math.floor(getAverage(pet) / (STAT_MAX / MOOD_COUNT))
  const clamped = Math.min(Math.max(idx, 0), MOOD_COUNT - 1)
  return pet.sick === true ? Math.min(clamped, SICK_MOOD_CAP) : clamped
}

function isSick(pet) {
  return pet.sick === true
}

function serialize(pet) {
  return JSON.stringify({ version: SAVE_VERSION, pet })
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

function deserialize(raw, now = Date.now()) {
  try {
    if (typeof raw !== 'string') return createPet(now)
    const data = JSON.parse(raw)
    if (!data || data.version !== SAVE_VERSION || !data.pet) return createPet(now)
    const p = data.pet
    if (!STAT_KEYS.every(k => isFiniteNumber(p[k])) || !isFiniteNumber(p.updatedAt)) return createPet(now)
    if (!p.lastActionAt || typeof p.lastActionAt !== 'object') return createPet(now)
    const lastActionAt = {}
    for (const id of ACTION_IDS) {
      const t = p.lastActionAt[id]
      if (t !== undefined && !isFiniteNumber(t)) return createPet(now)
      lastActionAt[id] = t === undefined ? 0 : t
    }
    // Evolution fields: coerce missing/garbage values to safe defaults without resetting the
    // rest of the pet (same pattern as the sick/zeroSince migration above). An old save with none
    // of these fields loads with its stats intact and starts as Egg at age 0.
    const ageMs = (isFiniteNumber(p.ageMs) && p.ageMs >= 0) ? p.ageMs : 0
    const careSumRaw = (isFiniteNumber(p.careSum) && p.careSum >= 0) ? p.careSum : 0
    const careSum = Math.min(careSumRaw, ageMs * STAT_MAX)
    const stage = STAGES.includes(p.stage) ? p.stage : 'egg'
    const adultForm = ADULT_FORMS.some(f => f.id === p.adultForm) ? p.adultForm : null
    // Achievements: an id->timestamp map. Unknown ids (e.g. a newer save opened by an older
    // build) are kept as-is; only entries with a non-finite/garbage timestamp are dropped, and a
    // non-object/array value is treated as empty rather than resetting the whole pet.
    const achievements = {}
    if (p.achievements && typeof p.achievements === 'object' && !Array.isArray(p.achievements)) {
      for (const id of Object.keys(p.achievements)) {
        const t = p.achievements[id]
        if (isFiniteNumber(t)) achievements[id] = t
      }
    }
    const pet = {
      fullness: clampStat(p.fullness),
      energy: clampStat(p.energy),
      fun: clampStat(p.fun),
      updatedAt: p.updatedAt,
      lastActionAt,
      sick: p.sick === true,
      zeroSince: (typeof p.zeroSince === 'number' && Number.isFinite(p.zeroSince))
        ? Math.min(p.zeroSince, p.updatedAt)
        : null,
      ageMs,
      careSum,
      stage,
      adultForm,
      history: coerceHistory(p.history),
      achievements,
      events: coerceEvents(p.events),
    }
    // Reconcile stage/adultForm against ageMs (handles inconsistent/tampered combinations the
    // same way a live pet's applyDecay would: stage never moves backwards, adultForm is only
    // ever computed once).
    return updateStage(pet)
  } catch (e) {
    return createPet(now)
  }
}

module.exports = {
  STAT_MIN,
  STAT_MAX,
  MOOD_COUNT,
  MAX_OFFLINE_MS,
  SAVE_VERSION,
  STAT_KEYS,
  DECAY_PER_MINUTE,
  ACTIONS,
  SICK_AFTER_MS,
  RECOVER_THRESHOLD,
  SICK_MOOD_CAP,
  STAGES,
  STAGE_AGE_MS,
  ADULT_FORMS,
  SICK_CARE_CAP,
  HISTORY_KEYS,
  coerceHistory,
  clampStat,
  createPet,
  updateHealth,
  updateStage,
  applyDecay,
  getCooldownRemaining,
  canDoAction,
  applyAction,
  getAverage,
  getAverageCare,
  getStageInfo,
  getMoodIndex,
  isSick,
  serialize,
  deserialize,
}
