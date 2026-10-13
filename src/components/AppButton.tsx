import { Pressable, StyleSheet, View, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';

type AppButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  style?: StyleProp<ViewStyle>;
};

const variantStyles = {
  primary: { backgroundColor: colors.accent, borderColor: colors.accent, text: colors.accentInk },
  secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.line, text: colors.text },
  quiet: { backgroundColor: 'transparent', borderColor: colors.line, text: colors.textSecondary },
  danger: { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder, text: colors.danger },
} as const;

export function AppButton({ title, onPress, disabled = false, busy = false, variant = 'secondary', style }: AppButtonProps) {
  const appearance = variantStyles[variant];
  const unavailable = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: unavailable, busy }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: appearance.backgroundColor, borderColor: appearance.borderColor }, unavailable ? styles.disabled : pressed ? styles.pressed : null, style]}
    >
      <View style={styles.content}>
        {busy ? <ActivityIndicator size="small" color={appearance.text} /> : null}
        <AppText variant="label" style={{ color: appearance.text, fontWeight: '700' }}>{busy ? `${title}…` : title}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderWidth: 1, borderRadius: radius.md, borderCurve: 'continuous' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
