import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Button } from 'react-native';
import Face from './Components/Face';

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
  if(currentFace < 4) {
    setCurrentFace(f => f +1)
  }
}

  return (
    <View style={styles.container}>
      <Text>This is an app</Text>
      <Face whichFace={currentFace}/>
      <Button 
      title='Click me Please'
      onPress={() => {getHappy()}}
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
});