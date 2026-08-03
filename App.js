import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Button } from 'react-native';
import Face from './Components/Face';

export default function App() {
  const [currentFace, setCurrentFace] = useState(2);

  useEffect(() => {
    const id = setTimeout(() => tick(), 5000);
    return () => clearTimeout(id);
  }, [currentFace]);

  const tick = () => {
    if (currentFace > 0) {
      setCurrentFace(f => f - 1);
    }
  };

  const getHappy = () => {
    if (currentFace < 4) {
      setCurrentFace(f => f + 1);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>EGotchi</Text>
      <Face whichFace={currentFace} />
      <Button
        title='Pet'
        onPress={() => { getHappy(); }}
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
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 20,
  },
});
