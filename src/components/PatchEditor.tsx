import { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions, type ColorValue, type ImageSourcePropType } from 'react-native';
import { RefreshCw, Settings2 } from 'lucide-react-native';
import { createMaterialTopTabNavigator } from 'expo-router/js-top-tabs';
import { effectSections, getParameterValue, getVisibleParameterDefinitions } from '../gt1/parameterMap';
import { setPatchNameLocally } from '../gt1/sysex';
import type { Gt1EffectSectionId, Gt1Patch, Gt1PatchDestination } from '../gt1/types';
import { gt1SystemSettingDefinitions, gt1SystemSettingGroups } from '../gt1/systemSettings';
import type { Gt1SystemSettingId, Gt1SystemSettings } from '../gt1/systemSettings';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { ParameterControl } from './ParameterControl';
import { PatchSlotPicker } from './PatchSlotPicker';
import { colors, radius, spacing, type } from '../theme';

const EffectTabs = createMaterialTopTabNavigator();
const SystemGroupTabs = createMaterialTopTabNavigator();
const genericEffectIcon = require('../assets/gt1/effect-block.png') as ImageSourcePropType;
const preampEffectIcon = require('../assets/gt1/preamp-block.png') as ImageSourcePropType;

function EffectTabLabel({ title, color, preamp = false, sectionId }: { title: string; color: ColorValue; preamp?: boolean; sectionId: Gt1EffectSectionId }) {
  const editor = useContext(EffectEditorContext);
  const definitions = editor ? getVisibleParameterDefinitions(editor.patch, sectionId) : [];
  let enabled = false;
  if (sectionId === 'preamp') {
    const mode = definitions.find((definition) => definition.id === 'divider-mode');
    const channel = definitions.find((definition) => definition.id === 'divider-channel');
    const dual = mode ? getParameterValue(editor!.patch, mode) === 1 : false;
    const channels = dual ? ['preamp-a-enabled', 'preamp-b-enabled'] : [`preamp-${channel && getParameterValue(editor!.patch, channel) === 1 ? 'b' : 'a'}-enabled`];
    enabled = channels.some((id) => {
      const definition = definitions.find((candidate) => candidate.id === id);
      return definition ? getParameterValue(editor!.patch, definition) === 1 : false;
    });
  } else {
    const enabledId: Record<Exclude<Gt1EffectSectionId, 'preamp'>, string> = {
      'fx1-comp': 'fx1-enabled',
      'od-ds': 'od-enabled',
      'fx2-mod': 'fx2-enabled',
      delay: 'delay-enabled',
      reverb: 'reverb-enabled',
    };
    const definition = definitions.find((candidate) => candidate.id === enabledId[sectionId]);
    enabled = definition && editor ? getParameterValue(editor.patch, definition) === 1 : false;
  }
  return (
    <View style={styles.effectTabLabelContainer}>
      <View style={[styles.effectTabStatusTriangle, { borderBottomColor: enabled ? colors.danger : '#343943' }]} />
      <Image source={preamp ? preampEffectIcon : genericEffectIcon} resizeMode="contain" style={styles.effectTabIcon} />
      <AppText variant="label" style={[styles.effectTabLabelText, { color }]}>{title}</AppText>
    </View>
  );
}

function SystemTabLabel({ color }: { color: ColorValue }) {
  return (
    <View style={styles.effectTabLabelRow}>
      <Settings2 size={16} color={color} />
      <AppText variant="label" style={[styles.effectTabLabelText, { color }]}>Sistema</AppText>
    </View>
  );
}

function SystemGroupTabLabel({ title, color }: { title: string; color: ColorValue }) {
  return <AppText variant="label" style={[styles.effectTabLabelText, { color }]}>{title}</AppText>;
}

const EffectEditorContext = createContext<{
  patch: Gt1Patch;
  busy: boolean;
  onParameterChange: (patchId: string, parameterId: string, value: number) => void;
} | null>(null);

const SystemSettingsContext = createContext<{
  connected: boolean;
  settings: Gt1SystemSettings | null;
  loading: boolean;
  resetKey: number;
  onChange: (settingId: Gt1SystemSettingId, value: number) => void;
} | null>(null);

function EffectSectionPanel({ sectionId }: { sectionId: Gt1EffectSectionId }) {
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const editor = useContext(EffectEditorContext);
  if (!editor) return null;
  const { patch, busy, onParameterChange } = editor;
  const section = effectSections.find((candidate) => candidate.id === sectionId) ?? effectSections[0];
  const definitions = getVisibleParameterDefinitions(patch, sectionId);
  const preampMode = sectionId === 'preamp' ? definitions.find((definition) => definition.id === 'divider-mode') : undefined;
  const preampChannel = sectionId === 'preamp' ? definitions.find((definition) => definition.id === 'divider-channel') : undefined;
  const dualPreamp = preampMode ? getParameterValue(patch, preampMode) === 1 : false;
  const selectedPreampChannel = preampChannel ? getParameterValue(patch, preampChannel) : 0;
  const groups = Array.from(new Set(definitions.map((definition) => definition.group)))
    .filter((group) => group !== 'Preamp routing')
    .filter((group) => dualPreamp || (group === `Preamp ${selectedPreampChannel === 0 ? 'A' : 'B'}`));
  const preampTitleSwitches = sectionId === 'preamp'
    ? groups.map((group) => definitions.find((definition) => definition.group === group && definition.id.endsWith('-enabled'))).filter((definition) => definition !== undefined)
    : [];
  const titleSwitch = sectionId === 'preamp' ? undefined : definitions.find((definition) => definition.control === 'toggle' && definition.label === 'Ligado');

  return (
    <ScrollView nestedScrollEnabled style={styles.effectTabScroll} contentContainerStyle={styles.effectTabContent}>
      <View style={styles.groupHeading}>
        <AppText variant="headline">{section.label}</AppText>
        {sectionId === 'preamp' ? (
          <View style={styles.preampTitleSwitches}>
            {preampTitleSwitches.map((definition) => (
              <View key={definition.id} style={styles.preampTitleSwitch}>
                {dualPreamp ? <AppText variant="caption">{definition.group.endsWith(' A') ? 'A' : 'B'}</AppText> : null}
                <ParameterControl
                  definition={definition}
                  value={getParameterValue(patch, definition)}
                  disabled={busy}
                  hideLabel
                  onChange={(parameterId, value) => onParameterChange(patch.id, parameterId, value)}
                />
              </View>
            ))}
          </View>
        ) : titleSwitch ? (
          <ParameterControl
            definition={titleSwitch}
            value={getParameterValue(patch, titleSwitch)}
            disabled={busy}
            hideLabel
            onChange={(parameterId, value) => onParameterChange(patch.id, parameterId, value)}
          />
        ) : null}
      </View>
      {sectionId === 'preamp' ? (
        <View style={styles.parameterGroup}>
          <View style={styles.parameterGrid}>
            {[preampMode, ...(!dualPreamp ? [preampChannel] : [])].filter((definition): definition is NonNullable<typeof definition> => Boolean(definition)).map((definition) => (
              <View key={definition.id} style={[styles.parameterItem, compact ? styles.parameterItemCompact : null]}>
                <ParameterControl
                  definition={definition}
                  value={getParameterValue(patch, definition)}
                  disabled={busy}
                  onChange={(parameterId, value) => onParameterChange(patch.id, parameterId, value)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {sectionId === 'preamp' ? groups.map((group, groupIndex) => {
        const groupDefinitions = definitions.filter((definition) => definition.group === group);
        const enabledDefinition = groupDefinitions.find((definition) => definition.control === 'toggle' && definition.label === 'Ligado');
        return (
          <View key={group} style={[styles.parameterGroup, groupIndex > 0 ? styles.groupDivider : null]}>
            <View style={styles.groupHeading}>
              <AppText variant="caption" style={styles.groupTitle}>{group.toUpperCase()}</AppText>
            </View>
            <View style={styles.parameterGrid}>
              {groupDefinitions.filter((definition) => definition !== enabledDefinition).map((definition) => (
                <View key={definition.id} style={[styles.parameterItem, compact ? styles.parameterItemCompact : null]}>
                  <ParameterControl
                    definition={definition}
                    value={getParameterValue(patch, definition)}
                    disabled={busy}
                    onChange={(parameterId, value) => onParameterChange(patch.id, parameterId, value)}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      }) : (
        <View style={styles.parameterGrid}>
          {definitions.filter((definition) => definition !== titleSwitch).map((definition) => (
            <View key={definition.id} style={[styles.parameterItem, compact ? styles.parameterItemCompact : null]}>
              <ParameterControl
                definition={definition}
                value={getParameterValue(patch, definition)}
                disabled={busy}
                onChange={(parameterId, value) => onParameterChange(patch.id, parameterId, value)}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Fx1Section() { return <EffectSectionPanel sectionId="fx1-comp" />; }
function OdDsSection() { return <EffectSectionPanel sectionId="od-ds" />; }
function PreampSection() { return <EffectSectionPanel sectionId="preamp" />; }
function Fx2Section() { return <EffectSectionPanel sectionId="fx2-mod" />; }
function DelaySection() { return <EffectSectionPanel sectionId="delay" />; }
function ReverbSection() { return <EffectSectionPanel sectionId="reverb" />; }

function SystemSettingGroupPanel({ groupId }: { groupId: string }) {
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const editor = useContext(SystemSettingsContext);
  if (!editor) return null;
  const { connected, settings, loading, resetKey, onChange } = editor;
  const group = gt1SystemSettingGroups.find((candidate) => candidate.id === groupId);
  if (!group) return null;
  const loaded = settings !== null && group.settings.every((definition) => settings[definition.id] !== undefined);
  const disabled = !connected || loading || !loaded;

  return (
    <ScrollView nestedScrollEnabled style={styles.effectTabScroll} contentContainerStyle={styles.systemTabContent}>
      {!loaded ? (
        <View style={styles.systemStatus}>
          <AppText variant="headline">{loading ? 'Lendo configurações da GT-1…' : connected ? 'Configurações indisponíveis' : 'GT-1 desconectada'}</AppText>
          <AppText variant="label">{loading ? 'As opções serão liberadas quando a leitura terminar.' : connected ? 'Reconecte a pedaleira e tente novamente.' : 'Conecte a pedaleira para ver e alterar as configurações do sistema.'}</AppText>
        </View>
      ) : null}
      {loaded ? (
        <View style={styles.systemGroup}>
          <View style={styles.systemGroupHeading}>
            <AppText variant="headline">{group.label}</AppText>
          </View>
          <View style={styles.systemParameterGrid}>
            {group.settings.map((definition) => (
              <View key={definition.id} style={[styles.parameterItem, compact ? styles.parameterItemCompact : null]}>
                <ParameterControl
                  definition={definition}
                  value={settings?.[definition.id] ?? definition.min}
                  disabled={disabled}
                  commitSliderOnRelease
                  resetKey={resetKey}
                  onChange={(settingId, value) => onChange(settingId as Gt1SystemSettingId, value)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function createSystemSettingScreen(groupId: string) {
  return function SystemSettingScreen() {
    return <SystemSettingGroupPanel groupId={groupId} />;
  };
}

const PlayOptionSettings = createSystemSettingScreen('play-option');
const KnobSettings = createSystemSettingScreen('knob-setting');
const PreferenceSettings = createSystemSettingScreen('preference');
const PhraseLoopSettings = createSystemSettingScreen('phrase-loop');
const UsbSettings = createSystemSettingScreen('usb');
const OutputSelectSettings = createSystemSettingScreen('output-select');

function SystemSettingsPanel() {
  const editor = useContext(SystemSettingsContext);
  if (!editor) return null;
  const loaded = editor.settings !== null && gt1SystemSettingDefinitions.every((definition) => editor.settings?.[definition.id] !== undefined);
  if (!loaded) return <SystemSettingGroupPanel groupId="play-option" />;

  return (
    <View style={styles.systemNavigator}>
      <SystemGroupTabs.Navigator
        initialRouteName="play-option"
        screenOptions={{
          lazy: true,
          swipeEnabled: true,
          tabBarScrollEnabled: true,
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: styles.systemTabBar,
          tabBarIndicatorStyle: styles.effectTabIndicator,
          tabBarItemStyle: styles.effectTabItem,
          tabBarLabelStyle: styles.effectTabLabel,
          sceneStyle: styles.effectTabScene,
        }}
      >
        <SystemGroupTabs.Screen name="play-option" component={PlayOptionSettings} options={{ tabBarLabel: ({ color }) => <SystemGroupTabLabel title="Play Option" color={color} /> }} />
        <SystemGroupTabs.Screen name="knob-setting" component={KnobSettings} options={{ tabBarLabel: ({ color }) => <SystemGroupTabLabel title="Knob Setting" color={color} /> }} />
        <SystemGroupTabs.Screen name="preference" component={PreferenceSettings} options={{ tabBarLabel: ({ color }) => <SystemGroupTabLabel title="Preference" color={color} /> }} />
        <SystemGroupTabs.Screen name="phrase-loop" component={PhraseLoopSettings} options={{ tabBarLabel: ({ color }) => <SystemGroupTabLabel title="Phrase Loop" color={color} /> }} />
        <SystemGroupTabs.Screen name="usb" component={UsbSettings} options={{ tabBarLabel: 'USB' }} />
        <SystemGroupTabs.Screen name="output-select" component={OutputSelectSettings} options={{ tabBarLabel: ({ color }) => <SystemGroupTabLabel title="Output Select" color={color} /> }} />
      </SystemGroupTabs.Navigator>
    </View>
  );
}

type PatchEditorProps = {
  patches: Gt1Patch[];
  activePatchId: string | null;
  dirtyPatchIds: ReadonlySet<string>;
  connected: boolean;
  busy: boolean;
  readingPatch: boolean;
  systemSettings: Gt1SystemSettings | null;
  systemSettingsBusy: boolean;
  systemSettingsRevision: number;
  onReadCurrentPatch: () => void;
  onParameterChange: (patchId: string, parameterId: string, value: number) => void;
  onPatchNameChange: (patchId: string, name: string) => void;
  onWriteToMemory: (destination: Gt1PatchDestination) => Promise<void>;
  onSystemSettingChange: (settingId: Gt1SystemSettingId, value: number) => void;
};

export function PatchEditor({ patches, activePatchId, dirtyPatchIds, connected, busy, readingPatch, systemSettings, systemSettingsBusy, systemSettingsRevision, onReadCurrentPatch, onParameterChange, onPatchNameChange, onWriteToMemory, onSystemSettingChange }: PatchEditorProps) {
  const { width, height } = useWindowDimensions();
  const compact = width < 640;
  const patch = patches.find((candidate) => candidate.id === activePatchId) ?? null;
  const isDirty = patch ? dirtyPatchIds.has(patch.id) : false;
  const [nameDraft, setNameDraft] = useState(patch?.name ?? '');
  const [writeMode, setWriteMode] = useState<'save' | 'copy' | null>(null);
  const [copySlot, setCopySlot] = useState<number | null>(null);
  const targetSlot = writeMode === 'save' ? (patch?.userPatch ?? null) : copySlot;
  const targetPatch = targetSlot === null ? undefined : patches.find((candidate) => candidate.userPatch === targetSlot);

  useEffect(() => {
    setNameDraft(patch?.name ?? '');
    setWriteMode(null);
    setCopySlot(null);
  }, [patch?.id]);

  const commitName = () => {
    if (patch && nameDraft !== patch.name) {
      const sanitized = setPatchNameLocally(patch, nameDraft).name;
      setNameDraft(sanitized);
      onPatchNameChange(patch.id, nameDraft);
    }
  };

  const openCopyModal = () => {
    setCopySlot(null);
    setWriteMode('copy');
  };

  const confirmWrite = (slot = targetSlot) => {
    if (slot === null) return;
    const destination: Gt1PatchDestination = { userPatch: slot };
    setWriteMode(null);
    setCopySlot(null);
    void onWriteToMemory(destination);
  };

  return (
    <View style={[styles.section, compact ? styles.sectionCompact : null]}>
      <View style={styles.heading}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ler patch atual"
          accessibilityState={{ disabled: !connected || busy, busy: readingPatch }}
          disabled={!connected || busy}
          onPress={onReadCurrentPatch}
          style={({ pressed }) => [styles.readPatchButton, !connected || busy ? styles.disabled : null, pressed ? styles.pressed : null]}
        >
          {readingPatch ? <ActivityIndicator size="small" color={colors.accentInk} /> : <RefreshCw size={20} strokeWidth={2.5} color={colors.accentInk} />}
        </Pressable>
        <View style={[styles.changeBadge, isDirty ? styles.changeBadgeDirty : null]}>
          <View style={[styles.changeDot, isDirty ? styles.changeDotDirty : null]} />
          <AppText variant="label" style={isDirty ? styles.dirtyText : null}>{isDirty ? 'Alterações locais' : 'Sem alterações locais'}</AppText>
        </View>
      </View>

      {!patch ? (
        <View style={styles.empty}>
          <AppText variant="headline">{connected ? 'Nenhum patch selecionado' : 'GT-1 desconectada'}</AppText>
          <AppText variant="subhead">{connected ? 'Abra a biblioteca para selecionar um patch ou importe um arquivo.' : 'Conecte a pedaleira GT-1 para carregar seus patches e editar os efeitos.'}</AppText>
        </View>
      ) : null}

      {patch ? (
        <>
          <View style={styles.patchHeader}>
            {patch.userPatch !== undefined || patch.patchNumber !== undefined || patch.bank !== undefined ? (
              <AppText variant="section" style={styles.patchSlot}>{patch.userPatch !== undefined
                ? destinationLabel(patch.userPatch)
                : `P${String(patch.patchNumber ?? ((patch.bank ?? 0) + 1)).padStart(2, '0')}`}</AppText>
            ) : null}
            <View style={styles.nameGroup}>
              <TextInput
                accessibilityLabel="Nome do patch"
                editable={!busy}
                maxLength={16}
                onChangeText={setNameDraft}
                onEndEditing={commitName}
                placeholder="Nome do patch"
                placeholderTextColor={colors.muted}
                selectTextOnFocus
                style={[type.patchName, styles.nameInput]}
                value={nameDraft}
              />
            </View>
          </View>

          {!patch.complete ? (
            <View style={styles.warningBox}>
              <AppText variant="label" style={styles.warning}>Este patch está incompleto e não pode ser gravado na memória da pedaleira.</AppText>
            </View>
          ) : null}

          <EffectEditorContext.Provider value={{ patch, busy, onParameterChange }}>
            <SystemSettingsContext.Provider value={{ connected, settings: systemSettings, loading: systemSettingsBusy, resetKey: systemSettingsRevision, onChange: onSystemSettingChange }}>
            <View style={styles.parameterSection}>
              <View style={[styles.effectNavigator, { height: Math.max(360, Math.min(560, height * 0.68)) }]}>
                <EffectTabs.Navigator
                  initialRouteName="fx1-comp"
                  screenOptions={{
                    lazy: true,
                    swipeEnabled: true,
                    tabBarScrollEnabled: true,
                    tabBarActiveTintColor: colors.text,
                    tabBarInactiveTintColor: colors.muted,
                    tabBarStyle: styles.effectTabBar,
                    tabBarIndicatorStyle: styles.effectTabIndicator,
                    tabBarItemStyle: styles.effectTabItem,
                    tabBarLabelStyle: styles.effectTabLabel,
                    sceneStyle: styles.effectTabScene,
                  }}
                >
                  <EffectTabs.Screen name="fx1-comp" component={Fx1Section} options={{ tabBarLabel: ({ color }) => <EffectTabLabel title="FX1/Comp" color={color} sectionId="fx1-comp" /> }} />
                  <EffectTabs.Screen name="od-ds" component={OdDsSection} options={{ tabBarLabel: ({ color }) => <EffectTabLabel title="OD/DS" color={color} sectionId="od-ds" /> }} />
                  <EffectTabs.Screen name="preamp" component={PreampSection} options={{ tabBarLabel: ({ color }) => <EffectTabLabel title="Preamp" color={color} preamp sectionId="preamp" /> }} />
                  <EffectTabs.Screen name="fx2-mod" component={Fx2Section} options={{ tabBarLabel: ({ color }) => <EffectTabLabel title="FX2/MOD" color={color} sectionId="fx2-mod" /> }} />
                  <EffectTabs.Screen name="delay" component={DelaySection} options={{ tabBarLabel: ({ color }) => <EffectTabLabel title="Delay" color={color} sectionId="delay" /> }} />
                  <EffectTabs.Screen name="reverb" component={ReverbSection} options={{ tabBarLabel: ({ color }) => <EffectTabLabel title="Reverb" color={color} sectionId="reverb" /> }} />
                  <EffectTabs.Screen name="system" component={SystemSettingsPanel} options={{ tabBarLabel: ({ color }) => <SystemTabLabel color={color} /> }} />
                </EffectTabs.Navigator>
              </View>
            </View>
            </SystemSettingsContext.Provider>
          </EffectEditorContext.Provider>

          <View style={styles.actionsRight}>
            <AppButton title="Salvar patch" variant="primary" busy={busy} disabled={!connected || !patch.complete || patch.userPatch === undefined} onPress={() => setWriteMode('save')} />
            <AppButton title="Copiar patch" variant="secondary" busy={busy} disabled={!connected || !patch.complete} onPress={openCopyModal} />
          </View>
        </>
      ) : null}

      <Modal visible={writeMode === 'save'} transparent animationType="fade" onRequestClose={() => setWriteMode(null)}>
        <View style={styles.modalOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar gravação de patch" onPress={() => setWriteMode(null)} style={StyleSheet.absoluteFill} />
          <View style={styles.writeModal}>
            <View style={styles.modalHeading}>
              <View style={styles.modalHeadingCopy}>
                <AppText variant="caption" style={styles.kicker}>SALVAR PATCH</AppText>
                <AppText variant="headline" numberOfLines={1}>{patch?.name ?? 'Patch selecionado'}</AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={() => setWriteMode(null)} style={styles.closeButton}>
                <AppText variant="section">×</AppText>
              </Pressable>
            </View>

            <AppText variant="subhead">O patch selecionado será salvo novamente em {targetSlot ? destinationLabel(targetSlot) : 'seu slot atual'}.</AppText>

            {targetSlot !== null ? (
              <View style={styles.confirmBox}>
                <AppText variant="label">Salvar em {destinationLabel(targetSlot)} substitui “{targetPatch?.name ?? 'o conteúdo atual'}” desse slot.</AppText>
                <View style={styles.actions}>
                  <AppButton title="Cancelar" variant="quiet" disabled={busy} onPress={() => setWriteMode(null)} />
                  <AppButton title={`${writeMode === 'copy' ? 'Copiar para' : 'Salvar em'} ${destinationLabel(targetSlot)}`} variant="danger" busy={busy} disabled={busy} onPress={confirmWrite} />
                </View>
              </View>
            ) : (
              <AppButton title="Fechar" variant="quiet" onPress={() => setWriteMode(null)} />
            )}
          </View>
        </View>
      </Modal>

      <PatchSlotPicker
        visible={writeMode === 'copy'}
        patches={patches}
        selectedSlot={copySlot}
        busy={busy}
        title={patch?.name ? `Copiar “${patch.name}”` : 'Copiar patch'}
        confirmLabel="Copiar para"
        onSelect={setCopySlot}
        onClose={() => setWriteMode(null)}
        onConfirm={(slot) => confirmWrite(slot)}
      />
    </View>
  );
}

function destinationLabel(userPatch: number): string {
  return `U${String(userPatch).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  section: { gap: spacing.xl, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, borderCurve: 'continuous' },
  sectionCompact: { gap: spacing.md, padding: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.md },
  readPatchButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.accent, borderRadius: radius.md },
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
  patchSlot: { paddingBottom: spacing.md, color: colors.accent, minWidth: 48 },
  nameGroup: { flex: 1, minWidth: 220, gap: spacing.sm },
  nameInput: { minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, borderCurve: 'continuous', fontSize: 20, fontWeight: '700' },
  patchMeta: { minWidth: 100, gap: spacing.sm, paddingBottom: spacing.md },
  warningBox: { padding: spacing.md, backgroundColor: colors.warningSurface, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radius.md },
  parameterSection: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.input, borderRadius: radius.md },
  effectNavigator: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden' },
  effectTabBar: { backgroundColor: colors.input, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, elevation: 0, shadowOpacity: 0 },
  effectTabIndicator: { height: 2, backgroundColor: colors.accent },
  effectTabItem: { width: 'auto', minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  effectTabLabel: { fontSize: 12, fontWeight: '700', textTransform: 'none' },
  effectTabLabelContainer: { position: 'relative', minHeight: 28, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  effectTabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  effectTabStatusTriangle: { position: 'absolute', left: -spacing.md - 2, bottom: -spacing.sm, width: 0, height: 0, borderBottomWidth: 9, borderRightWidth: 9, borderRightColor: 'transparent' },
  effectTabLabelText: { fontSize: 12, fontWeight: '700' },
  effectTabIcon: { width: 16, height: 16 },
  effectTabScene: { backgroundColor: colors.surface },
  effectTabScroll: { flex: 1, width: '100%' },
  effectTabContent: { flexGrow: 1, alignItems: 'stretch', gap: spacing.lg, padding: spacing.md },
  systemTabContent: { gap: spacing.md, padding: spacing.md },
  systemNavigator: { flex: 1, backgroundColor: colors.surface },
  systemTabBar: { backgroundColor: colors.input, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, elevation: 0, shadowOpacity: 0 },
  systemStatus: { gap: spacing.xs, padding: spacing.lg, backgroundColor: colors.input, borderRadius: radius.md },
  systemGroup: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  systemGroupHeading: { gap: spacing.xs },
  systemParameterGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  activeSectionCopy: { gap: spacing.xs },
  parameterGroup: { width: '100%', alignSelf: 'stretch', gap: spacing.xs },
  groupHeading: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  preampTitleSwitches: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  preampTitleSwitch: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  parameterGrid: { width: '100%', alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  parameterItem: { flexBasis: '48%', flexGrow: 1, minWidth: 290 },
  parameterItemCompact: { flexBasis: '100%', minWidth: 0, maxWidth: '100%' },
  groupDivider: { marginTop: spacing.md, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  groupTitle: { color: colors.accent, paddingBottom: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  actionsRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm },
  confirmBox: { gap: spacing.md, padding: spacing.md, backgroundColor: colors.warningSurface, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radius.md },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0, 0, 0, 0.68)' },
  writeModal: { width: '100%', maxWidth: 560, maxHeight: '88%', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.xl, borderCurve: 'continuous' },
  modalHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  modalHeadingCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.input, borderRadius: radius.md },
  slotList: { flexGrow: 0, maxHeight: 340, minHeight: 100 },
  slotListContent: { gap: spacing.xs },
  slotRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  slotSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceSelected },
  slotNumber: { minWidth: 34, color: colors.accent },
  slotName: { flex: 1, minWidth: 0 },
  selectedText: { color: colors.accent },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
