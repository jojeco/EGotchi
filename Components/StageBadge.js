import { StyleSheet, Text, View } from "react-native";

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

// Formats a millisecond duration as "3m 12s" (mm:ss-ish, but with unit letters instead of a colon).
function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`
}

export default function StageBadge({ stageInfo, justEvolved }) {
    if (!stageInfo) return null
    const { label, nextStage, msToNext } = stageInfo
    return(
        <View style={styles.wrap}>
            <Text style={styles.label}>{label}</Text>
            {nextStage !== null && msToNext !== null && (
                <Text style={styles.next}>Next: {capitalize(nextStage)} in {formatDuration(msToNext)}</Text>
            )}
            {justEvolved && (
                <Text style={styles.evolved}>Evolved!</Text>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        marginBottom: 8,
    },
    label: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    next: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    evolved: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#4caf50',
        marginTop: 2,
    },
})
