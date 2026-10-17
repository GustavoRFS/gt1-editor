import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import type { Gt1ParameterDefinition } from '../gt1/types';
import { usesPercentSlider } from '../gt1/controlPresentation';
import { AppText } from './AppText';
import { AppSwitch } from './AppSwitch';
import { colors, radius, spacing, type } from '../theme';

type ParameterControlDefinition = Pick<Gt1ParameterDefinition, 'id' | 'group' | 'label' | 'control' | 'min' | 'max' | 'options'> & {
  step?: number;
  displayDivisor?: number;
  slider?: boolean;
};

type ParameterControlProps = {
  definition: ParameterControlDefinition;
  value: number;
  disabled?: boolean;
  hideLabel?: boolean;
  commitSliderOnRelease?: boolean;
  resetKey?: number;
  onChange: (parameterId: string, value: number) => void;
};

export function ParameterControl({ definition, value, disabled = false, hideLabel = false, commitSliderOnRelease = false, resetKey, onChange }: ParameterControlProps) {
  const { width } = useWindowDimensions();
  const compact = width < 480;
  if (definition.control === 'toggle') {
    const options = definition.options ?? [];
    const enabledValue = options.find((option) => option.value !== definition.min)?.value ?? definition.max;
    const enabled = value === enabledValue;
    return (
      <View style={[styles.row, hideLabel ? styles.switchOnlyRow : null, disabled ? styles.disabled : null]}>
        {!hideLabel ? <AppText variant="label" style={styles.label}>{definition.label}</AppText> : null}
        <AppSwitch
          accessibilityLabel={definition.label}
          disabled={disabled}
          onValueChange={(nextEnabled) => onChange(definition.id, nextEnabled ? enabledValue : definition.min)}
          value={enabled}
        />
      </View>
    );
  }

  if (definition.control === 'select') {
    return <SelectParameter definition={definition} value={value} disabled={disabled} compact={compact} onChange={onChange} />;
  }

    return <NumberParameter definition={definition} value={value} disabled={disabled} compact={compact} commitSliderOnRelease={commitSliderOnRelease} resetKey={resetKey} onChange={onChange} />;
}

function SelectParameter({ definition, value, disabled, compact = false, onChange }: ParameterControlProps & { compact?: boolean }) {
  const [visible, setVisible] = useState(false);
  const options = definition.options ?? [];
  const currentOption = options.find((option) => option.value === value);
  return (
    <>
      <View style={[styles.row, compact ? styles.compactRow : null, disabled ? styles.disabled : null]}>
        <AppText variant="label" style={compact ? null : styles.label}>{definition.label}</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${definition.label}: ${currentOption?.label ?? `Valor ${value}`}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => setVisible(true)}
          style={({ pressed }) => [styles.selectButton, compact ? styles.compactSelectButton : null, pressed ? styles.pressed : null]}
        >
          <AppText variant="label" numberOfLines={1} style={styles.selectValue}>{currentOption?.label ?? `Valor ${value}`}</AppText>
          <AppText variant="caption" style={styles.chevron}>⌄</AppText>
        </Pressable>
      </View>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Fechar ${definition.label}`} onPress={() => setVisible(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.optionsModal}>
            <AppText variant="headline">{definition.label}</AppText>
            <ScrollView style={styles.optionList} contentContainerStyle={styles.optionListContent}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: option.value === value }}
                  onPress={() => {
                    setVisible(false);
                    if (option.value !== value) onChange(definition.id, option.value);
                  }}
                  style={({ pressed }) => [styles.option, option.value === value ? styles.optionSelected : null, pressed ? styles.pressed : null]}
                >
                  <AppText variant="label" style={option.value === value ? styles.selectedText : null}>{option.label}</AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function NumberParameter({ definition, value, disabled, compact = false, commitSliderOnRelease = false, resetKey, onChange }: ParameterControlProps & { compact?: boolean }) {
  const formatValue = (currentValue: number) => {
    if (!definition.displayDivisor) return String(currentValue);
    const decimalPlaces = Math.max(0, String(definition.displayDivisor).length - 1);
    return (currentValue / definition.displayDivisor).toFixed(decimalPlaces);
  };
  const [draft, setDraft] = useState(formatValue(value));
  const [sliderDraft, setSliderDraft] = useState<number | null>(null);
  useEffect(() => {
    setDraft(formatValue(value));
    setSliderDraft(null);
  }, [value, definition.displayDivisor, resetKey]);

  const commit = () => {
    const parsedDraft = definition.displayDivisor ? Number.parseFloat(draft) : Number.parseInt(draft, 10);
    const parsed = definition.displayDivisor ? Math.round(parsedDraft * definition.displayDivisor) : parsedDraft;
    if (!Number.isFinite(parsed)) {
      setDraft(formatValue(value));
      return;
    }
    const step = definition.step ?? 1;
    const clamped = Math.max(definition.min, Math.min(definition.max, Math.round((parsed - definition.min) / step) * step + definition.min));
    setDraft(formatValue(clamped));
    if (clamped !== value) onChange(definition.id, clamped);
  };
  const step = definition.step ?? 1;
  const hasSlider = definition.slider ?? usesPercentSlider(definition);

  return (
    <View style={[styles.row, compact ? styles.compactRow : null, disabled ? styles.disabled : null]}>
      <AppText variant="label" style={compact ? null : styles.label}>{definition.label}</AppText>
      <View style={[styles.numberControl, compact ? styles.compactNumberControl : null, hasSlider ? styles.sliderControl : null]}>
        {hasSlider ? (
          <Slider
            accessibilityLabel={definition.label}
            disabled={disabled}
            maximumValue={definition.max}
            maximumTrackTintColor={colors.line}
            minimumTrackTintColor={colors.accent}
            minimumValue={definition.min}
            onValueChange={(nextValue) => {
              const next = Math.round((nextValue - definition.min) / step) * step + definition.min;
              if (commitSliderOnRelease) setSliderDraft(next);
              else onChange(definition.id, next);
            }}
            onSlidingComplete={(nextValue) => {
              if (!commitSliderOnRelease) return;
              const next = Math.round((nextValue - definition.min) / step) * step + definition.min;
              setSliderDraft(null);
              if (next !== value) onChange(definition.id, next);
            }}
            step={step}
            style={styles.slider}
            thumbTintColor={colors.accentStrong}
            value={sliderDraft ?? value}
          />
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir ${definition.label}`} accessibilityState={{ disabled: disabled || value <= definition.min }} disabled={disabled || value <= definition.min} onPress={() => onChange(definition.id, Math.max(definition.min, value - step))} style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}>
            <AppText variant="headline" style={styles.stepGlyph}>−</AppText>
          </Pressable>
        )}
        <TextInput
          accessibilityLabel={definition.label}
          accessibilityState={{ disabled }}
          editable={!disabled}
          keyboardType={definition.min < 0 || definition.displayDivisor ? 'numbers-and-punctuation' : 'number-pad'}
          maxLength={String(definition.max).length + (definition.min < 0 ? 1 : 0) + (definition.displayDivisor ? 2 : 0)}
          onChangeText={setDraft}
          onEndEditing={commit}
          selectTextOnFocus
          style={[type.input, styles.numberInput]}
          value={draft}
        />
        {!hasSlider ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar ${definition.label}`} accessibilityState={{ disabled: disabled || value >= definition.max }} disabled={disabled || value >= definition.max} onPress={() => onChange(definition.id, Math.min(definition.max, value + step))} style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}>
            <AppText variant="headline" style={styles.stepGlyph}>+</AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  switchOnlyRow: { minHeight: 36, justifyContent: 'flex-end' },
  label: { flex: 1, minWidth: 70 },
  selectButton: { minWidth: 128, maxWidth: '58%', flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, borderCurve: 'continuous' },
  selectValue: { flex: 1, textAlign: 'center' },
  chevron: { color: colors.textSecondary, fontSize: 18 },
  numberControl: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  compactRow: { alignItems: 'stretch', flexDirection: 'column', gap: spacing.xs },
  compactSelectButton: { width: '100%', maxWidth: '100%', minWidth: 0, flex: 0 },
  compactNumberControl: { width: '100%', minWidth: 0 },
  sliderControl: { flex: 1, minWidth: 0 },
  slider: { flex: 1, minWidth: 0, height: 40 },
  stepButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, borderCurve: 'continuous' },
  stepGlyph: type.controlGlyph,
  numberInput: { width: 56, minWidth: 56, maxWidth: 56, flexGrow: 0, flexShrink: 0, height: 38, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, borderCurve: 'continuous', textAlign: 'center', fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0, 0, 0, 0.68)' },
  optionsModal: { width: '100%', maxWidth: 480, maxHeight: '82%', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.xl, borderCurve: 'continuous' },
  optionList: { flexGrow: 0, maxHeight: 480 },
  optionListContent: { gap: spacing.xs },
  option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, borderCurve: 'continuous' },
  optionSelected: { backgroundColor: colors.surfaceSelected, borderColor: colors.accent },
  selectedText: { color: colors.accent },
});
