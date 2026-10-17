# NativeWind Styling Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace app-owned `StyleSheet` styling with NativeWind utilities and responsive breakpoint selectors across the editor, settings, recording, automation, and dialogs.

**Architecture:** Use NativeWind 4.2.7 with Tailwind CSS 3 for the existing Expo SDK. Move the design tokens into Tailwind theme extensions and use `className` utilities on React Native primitives. Keep only runtime animation/interpolation and navigation-library style APIs as calculated style values where those APIs do not accept class names.

**Tech Stack:** Expo SDK 57, React Native 0.86, NativeWind 4.2.7, Tailwind CSS 3.4.

**Spec:** User request in conversation: migrate all app styling to NativeWind and use NativeWind selectors for responsiveness.

## Global Constraints

- Keep all existing colors, typography, spacing, and visual hierarchy unless a responsive breakpoint requires a layout change.
- Use explicit app breakpoints: `sm` 480px, `md` 640px, `lg` 1024px.
- Preserve dynamic animation transforms and third-party control/navigation APIs when they require resolved native style objects.
- Do not add or run test suites; validate with Android TypeScript check and web export.

## Review Focus

- Tailwind content globs include all routes and reusable components, including dynamically rendered effect controls.
- Responsive classes work in native Android as well as React Native Web.
- Animated drawer/toast retain runtime opacity/translate styles while their static appearance uses NativeWind.
- Modal, sliders, and material top tabs preserve behavior and visual state.

---

### Task 1: Configure NativeWind and theme tokens

**Files:** `package.json`, lockfile, `metro.config.js`, `babel.config.js`, `tailwind.config.js`, `global.css`, `nativewind-env.d.ts`, `app/_layout.tsx`, `src/theme/index.ts`.

- [ ] Install NativeWind 4.2.7 and Tailwind 3.4, plus Expo-compatible peer packages.
- [ ] Configure Babel and Metro; import the generated CSS once at the Expo Router root.
- [ ] Extend Tailwind with the existing color, radius, typography, and named breakpoint tokens.
- [ ] Add NativeWind TypeScript declarations and remove obsolete JS style tokens when no longer referenced.

### Task 2: Migrate reusable controls and dialogs

**Files:** `src/components/AppText.tsx`, `AppButton.tsx`, `ParameterControl.tsx`, `ConnectionPanel.tsx`, `PendingPatchSwitchModal.tsx`, `PatchSlotPicker.tsx`, `PatchLibraryDrawer.tsx`, `MockModeSwitch.tsx`.

- [ ] Replace component `StyleSheet` declarations and static inline style objects with `className` utilities.
- [ ] Express compact and wide control layouts using Tailwind breakpoint selectors.
- [ ] Preserve animated drawer values as runtime styles and map any third-party slider style API through NativeWind interoperability.

### Task 3: Migrate patch editor

**Files:** `src/components/PatchEditor.tsx`.

- [ ] Migrate editor layout, effect panels, system settings, modals, and action rows to NativeWind.
- [ ] Replace JS width breakpoint branching with `sm:`/`md:` classes where possible.
- [ ] Keep React Navigation's required tab-bar style objects only if its API cannot consume class names; document that boundary in the final report.

### Task 4: Migrate routes and verify

**Files:** `app/index.tsx`, `app/automation.tsx`, `app/recording.tsx`, `app/settings.tsx`.

- [ ] Replace route `StyleSheet` styles with NativeWind classes and selector-based responsive layout.
- [ ] Remove all `StyleSheet.create` declarations from app-owned presentation files.
- [ ] Run `npm run typecheck:android`, `npm run export:web`, and `git diff --check`.
