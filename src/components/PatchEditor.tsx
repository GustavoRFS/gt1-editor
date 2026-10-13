import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { getParameterValue, parameterDefinitions, updatePatchParameter } from '../gt1/parameterMap';
import { setPatchNameLocally } from '../gt1/sysex';
import type { Gt1Patch, Gt1PatchDestination } from '../gt1/types';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { ParameterControl } from './ParameterControl';
import { colors, radius, spacing, type } from '../theme';

type PatchEditorProps = {
  patches: Gt1Patch[];
  activePatchId: string | null;
  dirtyPatchIds: ReadonlySet<string>;
  connected: boolean;
  busy: boolean;
  onSelectPatch: (patchId: string) => void;
  onPatchChange: (patch: Gt1Patch) => void;
  onSendToBuffer: () => Promise<void>;
  onWriteToMemory: (destination: Gt1PatchDestination) => Promise<void>;
  onExport: (format: 'syx' | 'mid' | 'gcl') => void;
};

export function PatchEditor({ patches, activePatchId, dirtyPatchIds, connected, busy, onSelectPatch, onPatchChange, onSendToBuffer, onWriteToMemory, onExport }: PatchEditorProps) {
  const patch = patches.find((candidate) => candidate.id === activePatchId) ?? null;
  const isDirty = patch ? dirtyPatchIds.has(patch.id) : false;
  const [nameDraft, setNameDraft] = useState(patch?.name ?? '');
  const [bankDraft, setBankDraft] = useState('1');
  const [slotDraft, setSlotDraft] = useState('1');
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const bank = Math.max(1, Math.min(50, Number.parseInt(bankDraft, 10) || 1));
  const slot = Math.max(1, Math.min(5, Number.parseInt(slotDraft, 10) || 1));
  const destinationKey = `U${String(bank).padStart(2, '0')}-${slot}`;
  const groups = Array.from(new Set(parameterDefinitions.map((definition) => definition.group)));

  useEffect(() => {
    setNameDraft(patch?.name ?? '');
    setConfirmTarget(null);
  }, [patch?.id]);

  const commitName = () => {
    if (patch && nameDraft !== patch.name) onPatchChange(setPatchNameLocally(patch, nameDraft));
  };

  const updateDestination = (kind: 'bank' | 'slot', value: string) => {
    setConfirmTarget(null);
    if (kind === 'bank') setBankDraft(value.replace(/\D/g, '').slice(0, 2));
    else setSlotDraft(value.replace(/\D/g, '').slice(0, 1));
  };

  const requestStore = async () => {
    const destination: Gt1PatchDestination = { bank, patch: slot };
    if (confirmTarget !== destinationKey) {
      setConfirmTarget(destinationKey);
      return;
    }
    setConfirmTarget(null);
    await onWriteToMemory(destination);
  };

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <AppText variant="caption" style={styles.kicker}>EDITOR DE PATCH</AppText>
          <AppText variant="section">Som carregado</AppText>
        </View>
        <View style={[styles.changeBadge, isDirty ? styles.changeBadgeDirty : null]}>
          <View style={[styles.changeDot, isDirty ? styles.changeDotDirty : null]} />
          <AppText variant="label" style={isDirty ? styles.dirtyText : null}>{isDirty ? 'Alterações locais' : 'Sem alterações locais'}</AppText>
        </View>
      </View>

      {patches.length > 0 ? (
        <View style={styles.library}>
          <AppText variant="caption">PATCHES CARREGADOS · {patches.length}</AppText>
          {patches.map((item, index) => {
            const selected = item.id === activePatchId;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: busy }}
                disabled={busy}
                onPress={() => onSelectPatch(item.id)}
                style={({ pressed }) => [styles.patchRow, selected ? styles.patchSelected : null, pressed ? styles.pressed : null]}
              >
                <AppText variant="label" style={[styles.patchIndex, selected ? styles.patchSelectedText : null]}>{String(index + 1).padStart(2, '0')}</AppText>
                <View style={styles.patchRowCopy}>
                  <AppText variant="headline" numberOfLines={1}>{item.name || 'Sem nome'}</AppText>
                  <AppText variant="label">{item.sourceName ?? item.sourceFormat.toUpperCase()}{dirtyPatchIds.has(item.id) ? ' · alterado' : ''}</AppText>
                </View>
                {!item.complete ? <AppText variant="caption" style={styles.warning}>INCOMPLETO</AppText> : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <AppText variant="headline">Nenhum patch carregado</AppText>
          <AppText variant="subhead">Conecte a GT-1 para ler o patch atual ou abra um arquivo .syx, .mid ou .gcl.</AppText>
        </View>
      )}

      {patch ? (
        <>
          <View style={styles.patchHeader}>
            <View style={styles.nameGroup}>
              <AppText variant="caption">NOME DO PATCH · ATÉ 16 CARACTERES</AppText>
              <TextInput
                accessibilityLabel="Nome do patch"
                editable={!busy}
                maxLength={16}
                onBlur={commitName}
                onChangeText={setNameDraft}
                onEndEditing={commitName}
                placeholder="Nome do patch"
                placeholderTextColor={colors.muted}
                selectTextOnFocus
                style={[type.patchName, styles.nameInput]}
                value={nameDraft}
              />
            </View>
            <View style={styles.patchMeta}>
              <AppText variant="caption">ORIGEM</AppText>
              <AppText variant="label">{patch.sourceFormat === 'device' ? 'Buffer da GT-1' : patch.sourceFormat.toUpperCase()}</AppText>
            </View>
          </View>

          {!patch.complete ? (
            <View style={styles.warningBox}>
              <AppText variant="label" style={styles.warning}>Este patch está incompleto e não pode ser gravado na memória da pedaleira.</AppText>
            </View>
          ) : null}

          <View style={styles.parameterSection}>
            <View style={styles.parameterHeading}>
              <AppText variant="headline">Efeitos e parâmetros</AppText>
              <AppText variant="label">Edite localmente antes de enviar</AppText>
            </View>
            {groups.map((group, groupIndex) => (
              <View key={group} style={[styles.parameterGroup, groupIndex > 0 ? styles.groupDivider : null]}>
                <AppText variant="caption" style={styles.groupTitle}>{group.toUpperCase()}</AppText>
                {parameterDefinitions.filter((definition) => definition.group === group).map((definition) => (
                  <ParameterControl
                    key={definition.id}
                    definition={definition}
                    value={getParameterValue(patch, definition)}
                    disabled={busy}
                    onChange={(value) => onPatchChange(setPatchValue(patch, definition.id, value))}
                  />
                ))}
              </View>
            ))}
          </View>

          <View style={styles.transferSection}>
            <AppText variant="caption" style={styles.kicker}>ENVIAR À PEDALEIRA</AppText>
            <AppText variant="label">Enviar para o buffer temporário não confirma a gravação permanente. Escolha um destino de usuário para guardar o patch.</AppText>
            <View style={styles.actions}>
              <AppButton title="Enviar ao buffer" variant="primary" busy={busy} disabled={!connected || !patch.complete} onPress={() => { void onSendToBuffer(); }} />
              <View style={styles.destination}>
                <AppText variant="label">Banco U</AppText>
                <TextInput accessibilityLabel="Banco de usuário de 1 a 50" editable={!busy} keyboardType="number-pad" maxLength={2} onBlur={() => setBankDraft(String(bank))} onChangeText={(value) => updateDestination('bank', value)} style={[type.input, styles.destinationInput]} value={bankDraft} />
                <AppText variant="label">Patch</AppText>
                <TextInput accessibilityLabel="Slot de patch de 1 a 5" editable={!busy} keyboardType="number-pad" maxLength={1} onBlur={() => setSlotDraft(String(slot))} onChangeText={(value) => updateDestination('slot', value)} style={[type.input, styles.destinationInput]} value={slotDraft} />
              </View>
            </View>
            <AppButton title={`Gravar em ${destinationKey}`} variant="danger" busy={busy} disabled={!connected || !patch.complete} onPress={() => { void requestStore(); }} />
            {confirmTarget === destinationKey ? (
              <View style={styles.confirmBox}>
                <AppText variant="label">A gravação em {destinationKey} substitui o conteúdo desse slot de usuário. Confirme somente se esse é o destino escolhido.</AppText>
                <View style={styles.actions}>
                  <AppButton title="Cancelar" variant="quiet" onPress={() => setConfirmTarget(null)} />
                  <AppButton title={`Confirmar ${destinationKey}`} variant="danger" busy={busy} disabled={busy} onPress={() => { void requestStore(); }} />
                </View>
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      <View style={styles.exportSection}>
        <View style={styles.exportCopy}>
          <AppText variant="headline">Arquivos</AppText>
          <AppText variant="label">Exporta o conjunto de patches carregados.</AppText>
        </View>
        <View style={styles.actions}>
          <AppButton title="Exportar .SYX" variant="quiet" disabled={patches.length === 0 || busy} onPress={() => onExport('syx')} />
          <AppButton title="Exportar .MID" variant="quiet" disabled={patches.length === 0 || busy} onPress={() => onExport('mid')} />
          <AppButton title="Exportar .GCL" variant="quiet" disabled={patches.length === 0 || busy} onPress={() => onExport('gcl')} />
        </View>
      </View>
    </View>
  );
}

function setPatchValue(patch: Gt1Patch, parameterId: string, value: number): Gt1Patch {
  return updatePatchParameter(patch, parameterId, value);
}

const styles = StyleSheet.create({
  section: { gap: spacing.xl, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, borderCurve: 'continuous' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.md },
  headingCopy: { gap: spacing.xs },
  kicker: { color: colors.accent },
  changeBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill },
  changeBadgeDirty: { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder },
  changeDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.success },
  changeDotDirty: { backgroundColor: colors.warning },
  dirtyText: { color: colors.warning },
  library: { gap: spacing.sm },
  patchRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, borderCurve: 'continuous' },
  patchSelected: { backgroundColor: colors.surfaceSelected, borderColor: colors.accent },
  patchIndex: { color: colors.accent, minWidth: 24 },
  patchSelectedText: { fontWeight: '700' },
  patchRowCopy: { flex: 1, gap: spacing.xs },
  warning: { color: colors.warning },
  empty: { gap: spacing.sm, paddingVertical: spacing.xxl },
  patchHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg, flexWrap: 'wrap' },
  nameGroup: { flex: 1, minWidth: 220, gap: spacing.sm },
  nameInput: { minHeight: 46, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, borderCurve: 'continuous' },
  patchMeta: { minWidth: 100, gap: spacing.sm, paddingBottom: spacing.md },
  warningBox: { padding: spacing.md, backgroundColor: colors.warningSurface, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radius.md },
  parameterSection: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.input, borderRadius: radius.md },
  parameterHeading: { gap: spacing.xs, paddingBottom: spacing.sm },
  parameterGroup: { gap: spacing.xs },
  groupDivider: { marginTop: spacing.md, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  groupTitle: { color: colors.accent, paddingBottom: spacing.xs },
  transferSection: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, borderCurve: 'continuous' },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  destination: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  destinationInput: { width: 48, height: 40, paddingHorizontal: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, borderCurve: 'continuous', textAlign: 'center', fontVariant: ['tabular-nums'] },
  confirmBox: { gap: spacing.md, padding: spacing.md, backgroundColor: colors.warningSurface, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radius.md },
  exportSection: { gap: spacing.md, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  exportCopy: { gap: spacing.xs },
  pressed: { opacity: 0.72 },
});
