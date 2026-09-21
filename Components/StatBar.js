import { StyleSheet, Text, View } from "react-native";

export default function StatBar({ label, value, color }) {
    const clamped = Math.round(Math.min(Math.max(Number(value) || 0, 0), 100))
    return(
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.track}>
                <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: color }]} />
            </View>
            <Text style={styles.value}>{clamped}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 4,
    },
    label: {
        width: 80,
        fontSize: 14,
    },
    track: {
        width: 160,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#ddd',
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
    },
    value: {
        width: 36,
        textAlign: 'right',
        fontSize: 14,
    },
})
