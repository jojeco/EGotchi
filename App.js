import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Face, { FACE_LABELS } from './Components/Face';
import StatBar from './Components/StatBar';
import ActionButtons from './Components/ActionButtons';
import petState from './game/petState';
import storage from './game/storage';

const TICK_INTERVAL_MS = 1000;
const SAVE_INTERVAL_MS = 10000;

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

export default function App() {
  const [pet, setPet] = useState(() => petState.createPet())
  const [ready, setReady] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const petRef = useRef(pet)

  useEffect(() => {
    let cancelled = false
    storage.loadPet(store, Date.now(), petState).then(loaded => {
      if (cancelled) return
      const current = Date.now()
      petRef.current = petState.applyDecay(loaded, current)
      setPet(petRef.current)
      setNow(current)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready) return undefined
    const id = setInterval(() => {
      const current = Date.now()
      petRef.current = petState.applyDecay(petRef.current, current)
      setPet(petRef.current)
      setNow(current)
    }, TICK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [ready])

  useEffect(() => {
    if (!ready) return undefined
    const id = setInterval(() => storage.savePet(store, petRef.current, petState), SAVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [ready])

  const handleAction = (id) => {
    // Until the saved pet has loaded, petRef still holds the throwaway fresh pet: acting on it
    // would be silently discarded by the in-flight load (and would overwrite the save first).
    if (!ready) return
    const current = Date.now()
    const result = petState.applyAction(petRef.current, id, current)
    if (!result.applied) return
    petRef.current = result.pet
    setPet(result.pet)
    setNow(current)
    storage.savePet(store, result.pet, petState)
  }

  const cooldowns = {}
  for (const action of ACTION_LIST) {
    cooldowns[action.id] = petState.getCooldownRemaining(pet, action.id, now)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.mood}>{FACE_LABELS[petState.getMoodIndex(pet)]}</Text>
      <Face whichFace={petState.getMoodIndex(pet)}/>
      <View style={styles.stats}>
        <StatBar label='Fullness' value={pet.fullness} color='#ff9800'/>
        <StatBar label='Energy' value={pet.energy} color='#4caf50'/>
        <StatBar label='Fun' value={pet.fun} color='#e91e63'/>
      </View>
      <ActionButtons actions={ACTION_LIST} onPress={handleAction} cooldowns={cooldowns} disabled={!ready}/>
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
