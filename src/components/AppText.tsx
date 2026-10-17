import { Text, type TextProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { type } from '../theme';

type AppTextProps = TextProps & { variant?: 'display' | 'title' | 'section' | 'headline' | 'body' | 'subhead' | 'label' | 'caption' | 'button' | 'input' | 'patchName' | 'controlGlyph'; className?: string };

const variantColors: Record<NonNullable<AppTextProps['variant']>, string> = {
  display: 'text-text', title: 'text-text', section: 'text-text', headline: 'text-text', body: 'text-text',
  subhead: 'text-secondary', label: 'text-secondary', caption: 'text-muted', button: 'text-accent-ink',
  input: 'text-text', patchName: 'text-text', controlGlyph: 'text-accent',
};

// Keep the original React Native font metrics; Tailwind line-height defaults differ by platform.
const fontStyles = Object.fromEntries(
  Object.entries(type).map(([name, style]) => {
    const { color: _color, ...fontStyle } = style;
    return [name, fontStyle];
  }),
) as { [K in keyof typeof type]: Omit<(typeof type)[K], 'color'> };

export function AppText({ variant = 'body', style, className, ...props }: AppTextProps) {
  const { t } = useTranslation(undefined, { useSuspense: false });
  const children = typeof props.children === 'string'
    ? t(props.children, { defaultValue: props.children })
    : props.children;
  return <Text selectable className={`${variantColors[variant]} ${className ?? ''}`} style={[fontStyles[variant], style]} {...props}>{children}</Text>;
}
