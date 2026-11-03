// Injectable persistence adapters. CommonJS, no imports: callers pass in the real storage backend,
// and loadPet/savePet take the petState module as an explicit `codec` argument (needs
// createPet/deserialize/serialize) so this file stays free of require/import statements.
'use strict'

const STORAGE_KEY = 'egotchi:pet:v1'

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    async getItem(k) { return data.has(k) ? data.get(k) : null },
    async setItem(k, v) { data.set(k, String(v)) },
    async removeItem(k) { data.delete(k) },
  }
}

// Wraps an injected AsyncStorage-like module (getItem/setItem/removeItem returning promises).
function createAsyncStorageAdapter(asyncStorageModule) {
  return {
    getItem: k => asyncStorageModule.getItem(k),
    setItem: (k, v) => asyncStorageModule.setItem(k, v),
    removeItem: k => asyncStorageModule.removeItem(k),
  }
}

// Wraps an injected localStorage-like object (sync methods) in the same async shape.
function createLocalStorageAdapter(ls) {
  return {
    async getItem(k) { return ls.getItem(k) },
    async setItem(k, v) { ls.setItem(k, v) },
    async removeItem(k) { ls.removeItem(k) },
  }
}

// Unwraps ESM-interop default exports (e.g. `require('...async-storage').default`).
function unwrapModule(mod) {
  return mod && (mod.default || mod)
}

// True when `candidate` exposes getItem/setItem/removeItem as functions.
function isUsableStorage(candidate) {
  return !!candidate &&
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function'
}

// Picks the best available persistence backend: localStorage (web) first, then an injected
// AsyncStorage module (native), then an in-memory fallback so the app never crashes without one.
// Returns { kind, store } so callers/tests can tell which backend was chosen.
function pickStorage({ localStorage, asyncStorage } = {}) {
  const ls = unwrapModule(localStorage)
  if (isUsableStorage(ls)) {
    return { kind: 'local', store: createLocalStorageAdapter(ls) }
  }
  const as = unwrapModule(asyncStorage)
  if (isUsableStorage(as)) {
    return { kind: 'async', store: createAsyncStorageAdapter(as) }
  }
  return { kind: 'memory', store: createMemoryStorage() }
}

// Never throws: any storage or codec failure yields a fresh pet.
async function loadPet(storage, now, codec) {
  try {
    return codec.deserialize(await storage.getItem(STORAGE_KEY), now)
  } catch (e) {
    return codec.createPet(now)
  }
}

// Never throws: resolves { ok: false } when the adapter (or serialization) fails.
async function savePet(storage, pet, codec) {
  try {
    await storage.setItem(STORAGE_KEY, codec.serialize(pet))
    return { ok: true }
  } catch (e) {
    return { ok: false }
  }
}

module.exports = {
  STORAGE_KEY,
  createMemoryStorage,
  createAsyncStorageAdapter,
  createLocalStorageAdapter,
  pickStorage,
  loadPet,
  savePet,
}
