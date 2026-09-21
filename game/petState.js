// Pure pet simulation logic. CommonJS, no imports, so it can be unit-tested with plain node.
'use strict'

const STAT_MIN = 0
const STAT_MAX = 100
const MOOD_COUNT = 5
const MAX_OFFLINE_MS = 12 * 3600e3
const SAVE_VERSION = 1
const STAT_KEYS = ['fullness', 'energy', 'fun']

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
  return { fullness: 70, energy: 70, fun: 70, updatedAt: now, lastActionAt: { feed: 0, play: 0, rest: 0 } }
}

function applyDecay(pet, now) {
  const elapsed = Math.min(Math.max(now - pet.updatedAt, 0), MAX_OFFLINE_MS)
  const next = { ...pet, lastActionAt: { ...pet.lastActionAt }, updatedAt: now }
  for (const k of STAT_KEYS) {
    next[k] = clampStat(pet[k] - (DECAY_PER_MINUTE[k] * elapsed) / 60000)
  }
  return next
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
  const next = applyDecay(pet, now)
  for (const k of STAT_KEYS) {
    next[k] = clampStat(next[k] + action.effects[k])
  }
  next.lastActionAt[actionId] = now
  return { pet: next, applied: true, reason: 'ok' }
}

function getAverage(pet) {
  return STAT_KEYS.reduce((sum, k) => sum + pet[k], 0) / STAT_KEYS.length
}

function getMoodIndex(pet) {
  const idx = Math.floor(getAverage(pet) / (STAT_MAX / MOOD_COUNT))
  return Math.min(Math.max(idx, 0), MOOD_COUNT - 1)
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
  clampStat,
  createPet,
  applyDecay,
  getCooldownRemaining,
  canDoAction,
  applyAction,
  getAverage,
  getMoodIndex,
  serialize,
  deserialize,
}
