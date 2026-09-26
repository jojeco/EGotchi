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

const ACTIONS = {
  feed: { id: 'feed', label: 'Feed', cooldownMs: 20000, effects: { fullness: 25, energy: -2, fun: 2 } },
  play: { id: 'play', label: 'Play', cooldownMs: 15000, effects: { fullness: -8, energy: -12, fun: 25 } },
  rest: { id: 'rest', label: 'Rest', cooldownMs: 45000, effects: { fullness: -5, energy: 35, fun: -5 } },
}
const ACTION_IDS = Object.keys(ACTIONS)

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
  }
}

// Pure: derives zeroSince/sick from the stats already on `pet`. Sickness is sticky — it only
// clears once every stat has climbed back up to RECOVER_THRESHOLD, never just because zeroSince
// reset to null.
function updateHealth(pet, now) {
  const anyZero = STAT_KEYS.some(k => pet[k] <= STAT_MIN)
  let zeroSince = anyZero ? (typeof pet.zeroSince === 'number' ? pet.zeroSince : now) : null
  let sick = pet.sick === true || (zeroSince !== null && now - zeroSince >= SICK_AFTER_MS)
  if (STAT_KEYS.every(k => pet[k] >= RECOVER_THRESHOLD)) sick = false
  return { ...pet, zeroSince, sick }
}

function applyDecay(pet, now) {
  const elapsed = Math.min(Math.max(now - pet.updatedAt, 0), MAX_OFFLINE_MS)
  const next = { ...pet, lastActionAt: { ...pet.lastActionAt }, updatedAt: now }
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
  return updateHealth(next, now)
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
  const next = { ...decayed, lastActionAt: { ...decayed.lastActionAt } }
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
    return {
      fullness: clampStat(p.fullness),
      energy: clampStat(p.energy),
      fun: clampStat(p.fun),
      updatedAt: p.updatedAt,
      lastActionAt,
      sick: p.sick === true,
      zeroSince: (typeof p.zeroSince === 'number' && Number.isFinite(p.zeroSince))
        ? Math.min(p.zeroSince, p.updatedAt)
        : null,
    }
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
  clampStat,
  createPet,
  updateHealth,
  applyDecay,
  getCooldownRemaining,
  canDoAction,
  applyAction,
  getAverage,
  getMoodIndex,
  isSick,
  serialize,
  deserialize,
}
