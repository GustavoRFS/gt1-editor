import { Pressable, View, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { colors } from '../theme';

type AppButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  style?: StyleProp<ViewStyle>;
  className?: string;
};

const variants = {
  primary: 'border-accent bg-accent',
  secondary: 'border-line bg-surface-raised',
  quiet: 'border-line bg-transparent',
  danger: 'border-danger-border bg-danger-surface',
} as const;

const textColors = { primary: colors.accentInk, secondary: colors.text, quiet: colors.textSecondary, danger: colors.danger } as const;

export function AppButton({ title, onPress, disabled = false, busy = false, variant = 'secondary', style, className }: AppButtonProps) {
  const unavailable = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: unavailable, busy }}
      disabled={unavailable}
      onPress={onPress}
      className={`min-h-[42px] items-center justify-center rounded-md border px-4 py-2 active:opacity-70 ${variants[variant]} ${unavailable ? 'opacity-45' : ''} ${className ?? ''}`}
      style={style}
    >
      <View className="flex-row items-center justify-center gap-2">
        {busy ? <ActivityIndicator size="small" color={variant === 'primary' ? colors.accentInk : variant === 'danger' ? colors.danger : colors.text} /> : null}
        <AppText variant="label" style={{ color: textColors[variant] }}>{busy ? `${title}…` : title}</AppText>
      </View>
    </Pressable>
  );
}
