import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Button } from 'react-native';
import Face, { FACE_COUNT, FACE_LABELS } from './Components/Face';

const DECAY_INTERVAL_MS = 5000;

export default function App() {
  const[currentFace, setCurrentFace] = useState(2)

  useEffect(() => {
    const id = setInterval(() => tick(), DECAY_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const tick = () => {
    setCurrentFace(f => (f > 0 ? f - 1 : f))
  }

const getHappy = () => {
  setCurrentFace(f => (f < FACE_COUNT - 1 ? f + 1 : f))
}

  return (
    <View style={styles.container}>
      <Text style={styles.mood}>{FACE_LABELS[currentFace]}</Text>
      <Face whichFace={currentFace}/>
      <Button
      title='Pet'
      onPress={getHappy}
      />
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
});