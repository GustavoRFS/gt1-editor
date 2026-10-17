import { Pressable, View } from 'react-native';
type AppSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
};

export function AppSwitch({ value, onValueChange, disabled = false, accessibilityLabel }: AppSwitchProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: disabled ? 0.45 : pressed ? 0.8 : 1 })}
    >
      <View style={{
        width: 46,
        height: 26,
        padding: 3,
        justifyContent: 'center',
        alignItems: value ? 'flex-end' : 'flex-start',
        backgroundColor: value ? '#3b82f6' : '#293650',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: value ? '#82b3ff' : '#46536b',
      }}>
        <View style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          backgroundColor: '#f7f9ff',
        }} />
      </View>
    </Pressable>
  );
}
