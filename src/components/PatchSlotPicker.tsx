import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Gt1Patch } from '../gt1/types';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';

type PatchSlotPickerProps = {
  visible: boolean;
  patches: Gt1Patch[];
  selectedSlot: number | null;
  busy: boolean;
  title: string;
  confirmLabel: string;
  onSelect: (slot: number) => void;
  onClose: () => void;
  onConfirm: (slot: number) => void;
};

export function PatchSlotPicker({
  visible,
  patches,
  selectedSlot,
  busy,
  title,
  confirmLabel,
  onSelect,
  onClose,
  onConfirm,
}: PatchSlotPickerProps) {
  const targetPatch = selectedSlot === null ? undefined : patches.find((patch) => patch.userPatch === selectedSlot);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar seleção de slot" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.modal}>
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <AppText variant="caption" style={styles.kicker}>SLOT DE USUÁRIO</AppText>
              <AppText variant="headline">{title}</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={styles.closeButton}>
              <AppText variant="section">×</AppText>
            </Pressable>
          </View>

          <ScrollView style={styles.slotList} contentContainerStyle={styles.slotListContent} keyboardShouldPersistTaps="handled">
            {Array.from({ length: 99 }, (_, index) => index + 1).map((slot) => {
              const currentSlotPatch = patches.find((patch) => patch.userPatch === slot);
              const selected = selectedSlot === slot;
              return (
                <Pressable
                  key={slot}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: busy }}
                  disabled={busy}
                  onPress={() => onSelect(slot)}
                  style={({ pressed }) => [styles.slotRow, selected ? styles.slotSelected : null, pressed ? styles.pressed : null]}
                >
                  <AppText variant="label" style={styles.slotNumber}>{destinationLabel(slot)}</AppText>
                  <AppText variant="label" numberOfLines={1} style={styles.slotName}>{currentSlotPatch?.name ?? 'Slot de usuário'}</AppText>
                  {selected ? <AppText variant="caption" style={styles.selectedText}>SELECIONADO</AppText> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedSlot === null ? (
            <AppText variant="label">Selecione um slot para continuar.</AppText>
          ) : (
            <View style={styles.confirmBox}>
              <AppText variant="label">Salvar em {destinationLabel(selectedSlot)} substitui “{targetPatch?.name ?? 'o conteúdo atual'}”.</AppText>
              <View style={styles.actions}>
                <AppButton title="Cancelar" variant="quiet" disabled={busy} onPress={onClose} />
                <AppButton title={`${confirmLabel} ${destinationLabel(selectedSlot)}`} variant="danger" busy={busy} disabled={busy} onPress={() => onConfirm(selectedSlot)} />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function destinationLabel(userPatch: number): string {
  return `U${String(userPatch).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0, 0, 0, 0.68)' },
  modal: { width: '100%', maxWidth: 560, maxHeight: '88%', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.xl, borderCurve: 'continuous' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headingCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  kicker: { color: colors.accent },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.input, borderRadius: radius.md },
  slotList: { flexGrow: 0, maxHeight: 340, minHeight: 100 },
  slotListContent: { gap: spacing.xs },
  slotRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  slotSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceSelected },
  slotNumber: { minWidth: 34, color: colors.accent },
  slotName: { flex: 1, minWidth: 0 },
  selectedText: { color: colors.accent },
  confirmBox: { gap: spacing.md, padding: spacing.md, backgroundColor: colors.warningSurface, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radius.md },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  pressed: { opacity: 0.72 },
});
