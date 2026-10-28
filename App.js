import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import Face, { FACE_LABELS } from './Components/Face';
import StatBar from './Components/StatBar';
import ActionButtons from './Components/ActionButtons';
import SickBanner from './Components/SickBanner';
import StageBadge from './Components/StageBadge';
import AchievementsPanel from './Components/AchievementsPanel';
import EventLogPanel from './Components/EventLogPanel';
import petState from './game/petState';
import storage from './game/storage';
import achievements from './game/achievements';
import eventLog from './game/eventLog';

const TICK_INTERVAL_MS = 1000;
const SAVE_INTERVAL_MS = 10000;
const EVOLVE_BANNER_MS = 3000;
const ACHIEVEMENT_TOAST_MS = 3000;

// Real persistence on Expo web (localStorage); native falls back to memory until a backend is wired.
const getLocalStorage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch (e) {
    return null
  }
}
const localStore = getLocalStorage()
const store = localStore
  ? storage.createLocalStorageAdapter(localStore)
  : storage.createMemoryStorage()

const ACTION_LIST = Object.values(petState.ACTIONS)
const ACHIEVEMENT_LABELS = achievements.ACHIEVEMENTS.reduce((acc, a) => {
  acc[a.id] = a.label
  return acc
}, {})

export default function App() {
  const [pet, setPet] = useState(() => petState.createPet())
  const [ready, setReady] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [justEvolved, setJustEvolved] = useState(false)
  const [achievementToast, setAchievementToast] = useState(null)
  const petRef = useRef(pet)
  const stageIndexRef = useRef(0)
  const evolveTimeoutRef = useRef(null)
  const achievementToastTimeoutRef = useRef(null)

  // Fires the "Evolved!" banner whenever a tick/action pushes the stage index forward, and
  // clears it again after EVOLVE_BANNER_MS. Guarded by stageIndexRef so the initial load (seeded
  // separately below) never triggers it.
  const noteStage = (nextPet) => {
    const index = petState.getStageInfo(nextPet).index
    if (index > stageIndexRef.current) {
      setJustEvolved(true)
      if (evolveTimeoutRef.current) clearTimeout(evolveTimeoutRef.current)
      evolveTimeoutRef.current = setTimeout(() => setJustEvolved(false), EVOLVE_BANNER_MS)
    }
    stageIndexRef.current = index
  }

  // Runs evaluateAchievements on `current`, updates petRef, and (unless `silent`) fires an
  // "Unlocked!" toast cleared after ACHIEVEMENT_TOAST_MS, mirroring noteStage/evolveTimeoutRef
  // above. `silent` is used on initial load so an old save backfilling several unlocks at once
  // doesn't spam toasts. Returns the evaluated pet so callers can save/render it.
  const noteAchievements = (current, atTime, silent) => {
    const result = achievements.evaluateAchievements(current, atTime)
    petRef.current = result.pet
    if (!silent && result.newlyUnlocked.length > 0) {
      const labels = result.newlyUnlocked
        .map(id => achievements.ACHIEVEMENTS.find(a => a.id === id))
        .filter(Boolean)
        .map(a => a.label)
        .join(', ')
      setAchievementToast(labels)
      if (achievementToastTimeoutRef.current) clearTimeout(achievementToastTimeoutRef.current)
      achievementToastTimeoutRef.current = setTimeout(() => setAchievementToast(null), ACHIEVEMENT_TOAST_MS)
    }
    return result.pet
  }

  useEffect(() => {
    return () => {
      if (evolveTimeoutRef.current) clearTimeout(evolveTimeoutRef.current)
      if (achievementToastTimeoutRef.current) clearTimeout(achievementToastTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    storage.loadPet(store, Date.now(), petState).then(loaded => {
      if (cancelled) return
      const current = Date.now()
      const decayed = petState.applyDecay(loaded, current)
      petRef.current = decayed
      // Seed from the loaded pet's stage (not the throwaway fresh pet's), so a save that's
      // already past Egg doesn't fire a bogus evolution banner on first render.
      stageIndexRef.current = petState.getStageInfo(decayed).index
      // Silent: an old save may already satisfy several achievements that didn't exist yet when
      // it was written, and those shouldn't all fire toasts the instant the app opens.
      const evaluated = noteAchievements(decayed, current, true)
      // Diffed against the pre-decay load so sickness, evolution and backfilled unlocks that
      // happened offline show up in the log too.
      const recorded = eventLog.recordTransition(loaded, evaluated, current)
      petRef.current = recorded
      setPet(recorded)
      setNow(current)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready) return undefined
    const id = setInterval(() => {
      const current = Date.now()
      const prev = petRef.current
      const decayed = petState.applyDecay(prev, current)
      petRef.current = decayed
      noteStage(decayed)
      const evaluated = noteAchievements(decayed, current, false)
      // Must overwrite petRef.current with the logged pet, or the periodic save below would
      // silently erase this event with the stale (pre-log) state.
      const recorded = eventLog.recordTransition(prev, evaluated, current)
      petRef.current = recorded
      setPet(recorded)
      setNow(current)
    }, TICK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [ready])

  useEffect(() => {
    if (!ready) return undefined
    const id = setInterval(() => storage.savePet(store, petRef.current, petState), SAVE_INTERVAL_MS)
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState !== 'active') {
        storage.savePet(store, petRef.current, petState)
      }
    })
    return () => {
      clearInterval(id)
      sub.remove()
      storage.savePet(store, petRef.current, petState)
    }
  }, [ready])

  const handleAction = (id) => {
    // Until the saved pet has loaded, petRef still holds the throwaway fresh pet: acting on it
    // would be silently discarded by the in-flight load (and would overwrite the save first).
    if (!ready) return
    const current = Date.now()
    const prev = petRef.current
    const result = petState.applyAction(prev, id, current)
    if (!result.applied) return
    petRef.current = result.pet
    noteStage(petRef.current)
    const evaluated = noteAchievements(petRef.current, current, false)
    // Must overwrite petRef.current with the logged pet, or the periodic save would silently
    // erase this event with the stale (pre-log) state.
    const recorded = eventLog.recordTransition(prev, evaluated, current)
    petRef.current = recorded
    setPet(recorded)
    setNow(current)
    storage.savePet(store, recorded, petState)
  }

  const cooldowns = {}
  for (const action of ACTION_LIST) {
    cooldowns[action.id] = petState.getCooldownRemaining(pet, action.id, now)
  }

  const stageInfo = petState.getStageInfo(pet)
  const achievementList = achievements.getAchievementList(pet)
  const achievementProgress = achievements.getProgress(pet)

  return (
    <View style={styles.container}>
      <Text style={styles.mood}>{FACE_LABELS[petState.getMoodIndex(pet)]}</Text>
      <StageBadge stageInfo={stageInfo} justEvolved={justEvolved}/>
      <SickBanner visible={petState.isSick(pet)} threshold={petState.RECOVER_THRESHOLD}/>
      <Face whichFace={petState.getMoodIndex(pet)}/>
      <View style={styles.stats}>
        <StatBar label='Fullness' value={pet.fullness} color='#ff9800'/>
        <StatBar label='Energy' value={pet.energy} color='#4caf50'/>
        <StatBar label='Fun' value={pet.fun} color='#e91e63'/>
      </View>
      <ActionButtons actions={ACTION_LIST} onPress={handleAction} cooldowns={cooldowns} disabled={!ready}/>
      <AchievementsPanel list={achievementList} progress={achievementProgress} toast={achievementToast}/>
      <EventLogPanel events={eventLog.getRecentEvents(pet)} now={now} achievementLabels={ACHIEVEMENT_LABELS}/>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mood: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  stats: {
    marginTop: 12,
  },
});
