import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '../src/components/AppText';
import { colors, radius, spacing } from '../src/theme';
import { AppButton } from '../src/components/AppButton';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient } from '../src/query/queryClient';
import { ACTIVE_PATCH_CONTEXT_QUERY_KEY, HTTP_BINDINGS_QUERY_KEY, HTTP_BINDINGS_STORAGE_KEY } from '../src/automation/controllerBindings';
import type { BindingGesture, ControllerBinding } from '../src/automation/controllerBindings';
import { getSharedMidiTransport } from '../src/transport/sharedTransport';

export default function AutomationScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const { t } = useTranslation(undefined, { useSuspense: false });
  const [bindings, setBindings] = useState<ControllerBinding[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [gesture, setGesture] = useState<BindingGesture>('press');
  const [holdMs, setHoldMs] = useState('2000');
  const [pressBytes, setPressBytes] = useState<number[] | null>(null);
  const [releaseBytes, setReleaseBytes] = useState<number[] | undefined>();
  const [captureTarget, setCaptureTarget] = useState<'press' | 'release' | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [expressionMode, setExpressionMode] = useState(false);
  const [expressionThreshold, setExpressionThreshold] = useState('64');
  const [expressionDirection, setExpressionDirection] = useState<'above' | 'below'>('above');
  const [patchScoped, setPatchScoped] = useState(true);
  const [httpMethod, setHttpMethod] = useState<ControllerBinding['method']>('POST');
  const [httpBody, setHttpBody] = useState('');
  const [httpHeaders, setHttpHeaders] = useState('');
  const transport = getSharedMidiTransport();

  useEffect(() => {
    void AsyncStorage.getItem(HTTP_BINDINGS_STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const loaded = JSON.parse(raw) as ControllerBinding[];
        setBindings(loaded);
        queryClient.setQueryData(HTTP_BINDINGS_QUERY_KEY, loaded);
      } catch { setCaptureError('Não foi possível ler as ações salvas.'); }
    });
  }, []);

  useEffect(() => {
    if (!captureTarget) return undefined;
    let timeout: ReturnType<typeof setTimeout>;
    const onBytes = (bytes: Uint8Array) => {
      const values = Array.from(bytes);
      if (captureTarget === 'press') setPressBytes(values);
      else setReleaseBytes(values);
      setCaptureTarget(null);
      clearTimeout(timeout);
    };
    const offMidi = transport.onMidi?.(({ bytes }) => onBytes(bytes));
    const offSysEx = transport.onSysEx(onBytes);
    timeout = setTimeout(() => {
      setCaptureTarget(null);
      setCaptureError('Nenhum evento recebido. Verifique se a GT-1 está conectada e tente novamente.');
    }, 20_000);
    return () => { clearTimeout(timeout); offMidi?.(); offSysEx(); };
  }, [captureTarget, transport]);

  const saveBindings = async (next: ControllerBinding[]) => {
    setBindings(next);
    queryClient.setQueryData(HTTP_BINDINGS_QUERY_KEY, next);
    await AsyncStorage.setItem(HTTP_BINDINGS_STORAGE_KEY, JSON.stringify(next));
  };

  const addBinding = async () => {
    if (!draftUrl.trim() || !pressBytes?.length || (expressionMode && ((pressBytes[0] & 0xf0) !== 0xb0)) || (gesture !== 'press' && !expressionMode && !releaseBytes?.length)) {
      setCaptureError(expressionMode ? 'Capture uma mensagem Control Change para usar o pedal de expressão.' : 'Informe uma URL e capture os eventos de acionamento e soltura.');
      return;
    }
    const patchId = patchScoped ? queryClient.getQueryData<string | null>(ACTIVE_PATCH_CONTEXT_QUERY_KEY) ?? undefined : undefined;
    let headers: Record<string, string> | undefined;
    try {
      const parsedUrl = new URL(draftUrl.trim());
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error('scheme');
      if (httpHeaders.trim()) {
        const parsedHeaders: unknown = JSON.parse(httpHeaders);
        if (!parsedHeaders || typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders) || Object.values(parsedHeaders).some((value) => typeof value !== 'string')) throw new Error('headers');
        headers = parsedHeaders as Record<string, string>;
      }
    }
    catch { setCaptureError(t('invalidUrlHeaders')); return; }
    const binding: ControllerBinding = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: draftName.trim() || 'GT-1 controller', pressBytes, releaseBytes, patchId,
      ...(expressionMode ? { expressionCc: pressBytes[1], expressionChannel: pressBytes[0] & 0x0f, expressionThreshold: Math.min(127, Math.max(0, Number(expressionThreshold) || 64)), expressionDirection } : {}),
      gesture, holdMs: Math.max(250, Number(holdMs) || 2000), url: draftUrl.trim(), method: httpMethod, body: httpBody || undefined, headers,
    };
    await saveBindings([...bindings, binding]);
    setDraftName(''); setDraftUrl(''); setPressBytes(null); setReleaseBytes(undefined); setHttpBody(''); setHttpHeaders(''); setCaptureError(null);
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, compact ? styles.pageCompact : null]}>
      <View style={styles.content}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={20} color={colors.text} />
          <AppText variant="label">{t('back')}</AppText>
        </Pressable>
        <View style={styles.heading}>
          <AppText variant="caption" style={styles.kicker}>{t('httpActions')}</AppText>
          <AppText variant="title">{t('automation')}</AppText>
        </View>
        <View style={[styles.card, compact ? styles.cardCompact : null]}>
          <View style={styles.copy}>
            <AppText variant="headline">{t('httpActions')}</AppText>
            <AppText variant="subhead">{t('assignmentNote')}</AppText>
            <AppText variant="subhead">{t('selectDeviceFirst')}</AppText>
          </View>
          <Field label={t('bindingName')} value={draftName} onChangeText={setDraftName} placeholder="Ex.: Próximo efeito" />
          <Field label={t('bindingUrl')} value={draftUrl} onChangeText={setDraftUrl} placeholder="http://192.168.1.10/action" autoCapitalize="none" keyboardType="url" />
          <AppText variant="label">HTTP</AppText>
          <View style={styles.row}>{(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((method) => <Pressable key={method} onPress={() => setHttpMethod(method)} style={[styles.choice, httpMethod === method ? styles.optionSelected : null]}><AppText variant="caption">{method}</AppText></Pressable>)}</View>
          {httpMethod !== 'GET' && httpMethod !== 'DELETE' ? <Field label={t('httpBody')} value={httpBody} onChangeText={setHttpBody} placeholder="{}" autoCapitalize="none" multiline /> : null}
          <Field label={t('httpHeaders')} value={httpHeaders} onChangeText={setHttpHeaders} placeholder={'{"Authorization":"Bearer …"}'} autoCapitalize="none" multiline />
          <View style={styles.row}><Pressable onPress={() => setExpressionMode((value) => !value)} style={[styles.choice, expressionMode ? styles.optionSelected : null]}><AppText variant="caption">{expressionMode ? t('expressionPedalMode') : t('midiButtonMode')}</AppText></Pressable></View>
          <View style={styles.row}><Pressable onPress={() => setPatchScoped((value) => !value)} style={[styles.choice, patchScoped ? styles.optionSelected : null]}><AppText variant="caption">{patchScoped ? t('selectedPatchScope') : t('allPatches')}</AppText></Pressable></View>
          {expressionMode ? <><Field label={t('expressionThreshold')} value={expressionThreshold} onChangeText={setExpressionThreshold} keyboardType="numeric" /><View style={styles.row}>{(['above', 'below'] as const).map((value) => <Pressable key={value} onPress={() => setExpressionDirection(value)} style={[styles.choice, expressionDirection === value ? styles.optionSelected : null]}><AppText variant="caption">{value === 'above' ? t('expressionAbove') : t('expressionBelow')}</AppText></Pressable>)}</View></> : null}
          <AppText variant="label">{t('bindingGesture')}</AppText>
          <View style={styles.row}>
            {(['press', 'release', 'hold'] as BindingGesture[]).map((value) => {
              const label = value === 'press' ? t('pressGesture') : value === 'release' ? t('releaseGesture') : t('holdGesture');
              return <Pressable key={value} onPress={() => setGesture(value)} style={[styles.choice, gesture === value ? styles.optionSelected : null]}><AppText variant="caption">{label}</AppText></Pressable>;
            })}
          </View>
          {gesture === 'hold' ? <Field label={t('holdDuration')} value={holdMs} onChangeText={setHoldMs} keyboardType="numeric" /> : null}
          <View style={styles.row}>
            <AppButton title={captureTarget === 'press' ? t('pending') : t('capturePress')} onPress={() => { setCaptureError(null); setCaptureTarget('press'); }} />
            {!expressionMode ? <AppButton title={captureTarget === 'release' ? t('pending') : t('captureRelease')} onPress={() => { setCaptureError(null); setCaptureTarget('release'); }} /> : null}
          </View>
          {pressBytes ? <AppText variant="caption">{t('capturedBytes')}: {hexBytes(pressBytes)}</AppText> : null}
          {releaseBytes ? <AppText variant="caption">{t('captureRelease')}: {hexBytes(releaseBytes)}</AppText> : null}
          {captureError ? <AppText variant="caption" style={{ color: colors.danger }}>{captureError}</AppText> : null}
          <AppButton title={t('addBinding')} onPress={() => { void addBinding(); }} variant="primary" />
          {bindings.map((binding) => (
            <View key={binding.id} style={styles.bindingRow}>
              <View style={{ flex: 1, gap: 3 }}><AppText variant="label">{binding.label}</AppText><AppText variant="caption">{binding.method} {binding.url} · {binding.patchId ? 'patch atual' : 'todos os patches'}</AppText></View>
              <Pressable onPress={() => { void saveBindings(bindings.filter((item) => item.id !== binding.id)); }}><AppText variant="caption" style={{ color: colors.danger }}>{t('deleteBinding')}</AppText></Pressable>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function hexBytes(bytes: number[]) { return bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' '); }

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; autoCapitalize?: 'none' | 'sentences'; keyboardType?: 'url' | 'numeric' | 'default'; multiline?: boolean }) {
  const { label, ...inputProps } = props;
  return <View style={{ gap: 6 }}><AppText variant="caption">{label}</AppText><TextInput {...inputProps} placeholderTextColor={colors.muted} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  pageCompact: { paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  content: { width: '100%', maxWidth: 840, alignSelf: 'center', gap: spacing.xl },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs },
  heading: { gap: spacing.xs },
  kicker: { color: colors.accent },
  card: { gap: spacing.sm, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  cardCompact: { padding: spacing.md },
  copy: { gap: spacing.xs, marginBottom: spacing.sm },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: 'transparent', borderRadius: radius.md },
  optionSelected: { backgroundColor: colors.surfaceSelected, borderColor: colors.line },
  selectedText: { color: colors.accent, fontWeight: '700' },
  input: { color: colors.text, minHeight: 42, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.canvas },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.sm },
  bindingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
