import type { TextStyle } from 'react-native';

export const colors = {
  canvas: '#0b1211',
  surface: '#111a17',
  surfaceRaised: '#17231f',
  surfaceSelected: '#20342c',
  line: '#293a33',
  accent: '#91e4bd',
  accentStrong: '#b5f2d2',
  accentInk: '#10251c',
  text: '#edf5f0',
  textSecondary: '#a1b0a9',
  muted: '#718079',
  danger: '#f28d83',
  warning: '#e2b572',
  success: '#8fd9a8',
  input: '#0e1714',
  warningSurface: '#30281b',
  warningBorder: '#6c542f',
  dangerSurface: '#39211f',
  dangerBorder: '#71413d',
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
