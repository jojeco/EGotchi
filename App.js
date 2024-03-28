import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Button, Image } from 'react-native';
import Face from './Components/Face';


export default function App() {
  const[currentFace, setCurrentFace] = useState(2)
  
  const randomFace = (numFaces) => {
    return Math.floor(Math.random() * numFaces)
  }

  useEffect(() => {setTimeout(()=>  tick(), 5000)}, [currentFace])
  
  const tick = () => {
    if (currentFace > 0){
    setCurrentFace(f => f-1)
  }
}  useEffect(() => {setTimeout(()=>  tick(), 5000)}, [currentFace])
  
const tick = () => {
  if (currentFace > 0){
  setCurrentFace(f => f-1)
}
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