import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Settings2, Camera, Workflow } from 'lucide-react-native';
import { AppButton } from '../src/components/AppButton';
import { AppText } from '../src/components/AppText';
import { ConnectionPanel } from '../src/components/ConnectionPanel';
import { PatchEditor } from '../src/components/PatchEditor';
import { PatchLibraryDrawer } from '../src/components/PatchLibraryDrawer';
import { PatchSlotPicker } from '../src/components/PatchSlotPicker';
import { PendingPatchSwitchModal } from '../src/components/PendingPatchSwitchModal';
import { MockModeSwitch } from '../src/components/MockModeSwitch';
import { addPatches, DEFAULT_GT1_UNIT_ID } from '../src/gt1/editorState';
import { parsePatchFile, serializePatchFile } from '../src/gt1/patchFiles';
import { Gt1Client } from '../src/gt1/client';
import type { Gt1EditorClient } from '../src/gt1/client';
import { createMockGt1Client } from '../src/gt1/mockClient';
import { GT1_USER_PATCH_COUNT, patchContentsEqual, setPatchNameLocally, setParameterLocally } from '../src/gt1/sysex';
import { composePatchLibrary, findMatchingUserPatch, mergeUserPatchScan } from '../src/gt1/userPatchQuery';
import type { Gt1Patch, Gt1PatchDestination } from '../src/gt1/types';
import { openPatchFiles, savePatchFile } from '../src/patch-files/fileAccess';
import { getSharedMidiTransport } from '../src/transport/sharedTransport';
import { ACTIVE_PATCH_CONTEXT_QUERY_KEY, ControllerBindingRunner, HTTP_BINDINGS_QUERY_KEY, HTTP_BINDINGS_STORAGE_KEY, bindingEventFromMidi } from '../src/automation/controllerBindings';
import type { ControllerBinding } from '../src/automation/controllerBindings';
import type { MidiDevice } from '../src/transport/transport';
import { colors, radius, spacing } from '../src/theme';
import { queryClient, USER_PATCH_QUERY_KEY } from '../src/query/queryClient';
import { getPatchSwitchDecision, patchSwitchReducer } from '../src/gt1/patchSwitchState';
import type { Gt1SystemSettingId, Gt1SystemSettings } from '../src/gt1/systemSettings';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'A operação não foi concluída.';
}

function uniquePatches(parsed: Gt1Patch[], fileIndex: number): Gt1Patch[] {
  const stamp = `${Date.now()}-${fileIndex}`;
  return parsed.map((patch, index) => ({
    ...patch,
    id: `patch-${stamp}-${index}`,
  }));
}

function destinationLabel(userPatch: number): string {
  return `U${String(userPatch).padStart(2, '0')}`;
}

export default function EditorScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const transport = useMemo(() => getSharedMidiTransport(), []);
  const realClient = useMemo(() => new Gt1Client(transport, DEFAULT_GT1_UNIT_ID), [transport]);
  const mockClient = useMemo(() => createMockGt1Client(), []);
  const [mockMode, setMockMode] = useState(false);
  const client: Gt1EditorClient = mockMode ? mockClient : realClient;
  const userPatchQuery = useQuery<Gt1Patch[]>({
    queryKey: USER_PATCH_QUERY_KEY,
    enabled: false,
    retry: false,
    queryFn: async ({ signal }) => {
      if (mockMode) throw new Error('Patches mock não devem ser gravados no cache persistido.');
      const previous = queryClient.getQueryData<Gt1Patch[]>(USER_PATCH_QUERY_KEY) ?? [];
      const result = await client.readUserPatchNames(DEFAULT_GT1_UNIT_ID, (update) => {
        setPatchScan({ completed: update.completed, total: update.total, userPatch: update.userPatch });
        queryClient.setQueryData<Gt1Patch[]>(USER_PATCH_QUERY_KEY, (current) => mergeUserPatchScan(
          current ?? previous,
          update.patch ? [update.patch] : [],
          update.error ? [{ userPatch: update.userPatch }] : [],
        ));
      }, signal);
      scanFailuresRef.current = result.failures.map(({ userPatch }) => userPatch);
      return mergeUserPatchScan(
        queryClient.getQueryData<Gt1Patch[]>(USER_PATCH_QUERY_KEY) ?? previous,
        result.patches,
        result.failures,
      );
    },
  });
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [connected, setConnected] = useState(false);
  const [systemSettings, setSystemSettings] = useState<Gt1SystemSettings | null>(null);
  const [systemSettingsLoading, setSystemSettingsLoading] = useState(false);
  const [systemSettingsWriting, setSystemSettingsWriting] = useState(false);
  const [systemSettingsRevision, setSystemSettingsRevision] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [patchScan, setPatchScan] = useState<{ completed: number; total: number; userPatch: number } | null>(null);
  const toastOpacity = useRef(new Animated.Value(1)).current;
  const [connectionModalVisible, setConnectionModalVisible] = useState(false);
  const [libraryDrawerVisible, setLibraryDrawerVisible] = useState(false);
  const [pendingSavePickerVisible, setPendingSavePickerVisible] = useState(false);
  const [pendingSaveSlot, setPendingSaveSlot] = useState<number | null>(null);
  const [sessionPatches, setSessionPatches] = useState<Gt1Patch[]>([]);
  const [mockPatches, setMockPatches] = useState<Gt1Patch[]>([]);
  const [editOverlays, setEditOverlays] = useState<Record<string, Gt1Patch>>({});
  const [patchSwitchState, dispatchPatchSwitch] = useReducer(patchSwitchReducer, {
    activePatchId: null,
    targetPatchId: null,
    dirtyPatchIds: new Set<string>(),
    phase: 'idle',
  });
  const { activePatchId, dirtyPatchIds } = patchSwitchState;
  const dirtyPatchIdsRef = useRef<ReadonlySet<string>>(dirtyPatchIds);
  const preMockSessionRef = useRef<{
    activePatchId: string | null;
    dirtyPatchIds: ReadonlySet<string>;
    sessionPatches: Gt1Patch[];
    editOverlays: Record<string, Gt1Patch>;
  } | null>(null);
  const scanFailuresRef = useRef<number[]>([]);
  const systemSettingsWriteCountRef = useRef(0);
  const sessionGenerationRef = useRef(0);
  const currentPedalPatchRef = useRef<Gt1Patch | null>(null);
  const initialPatchReconcilePendingRef = useRef(false);
  const busy = working !== null;
  const visibleDevices = mockMode ? [{ id: 'mock-gt1', name: 'BOSS GT-1 (mock)' }] : devices;
  const visibleSelectedDeviceId = mockMode ? 'mock-gt1' : selectedDeviceId;
  const selectedDeviceName = visibleDevices.find((device) => device.id === visibleSelectedDeviceId)?.name;
  const devicePatches = mockMode ? mockPatches : userPatchQuery.data ?? [];
  const patches = useMemo(() => {
    return composePatchLibrary(devicePatches, sessionPatches, editOverlays);
  }, [devicePatches, editOverlays, sessionPatches]);
  // The live edit buffer is not a user memory slot. Keep it available to the
  // editor when its slot cannot be identified, but never expose it as an extra
  // item in the patch library (the GT-1 has exactly 99 user slots).
  const libraryPatches = useMemo(
    () => patches.filter((patch) => patch.id !== 'device-current'),
    [patches],
  );
  const selectedPatch = patches.find((patch) => patch.id === activePatchId);
  const selectedPatchIdRef = useRef<string | null>(activePatchId);
  selectedPatchIdRef.current = activePatchId;
  useEffect(() => { queryClient.setQueryData(ACTIVE_PATCH_CONTEXT_QUERY_KEY, activePatchId ?? null); }, [activePatchId]);
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(HTTP_BINDINGS_STORAGE_KEY).then((raw) => {
      if (!cancelled && raw) {
        try { queryClient.setQueryData(HTTP_BINDINGS_QUERY_KEY, JSON.parse(raw) as ControllerBinding[]); } catch { /* Ignore invalid saved configuration. */ }
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!notice) {
      toastOpacity.setValue(1);
      return;
    }
    if (patchScan) {
      toastOpacity.stopAnimation();
      toastOpacity.setValue(1);
      return;
    }

    const fadeOut = Animated.timing(toastOpacity, {
      toValue: 0,
      delay: 2700,
      duration: 300,
      useNativeDriver: true,
    });
    fadeOut.start(({ finished }) => {
      if (finished) setNotice(null);
    });
    return () => fadeOut.stop();
  }, [notice, patchScan, toastOpacity]);

  useEffect(() => {
    dirtyPatchIdsRef.current = dirtyPatchIds;
  }, [dirtyPatchIds]);

  const refreshDevices = useCallback(async () => {
    setScanning(true);
    setConnectionError(null);
    setOperationError(null);
    try {
      const found = await transport.listDevices();
      setDevices(found);
      setSelectedDeviceId((current) => found.some((device) => device.id === current) ? current : (found[0]?.id ?? ''));
      if (found.length === 0) setConnectionError(null);
    } catch (error) {
      setConnectionError(getErrorMessage(error));
    } finally {
      setScanning(false);
    }
  }, [transport]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    if (mockMode) return undefined;
    const removeListener = transport.onDisconnect?.(() => {
      sessionGenerationRef.current += 1;
      void queryClient.cancelQueries({ queryKey: USER_PATCH_QUERY_KEY });
      setPatchScan(null);
      setConnected(false);
      setSystemSettings(null);
      setSystemSettingsLoading(false);
      setSystemSettingsWriting(false);
      systemSettingsWriteCountRef.current = 0;
      setConnectionError('A pedaleira foi desconectada. Reconecte-a e atualize a lista MIDI.');
      setNotice(null);
    });
    return () => removeListener?.();
  }, [mockMode, transport]);

  useEffect(() => {
    if (!connected || mockMode) return undefined;
    const runner = new ControllerBindingRunner(
      () => queryClient.getQueryData<ControllerBinding[]>(HTTP_BINDINGS_QUERY_KEY) ?? [],
      (binding, error) => setOperationError(`A ação HTTP “${binding.label}” falhou: ${getErrorMessage(error)}`),
    );
    const offMidi = transport.onMidi?.((event) => runner.handle(bindingEventFromMidi(event, selectedPatchIdRef.current)));
    // Some GT-1 controller functions arrive as SysEx instead of channel MIDI.
    const offSysEx = transport.onSysEx((bytes) => runner.handle({
      bytes: Array.from(bytes), timestamp: Date.now(), patchId: selectedPatchIdRef.current,
    }));
    return () => { offMidi?.(); offSysEx(); runner.dispose(); };
  }, [connected, mockMode, transport]);

  useEffect(() => {
    if (mockMode || !connected || transport.onDisconnect || !selectedDeviceId) return undefined;
    let cancelled = false;
    let checking = false;
    const checkConnection = async () => {
      if (checking) return;
      checking = true;
      try {
        const available = await transport.listDevices();
        if (!cancelled && !available.some((device) => device.id === selectedDeviceId)) {
          sessionGenerationRef.current += 1;
          setConnected(false);
          setSystemSettings(null);
          setSystemSettingsLoading(false);
          setSystemSettingsWriting(false);
          systemSettingsWriteCountRef.current = 0;
          setConnectionError('A pedaleira foi desconectada. Reconecte-a e atualize a lista MIDI.');
          setNotice(null);
          void transport.disconnect().catch(() => undefined);
        }
      } catch {
        // A temporary port enumeration error does not prove that the GT-1 disconnected.
      } finally {
        checking = false;
      }
    };
    const interval = setInterval(() => { void checkConnection(); }, 2_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connected, mockMode, selectedDeviceId, transport]);

  useEffect(() => () => {
    void queryClient.cancelQueries({ queryKey: USER_PATCH_QUERY_KEY });
  }, []);

  const perform = async (label: string, operation: () => Promise<void>) => {
    if (busy) return;
    setWorking(label);
    setOperationError(null);
    setConnectionError(null);
    setNotice(null);
    try {
      await operation();
    } catch (error) {
      const message = getErrorMessage(error);
      setOperationError(message);
      if (label === 'Conectando' || label === 'Desconectando') setConnectionError(message);
    } finally {
      setWorking(null);
    }
  };

  const markPatchDirty = (patchId: string, dirty: boolean) => {
    const next = new Set(dirtyPatchIdsRef.current);
    if (dirty) next.add(patchId);
    else next.delete(patchId);
    dirtyPatchIdsRef.current = next;
    dispatchPatchSwitch({ type: 'set-dirty', patchId, dirty });
  };

  const toggleMockMode = (enabled: boolean) => {
    if (enabled === mockMode) return;
    if (systemSettingsWriteCountRef.current > 0) return;
    sessionGenerationRef.current += 1;
    if (enabled) {
      void perform('Ativando modo mock', async () => {
        await queryClient.cancelQueries({ queryKey: USER_PATCH_QUERY_KEY });
        if (connected) await transport.disconnect();
        preMockSessionRef.current = { activePatchId, dirtyPatchIds: new Set(dirtyPatchIdsRef.current), sessionPatches, editOverlays };
        mockClient.reset();
        const simulatedPatches = mockClient.getUserPatches();
        const [currentPatch, loadedSystemSettings] = await Promise.all([
          mockClient.readCurrentPatch(DEFAULT_GT1_UNIT_ID),
          mockClient.readSystemSettings(DEFAULT_GT1_UNIT_ID),
        ]);
        const scanResult = await mockClient.readUserPatchNames(DEFAULT_GT1_UNIT_ID, (update) => {
          setPatchScan({ completed: update.completed, total: update.total, userPatch: update.userPatch });
        });
        setMockPatches(scanResult.patches);
        setSessionPatches([]);
        setEditOverlays({});
        dirtyPatchIdsRef.current = new Set();
        dispatchPatchSwitch({ type: 'restore-session', activePatchId: currentPatch.id, dirtyPatchIds: new Set() });
        currentPedalPatchRef.current = currentPatch;
        initialPatchReconcilePendingRef.current = false;
        setSystemSettings(loadedSystemSettings);
        setSystemSettingsLoading(false);
        setSystemSettingsWriting(false);
        setConnected(true);
        setMockMode(true);
        setConnectionError(null);
        setOperationError(null);
        setPatchScan(null);
        setConnectionModalVisible(false);
        setNotice(`Modo mock ativo · ${simulatedPatches.length} patches simulados.`);
      });
      return;
    }

    void perform('Desativando modo mock', async () => {
      await queryClient.cancelQueries({ queryKey: USER_PATCH_QUERY_KEY });
      const previous = preMockSessionRef.current;
      mockClient.clear();
      setMockMode(false);
      setMockPatches([]);
      setConnected(false);
      setSystemSettings(null);
      setSystemSettingsLoading(false);
      setSystemSettingsWriting(false);
      systemSettingsWriteCountRef.current = 0;
      setPatchScan(null);
      setSessionPatches(previous?.sessionPatches ?? []);
      setEditOverlays(previous?.editOverlays ?? {});
      dirtyPatchIdsRef.current = new Set(previous?.dirtyPatchIds ?? []);
      dispatchPatchSwitch({
        type: 'restore-session',
        activePatchId: previous?.activePatchId ?? null,
        dirtyPatchIds: previous?.dirtyPatchIds ?? new Set(),
      });
      preMockSessionRef.current = null;
      currentPedalPatchRef.current = null;
      setConnectionModalVisible(false);
      setLibraryDrawerVisible(false);
      setPendingSavePickerVisible(false);
      setPendingSaveSlot(null);
      setConnectionError(null);
      setNotice('Modo mock desativado.');
      await refreshDevices();
    });
  };

  const scanUserPatches = async () => {
    scanFailuresRef.current = [];
    setPatchScan({ completed: 0, total: GT1_USER_PATCH_COUNT, userPatch: 1 });

    try {
      const result = await userPatchQuery.refetch();
      if (result.error) throw result.error;
      const livePatch = currentPedalPatchRef.current;
      const matchingPatch = livePatch && findMatchingUserPatch(livePatch, result.data ?? []);
      if (initialPatchReconcilePendingRef.current && matchingPatch) {
        setSessionPatches((current) => current.filter((patch) => patch.id !== 'device-current'));
        dispatchPatchSwitch({ type: 'set-active', patchId: matchingPatch.id });
      }
      initialPatchReconcilePendingRef.current = false;
      const failedSlots = scanFailuresRef.current.map((userPatch) => `U${String(userPatch).padStart(2, '0')}`);
      setNotice(`Leitura da GT-1 concluída: ${result.data?.length ?? 0}/${GT1_USER_PATCH_COUNT} nomes de slots carregados.${failedSlots.length ? ` Falhas: ${failedSlots.join(', ')}.` : ''}`);
    } catch (error) {
      setOperationError(`Não foi possível listar os patches da GT-1: ${getErrorMessage(error)}`);
    } finally {
      setPatchScan(null);
    }
  };

  const connect = () => perform('Conectando', async () => {
    if (mockMode) throw new Error('Desative o modo mock para conectar à pedaleira real.');
    if (!selectedDeviceId) throw new Error('Selecione um dispositivo MIDI primeiro.');
    setSystemSettings(null);
    setSystemSettingsLoading(true);
    try {
      await transport.connect(selectedDeviceId);
      await client.initializeEditorCommunication(DEFAULT_GT1_UNIT_ID);
      const currentPatch = await client.readCurrentPatch(DEFAULT_GT1_UNIT_ID);
      const loadedSystemSettings = await client.readSystemSettings(DEFAULT_GT1_UNIT_ID);
      setSystemSettings(loadedSystemSettings);
      currentPedalPatchRef.current = currentPatch;
      initialPatchReconcilePendingRef.current = true;
      const cachedMatch = findMatchingUserPatch(
        currentPatch,
        queryClient.getQueryData<Gt1Patch[]>(USER_PATCH_QUERY_KEY) ?? [],
      );
      setSessionPatches((current) => current.filter((patch) => patch.id !== 'device-current'));
      if (cachedMatch) {
        dispatchPatchSwitch({ type: 'set-active', patchId: cachedMatch.id });
      } else {
        const currentBufferPatch: Gt1Patch = {
          ...currentPatch,
          id: 'device-current',
          sourceName: 'GT-1 · Buffer atual',
        };
        setSessionPatches((current) => addPatches(current, [currentBufferPatch]));
        dispatchPatchSwitch({ type: 'set-active', patchId: currentBufferPatch.id });
      }
    } catch (error) {
      setSystemSettings(null);
      await transport.disconnect().catch(() => undefined);
      throw error;
    } finally {
      setSystemSettingsLoading(false);
    }
    setConnected(true);
    setConnectionError(null);
    setNotice('GT-1 conectada no modo de comunicação. Lendo os nomes dos patches…');
    setConnectionModalVisible(false);
    void scanUserPatches();
  });

  const disconnect = () => {
    if (mockMode) {
      toggleMockMode(false);
      return;
    }
    return perform('Desconectando', async () => {
      await queryClient.cancelQueries({ queryKey: USER_PATCH_QUERY_KEY });
      await transport.disconnect();
      sessionGenerationRef.current += 1;
      setConnected(false);
      setSystemSettings(null);
      setSystemSettingsLoading(false);
      setSystemSettingsWriting(false);
      systemSettingsWriteCountRef.current = 0;
      setNotice('Pedaleira desconectada.');
    });
  };

  const changeSystemSetting = (settingId: Gt1SystemSettingId, value: number) => {
    if (!connected || !systemSettings) return;
    const sessionGeneration = sessionGenerationRef.current;
    setOperationError(null);
    systemSettingsWriteCountRef.current += 1;
    setSystemSettingsWriting(true);
    void client.writeSystemSetting(DEFAULT_GT1_UNIT_ID, settingId, value)
      .then(() => {
        if (sessionGeneration !== sessionGenerationRef.current) return;
        setSystemSettings((current) => current ? { ...current, [settingId]: value } : current);
      })
      .catch((error) => {
        if (sessionGeneration !== sessionGenerationRef.current) return;
        const code = (error as { code?: string } | null)?.code;
        if (code === 'device-disconnected' || code === 'not-connected' || code === 'send-failed') {
          setConnected(false);
          setSystemSettings(null);
          setConnectionError('A GT-1 foi desconectada. Reconecte-a para continuar.');
          void transport.disconnect().catch(() => undefined);
        }
        setOperationError(`Não foi possível alterar a configuração da GT-1: ${getErrorMessage(error)}`);
      })
      .finally(() => {
        systemSettingsWriteCountRef.current = Math.max(0, systemSettingsWriteCountRef.current - 1);
        if (sessionGeneration === sessionGenerationRef.current) {
          setSystemSettingsWriting(systemSettingsWriteCountRef.current > 0);
          setSystemSettingsRevision((current) => current + 1);
        }
      });
  };

  const readPatch = () => perform('Lendo patch', async () => {
    const received = await client.readCurrentPatch(DEFAULT_GT1_UNIT_ID);
    currentPedalPatchRef.current = received;
    if (mockMode && received.userPatch !== undefined) {
      const slotPatch = mockClient.getUserPatches().find((patch) => patch.userPatch === received.userPatch);
      if (slotPatch) {
        setEditOverlays((current) => ({ ...current, [slotPatch.id]: { ...received, id: slotPatch.id, sourceName: slotPatch.sourceName } }));
        dispatchPatchSwitch({ type: 'set-active', patchId: slotPatch.id });
        markPatchDirty(slotPatch.id, false);
        setNotice(`Patch “${received.name}” recebido da GT-1 mock. A leitura não altera o slot permanente.`);
        return;
      }
    }
    if (mockMode) {
      const patch: Gt1Patch = { ...received, id: 'device-current', sourceName: 'GT-1 (mock) · Buffer atual' };
      setSessionPatches((current) => [...current.filter((item) => item.id !== patch.id), patch]);
      dispatchPatchSwitch({ type: 'set-active', patchId: patch.id });
      markPatchDirty(patch.id, false);
      setNotice(`Patch “${patch.name}” recebido da GT-1 mock. A leitura não altera um slot permanente.`);
      return;
    }
    const patch: Gt1Patch = { ...received, id: `device-${Date.now()}`, sourceName: 'GT-1' };
    setSessionPatches((current) => addPatches(current, [patch]));
    dispatchPatchSwitch({ type: 'set-active', patchId: patch.id });
    markPatchDirty(patch.id, false);
    setNotice(`Patch “${patch.name}” recebido da GT-1. A leitura não altera o slot permanente.`);
  });

  const importPatches = () => perform('Importando patches', async () => {
    const files = await openPatchFiles();
    if (!files || files.length === 0) return;
    const imported: Gt1Patch[] = [];
    const failures: string[] = [];
    for (const [index, file] of files.entries()) {
      try {
        imported.push(...uniquePatches(parsePatchFile(file.name, file.bytes), index));
      } catch (error) {
        failures.push(`${file.name}: ${getErrorMessage(error)}`);
      }
    }
    if (imported.length === 0) throw new Error(failures.join('\n') || 'Nenhum patch compatível foi encontrado nos arquivos.');
    setSessionPatches((current) => addPatches(current, imported));
    setNotice(`Importados ${imported.length} patch(es) de ${files.length} arquivo(s).${failures.length ? ` Arquivos ignorados: ${failures.join(' · ')}` : ''}`);
  });

  const selectToneCentralPatch = (patch: Gt1Patch) => {
    setSessionPatches((current) => current.some((item) => item.id === patch.id) ? current : addPatches(current, [patch]));
    requestPatchSelection(patch.id, patch);
  };

  const writeToMemory = (destination: Gt1PatchDestination) => perform('Gravando no slot de usuário', async () => {
    const patch = patches.find((item) => item.id === activePatchId);
    if (!patch) throw new Error('Selecione um patch antes de gravar.');
    const writtenPatch = await client.writeUserPatchAndVerify(patch, DEFAULT_GT1_UNIT_ID, destination.userPatch);
    markPatchDirty(patch.id, false);
    markPatchDirty(writtenPatch.id, false);
    setEditOverlays((current) => {
      const next = { ...current };
      delete next[patch.id];
      delete next[writtenPatch.id];
      return next;
    });
    if (mockMode) setMockPatches(mockClient.getUserPatches());
    else {
      queryClient.setQueryData<Gt1Patch[]>(USER_PATCH_QUERY_KEY, (current) =>
        mergeUserPatchScan(current ?? [], [writtenPatch], []));
    }
    dispatchPatchSwitch({ type: 'set-active', patchId: writtenPatch.id });
    setNotice(`Patch gravado e relido com sucesso em U${String(destination.userPatch).padStart(2, '0')}.`);
  });

  const changeParameter = (patchId: string, parameterId: string, value: number) => {
    const original = patches.find((patch) => patch.id === patchId);
    if (!original) return;
    const updated = setParameterLocally(original, parameterId, value);
    if (updated === original) return;
    setEditOverlays((current) => ({ ...current, [patchId]: updated }));
    markPatchDirty(patchId, true);
    setNotice(null);
    const sessionGeneration = sessionGenerationRef.current;
    if (connected) {
      void client.setParameter(original, parameterId, value).catch((error) => {
        if (sessionGeneration !== sessionGenerationRef.current) return;
        setOperationError(`A alteração ficou no editor, mas não foi enviada à GT-1: ${getErrorMessage(error)}`);
      });
    }
  };

  const changePatchName = (patchId: string, name: string) => {
    const original = patches.find((patch) => patch.id === patchId);
    if (!original) return;
    const updated = setPatchNameLocally(original, name);
    if (updated === original) return;
    setEditOverlays((current) => ({ ...current, [patchId]: updated }));
    markPatchDirty(patchId, true);
    setNotice(null);
    const sessionGeneration = sessionGenerationRef.current;
    if (connected) {
      void client.setPatchName(original, name).catch((error) => {
        if (sessionGeneration !== sessionGenerationRef.current) return;
        setOperationError(`O nome ficou no editor, mas não foi enviado à GT-1: ${getErrorMessage(error)}`);
      });
    }
  };

  const syncPatchFromPedal = (received: Gt1Patch) => {
    currentPedalPatchRef.current = received;
    const activePatch = patches.find((patch) => patch.id === activePatchId);
    if (activePatch && patchContentsEqual(activePatch, received)) return;

    const savedMatch = findMatchingUserPatch(received, devicePatches);
    const matchingPatch = savedMatch ?? findMatchingUserPatch(received, patches);
    if (matchingPatch) {
      if (savedMatch && editOverlays[savedMatch.id]) {
        setEditOverlays((current) => {
          const next = { ...current };
          delete next[savedMatch.id];
          return next;
        });
        markPatchDirty(savedMatch.id, false);
      }
      if (activePatchId !== matchingPatch.id) dispatchPatchSwitch({ type: 'set-active', patchId: matchingPatch.id });
      setSessionPatches((current) => current.filter((patch) => patch.id !== 'device-current'));
      return;
    }

    if (activePatch && activePatch.name === received.name) {
      if (!patchContentsEqual(activePatch, received)) {
        setEditOverlays((current) => ({
          ...current,
          [activePatch.id]: {
            ...received,
            id: activePatch.id,
            userPatch: activePatch.userPatch,
            sourceName: activePatch.sourceName,
          },
        }));
        markPatchDirty(activePatch.id, true);
      }
      return;
    }

    const currentBufferPatch: Gt1Patch = {
      ...received,
      id: 'device-current',
      sourceName: 'GT-1 · Buffer atual',
    };
    setSessionPatches((current) => [
      ...current.filter((patch) => patch.id !== currentBufferPatch.id),
      currentBufferPatch,
    ]);
    if (activePatchId !== currentBufferPatch.id) dispatchPatchSwitch({ type: 'set-active', patchId: currentBufferPatch.id });
  };

  useEffect(() => {
    if (!connected || userPatchQuery.isFetching || busy || patchSwitchState.phase !== 'idle') return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const patch = await client.readCurrentPatch(DEFAULT_GT1_UNIT_ID);
        if (!cancelled) {
          syncPatchFromPedal(patch);
          setOperationError((current) => current?.startsWith('Não foi possível sincronizar o patch atual da GT-1:') ? null : current);
        }
      } catch (error) {
        if (!cancelled) {
          setOperationError((current) => current ?? `Não foi possível sincronizar o patch atual da GT-1: ${getErrorMessage(error)}`);
        }
      } finally {
        if (!cancelled) timer = setTimeout(() => { void poll(); }, 900);
      }
    };
    timer = setTimeout(() => { void poll(); }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activePatchId, busy, client, connected, devicePatches, editOverlays, patchSwitchState.phase, patches, userPatchQuery.isFetching]);

  const activatePatchOnPedal = async (patch: Gt1Patch): Promise<Gt1Patch> => {
    if (!connected) return patch;
    return patch.userPatch !== undefined
      ? await client.selectUserPatch(DEFAULT_GT1_UNIT_ID, patch.userPatch)
      : await client.loadPatchToEditBufferAndVerify(patch, DEFAULT_GT1_UNIT_ID);
  };

  const activatePendingTarget = (targetPatchId: string, previousPatchId: string | null, targetOverride?: Gt1Patch) => {
    void perform('Trocando patch', async () => {
      try {
        const target = targetOverride ?? patches.find((patch) => patch.id === targetPatchId);
        if (!target) throw new Error('O patch escolhido não está mais na biblioteca.');
        const activated = await activatePatchOnPedal(target);
        if (activated.complete) {
          setEditOverlays((current) => ({
            ...current,
            [target.id]: { ...activated, id: target.id, userPatch: target.userPatch, sourceName: target.sourceName },
          }));
        }
        if (previousPatchId && dirtyPatchIdsRef.current.has(previousPatchId)) {
          markPatchDirty(previousPatchId, false);
          setEditOverlays((current) => {
            const next = { ...current };
            delete next[previousPatchId];
            return next;
          });
        }
        dispatchPatchSwitch({ type: 'activation-succeeded' });
        setNotice(`Patch “${target.name}” ativado${connected ? ' na GT-1' : ''}.`);
      } catch (error) {
        dispatchPatchSwitch({ type: 'operation-failed' });
        throw error;
      }
    });
  };

  const requestPatchSelection = (targetPatchId: string, targetOverride?: Gt1Patch) => {
    const decision = getPatchSwitchDecision(
      activePatchId,
      targetPatchId,
      activePatchId !== null && dirtyPatchIdsRef.current.has(activePatchId),
    );
    if (decision === 'noop') return;
    initialPatchReconcilePendingRef.current = false;
    dispatchPatchSwitch({ type: 'request-target', targetPatchId });
    setOperationError(null);
    if (decision === 'activate') activatePendingTarget(targetPatchId, activePatchId, targetOverride);
  };

  const cancelPatchSwitch = () => {
    dispatchPatchSwitch({ type: 'cancel' });
    setPendingSavePickerVisible(false);
    setPendingSaveSlot(null);
  };

  const discardAndSwitch = () => {
    const targetPatchId = patchSwitchState.targetPatchId;
    if (!targetPatchId) return;
    dispatchPatchSwitch({ type: 'discard' });
    activatePendingTarget(targetPatchId, activePatchId);
  };

  const savePendingChangesAndSwitch = (destinationSlot?: number) => {
    const patch = selectedPatch;
    const targetPatchId = patchSwitchState.targetPatchId;
    if (!patch || !targetPatchId) return;
    if (patch.userPatch === undefined && destinationSlot === undefined) {
      dispatchPatchSwitch({ type: 'save-start' });
      setPendingSavePickerVisible(true);
      setPendingSaveSlot(null);
      return;
    }

    dispatchPatchSwitch({ type: 'save-start' });
    setPendingSavePickerVisible(false);
    void perform('Salvando alterações', async () => {
      try {
        if (!connected) throw new Error('Conecte a pedaleira para salvar as alterações pendentes.');
        const slot = destinationSlot ?? patch.userPatch;
        if (slot === undefined) throw new Error('Selecione um slot de usuário para salvar este patch.');
        const written = await client.writeUserPatchAndVerify(patch, DEFAULT_GT1_UNIT_ID, slot);
        if (mockMode) setMockPatches(mockClient.getUserPatches());
        else {
          queryClient.setQueryData<Gt1Patch[]>(USER_PATCH_QUERY_KEY, (current) =>
            mergeUserPatchScan(current ?? [], [written], []));
        }
        markPatchDirty(patch.id, false);
        setEditOverlays((current) => {
          const next = { ...current };
          delete next[patch.id];
          delete next[written.id];
          return next;
        });
        dispatchPatchSwitch({ type: 'save-succeeded' });

        const target = patches.find((candidate) => candidate.id === targetPatchId);
        if (!target) throw new Error('O patch escolhido para a troca não está mais na biblioteca.');
        const activated = await activatePatchOnPedal(target);
        if (activated.complete) {
          setEditOverlays((current) => ({
            ...current,
            [target.id]: { ...activated, id: target.id, userPatch: target.userPatch, sourceName: target.sourceName },
          }));
        }
        dispatchPatchSwitch({ type: 'activation-succeeded' });
        setPendingSaveSlot(null);
        setNotice(`Alterações salvas em ${destinationLabel(slot)} e patch “${target.name}” ativado${connected ? ' na GT-1' : ''}.`);
      } catch (error) {
        dispatchPatchSwitch({ type: 'operation-failed' });
        throw error;
      }
    });
  };

  const closePendingSavePicker = () => {
    setPendingSavePickerVisible(false);
    setPendingSaveSlot(null);
    dispatchPatchSwitch({ type: 'operation-failed' });
  };

  const exportPatches = (format: 'syx' | 'mid' | 'gcl') => {
    void perform(`Exportando .${format.toUpperCase()}`, async () => {
      const bytes = serializePatchFile(format, patches);
      const result = await savePatchFile(`gt1-library.${format}`, bytes);
      if (result === 'saved') setNotice(`Biblioteca salva como .${format.toUpperCase()}.`);
      else if (result === 'shared') setNotice(`Arquivo .${format.toUpperCase()} preparado e enviado à folha de compartilhamento do Android.`);
    });
  };
  const toastText = patchScan
    ? `Lendo nomes dos slots da GT-1 · ${patchScan.completed}/${patchScan.total}`
    : notice;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.page, compact ? styles.pageCompact : null]} keyboardShouldPersistTaps="handled">
      <View style={styles.shell}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abrir biblioteca com ${libraryPatches.length} patches`}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => setLibraryDrawerVisible(true)}
              style={({ pressed }) => [styles.menuButton, busy ? styles.disabled : null, pressed ? styles.pressed : null]}
            >
              <View style={styles.menuLines}>
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
              </View>
            </Pressable>
            <View style={styles.titleGroup}>
              <AppText variant="display">BOSS GT-1</AppText>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gravação de vídeo"
              onPress={() => router.push('/recording')}
              style={({ pressed }) => [styles.settingsButton, pressed ? styles.pressed : null]}
            >
              <Camera size={18} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Automações HTTP"
              onPress={() => router.push('/automation')}
              style={({ pressed }) => [styles.settingsButton, pressed ? styles.pressed : null]}
            >
              <Workflow size={18} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Configurações do aplicativo"
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [styles.settingsButton, pressed ? styles.pressed : null]}
            >
              <Settings2 size={18} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={connected ? `Selecionar dispositivo · ${selectedDeviceName ?? 'MIDI conectada'}` : 'Selecionar dispositivo MIDI'}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => setConnectionModalVisible(true)}
              style={({ pressed }) => [styles.headerStatus, busy ? styles.disabled : null, pressed ? styles.pressed : null]}
            >
              <View style={[styles.statusDot, connected ? styles.statusConnected : null]} />
              <AppText variant="label" numberOfLines={1}>{connected ? selectedDeviceName ?? 'MIDI conectada' : 'Sem conexão'}</AppText>
            </Pressable>
          </View>
        </View>

        {operationError ? <View style={styles.messageError}><AppText variant="label" style={styles.errorText}>{operationError}</AppText></View> : null}

        <PatchEditor
          patches={patches}
          activePatchId={activePatchId}
          dirtyPatchIds={dirtyPatchIds}
          connected={connected}
          busy={busy}
          readingPatch={working === 'Lendo patch'}
          systemSettings={systemSettings}
          systemSettingsBusy={systemSettingsLoading || systemSettingsWriting}
          systemSettingsRevision={systemSettingsRevision}
          onReadCurrentPatch={() => { void readPatch(); }}
          onParameterChange={changeParameter}
          onPatchNameChange={changePatchName}
          onWriteToMemory={writeToMemory}
          onSystemSettingChange={changeSystemSetting}
        />

        <ConnectionPanel
          visible={connectionModalVisible}
          devices={visibleDevices}
          selectedDeviceId={visibleSelectedDeviceId}
          connected={connected}
          busy={busy || scanning}
          error={connectionError}
          onSelect={setSelectedDeviceId}
          onRefresh={() => { void refreshDevices(); }}
          onConnect={() => { void connect(); }}
          onDisconnect={() => { void disconnect(); }}
          onClose={() => setConnectionModalVisible(false)}
        />

        <PatchLibraryDrawer
          visible={libraryDrawerVisible}
          patches={libraryPatches}
          activePatchId={activePatchId}
          dirtyPatchIds={dirtyPatchIds}
          busy={busy}
          onClose={() => setLibraryDrawerVisible(false)}
          onSelectPatch={requestPatchSelection}
          onImport={() => { setLibraryDrawerVisible(false); void importPatches(); }}
          onExport={exportPatches}
          onSelectToneCentralPatch={selectToneCentralPatch}
        />

        <PendingPatchSwitchModal
          visible={patchSwitchState.phase === 'confirming'}
          currentPatch={selectedPatch}
          targetPatch={patches.find((patch) => patch.id === patchSwitchState.targetPatchId)}
          busy={busy}
          error={operationError}
          onSave={() => savePendingChangesAndSwitch()}
          onDiscard={discardAndSwitch}
          onCancel={cancelPatchSwitch}
        />

        <PatchSlotPicker
          visible={pendingSavePickerVisible}
          patches={patches}
          selectedSlot={pendingSaveSlot}
          busy={busy}
          title={selectedPatch?.name ? `Salvar “${selectedPatch.name}” antes de trocar` : 'Salvar antes de trocar'}
          confirmLabel="Salvar em"
          onSelect={setPendingSaveSlot}
          onClose={closePendingSavePicker}
          onConfirm={(slot) => savePendingChangesAndSwitch(slot)}
        />

        <View style={styles.footer}>
          <AppText variant="label">Funciona offline · o áudio continua passando pela pedaleira · sem afiliação com BOSS/Roland</AppText>
          <AppText variant="caption">A resposta SysEx indica transmissão recebida, não confirmação de gravação permanente.</AppText>
        </View>
        <MockModeSwitch enabled={mockMode} disabled={busy || systemSettingsWriting} onChange={toggleMockMode} />
      </View>
      </ScrollView>
      {toastText ? (
        <Animated.View pointerEvents="box-none" style={[styles.toastLayer, { opacity: toastOpacity }]}>
          <View pointerEvents="none" accessibilityRole="alert" style={styles.messageNotice}>
            {patchScan ? <ActivityIndicator size="small" color={colors.accent} /> : null}
            <AppText variant="label" style={styles.noticeText}>{toastText}</AppText>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flexGrow: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  pageCompact: { paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  shell: { width: '100%', maxWidth: 1040, alignSelf: 'center', gap: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.lg },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  menuButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSelected, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  menuLines: { width: 20, gap: 4 },
  menuLine: { height: 2, borderRadius: radius.pill, backgroundColor: colors.accent },
  titleGroup: { gap: spacing.xs },
  kicker: { color: colors.accent },
  headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm },
  settingsButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: 200, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill },
  statusDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.warning },
  statusConnected: { backgroundColor: colors.success },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  messageError: { padding: spacing.md, backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: radius.md },
  errorText: { color: colors.danger },
  toastLayer: { position: 'absolute', left: 0, right: 0, bottom: spacing.xl, zIndex: 100, alignItems: 'center', elevation: 20 },
  messageNotice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '90%', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surfaceSelected, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, elevation: 6 },
  noticeText: { flexShrink: 1, color: colors.accentStrong },
  footer: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xxl, textAlign: 'center' },
});
