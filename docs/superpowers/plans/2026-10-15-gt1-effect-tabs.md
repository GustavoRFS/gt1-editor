# GT-1 Effect Tabs and Parameter Map Implementation Plan

> **For agentic workers:** Native execution in this session. Work task-by-task and verify each result.

**Goal:** Organize patch editing into six GT-1 effect tabs and map the parameters displayed by those sections to patch bytes.

**Architecture:** Keep the byte definitions in `src/gt1/parameterMap.ts`, including selector fields and selector-conditioned effect controls. Add a pure helper that returns definitions for the chosen section and patch. `PatchEditor` renders the six requested tabs while retaining patch selection, naming, transfer, and export controls outside the effect panel.

**Tech Stack:** TypeScript, React Native, Node test runner, TypeScript transpile hook.

**Spec:** User request in this conversation; GT-1 Parameter Guide and Tone Studio documentation linked in the completion report.

## Global Constraints

- Tab order and labels are `FX1/Comp`, `OD/DS`, `Preamp`, `FX2/MOD`, `Delay`, `Reverb`.
- Parameter edits continue to update local patch frames and Roland checksums through the existing mutation path.
- Effect-specific fields appear only for their selected effect type.
- Keep the patch library, name, transfer, destination, and export controls outside the effect tabs.

## Review Focus

- Selector writes must target the GT-1 byte offsets, preserve other bytes, and refresh checksums — parameter-map test.
- Switching the selected type must change the visible controls without showing unrelated controls — conditional-catalog test.
- FX1 and FX2 use the same type catalog but different byte ranges — offset and independent-value tests.
- Delay and reverb selectors must expose their model-specific types and values — selector and type-conditional tests.
- A narrow layout must keep all six tabs reachable — horizontal-scroll tab strip and typecheck.

---

### Task 1: Parameter catalog

**Files:**
- Modify: `src/gt1/types.ts`
- Modify: `src/gt1/parameterMap.ts`
- Test: `tests/gt1-effects.test.cjs`

**Interfaces:**
- Produces `effectSections`, `getVisibleParameterDefinitions(patch, sectionId)`, and mapped fields addressable by stable parameter IDs.

- [x] Write tests for section order, FX1/FX2 selector offsets, conditional effect controls, and local parameter writes.
- [x] Run the focused tests and confirm they fail for the missing catalog.
- [x] Add section metadata, selector-conditioned fields, and correct value ranges/options from the GT-1 parameter map.
- [x] Run the focused tests and confirm they pass.

### Task 2: Tabbed patch editor

**Files:**
- Modify: `src/components/PatchEditor.tsx`

**Interfaces:**
- Consumes `effectSections` and `getVisibleParameterDefinitions` from Task 1.

- [x] Render a horizontally scrollable six-tab strip and a single selected effect panel.
- [x] Keep patch management, name, send/store, and export sections outside the selected effect panel.
- [x] Run TypeScript checks and the focused tests.

### Task 3: Verification and documentation

**Files:**
- Modify: `docs/gt1-protocol.md`

- [x] Document that the supported parameter map now includes the six tab sections and type-specific fields.
- [x] Run the repository’s GT-1 tests, TypeScript checks, and web export; resolve failures caused by this change.
