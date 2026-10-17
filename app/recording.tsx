import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Camera, ChevronLeft, Circle, Square } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppButton } from '../src/components/AppButton';
import { AppText } from '../src/components/AppText';
import { colors, radius, spacing } from '../src/theme';
import { getSharedMidiTransport } from '../src/transport/sharedTransport';
import { queryClient } from '../src/query/queryClient';
import { ACTIVE_PATCH_CONTEXT_QUERY_KEY } from '../src/automation/controllerBindings';
import { listCaptureDevices, requestCapturePermission, saveRecording, startVideoRecording } from '../src/video/recorder';
import type { CaptureDevice, RecordingHandle, VideoRecordingOptions } from '../src/video/recorder';

const STORAGE_KEY = 'gt1-video-settings-v1';
const defaultOptions: VideoRecordingOptions = { width: 1920, height: 1080, fps: 30, videoBitrate: 8_000_000, audioDelayMs: 0, audioDeviceId: '', videoDeviceId: '' };

export default function RecordingScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const { t } = useTranslation(undefined, { useSuspense: false });
  const [options, setOptions] = useState(defaultOptions);
  const [devices, setDevices] = useState<CaptureDevice[]>([]);
  const [cameraId, setCameraId] = useState('');
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState('');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [triggerBytes, setTriggerBytes] = useState<number[] | null>(null);
  const [triggerReleaseBytes, setTriggerReleaseBytes] = useState<number[] | null>(null);
  const [triggerPatchId, setTriggerPatchId] = useState<string | null>(null);
  const [triggerAllPatches, setTriggerAllPatches] = useState(false);
  const [triggerHoldMs, setTriggerHoldMs] = useState('0');
  const [capturingTrigger, setCapturingTrigger] = useState(false);
  const [captureRelease, setCaptureRelease] = useState(false);
  const handleRef = useRef<RecordingHandle | null>(null);
  const startingRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerHeldRef = useRef(false);
  const previewRef = useRef<any>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const startRef = useRef<() => void>(() => undefined);
  const transport = getSharedMidiTransport();
  const audioDevices = devices.filter((device) => device.kind === 'audioinput' && /gt.?1|boss|roland|usb/i.test(device.label));
  const cameraDevices = devices.filter((device) => device.kind === 'videoinput');

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (!raw) { setPreferencesLoaded(true); return; }
      try {
        const parsed = JSON.parse(raw) as Partial<VideoRecordingOptions> & { triggerBytes?: number[] | null; triggerReleaseBytes?: number[] | null; triggerPatchId?: string | null; triggerHoldMs?: string; triggerAllPatches?: boolean };
        const saved = { ...defaultOptions, ...parsed };
        setOptions(saved);
        setCameraId(saved.videoDeviceId);
        setTriggerBytes(parsed.triggerBytes ?? null);
        setTriggerReleaseBytes(parsed.triggerReleaseBytes ?? null);
        setTriggerPatchId(parsed.triggerPatchId ?? null);
        setTriggerHoldMs(parsed.triggerHoldMs ?? '0');
        setTriggerAllPatches(parsed.triggerAllPatches ?? false);
      } catch { /* Keep defaults. */ }
      finally { setPreferencesLoaded(true); }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...options, triggerBytes, triggerReleaseBytes, triggerPatchId, triggerHoldMs, triggerAllPatches }));
  }, [preferencesLoaded, options, triggerBytes, triggerReleaseBytes, triggerPatchId, triggerHoldMs, triggerAllPatches]);

  useEffect(() => () => {
    const active = handleRef.current;
    handleRef.current = null;
    if (active) void active.stop().then(saveRecording).catch(() => undefined);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, []);

  useEffect(() => {
    const receive = (bytes: Uint8Array) => {
      const currentPatchId = queryClient.getQueryData<string | null>(ACTIVE_PATCH_CONTEXT_QUERY_KEY) ?? null;
      if (triggerPatchId && triggerPatchId !== currentPatchId) return;
      const samePress = triggerBytes && triggerBytes.length === bytes.length && triggerBytes.every((byte, index) => byte === bytes[index]);
      const sameRelease = triggerReleaseBytes && triggerReleaseBytes.length === bytes.length && triggerReleaseBytes.every((byte, index) => byte === bytes[index]);
      if (samePress && Number(triggerHoldMs) > 0) {
        if (holdTimerRef.current || triggerHeldRef.current) return;
        if (!triggerReleaseBytes) { setMessage('Capture também o evento de soltura para ativar o gatilho por duração.'); return; }
        triggerHeldRef.current = true;
        holdTimerRef.current = setTimeout(() => {
          holdTimerRef.current = null;
          if (handleRef.current) void stopRecording();
          else if (!startingRef.current) startRef.current();
        }, Math.max(250, Number(triggerHoldMs)));
      } else if (samePress && !startingRef.current && !triggerHeldRef.current) {
        triggerHeldRef.current = true;
        if (handleRef.current) void stopRecording();
        else startRef.current();
        if (!triggerReleaseBytes) setTimeout(() => { triggerHeldRef.current = false; }, 300);
      } else if (sameRelease) {
        triggerHeldRef.current = false;
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
      }
    };
    const offMidi = transport.onMidi?.(({ bytes }) => receive(bytes));
    const offSysEx = transport.onSysEx(receive);
    return () => { offMidi?.(); offSysEx(); };
  }, [transport, triggerBytes, triggerReleaseBytes, triggerPatchId, triggerHoldMs]);

  const refreshDevices = async () => {
    setMessage('');
    try {
      await requestCapturePermission();
      const available = await listCaptureDevices();
      setDevices(available);
      const audio = available.find((device) => device.kind === 'audioinput' && /gt.?1|boss|roland|usb/i.test(device.label));
      const camera = available.find((device) => device.kind === 'videoinput');
      setOptions((current) => ({ ...current, audioDeviceId: current.audioDeviceId || audio?.id || '' }));
      setCameraId((current) => current || camera?.id || '');
      setOptions((current) => ({ ...current, videoDeviceId: current.videoDeviceId || camera?.id || '' }));
      if (!audio) setMessage('Entrada de áudio da GT-1 não encontrada. Selecione uma interface USB adequada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const stopRecording = async () => {
    const handle = handleRef.current;
    if (!handle) return;
    handleRef.current = null;
    setRecording(false);
    try {
      const blob = await handle.stop();
      await saveRecording(blob);
      setMessage(t('recordingSaved'));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  const startRecording = async () => {
    if (startingRef.current || handleRef.current) return;
    if (!options.audioDeviceId || !cameraId) { setMessage(t('captureDeviceRequired')); return; }
    startingRef.current = true;
    setMessage('');
    try {
      const handle = await startVideoRecording({ ...options, videoDeviceId: cameraId }, (stream) => {
        previewStreamRef.current = stream;
        const container = previewRef.current;
        if (container && !container.querySelector('video')) {
          const preview = document.createElement('video');
          preview.autoplay = true; preview.muted = true; preview.playsInline = true;
          preview.style.width = '100%'; preview.style.maxHeight = '420px'; preview.style.objectFit = 'contain';
          container.appendChild(preview);
        }
        const preview = container?.querySelector('video') as HTMLVideoElement | null;
        if (preview) { preview.srcObject = stream; void preview.play(); }
      });
      handleRef.current = handle;
      setRecording(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { startingRef.current = false; }
  };
  startRef.current = () => { void startRecording(); };

  const captureTrigger = (target: 'press' | 'release') => {
    setMessage('');
    setCapturingTrigger(true);
    const currentPatchId = queryClient.getQueryData<string | null>(ACTIVE_PATCH_CONTEXT_QUERY_KEY);
    let done = false;
    const finish = (bytes: Uint8Array) => {
      if (done) return;
      done = true;
      if (target === 'release') setTriggerReleaseBytes(Array.from(bytes));
      else setTriggerBytes(Array.from(bytes));
      setTriggerPatchId(triggerAllPatches ? null : currentPatchId ?? null);
      setCapturingTrigger(false);
      setMessage(`Pedal vinculado ao patch selecionado${currentPatchId ? '' : ' (sem patch ativo)'}.`);
      offMidi?.(); offSysEx(); clearTimeout(timeout);
    };
    const offMidi = transport.onMidi?.(({ bytes }) => finish(bytes));
    const offSysEx = transport.onSysEx(finish);
    const timeout = setTimeout(() => { setCapturingTrigger(false); setMessage('Nenhum evento recebido da pedaleira.'); offMidi?.(); offSysEx(); }, 20_000);
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, compact ? styles.pageCompact : null]}>
      <View style={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><ChevronLeft size={20} color={colors.text} /><AppText variant="label">{t('back')}</AppText></Pressable>
        <View style={styles.heading}><Camera size={18} color={colors.accent} /><AppText variant="title">{t('videoRecording')}</AppText></View>
        {Platform.OS === 'ios' ? <AppText variant="subhead">{t('recordingUnsupported')}</AppText> : null}
        <View style={[styles.card, compact ? styles.cardCompact : null]}>
          <View style={styles.row}>
            <AppButton title={t('recordingPermission')} onPress={() => { void refreshDevices(); }} />
            <AppButton title={t('refreshDevices')} onPress={() => { void refreshDevices(); }} />
          </View>
          <AppText variant="label">{t('audioInput')}</AppText>
          <View style={styles.choices}>{audioDevices.map((device) => <Choice key={device.id} selected={device.id === options.audioDeviceId} label={device.label} onPress={() => setOptions((value) => ({ ...value, audioDeviceId: device.id }))} />)}</View>
          <AppText variant="label">{t('camera')}</AppText>
          <View style={styles.choices}>{cameraDevices.map((device) => <Choice key={device.id} selected={device.id === cameraId} label={device.label} onPress={() => { setCameraId(device.id); setOptions((current) => ({ ...current, videoDeviceId: device.id })); }} />)}</View>
          <AppText variant="label">{t('resolution')}</AppText>
          <View style={styles.row}>{[[1280, 720, '720p'], [1920, 1080, '1080p'], [3840, 2160, '4K']].map(([width, height, label]) => <Choice key={label} selected={options.width === width} label={String(label)} onPress={() => setOptions((value) => ({ ...value, width: Number(width), height: Number(height) }))} />)}</View>
          <AppText variant="label">{t('frameRate')}</AppText>
          <View style={styles.row}>{[24, 30, 60].map((fps) => <Choice key={fps} selected={options.fps === fps} label={`${fps} FPS`} onPress={() => setOptions((value) => ({ ...value, fps }))} />)}</View>
          <Field label={t('bitrate')} value={String(Math.round(options.videoBitrate / 1_000_000))} suffix="Mbps" onChangeText={(value) => setOptions((current) => ({ ...current, videoBitrate: Math.max(1, Number(value) || 1) * 1_000_000 }))} />
          <Field label={t('audioDelay')} value={String(options.audioDelayMs)} suffix="ms" onChangeText={(value) => setOptions((current) => ({ ...current, audioDelayMs: Number(value) || 0 }))} />
          <AppText variant="subhead">{t('audioDelayHint')}</AppText>
          <Field label={t('holdBeforeToggle')} value={triggerHoldMs} suffix="ms" onChangeText={setTriggerHoldMs} />
          <View style={styles.row}><Choice selected={triggerAllPatches} label={triggerAllPatches ? t('allPatches') : t('selectedPatchScope')} onPress={() => setTriggerAllPatches((value) => !value)} /></View>
          <View style={styles.row}>
            <AppButton title={capturingTrigger && !captureRelease ? t('pending') : t('learnRecordTrigger')} onPress={() => { setCaptureRelease(false); captureTrigger('press'); }} />
            {Number(triggerHoldMs) > 0 ? <AppButton title={capturingTrigger && captureRelease ? t('pending') : t('captureRelease')} onPress={() => { setCaptureRelease(true); captureTrigger('release'); }} /> : null}
          </View>
          {triggerBytes ? <AppText variant="caption">MIDI: {hexBytes(triggerBytes)}</AppText> : null}
          {triggerReleaseBytes ? <AppText variant="caption">Soltura: {hexBytes(triggerReleaseBytes)}</AppText> : null}
          {message ? <AppText variant="subhead" style={{ color: colors.warning }}>{message}</AppText> : null}
          {Platform.OS === 'web' ? <View ref={previewRef} style={styles.preview} /> : null}
          <AppButton title={recording ? t('stopRecording') : t('startRecording')} onPress={() => { void (recording ? stopRecording() : startRecording()); }} variant={recording ? 'danger' : 'primary'} />
          <View style={styles.recordIndicator}>{recording ? <Circle size={10} color={colors.danger} fill={colors.danger} /> : <Square size={10} color={colors.muted} />}<AppText variant="caption">{recording ? 'REC' : 'STOP'}</AppText></View>
        </View>
      </View>
    </ScrollView>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choice, selected ? styles.selected : null]}><AppText variant="caption" style={selected ? { color: colors.accent } : undefined}>{label}</AppText></Pressable>;
}
function Field({ label, value, suffix, onChangeText }: { label: string; value: string; suffix: string; onChangeText: (value: string) => void }) {
  return <View style={styles.field}><AppText variant="label">{label}</AppText><View style={styles.fieldInput}><TextInput value={value} onChangeText={onChangeText} keyboardType="numeric" style={styles.input} /><AppText variant="subhead">{suffix}</AppText></View></View>;
}
function hexBytes(bytes: number[]) { return bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' '); }

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: colors.canvas, padding: spacing.xl },
  pageCompact: { padding: spacing.sm },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', gap: spacing.lg },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  card: { gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  cardCompact: { padding: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: { padding: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  selected: { backgroundColor: colors.surfaceSelected, borderColor: colors.accent },
  field: { gap: spacing.xs },
  fieldInput: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { width: 120, minHeight: 40, paddingHorizontal: spacing.sm, color: colors.text, backgroundColor: colors.input, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md },
  preview: { minHeight: 240, backgroundColor: '#000', borderRadius: radius.md },
  recordIndicator: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
