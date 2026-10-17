import { Modal, Pressable, View } from 'react-native';
import type { Gt1Patch } from '../gt1/types';
import { AppButton } from './AppButton';
import { AppText } from './AppText';

type PendingPatchSwitchModalProps = {
  visible: boolean;
  currentPatch: Gt1Patch | undefined;
  targetPatch: Gt1Patch | undefined;
  busy: boolean;
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

export function PendingPatchSwitchModal({ visible, currentPatch, targetPatch, busy, error, onSave, onDiscard, onCancel }: PendingPatchSwitchModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? () => undefined : onCancel}>
      <View className="flex-1 items-center justify-center bg-black/70 p-4">
        <Pressable accessibilityRole="button" accessibilityLabel="Cancelar troca de patch" disabled={busy} onPress={onCancel} className="absolute inset-0" />
        <View className="w-full max-w-[460px] gap-3 rounded-xl border border-line bg-surface p-5">
          <AppText variant="caption" className="text-warning">ALTERAÇÕES NÃO SALVAS</AppText>
          <AppText variant="headline">Salvar antes de trocar?</AppText>
          <AppText variant="subhead">“{currentPatch?.name ?? 'Patch atual'}” tem alterações pendentes. Você escolheu “{targetPatch?.name ?? 'outro patch'}”.</AppText>
          {error ? <AppText variant="label" className="text-danger">{error}</AppText> : null}
          <View className="gap-2 pt-2">
            <AppButton title="Salvar alterações" variant="primary" busy={busy} disabled={busy} onPress={onSave} />
            <AppButton title="Trocar sem salvar" variant="danger" busy={busy} disabled={busy} onPress={onDiscard} />
            <AppButton title="Cancelar" variant="quiet" disabled={busy} onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
