import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { MidiDevice } from '../transport/transport';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';

type ConnectionPanelProps = {
  visible: boolean;
  devices: MidiDevice[];
  selectedDeviceId: string;
  connected: boolean;
  busy: boolean;
  error: string | null;
  onSelect: (deviceId: string) => void;
  onRefresh: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onClose: () => void;
};

export function ConnectionPanel({ visible, devices, selectedDeviceId, connected, busy, error, onSelect, onRefresh, onConnect, onDisconnect, onClose }: ConnectionPanelProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar seleção de dispositivo" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.modalCard}>
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <AppText variant="caption" style={styles.kicker}>CONEXÃO MIDI</AppText>
              <AppText variant="headline">Selecionar dispositivo</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={styles.closeButton}>
              <AppText variant="section">×</AppText>
            </Pressable>
          </View>

          {devices.length === 0 ? (
            <View style={styles.empty}>
              <AppText variant="subhead">Nenhum dispositivo MIDI bidirecional encontrado.</AppText>
              <AppText variant="label">Android: use um cabo USB-C host/OTG para USB-B. Linux: confira se a GT-1 aparece no ALSA.</AppText>
            </View>
          ) : (
            <ScrollView style={styles.deviceList} contentContainerStyle={styles.deviceListContent} keyboardShouldPersistTaps="handled">
              {devices.map((device) => {
                const selected = selectedDeviceId === device.id;
                return (
                  <Pressable
                    key={device.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: connected }}
                    disabled={connected}
                    onPress={() => onSelect(device.id)}
                    style={({ pressed }) => [styles.device, selected ? styles.deviceSelected : null, pressed ? styles.devicePressed : null]}
                  >
                    <View style={[styles.deviceIndicator, selected ? styles.deviceIndicatorSelected : null]} />
                    <View style={styles.deviceCopy}>
                      <AppText variant="headline" numberOfLines={1}>{device.name}</AppText>
                      <AppText variant="label">MIDI input + output</AppText>
                    </View>
                    {selected ? <AppText variant="caption" style={styles.selectedText}>SELECIONADA</AppText> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {error ? <AppText variant="subhead" style={styles.error}>{error}</AppText> : null}

          <View style={styles.actions}>
            <AppButton title="Atualizar dispositivos" onPress={onRefresh} busy={busy && !connected} disabled={connected} variant="quiet" />
            {connected ? (
              <AppButton title="Desconectar" onPress={onDisconnect} busy={busy} variant="secondary" />
            ) : (
              <AppButton title="Conectar à GT-1" onPress={onConnect} busy={busy} disabled={!selectedDeviceId} variant="primary" />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0, 0, 0, 0.68)' },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '82%', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.xl, borderCurve: 'continuous' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headingCopy: { gap: spacing.xs },
  kicker: { color: colors.accent },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.input, borderRadius: radius.md },
  empty: { gap: spacing.sm, paddingVertical: spacing.xl },
  deviceList: { flexGrow: 0, minHeight: 72, maxHeight: 380 },
  deviceListContent: { gap: spacing.sm, paddingVertical: spacing.xs },
  device: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, borderCurve: 'continuous' },
  deviceSelected: { backgroundColor: colors.surfaceSelected, borderColor: colors.accent },
  devicePressed: { opacity: 0.7 },
  deviceIndicator: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.muted },
  deviceIndicatorSelected: { backgroundColor: colors.accent },
  deviceCopy: { flex: 1, gap: spacing.xs },
  selectedText: { color: colors.accent },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.md },
  error: { color: colors.danger },
});
