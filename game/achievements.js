// Achievement/milestone definitions + evaluation. CommonJS, no imports — kept standalone like
// game/storage.js, so callers (App.js, tests) pass the pet object straight in and this module
// never requires game/petState.js.
'use strict'

// Mirrors game/petState.js's STAGES order exactly. Duplicated here (not required) so this file
// stays import-free; a test cross-checks the two constants stay in sync.
const STAGE_ORDER = ['egg', 'baby', 'child', 'teen', 'adult']

const MINUTE_MS = 60000
const DEVOTED_STREAK_MS = 30 * MINUTE_MS

function stageIndex(pet) {
  const i = STAGE_ORDER.indexOf(pet.stage)
  return i === -1 ? 0 : i
}

// Defensive like game/petState.js's updateHealth: a hand-built pet missing `history` (or with a
// garbage value) is treated as all-zero counters rather than throwing.
function historyOf(pet) {
  return pet && pet.history && typeof pet.history === 'object' ? pet.history : {}
}

const ACHIEVEMENTS = [
  {
    id: 'first_meal',
    label: 'First Meal',
    description: 'Feed your pet for the first time.',
    check: pet => (historyOf(pet).feeds || 0) >= 1,
  },
  {
    id: 'gourmet',
    label: 'Gourmet',
    description: 'Feed your pet 25 times.',
    check: pet => (historyOf(pet).feeds || 0) >= 25,
  },
  {
    id: 'playmate',
    label: 'Playmate',
    description: 'Play with your pet 25 times.',
    check: pet => (historyOf(pet).plays || 0) >= 25,
  },
  {
    id: 'sleepyhead',
    label: 'Sleepyhead',
    description: 'Rest your pet 25 times.',
    check: pet => (historyOf(pet).rests || 0) >= 25,
  },
  {
    id: 'hatched',
    label: 'Hatched',
    description: 'Reach the Baby stage.',
    check: pet => stageIndex(pet) >= STAGE_ORDER.indexOf('baby'),
  },
  {
    id: 'grown_up',
    label: 'Grown Up',
    description: 'Reach the Adult stage.',
    check: pet => pet.stage === 'adult',
  },
  {
    id: 'radiant',
    label: 'Radiant',
    description: 'Grow into the Radiant adult form.',
    check: pet => pet.adultForm === 'radiant',
  },
  {
    id: 'comeback',
    label: 'Comeback',
    description: 'Recover from sickness at least once.',
    check: pet => (historyOf(pet).recoveries || 0) >= 1,
  },
  {
    id: 'devoted',
    label: 'Devoted',
    description: 'Keep every stat healthy for 30 minutes straight.',
    check: pet => (historyOf(pet).bestCareStreakMs || 0) >= DEVOTED_STREAK_MS,
  },
  {
    id: 'pampered',
    label: 'Pampered',
    description: 'Get fullness, energy and fun all to 95+ at the same time.',
    check: pet => pet.fullness >= 95 && pet.energy >= 95 && pet.fun >= 95,
  },
]

const ACHIEVEMENT_IDS = ACHIEVEMENTS.map(a => a.id)

// Pure: checks every achievement against `pet`, unlocking (timestamping with `now`) any newly
// satisfied one. Never re-locks or re-timestamps one already unlocked, even if the pet later
// regresses below the threshold. Returns the exact same `pet` reference when nothing new
// unlocked, so callers can skip a state update.
function evaluateAchievements(pet, now) {
  const existing = pet.achievements && typeof pet.achievements === 'object' ? pet.achievements : {}
  let achievements = existing
  const newlyUnlocked = []
  for (const a of ACHIEVEMENTS) {
    if (existing[a.id] !== undefined) continue
    if (a.check(pet)) {
      if (achievements === existing) achievements = { ...existing }
      achievements[a.id] = now
      newlyUnlocked.push(a.id)
    }
  }
  if (newlyUnlocked.length === 0) return { pet, newlyUnlocked }
  return { pet: { ...pet, achievements }, newlyUnlocked }
}

// Render-friendly rows for every known achievement, in definition order. An unknown id stored on
// the pet (e.g. a save written by a newer build) is simply not rendered here — it's neither
// counted nor dropped from storage, just not displayed.
function getAchievementList(pet) {
  const stored = pet.achievements && typeof pet.achievements === 'object' ? pet.achievements : {}
  return ACHIEVEMENTS.map(a => ({
    id: a.id,
    label: a.label,
    description: a.description,
    unlocked: typeof stored[a.id] === 'number',
    unlockedAt: typeof stored[a.id] === 'number' ? stored[a.id] : null,
  }))
}

// Pure: counts only known achievement ids, so a stray/unknown id sitting in storage never
// inflates the total unlocked count.
function getProgress(pet) {
  const stored = pet.achievements && typeof pet.achievements === 'object' ? pet.achievements : {}
  const unlocked = ACHIEVEMENT_IDS.filter(id => typeof stored[id] === 'number').length
  return { unlocked, total: ACHIEVEMENT_IDS.length }
}

module.exports = {
  STAGE_ORDER,
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  evaluateAchievements,
  getAchievementList,
  getProgress,
}
