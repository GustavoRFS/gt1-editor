import type { TextStyle } from 'react-native';

export const colors = {
  canvas: '#070910',
  surface: '#0d111b',
  surfaceRaised: '#141b2a',
  surfaceSelected: '#172a49',
  line: '#293650',
  accent: '#3b82f6',
  accentStrong: '#82b3ff',
  accentInk: '#f7f9ff',
  text: '#f2f5fb',
  textSecondary: '#aab5c9',
  muted: '#75819a',
  danger: '#ff5263',
  warning: '#ff6878',
  success: '#78aaff',
  input: '#0a0f19',
  warningSurface: '#2b141b',
  warningBorder: '#71313e',
  dangerSurface: '#30131b',
  dangerBorder: '#803342',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

export const type = {
  display: { color: colors.text, fontSize: 28, fontWeight: '800' },
  title: { color: colors.text, fontSize: 23, fontWeight: '700' },
  section: { color: colors.text, fontSize: 19, fontWeight: '700' },
  headline: { color: colors.text, fontSize: 16, fontWeight: '600' },
  body: { color: colors.text, fontSize: 14, fontWeight: '400' },
  subhead: { color: colors.textSecondary, fontSize: 13, fontWeight: '400' },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  caption: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  button: { color: colors.accentInk, fontSize: 14, fontWeight: '700' },
  input: { color: colors.text, fontSize: 14, fontWeight: '400' },
  patchName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  controlGlyph: { color: colors.accent, fontSize: 20, fontWeight: '400', lineHeight: 22 },
} as const satisfies Record<string, TextStyle>;
