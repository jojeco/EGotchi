import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function AchievementsPanel({ list, progress, toast }) {
    const [expanded, setExpanded] = useState(false)
    const rows = list || []
    const unlocked = (progress && progress.unlocked) || 0
    const total = (progress && progress.total) || rows.length

    return (
        <View style={styles.wrap}>
            <Pressable onPress={() => setExpanded(e => !e)} style={styles.header}>
                <Text style={styles.headerText}>Achievements {unlocked}/{total}</Text>
            </Pressable>
            {toast != null && (
                <Text style={styles.toast}>Unlocked: {toast}!</Text>
            )}
            {expanded && (
                <View style={styles.list}>
                    {rows.map(item => (
                        <View key={item.id} style={styles.row}>
                            <Text style={[styles.rowLabel, !item.unlocked && styles.locked]}>
                                {item.unlocked ? '✓ ' : '· '}{item.label}
                            </Text>
                            <Text style={[styles.rowDescription, !item.unlocked && styles.locked]}>
                                {item.description}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        marginTop: 12,
    },
    header: {
        paddingVertical: 6,
        paddingHorizontal: 12,
    },
    headerText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },
    toast: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#4caf50',
        marginTop: 2,
    },
    list: {
        marginTop: 6,
        width: '100%',
        paddingHorizontal: 16,
    },
    row: {
        marginBottom: 6,
        alignItems: 'center',
    },
    rowLabel: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#333',
    },
    rowDescription: {
        fontSize: 11,
        color: '#666',
    },
    locked: {
        color: '#aaa',
    },
})
