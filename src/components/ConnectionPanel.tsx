import { Pressable, StyleSheet, View } from 'react-native';
import type { MidiDevice } from '../transport/transport';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';

type ConnectionPanelProps = {
  devices: MidiDevice[];
  selectedDeviceId: string;
  connected: boolean;
  busy: boolean;
  error: string | null;
  onSelect: (deviceId: string) => void;
  onRefresh: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function ConnectionPanel({ devices, selectedDeviceId, connected, busy, error, onSelect, onRefresh, onConnect, onDisconnect }: ConnectionPanelProps) {
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <AppText variant="caption" style={styles.kicker}>CONEXÃO MIDI</AppText>
          <AppText variant="headline">Pedaleira</AppText>
        </View>
        <AppButton title="Atualizar" onPress={onRefresh} busy={busy} disabled={connected} variant="quiet" />
      </View>

      {devices.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="subhead">Nenhum dispositivo MIDI bidirecional encontrado.</AppText>
          <AppText variant="label">Android: use um cabo USB-C host/OTG para USB-B. Linux: confira se a GT-1 aparece no ALSA.</AppText>
        </View>
      ) : (
        <View style={styles.deviceList}>
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
        </View>
      )}

      <View style={styles.actions}>
        {connected ? (
          <AppButton title="Desconectar" onPress={onDisconnect} busy={busy} variant="secondary" />
        ) : (
          <AppButton title="Conectar à GT-1" onPress={onConnect} busy={busy} disabled={!selectedDeviceId} variant="primary" />
        )}
        <View style={styles.state}>
          <View style={[styles.stateDot, connected ? styles.stateConnected : null]} />
          <AppText variant="label" style={connected ? styles.connectedText : null}>{connected ? 'Conectada' : 'Desconectada'}</AppText>
        </View>
      </View>
      {error ? <AppText variant="subhead" style={styles.error}>{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, borderCurve: 'continuous' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  headingCopy: { gap: spacing.xs },
  kicker: { color: colors.accent },
  empty: { gap: spacing.sm, paddingVertical: spacing.sm },
  deviceList: { gap: spacing.sm },
  device: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, borderCurve: 'continuous' },
  deviceSelected: { backgroundColor: colors.surfaceSelected, borderColor: colors.accent },
  devicePressed: { opacity: 0.7 },
  deviceIndicator: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.muted },
  deviceIndicatorSelected: { backgroundColor: colors.accent },
  deviceCopy: { flex: 1, gap: spacing.xs },
  selectedText: { color: colors.accent },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.md },
  state: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  stateDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.warning },
  stateConnected: { backgroundColor: colors.success },
  connectedText: { color: colors.success },
  error: { color: colors.danger },
});
