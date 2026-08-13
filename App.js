import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Button } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Face from './Components/Face';

const STORAGE_KEY = '@egotchi_face';

const STATUS_TEXT = {
  1: 'Very Sad',
  2: 'Neutral',
  3: 'Happy',
  4: 'Very Happy! 🎉',
};

export default function App() {
  const [currentFace, setCurrentFace] = useState(2);
  const [isDead, setIsDead] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load persisted face on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val !== null) {
        const saved = parseInt(val, 10);
        if (saved === 0) {
          setCurrentFace(0);
          setIsDead(true);
        } else {
          setCurrentFace(saved);
        }
      }
      setLoaded(true);
    });
  }, []);

  // Persist currentFace whenever it changes (skip until initial load is done)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, String(currentFace));
  }, [currentFace, loaded]);

  // Trigger game over when happiness hits 0
  useEffect(() => {
    if (currentFace === 0) {
      setIsDead(true);
    }
  }, [currentFace]);

  // Tick every 5 seconds while alive and loaded — interval is stable, no chaining
  useEffect(() => {
    if (isDead || !loaded) return;
    const interval = setInterval(() => {
      setCurrentFace(f => Math.max(0, f - 1));
    }, 5000);
    return () => clearInterval(interval);
  }, [isDead, loaded]);

  const getHappy = () => {
    if (currentFace < 4) {
      setCurrentFace(f => f + 1);
    }
  };

  const startOver = () => {
    setCurrentFace(2);
    setIsDead(false);
  };

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (isDead) {
    return (
      <View style={styles.container}>
        <Face whichFace={0} />
        <Text style={styles.gameOverText}>Your pet has passed away 😢</Text>
        <Button title="Start Over" onPress={startOver} />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.statusText}>{STATUS_TEXT[currentFace]}</Text>
      <Face whichFace={currentFace} />
      <Button title="Pet Me! 🐾" onPress={getHappy} />
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
  statusText: {
    fontSize: 20,
    marginBottom: 16,
    fontWeight: '600',
  },
  gameOverText: {
    fontSize: 22,
    marginVertical: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
