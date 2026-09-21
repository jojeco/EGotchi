import { Pressable, StyleSheet, Text, View } from "react-native";

export default function ActionButtons({ actions, onPress, cooldowns, disabled }) {
    return(
        <View style={styles.row}>
            {actions.map(action => {
                const remainingMs = (cooldowns && cooldowns[action.id]) || 0
                const cooling = remainingMs > 0
                const blocked = Boolean(disabled) || cooling
                const title = cooling
                    ? `${action.label} (${Math.ceil(remainingMs / 1000)}s)`
                    : action.label
                return(
                    <Pressable
                    key={action.id}
                    disabled={blocked}
                    onPress={() => onPress(action.id)}
                    style={[styles.button, blocked && styles.buttonDisabled]}
                    >
                        <Text style={styles.buttonText}>{title}</Text>
                    </Pressable>
                )
            })}
        </View>
    )
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        marginTop: 16,
    },
    button: {
        backgroundColor: '#2196f3',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 6,
        marginHorizontal: 4,
    },
    buttonDisabled: {
        opacity: 0.4,
    },
    buttonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
})
