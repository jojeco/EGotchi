// Run with: node tests/petState.test.js
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const petState = require('../game/petState')
const storage = require('../game/storage')

const MIN = 60000
const T0 = 1700000000000
const tests = []
const test = (name, fn) => tests.push({ name, fn })

test('petState exports every symbol App.js and storage.js rely on', () => {
  const names = ['STAT_MIN', 'STAT_MAX', 'MOOD_COUNT', 'MAX_OFFLINE_MS', 'SAVE_VERSION', 'STAT_KEYS',
    'DECAY_PER_MINUTE', 'ACTIONS', 'SICK_AFTER_MS', 'RECOVER_THRESHOLD', 'SICK_MOOD_CAP',
    'STAGES', 'STAGE_AGE_MS', 'ADULT_FORMS', 'SICK_CARE_CAP', 'clampStat',
    'createPet', 'updateHealth', 'updateStage', 'applyDecay', 'getCooldownRemaining', 'canDoAction',
    'applyAction', 'getAverage', 'getAverageCare', 'getStageInfo', 'getMoodIndex', 'isSick',
    'serialize', 'deserialize']
  for (const n of names) assert.notStrictEqual(petState[n], undefined, 'petState missing ' + n)
})

test('storage exports every symbol App.js relies on', () => {
  const names = ['STORAGE_KEY', 'createMemoryStorage', 'createAsyncStorageAdapter',
    'createLocalStorageAdapter', 'loadPet', 'savePet']
  for (const n of names) assert.notStrictEqual(storage[n], undefined, 'storage missing ' + n)
})

test('MOOD_COUNT matches the number of faces in Components/Face.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'Components', 'Face.js'), 'utf8')
  const faceCount = (src.match(/citweb\.lethbridgecollege\.ab\.ca/g) || []).length
  assert.strictEqual(petState.MOOD_COUNT, faceCount)
})

// App.js is ESM + JSX and cannot be require()d here, so this guards the load/save race by source:
// actions must not run against the throwaway fresh pet while the saved pet is still loading.
test('App.js blocks actions until the saved pet has loaded', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8')
  const handlerAt = src.indexOf('const handleAction')
  assert.notStrictEqual(handlerAt, -1, 'App.js must define handleAction')
  const applyAt = src.indexOf('applyAction', handlerAt)
  assert.notStrictEqual(applyAt, -1, 'handleAction must call petState.applyAction')
  // The readiness check has to sit between the handler's opening and its applyAction call —
  // matching anywhere in the file would also match the `if (!ready) return undefined` effects.
  assert.ok(/if\s*\(\s*!ready\s*\)\s*return/.test(src.slice(handlerAt, applyAt)),
    'handleAction must bail out while !ready, or a tap during load is silently discarded')
  assert.ok(/disabled=\{\s*!ready\s*\}/.test(src),
    'ActionButtons must be passed disabled={!ready} so buttons dim until the load resolves')
})

test('App.js computes stageInfo and renders StageBadge under the mood label', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8')
  assert.ok(/getStageInfo/.test(src), 'App.js must compute stageInfo via petState.getStageInfo')
  assert.ok(/<StageBadge\b/.test(src), 'App.js must render <StageBadge>')
})

test('ActionButtons honours an explicit disabled prop as well as cooldowns', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'Components', 'ActionButtons.js'), 'utf8')
  assert.ok(/\{\s*actions\s*,\s*onPress\s*,\s*cooldowns\s*,\s*disabled\s*\}/.test(src),
    'ActionButtons must accept a disabled prop')
  assert.ok(/disabled=\{\s*blocked\s*\}/.test(src) && /const\s+blocked\s*=.*disabled.*cooling/.test(src),
    'each Pressable must be disabled when either the disabled prop or its cooldown is active')
})

test('createPet starts at 70/70/70', () => {
  const pet = petState.createPet(T0)
  assert.deepStrictEqual([pet.fullness, pet.energy, pet.fun], [70, 70, 70])
  assert.strictEqual(pet.updatedAt, T0)
})

test('createPet starts as Egg at age 0', () => {
  const pet = petState.createPet(T0)
  assert.strictEqual(pet.stage, 'egg')
  assert.strictEqual(pet.ageMs, 0)
  assert.strictEqual(pet.careSum, 0)
  assert.strictEqual(pet.adultForm, null)
  const info = petState.getStageInfo(pet)
  assert.strictEqual(info.stage, 'egg')
  assert.strictEqual(info.index, 0)
  assert.strictEqual(info.label, 'Egg')
  assert.strictEqual(info.nextStage, 'baby')
})

test('decay over 10 minutes', () => {
  const pet = petState.createPet(T0)
  const next = petState.applyDecay(pet, T0 + 10 * MIN)
  assert.strictEqual(next.fullness, 10)
  assert.strictEqual(next.energy, 30)
  assert.strictEqual(next.fun, 20)
  assert.strictEqual(next.updatedAt, T0 + 10 * MIN)
})

test('decay clamps at STAT_MIN', () => {
  const next = petState.applyDecay(petState.createPet(T0), T0 + 12 * MIN)
  assert.strictEqual(next.fullness, petState.STAT_MIN)
  for (const k of petState.STAT_KEYS) assert.ok(next[k] >= petState.STAT_MIN && next[k] <= petState.STAT_MAX)
})

test('now < updatedAt leaves stats untouched and resets updatedAt', () => {
  const pet = petState.createPet(T0)
  const next = petState.applyDecay(pet, T0 - 5 * MIN)
  assert.deepStrictEqual([next.fullness, next.energy, next.fun], [70, 70, 70])
  assert.strictEqual(next.updatedAt, T0 - 5 * MIN)
})

test('30-day gap equals 12-hour gap (MAX_OFFLINE_MS cap)', () => {
  const pet = petState.createPet(T0)
  const long = petState.applyDecay(pet, T0 + 30 * 24 * 3600e3)
  const capped = petState.applyDecay(pet, T0 + petState.MAX_OFFLINE_MS)
  for (const k of petState.STAT_KEYS) assert.strictEqual(long[k], capped[k])
})

test('30-day offline gap ages (ageMs/careSum/stage) identically to the 12h MAX_OFFLINE_MS cap', () => {
  const pet = petState.createPet(T0)
  const long = petState.applyDecay(pet, T0 + 30 * 24 * 3600e3)
  const capped = petState.applyDecay(pet, T0 + petState.MAX_OFFLINE_MS)
  assert.strictEqual(long.ageMs, capped.ageMs)
  assert.strictEqual(long.ageMs, petState.MAX_OFFLINE_MS)
  assert.strictEqual(long.careSum, capped.careSum)
  assert.strictEqual(long.stage, capped.stage)
  assert.strictEqual(long.adultForm, capped.adultForm)
})

test('updateStage: just-below and at each STAGE_AGE_MS boundary', () => {
  for (let i = 1; i < petState.STAGES.length; i++) {
    const stageName = petState.STAGES[i]
    const boundary = petState.STAGE_AGE_MS[stageName]
    const prevStage = petState.STAGES[i - 1]
    const below = petState.updateStage({ ...petState.createPet(T0), stage: prevStage, ageMs: boundary - 1 })
    assert.strictEqual(below.stage, prevStage, stageName + ': just below the boundary must not advance')
    const at = petState.updateStage({ ...petState.createPet(T0), stage: prevStage, ageMs: boundary })
    assert.strictEqual(at.stage, stageName, stageName + ': exactly at the boundary must advance')
  }
})

test('applyDecay stage transition: stepped ticks and one big jump agree at the baby boundary', () => {
  const base = petState.createPet(T0)
  const boundary = petState.STAGE_AGE_MS.baby
  const beforeAt = T0 + boundary - 5000
  const afterAt = T0 + boundary + 5000

  let stepped = base
  let now = T0
  while (now < beforeAt) {
    now += 1000
    stepped = petState.applyDecay(stepped, Math.min(now, beforeAt))
  }
  assert.strictEqual(stepped.stage, 'egg', 'stepped: still Egg 5s before the baby boundary')

  while (now < afterAt) {
    now += 1000
    stepped = petState.applyDecay(stepped, Math.min(now, afterAt))
  }
  assert.strictEqual(stepped.stage, 'baby', 'stepped: Baby 5s past the boundary')

  const jumpBefore = petState.applyDecay(base, beforeAt)
  const jumpAfter = petState.applyDecay(base, afterAt)
  assert.strictEqual(jumpBefore.stage, 'egg', 'jump: still Egg 5s before the boundary')
  assert.strictEqual(jumpAfter.stage, 'baby', 'jump: Baby 5s past the boundary')
  assert.strictEqual(stepped.ageMs, jumpAfter.ageMs, 'stepped and single-jump ageMs must agree')
})

test('stage never regresses, even when updateStage sees a stale/lower ageMs', () => {
  const advanced = { ...petState.createPet(T0), stage: 'teen', ageMs: petState.STAGE_AGE_MS.teen, adultForm: null }
  const result = petState.updateStage({ ...advanced, ageMs: 1000 })
  assert.strictEqual(result.stage, 'teen', 'updateStage must not move backwards from the current stage')
})

test('adult form is chosen from the long-run care average at the Teen->Adult transition', () => {
  const adultAge = petState.STAGE_AGE_MS.adult
  const makeTeen = (avgCare) => ({
    ...petState.createPet(T0), stage: 'teen', ageMs: adultAge, careSum: avgCare * adultAge, adultForm: null,
  })
  const radiant = petState.updateStage(makeTeen(80))
  assert.strictEqual(radiant.stage, 'adult')
  assert.strictEqual(radiant.adultForm, 'radiant')
  assert.strictEqual(petState.updateStage(makeTeen(70)).adultForm, 'radiant', 'exactly at the radiant threshold')

  const steady = petState.updateStage(makeTeen(55))
  assert.strictEqual(steady.adultForm, 'steady')
  assert.strictEqual(petState.updateStage(makeTeen(40)).adultForm, 'steady', 'exactly at the steady threshold')

  const scruffy = petState.updateStage(makeTeen(10))
  assert.strictEqual(scruffy.adultForm, 'scruffy')
  assert.strictEqual(petState.updateStage(makeTeen(0)).adultForm, 'scruffy', 'exactly at the scruffy threshold')
})

test('sick time is capped at SICK_CARE_CAP when accumulating careSum', () => {
  const sickPet = { ...petState.createPet(T0), fullness: 90, energy: 90, fun: 90, sick: true }
  const next = petState.applyDecay(sickPet, T0 + MIN)
  // Both the before/after samples get capped at SICK_CARE_CAP since sick === true, and stats stay
  // well above that cap over one minute, so the trapezoid average is exactly the cap.
  assert.strictEqual(next.careSum, petState.SICK_CARE_CAP * MIN)
})

test('adultForm stays locked once set, even after later neglect drags the average down', () => {
  const adultAge = petState.STAGE_AGE_MS.adult
  const atTransition = petState.updateStage({
    ...petState.createPet(T0), stage: 'teen', ageMs: adultAge, careSum: 80 * adultAge, adultForm: null,
  })
  assert.strictEqual(atTransition.stage, 'adult')
  assert.strictEqual(atTransition.adultForm, 'radiant')

  // Neglect for a long stretch afterwards (careSum barely grows -> average care crashes).
  // updateStage must leave adultForm alone because it was already set once.
  const neglected = petState.updateStage({
    ...atTransition, ageMs: atTransition.ageMs + 10000, careSum: atTransition.careSum,
  })
  assert.strictEqual(neglected.stage, 'adult')
  assert.strictEqual(neglected.adultForm, 'radiant', 'adultForm must not be recomputed once locked')
})

test('deserialize migrates an old v1 save with no evolution fields at all', () => {
  const raw = JSON.stringify({
    version: 1,
    pet: { fullness: 33, energy: 44, fun: 55, updatedAt: T0, lastActionAt: { feed: 1, play: 2, rest: 3 } },
  })
  const result = petState.deserialize(raw, T0 + 999)
  assert.strictEqual(result.fullness, 33)
  assert.strictEqual(result.energy, 44)
  assert.strictEqual(result.fun, 55)
  assert.strictEqual(result.ageMs, 0)
  assert.strictEqual(result.careSum, 0)
  assert.strictEqual(result.stage, 'egg')
  assert.strictEqual(result.adultForm, null)
})

test('deserialize coerces garbage evolution fields without a full reset', () => {
  const raw = JSON.stringify({
    version: 1,
    pet: {
      fullness: 60, energy: 61, fun: 62, updatedAt: T0,
      lastActionAt: { feed: 0, play: 0, rest: 0 },
      ageMs: 'lots', careSum: -5, stage: 'larva', adultForm: 'golden',
    },
  })
  const result = petState.deserialize(raw, T0 + 1)
  assert.strictEqual(result.fullness, 60, 'garbage evolution fields must not trigger a full reset')
  assert.strictEqual(result.energy, 61)
  assert.strictEqual(result.fun, 62)
  assert.strictEqual(result.ageMs, 0)
  assert.strictEqual(result.careSum, 0)
  assert.strictEqual(result.stage, 'egg')
  assert.strictEqual(result.adultForm, null)
})

test('deserialize reconciles an inconsistent stage/ageMs/adultForm combination', () => {
  // Stage claims "adult" already even though ageMs is still in egg territory (e.g. a corrupted or
  // hand-edited save). updateStage never regresses stage, so it stays adult; since adultForm was
  // never set, it gets computed now from whatever care average the (low) ageMs/careSum imply.
  const raw = JSON.stringify({
    version: 1,
    pet: {
      fullness: 50, energy: 50, fun: 50, updatedAt: T0,
      lastActionAt: { feed: 0, play: 0, rest: 0 },
      ageMs: 1000, careSum: 50 * 1000,
      stage: 'adult', adultForm: null,
    },
  })
  const result = petState.deserialize(raw, T0 + 1)
  assert.strictEqual(result.stage, 'adult', 'stage must never regress, even reconciling a stale/low ageMs')
  assert.strictEqual(result.adultForm, 'steady', 'adultForm must be computed once stage is adult and was unset')
})

test('deserialize drops a pre-set adultForm on a pet that is not adult yet', () => {
  const raw = JSON.stringify({
    version: 1,
    pet: {
      fullness: 10, energy: 10, fun: 10, updatedAt: T0,
      lastActionAt: { feed: 0, play: 0, rest: 0 },
      ageMs: 1000, careSum: 10 * 1000,
      stage: 'egg', adultForm: 'radiant',
    },
  })
  const result = petState.deserialize(raw, T0 + 1)
  assert.strictEqual(result.stage, 'egg')
  assert.strictEqual(result.adultForm, null, 'a non-adult must not carry a locked-in form')
})

test('new evolution fields survive a serialize -> deserialize round trip', () => {
  const pet = {
    ...petState.createPet(T0),
    updatedAt: T0 + 700000,
    ageMs: 700000, careSum: 42 * 700000, stage: 'child', adultForm: null,
  }
  assert.deepStrictEqual(petState.deserialize(petState.serialize(pet), T0), pet)
})

test('careSum clamp during deserialize caps an impossibly large garbage value', () => {
  const raw = JSON.stringify({
    version: 1,
    pet: {
      fullness: 50, energy: 50, fun: 50, updatedAt: T0,
      lastActionAt: { feed: 0, play: 0, rest: 0 },
      ageMs: 1000, careSum: 999999999, stage: 'egg', adultForm: null,
    },
  })
  const result = petState.deserialize(raw, T0 + 1)
  assert.ok(result.careSum <= 1000 * petState.STAT_MAX, 'careSum must be clamped to ageMs * STAT_MAX')
})

test('applyDecay and applyAction do not mutate their input', () => {
  const pet = petState.createPet(T0)
  const snapshot = JSON.stringify(pet)
  petState.applyDecay(pet, T0 + MIN)
  petState.applyAction(pet, 'feed', T0 + MIN)
  petState.updateStage(pet)
  petState.getStageInfo(pet)
  petState.getAverageCare(pet)
  assert.strictEqual(JSON.stringify(pet), snapshot)
})

test('each action applies its effects (after decay), clamped', () => {
  for (const id of Object.keys(petState.ACTIONS)) {
    const start = { ...petState.createPet(T0), fullness: 50, energy: 50, fun: 50 }
    const res = petState.applyAction(start, id, T0)
    assert.strictEqual(res.applied, true)
    const fx = petState.ACTIONS[id].effects
    for (const k of petState.STAT_KEYS) assert.strictEqual(res.pet[k], 50 + fx[k], id + ' ' + k)
    assert.strictEqual(res.pet.lastActionAt[id], T0)
  }
  const full = { ...petState.createPet(T0), fullness: 95 }
  assert.strictEqual(petState.applyAction(full, 'feed', T0).pet.fullness, petState.STAT_MAX)
})

test('cooldown blocks a repeat, then allows after expiry', () => {
  const first = petState.applyAction(petState.createPet(T0), 'feed', T0)
  const blocked = petState.applyAction(first.pet, 'feed', T0 + 5000)
  assert.strictEqual(blocked.applied, false)
  assert.strictEqual(blocked.reason, 'cooldown')
  assert.strictEqual(blocked.pet, first.pet)
  const check = petState.canDoAction(first.pet, 'feed', T0 + 5000)
  assert.deepStrictEqual(check, { allowed: false, reason: 'cooldown', remainingMs: 15000 })
  assert.strictEqual(petState.canDoAction(first.pet, 'play', T0 + 5000).allowed, true)
  const later = petState.applyAction(first.pet, 'feed', T0 + petState.ACTIONS.feed.cooldownMs)
  assert.strictEqual(later.applied, true)
})

test('future lastActionAt cannot lock an action for longer than its cooldown', () => {
  const pet = { ...petState.createPet(T0), lastActionAt: { feed: T0 + 10 * MIN, play: 0, rest: 0 } }
  assert.ok(petState.getCooldownRemaining(pet, 'feed', T0) <= petState.ACTIONS.feed.cooldownMs)
})

test('unknown action is rejected', () => {
  const pet = petState.createPet(T0)
  const res = petState.applyAction(pet, 'dance', T0)
  assert.deepStrictEqual([res.applied, res.reason, res.pet], [false, 'unknown-action', pet])
  assert.strictEqual(petState.canDoAction(pet, 'toString', T0).reason, 'unknown-action')
})

test('getMoodIndex at 0 / 50 / 100 and always in range', () => {
  const at = v => ({ ...petState.createPet(T0), fullness: v, energy: v, fun: v })
  assert.strictEqual(petState.getMoodIndex(at(0)), 0)
  assert.strictEqual(petState.getMoodIndex(at(50)), 2)
  assert.strictEqual(petState.getMoodIndex(at(100)), petState.MOOD_COUNT - 1)
  assert.strictEqual(petState.getAverage(at(40)), 40)
})

test('sick after SICK_AFTER_MS at 0, not before — stepped ticks and one big jump agree', () => {
  const base = {
    fullness: 6, energy: 100, fun: 100, updatedAt: T0,
    lastActionAt: { feed: 0, play: 0, rest: 0 }, zeroSince: null, sick: false,
  }
  // fullness decays 6/min -> crosses 0 at T0+60000. Sick threshold is T0+60000+SICK_AFTER_MS = T0+180000.
  const beforeAt = T0 + 180000 - 5000
  const afterAt = T0 + 180000 + 5000

  let stepped = base
  let now = T0
  while (now < beforeAt) {
    now += 1000
    stepped = petState.applyDecay(stepped, Math.min(now, beforeAt))
  }
  assert.strictEqual(stepped.updatedAt, beforeAt)
  assert.strictEqual(stepped.sick, false, 'stepped: not sick 5s before threshold')

  while (now < afterAt) {
    now += 1000
    stepped = petState.applyDecay(stepped, Math.min(now, afterAt))
  }
  assert.strictEqual(stepped.updatedAt, afterAt)
  assert.strictEqual(stepped.sick, true, 'stepped: sick 5s past threshold')

  const jumpBefore = petState.applyDecay(base, beforeAt)
  const jumpAfter = petState.applyDecay(base, afterAt)
  assert.strictEqual(jumpBefore.sick, false, 'jump: not sick 5s before threshold')
  assert.strictEqual(jumpAfter.sick, true, 'jump: sick 5s past threshold')
})

test('applyDecay computes the exact offline zero-crossing timestamp, not "now" or the gap start', () => {
  const base = {
    fullness: 6, energy: 100, fun: 100, updatedAt: T0,
    lastActionAt: { feed: 0, play: 0, rest: 0 }, zeroSince: null, sick: false,
  }
  // fullness (rate 6/min) crosses 0 at exactly T0+60000, regardless of how far past that the
  // single offline gap runs.
  const next = petState.applyDecay(base, T0 + 180000)
  assert.strictEqual(next.fullness, 0)
  assert.strictEqual(next.zeroSince, T0 + 60000)
  assert.notStrictEqual(next.zeroSince, T0)
  assert.notStrictEqual(next.zeroSince, T0 + 180000)
  assert.strictEqual(next.sick, true)
})

test('sickness is sticky: an action lifting the zeroed stat off 0 clears zeroSince but not sick', () => {
  const sickPet = {
    fullness: 0, energy: 50, fun: 50, updatedAt: T0,
    lastActionAt: { feed: 0, play: 0, rest: 0 }, zeroSince: T0 - 200000, sick: true,
  }
  const res = petState.applyAction(sickPet, 'feed', T0)
  assert.strictEqual(res.applied, true)
  assert.ok(res.pet.fullness > 0, 'feed must lift fullness off 0')
  assert.strictEqual(res.pet.zeroSince, null, 'zeroSince clears once no stat is at 0')
  assert.strictEqual(res.pet.sick, true, 'sick stays true even though zeroSince cleared')
})

test('recovery only clears sick once ALL stats are >= RECOVER_THRESHOLD', () => {
  const partial = {
    fullness: 50, energy: 50, fun: 39, updatedAt: T0,
    lastActionAt: { feed: 0, play: 0, rest: 0 }, zeroSince: null, sick: true,
  }
  const stillSick = petState.updateHealth(partial, T0 + 1000)
  assert.strictEqual(stillSick.sick, true, 'one stat below RECOVER_THRESHOLD keeps it sick')

  const fullyRecovered = { ...partial, fun: petState.RECOVER_THRESHOLD }
  const cured = petState.updateHealth(fullyRecovered, T0 + 1000)
  assert.strictEqual(cured.sick, false, 'every stat at/above RECOVER_THRESHOLD clears sick')
})

test('getMoodIndex is capped at SICK_MOOD_CAP while sick, unaffected otherwise', () => {
  const maxedSick = { ...petState.createPet(T0), fullness: 100, energy: 100, fun: 100, sick: true }
  assert.strictEqual(petState.getMoodIndex(maxedSick), petState.SICK_MOOD_CAP)
  const maxedHealthy = { ...maxedSick, sick: false }
  assert.strictEqual(petState.getMoodIndex(maxedHealthy), petState.MOOD_COUNT - 1)
  assert.strictEqual(petState.isSick(maxedSick), true)
  assert.strictEqual(petState.isSick(maxedHealthy), false)
})

test('deserialize migrates an old save with no sick/zeroSince fields at all', () => {
  const raw = JSON.stringify({
    version: 1,
    pet: { fullness: 33, energy: 44, fun: 55, updatedAt: T0, lastActionAt: { feed: 1, play: 2, rest: 3 } },
  })
  const result = petState.deserialize(raw, T0 + 999)
  assert.strictEqual(result.fullness, 33)
  assert.strictEqual(result.energy, 44)
  assert.strictEqual(result.fun, 55)
  assert.strictEqual(result.updatedAt, T0)
  assert.deepStrictEqual(result.lastActionAt, { feed: 1, play: 2, rest: 3 })
  assert.strictEqual(result.sick, false)
  assert.strictEqual(result.zeroSince, null)
})

test('deserialize coerces garbage sick/zeroSince values without a full reset', () => {
  const rawGarbage = JSON.stringify({
    version: 1,
    pet: {
      fullness: 60, energy: 61, fun: 62, updatedAt: T0,
      lastActionAt: { feed: 0, play: 0, rest: 0 }, sick: 'yes', zeroSince: 'not a number',
    },
  })
  const resGarbage = petState.deserialize(rawGarbage, T0 + 1)
  assert.strictEqual(resGarbage.fullness, 60, 'garbage new fields must not trigger a full reset')
  assert.strictEqual(resGarbage.sick, false)
  assert.strictEqual(resGarbage.zeroSince, null)

  const rawFuture = JSON.stringify({
    version: 1,
    pet: {
      fullness: 70, energy: 70, fun: 70, updatedAt: T0,
      lastActionAt: { feed: 0, play: 0, rest: 0 }, zeroSince: T0 + 999999,
    },
  })
  const resFuture = petState.deserialize(rawFuture, T0 + 1)
  assert.strictEqual(resFuture.updatedAt, T0, 'sanity: not the fresh-pet fallback')
  assert.strictEqual(resFuture.zeroSince, T0, 'a future zeroSince is clamped down to updatedAt')
})

test('serialize -> deserialize round-trips sick:true and a non-null zeroSince exactly', () => {
  // Evolution fields added for the Egg->Adult feature: this pet never ran through applyDecay, so
  // it carries the same ageMs:0/careSum:0/stage:'egg'/adultForm:null defaults createPet would give it.
  const pet = {
    fullness: 20, energy: 60, fun: 80, updatedAt: T0 + 50000,
    lastActionAt: { feed: 0, play: 0, rest: 0 }, zeroSince: T0 + 12345, sick: true,
    ageMs: 0, careSum: 0, stage: 'egg', adultForm: null,
  }
  assert.deepStrictEqual(petState.deserialize(petState.serialize(pet), T0), pet)
})

test('serialize -> deserialize round-trips', () => {
  const pet = petState.applyAction(petState.createPet(T0), 'play', T0 + 1000).pet
  assert.deepStrictEqual(petState.deserialize(petState.serialize(pet), T0 + 5000), pet)
})

test('deserialize falls back to a fresh pet on bad input', () => {
  const fresh = petState.createPet(T0)
  assert.deepStrictEqual(petState.deserialize(null, T0), fresh)
  assert.deepStrictEqual(petState.deserialize('{', T0), fresh)
  assert.deepStrictEqual(petState.deserialize('{"version":99,"pet":{}}', T0), fresh)
  const good = JSON.parse(petState.serialize(fresh))
  good.pet.fullness = NaN
  assert.deepStrictEqual(petState.deserialize(JSON.stringify(good), T0), fresh)
  good.pet.fullness = 'lots'
  assert.deepStrictEqual(petState.deserialize(JSON.stringify(good), T0), fresh)
  delete good.pet.fullness
  assert.deepStrictEqual(petState.deserialize(JSON.stringify(good), T0), fresh)
})

test('loadPet/savePet round-trip through createMemoryStorage', async () => {
  const store = storage.createMemoryStorage()
  const pet = petState.applyAction(petState.createPet(T0), 'rest', T0).pet
  assert.deepStrictEqual(await storage.savePet(store, pet, petState), { ok: true })
  assert.deepStrictEqual(await storage.loadPet(store, T0 + 1, petState), pet)
  assert.deepStrictEqual(await storage.loadPet(storage.createMemoryStorage(), T0, petState), petState.createPet(T0))
})

test('savePet returns { ok: false } and loadPet returns a fresh pet on a throwing adapter', async () => {
  const bad = {
    getItem: async () => { throw new Error('boom') },
    setItem: async () => { throw new Error('boom') },
    removeItem: async () => { throw new Error('boom') },
  }
  assert.deepStrictEqual(await storage.savePet(bad, petState.createPet(T0), petState), { ok: false })
  assert.deepStrictEqual(await storage.loadPet(bad, T0, petState), petState.createPet(T0))
})

test('createAsyncStorageAdapter delegates to the injected module', async () => {
  const calls = []
  const adapter = storage.createAsyncStorageAdapter({
    getItem: async k => { calls.push(['get', k]); return 'v' },
    setItem: async (k, v) => { calls.push(['set', k, v]) },
    removeItem: async k => { calls.push(['remove', k]) },
  })
  assert.strictEqual(await adapter.getItem('a'), 'v')
  await adapter.setItem('a', 'b')
  await adapter.removeItem('a')
  assert.deepStrictEqual(calls, [['get', 'a'], ['set', 'a', 'b'], ['remove', 'a']])
})

test('createLocalStorageAdapter wraps sync methods and round-trips a pet', async () => {
  const backing = new Map()
  const fakeLs = {
    getItem: k => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => { backing.set(k, v) },
    removeItem: k => { backing.delete(k) },
  }
  const adapter = storage.createLocalStorageAdapter(fakeLs)
  assert.strictEqual(await adapter.getItem('x'), null)
  await adapter.setItem('x', '1')
  assert.strictEqual(await adapter.getItem('x'), '1')
  await adapter.removeItem('x')
  assert.strictEqual(await adapter.getItem('x'), null)
  const pet = petState.applyAction(petState.createPet(T0), 'feed', T0).pet
  assert.deepStrictEqual(await storage.savePet(adapter, pet, petState), { ok: true })
  assert.ok(backing.has(storage.STORAGE_KEY))
  assert.deepStrictEqual(await storage.loadPet(adapter, T0, petState), pet)
})

test('createLocalStorageAdapter with a throwing localStorage never crashes load/save', async () => {
  const throwing = {
    getItem: () => { throw new Error('SecurityError') },
    setItem: () => { throw new Error('QuotaExceededError') },
    removeItem: () => { throw new Error('SecurityError') },
  }
  const adapter = storage.createLocalStorageAdapter(throwing)
  await assert.rejects(adapter.getItem('x'))
  assert.deepStrictEqual(await storage.savePet(adapter, petState.createPet(T0), petState), { ok: false })
  assert.deepStrictEqual(await storage.loadPet(adapter, T0, petState), petState.createPet(T0))
})

async function run() {
  let failed = 0
  for (const t of tests) {
    try {
      await t.fn()
      console.log('ok   - ' + t.name)
    } catch (e) {
      failed++
      console.log('FAIL - ' + t.name + '\n       ' + (e && e.message))
    }
  }
  console.log('\n' + (tests.length - failed) + '/' + tests.length + ' passed')
  process.exit(failed ? 1 : 0)
}
run()
