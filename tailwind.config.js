/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    screens: { sm: '480px', md: '640px', lg: '1024px' },
    extend: {
      colors: {
        canvas: '#070910', surface: '#0d111b', 'surface-raised': '#141b2a', 'surface-selected': '#172a49',
        line: '#293650', accent: '#3b82f6', 'accent-strong': '#82b3ff', 'accent-ink': '#f7f9ff',
        text: '#f2f5fb', secondary: '#aab5c9', muted: '#75819a', danger: '#ff5263', warning: '#ff6878',
        success: '#78aaff', input: '#0a0f19', 'warning-surface': '#2b141b', 'warning-border': '#71313e',
        'danger-surface': '#30131b', 'danger-border': '#803342',
      },
      borderRadius: { sm: 8, md: 12, lg: 18, xl: 22 },
      fontSize: {
        display: ['28px', { lineHeight: '34px', fontWeight: '800' }],
        title: ['23px', { lineHeight: '29px', fontWeight: '700' }],
        section: ['19px', { lineHeight: '25px', fontWeight: '700' }],
        headline: ['16px', { lineHeight: '22px', fontWeight: '600' }],
        body: ['14px', { lineHeight: '20px' }], subhead: ['13px', { lineHeight: '19px' }],
        label: ['12px', { lineHeight: '16px', fontWeight: '600' }], caption: ['10px', { lineHeight: '14px', fontWeight: '700', letterSpacing: '1.2px' }],
      },
    },
  },
  plugins: [],
};
