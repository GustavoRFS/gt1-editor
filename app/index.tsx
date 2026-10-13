import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppButton } from '../src/components/AppButton';
import { AppText } from '../src/components/AppText';
import { ConnectionPanel } from '../src/components/ConnectionPanel';
import { PatchEditor } from '../src/components/PatchEditor';
import { addPatches, DEFAULT_GT1_UNIT_ID, setPatchDirty, updatePatchList } from '../src/gt1/editorState';
import { parsePatchFile, serializePatchFile } from '../src/gt1/patchFiles';
import { Gt1Client } from '../src/gt1/client';
import type { Gt1Patch, Gt1PatchDestination } from '../src/gt1/types';
import { openPatchFiles, savePatchFile } from '../src/patch-files/fileAccess';
import { createMidiTransport } from '../src/transport/transport';
import type { MidiDevice } from '../src/transport/transport';
import { colors, radius, spacing } from '../src/theme';

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

export default function EditorScreen() {
  const transport = useMemo(() => createMidiTransport(), []);
  const client = useMemo(() => new Gt1Client(transport, DEFAULT_GT1_UNIT_ID), [transport]);
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [patches, setPatches] = useState<Gt1Patch[]>([]);
  const [activePatchId, setActivePatchId] = useState<string | null>(null);
  const [dirtyPatchIds, setDirtyPatchIds] = useState<Set<string>>(() => new Set());
  const busy = working !== null;

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
    const removeListener = transport.onDisconnect?.(() => {
      setConnected(false);
      setConnectionError('A pedaleira foi desconectada. Reconecte-a e atualize a lista MIDI.');
      setNotice(null);
    });
    return () => removeListener?.();
  }, [transport]);

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

  const connect = () => perform('Conectando', async () => {
    if (!selectedDeviceId) throw new Error('Selecione um dispositivo MIDI primeiro.');
    await transport.connect(selectedDeviceId);
    setConnected(true);
    setConnectionError(null);
    setNotice('Conexão MIDI aberta.');
  });

  const disconnect = () => perform('Desconectando', async () => {
    await transport.disconnect();
    setConnected(false);
    setNotice('Pedaleira desconectada.');
  });

  const readPatch = () => perform('Lendo patch', async () => {
    const received = await client.readCurrentPatch(DEFAULT_GT1_UNIT_ID);
    const patch: Gt1Patch = { ...received, id: `device-${Date.now()}`, sourceName: 'GT-1' };
    setPatches((current) => addPatches(current, [patch]));
    setActivePatchId(patch.id);
    setDirtyPatchIds((current) => setPatchDirty(current, patch.id, false));
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
    setPatches((current) => addPatches(current, imported));
    setActivePatchId(imported[0].id);
    setNotice(`Importados ${imported.length} patch(es) de ${files.length} arquivo(s).${failures.length ? ` Arquivos ignorados: ${failures.join(' · ')}` : ''}`);
  });

  const sendToBuffer = () => perform('Enviando ao buffer', async () => {
    const patch = patches.find((item) => item.id === activePatchId);
    if (!patch) throw new Error('Selecione um patch antes de enviar.');
    await client.writePatch(patch, DEFAULT_GT1_UNIT_ID);
    setDirtyPatchIds((current) => setPatchDirty(current, patch.id, false));
    setNotice(`Frames enviados ao buffer temporário para “${patch.name}”. A GT-1 não envia confirmação de gravação por este fluxo.`);
  });

  const writeToMemory = (destination: Gt1PatchDestination) => perform('Gravando no slot de usuário', async () => {
    const patch = patches.find((item) => item.id === activePatchId);
    if (!patch) throw new Error('Selecione um patch antes de gravar.');
    await client.writePatch(patch, DEFAULT_GT1_UNIT_ID, destination);
    setDirtyPatchIds((current) => setPatchDirty(current, patch.id, false));
    setNotice(`Frames enviados para U${String(destination.bank).padStart(2, '0')}-${destination.patch}. O protocolo auditado não confirma que a memória persistente foi gravada; confira a pedaleira.`);
  });

  const changePatch = (updated: Gt1Patch) => {
    setPatches((current) => updatePatchList(current, updated));
    setDirtyPatchIds((current) => setPatchDirty(current, updated.id, true));
    setNotice(null);
  };

  const exportPatches = (format: 'syx' | 'mid' | 'gcl') => {
    void perform(`Exportando .${format.toUpperCase()}`, async () => {
      const bytes = serializePatchFile(format, patches);
      const result = await savePatchFile(`gt1-library.${format}`, bytes);
      if (result === 'saved') setNotice(`Biblioteca salva como .${format.toUpperCase()}.`);
      else if (result === 'shared') setNotice(`Arquivo .${format.toUpperCase()} preparado e enviado à folha de compartilhamento do Android.`);
    });
  };

  const statusText = working ?? (connected ? 'Conectada · pronta para MIDI SysEx' : 'Desconectada · os patches ficam somente no arquivo');

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.shell}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.brandMark}><AppText variant="caption" style={styles.brandMarkText}>GT</AppText></View>
            <View style={styles.titleGroup}>
              <AppText variant="caption" style={styles.kicker}>EDITOR OFFLINE · MIDI SYSEx</AppText>
              <AppText variant="display">BOSS GT-1</AppText>
            </View>
          </View>
          <View style={styles.headerStatus}>
            <View style={[styles.statusDot, connected ? styles.statusConnected : null]} />
            <AppText variant="label">{connected ? 'MIDI conectada' : 'Sem conexão'}</AppText>
          </View>
        </View>

        <View style={styles.intro}>
          <View style={styles.introCopy}>
            <AppText variant="caption" style={styles.kicker}>EDIÇÃO DE PRESETS</AppText>
            <AppText variant="title">Seus sons, sob seu controle.</AppText>
            <AppText variant="subhead">Leia patches da pedaleira, ajuste os parâmetros disponíveis e salve cópias nos bancos de usuário.</AppText>
          </View>
          <View style={styles.patchCount}>
            <AppText variant="caption">BIBLIOTECA</AppText>
            <AppText variant="section" style={styles.patchCountNumber}>{String(patches.length).padStart(2, '0')}</AppText>
            <AppText variant="label">patches</AppText>
          </View>
        </View>

        <ConnectionPanel
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          connected={connected}
          busy={busy || scanning}
          error={connectionError}
          onSelect={setSelectedDeviceId}
          onRefresh={() => { void refreshDevices(); }}
          onConnect={() => { void connect(); }}
          onDisconnect={() => { void disconnect(); }}
        />

        <View style={styles.workflow}>
          <View style={styles.workflowCopy}>
            <AppText variant="headline">Biblioteca de patches</AppText>
            <AppText variant="label">{statusText}</AppText>
          </View>
          <View style={styles.workflowActions}>
            <AppButton title="Importar arquivos" variant="secondary" busy={working === 'Importando patches'} disabled={busy} onPress={() => { void importPatches(); }} />
            <AppButton title="Ler patch atual" variant="primary" busy={working === 'Lendo patch'} disabled={!connected || busy} onPress={() => { void readPatch(); }} />
          </View>
        </View>

        {operationError ? <View style={styles.messageError}><AppText variant="label" style={styles.errorText}>{operationError}</AppText></View> : null}
        {notice ? <View style={styles.messageNotice}><AppText variant="label" style={styles.noticeText}>{notice}</AppText></View> : null}

        <PatchEditor
          patches={patches}
          activePatchId={activePatchId}
          dirtyPatchIds={dirtyPatchIds}
          connected={connected}
          busy={busy}
          onSelectPatch={setActivePatchId}
          onPatchChange={changePatch}
          onSendToBuffer={async () => sendToBuffer()}
          onWriteToMemory={writeToMemory}
          onExport={exportPatches}
        />

        <View style={styles.footer}>
          <AppText variant="label">Funciona offline · o áudio continua passando pela pedaleira · sem afiliação com BOSS/Roland</AppText>
          <AppText variant="caption">A resposta SysEx indica transmissão recebida, não confirmação de gravação permanente.</AppText>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  shell: { width: '100%', maxWidth: 1040, alignSelf: 'center', gap: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.lg },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brandMark: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSelected, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  brandMarkText: { color: colors.accent, letterSpacing: 1 },
  titleGroup: { gap: spacing.xs },
  kicker: { color: colors.accent },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill },
  statusDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.warning },
  statusConnected: { backgroundColor: colors.success },
  intro: { minHeight: 138, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg, padding: spacing.xxl, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.xl, borderCurve: 'continuous' },
  introCopy: { flex: 1, gap: spacing.sm },
  patchCount: { minWidth: 96, alignItems: 'center', gap: spacing.xs, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  patchCountNumber: { color: colors.accent },
  workflow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.lg, paddingHorizontal: spacing.xs },
  workflowCopy: { gap: spacing.xs },
  workflowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  messageError: { padding: spacing.md, backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: radius.md },
  errorText: { color: colors.danger },
  messageNotice: { padding: spacing.md, backgroundColor: colors.surfaceSelected, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  noticeText: { color: colors.accentStrong },
  footer: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xxl, textAlign: 'center' },
});
