import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { Gt1ParameterDefinition } from '../gt1/types';
import { AppText } from './AppText';
import { colors, radius, spacing, type } from '../theme';

type ParameterControlProps = {
  definition: Gt1ParameterDefinition;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

export function ParameterControl({ definition, value, disabled = false, onChange }: ParameterControlProps) {
  if (definition.control === 'toggle') {
    const options = definition.options ?? [];
    const enabledValue = options.find((option) => option.value !== definition.min)?.value ?? definition.max;
    const enabled = value === enabledValue;
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={definition.label}
        accessibilityState={{ checked: enabled, disabled }}
        disabled={disabled}
        onPress={() => onChange(enabled ? definition.min : enabledValue)}
        style={({ pressed }) => [styles.row, styles.toggle, disabled ? styles.disabled : null, pressed ? styles.pressed : null]}
      >
        <AppText variant="label">{definition.label}</AppText>
        <View style={[styles.toggleValue, enabled ? styles.toggleOn : null]}>
          <AppText variant="label" style={enabled ? styles.toggleTextOn : styles.toggleTextOff}>{enabled ? 'Ligado' : 'Desligado'}</AppText>
        </View>
      </Pressable>
    );
  }

  if (definition.control === 'select') {
    const options = definition.options ?? [];
    const currentIndex = options.findIndex((option) => option.value === value);
    const currentOption = options[currentIndex];
    const previous = () => {
      if (options.length === 0) return;
      const targetIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
      onChange(options[targetIndex].value);
    };
    const next = () => {
      if (options.length === 0) return;
      const targetIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, options.length - 1);
      onChange(options[targetIndex].value);
    };
    return (
      <View style={[styles.row, disabled ? styles.disabled : null]}>
        <AppText variant="label" style={styles.label}>{definition.label}</AppText>
        <View style={styles.selectControl}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Valor anterior de ${definition.label}`} accessibilityState={{ disabled: disabled || currentIndex <= 0 }} disabled={disabled || currentIndex <= 0} onPress={previous} style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}>
            <AppText variant="headline" style={styles.stepGlyph}>−</AppText>
          </Pressable>
          <AppText variant="label" style={styles.selectedOption} numberOfLines={1}>{currentOption?.label ?? `Valor ${value}`}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={`Próximo valor de ${definition.label}`} accessibilityState={{ disabled: disabled || currentIndex >= options.length - 1 }} disabled={disabled || currentIndex >= options.length - 1} onPress={next} style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}>
            <AppText variant="headline" style={styles.stepGlyph}>+</AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  return <NumberParameter definition={definition} value={value} disabled={disabled} onChange={onChange} />;
}

function NumberParameter({ definition, value, disabled, onChange }: ParameterControlProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.max(definition.min, Math.min(definition.max, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <View style={[styles.row, disabled ? styles.disabled : null]}>
      <AppText variant="label" style={styles.label}>{definition.label}</AppText>
      <View style={styles.numberControl}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir ${definition.label}`} accessibilityState={{ disabled: disabled || value <= definition.min }} disabled={disabled || value <= definition.min} onPress={() => onChange(Math.max(definition.min, value - 1))} style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}>
          <AppText variant="headline" style={styles.stepGlyph}>−</AppText>
        </Pressable>
        <TextInput
          accessibilityLabel={definition.label}
          accessibilityState={{ disabled }}
          editable={!disabled}
          keyboardType="number-pad"
          maxLength={String(definition.max).length + 1}
          onBlur={commit}
          onChangeText={setDraft}
          onEndEditing={commit}
          selectTextOnFocus
          style={[type.input, styles.numberInput]}
          value={draft}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar ${definition.label}`} accessibilityState={{ disabled: disabled || value >= definition.max }} disabled={disabled || value >= definition.max} onPress={() => onChange(Math.min(definition.max, value + 1))} style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}>
          <AppText variant="headline" style={styles.stepGlyph}>+</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  toggle: { paddingVertical: spacing.sm },
  label: { flex: 1 },
  selectControl: { width: 210, maxWidth: '58%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  numberControl: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, borderCurve: 'continuous' },
  stepGlyph: type.controlGlyph,
  selectedOption: { flex: 1, textAlign: 'center' },
  numberInput: { minWidth: 58, height: 38, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, borderCurve: 'continuous', textAlign: 'center', fontVariant: ['tabular-nums'] },
  toggleValue: { minWidth: 94, alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill },
  toggleOn: { backgroundColor: colors.surfaceSelected, borderColor: colors.accent },
  toggleTextOn: { color: colors.accent },
  toggleTextOff: { color: colors.textSecondary },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
