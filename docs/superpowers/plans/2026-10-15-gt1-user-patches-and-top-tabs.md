# GT-1 user patch sync and effect navigator plan

## Goal

Read the GT-1's 99 user patches after connection, make persistent patch writes use U01–U99 addressing, and replace the custom effect-section buttons with a React Native material top-tab navigator.

## Decisions

- Read each U01–U99 slot with a separate RQ1 request and wait for its full reply before requesting the next slot. Do not select patches on the pedal during the scan.
- Keep buffer writes addressed to the temporary buffer and memory writes addressed to a selected U slot. Do not overwrite a user slot during verification.
- Keep device patches keyed by user slot so reconnects refresh rather than duplicate them. Preserve locally edited patches while they are marked dirty.
- Render the existing six parameter sections in the requested order. FX1/Comp's selected type controls which effect-specific parameters are visible.
- Use Expo Router's React Navigation material top tabs and its SDK 57 compatible pager dependencies.

## Tasks

1. Add failing protocol tests for U01/U99 read and write addresses, response address validation, and slot bounds; implement the U-slot SysEx helpers.
2. Add failing client and state tests for sequential all-slot reads, progress, per-slot failures, and stable patch upserts; implement the automatic scan on connect and a U01–U99 destination selector.
3. Replace the custom section controls with the material top-tab navigator, install Expo-compatible pager dependencies, and verify TypeScript plus the app bundle.

## Verification

- `npm run test:gt1`
- `npm run typecheck:android`
- `npm run export:web`
- Read-only USB verification of memory-slot scans. Do not issue persistent writes to the pedal during tests.
