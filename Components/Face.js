import { Image, View } from "react-native";

const faces = [
    {uri:'https://citweb.lethbridgecollege.ab.ca/MobileApp/mad-face.png'},
    {uri:'https://citweb.lethbridgecollege.ab.ca/MobileApp/sad-face.png'},
    {uri:'https://citweb.lethbridgecollege.ab.ca/MobileApp/meh-face.png'},
    {uri:'https://citweb.lethbridgecollege.ab.ca/MobileApp/okay-face.png'},
    {uri:'https://citweb.lethbridgecollege.ab.ca/MobileApp/happy-face.png'},
]

export const FACE_COUNT = faces.length
export const FACE_LABELS = ['Miserable', 'Sad', 'Meh', 'Okay', 'Happy']

export default function Face(props) {
    const whichFace = Math.min(Math.max(props.whichFace, 0), FACE_COUNT - 1)
    return(
        <Image
        style={{height:200, width: 200, resizeMode: 'center'}}
        source={faces[whichFace]}
        />
    )
}