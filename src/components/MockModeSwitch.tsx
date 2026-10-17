import { View } from 'react-native';
import { AppText } from './AppText';
import { AppSwitch } from './AppSwitch';
import { colors, spacing } from '../theme';

type MockModeSwitchProps = {
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
};

export function MockModeSwitch({ enabled, disabled = false, onChange }: MockModeSwitchProps) {
  return (
    <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14 }}>
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        <AppText variant="headline">Modo mock</AppText>
        <AppText variant="label">{enabled ? 'GT-1 simulada · sem comunicação MIDI' : 'Teste a interface sem conectar a pedaleira'}</AppText>
      </View>
      <AppSwitch
        accessibilityLabel="Ativar modo mock"
        disabled={disabled}
        value={enabled}
        onValueChange={onChange}
      />
    </View>
  );
}
