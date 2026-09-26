import { StyleSheet, Text, View } from "react-native";

export default function SickBanner({ visible, threshold }) {
    if (!visible) return null
    return(
        <View style={styles.banner}>
            <Text style={styles.label}>Sick!</Text>
            <Text style={styles.hint}>Raise every stat to {threshold}+ to recover</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    banner: {
        alignItems: 'center',
        marginBottom: 8,
    },
    label: {
        color: '#e53935',
        fontSize: 16,
        fontWeight: 'bold',
    },
    hint: {
        fontSize: 12,
        color: '#e53935',
    },
})
