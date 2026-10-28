import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import eventLog from "../game/eventLog";

export default function EventLogPanel({ events, now, achievementLabels }) {
    const [expanded, setExpanded] = useState(false)
    const all = events || []
    const rows = all.slice(0, 10)

    return (
        <View style={styles.wrap}>
            <Pressable onPress={() => setExpanded(e => !e)} style={styles.header}>
                <Text style={styles.headerText}>Recent activity ({all.length})</Text>
            </Pressable>
            {expanded && (
                <View style={styles.list}>
                    {rows.length === 0 && (
                        <Text style={styles.empty}>Nothing yet. Try feeding your pet!</Text>
                    )}
                    {rows.map((item, i) => (
                        <View key={`${item.at}-${item.type}-${i}`} style={styles.row}>
                            <Text style={styles.rowLabel}>
                                {eventLog.describeEvent(item, { achievementLabels })}
                            </Text>
                            <Text style={styles.rowTime}>
                                {eventLog.formatAgo(now - item.at)}
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
        color: '#666',
    },
    rowTime: {
        fontSize: 11,
        color: '#999',
    },
    empty: {
        fontSize: 12,
        color: '#999',
    },
})
