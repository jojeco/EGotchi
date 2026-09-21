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
    'DECAY_PER_MINUTE', 'ACTIONS', 'clampStat', 'createPet', 'applyDecay', 'getCooldownRemaining',
    'canDoAction', 'applyAction', 'getAverage', 'getMoodIndex', 'serialize', 'deserialize']
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

test('applyDecay and applyAction do not mutate their input', () => {
  const pet = petState.createPet(T0)
  const snapshot = JSON.stringify(pet)
  petState.applyDecay(pet, T0 + MIN)
  petState.applyAction(pet, 'feed', T0 + MIN)
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
