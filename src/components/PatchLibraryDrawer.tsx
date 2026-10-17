import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import type { Gt1Patch } from '../gt1/types';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';
import { fetchToneCentralLiveSet, fetchToneCentralSets } from '../toneCentral/api';
import type { ToneCentralSet } from '../toneCentral/api';
import { convertToneCentralPatch } from '../toneCentral/convertPatch';

type PatchLibraryDrawerProps = {
  visible: boolean;
  patches: Gt1Patch[];
  activePatchId: string | null;
  dirtyPatchIds: ReadonlySet<string>;
  busy: boolean;
  onClose: () => void;
  onSelectPatch: (patchId: string) => void;
  onImport: () => void;
  onExport: (format: 'syx' | 'mid' | 'gcl') => void;
  onSelectToneCentralPatch: (patch: Gt1Patch) => void;
};

export function PatchLibraryDrawer({ visible, patches, activePatchId, dirtyPatchIds, busy, onClose, onSelectPatch, onImport, onExport, onSelectToneCentralPatch }: PatchLibraryDrawerProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.88, 400);
  const translateX = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<'library' | 'tone-central'>('library');
  const [search, setSearch] = useState('');
  const [selectedSet, setSelectedSet] = useState<ToneCentralSet | null>(null);
  const setsQuery = useQuery({
    queryKey: ['tonecentral', 'gt1', 'live-sets'],
    queryFn: ({ signal }) => fetchToneCentralSets(signal),
    enabled: visible && activeTab === 'tone-central',
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  const setQuery = useQuery({
    queryKey: ['tonecentral', 'gt1', 'live-set', selectedSet?.basename],
    queryFn: ({ signal }) => fetchToneCentralLiveSet(selectedSet!, signal),
    enabled: visible && activeTab === 'tone-central' && selectedSet !== null,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
  const filteredSets = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    const items = setsQuery.data ?? [];
    if (!searchValue) return items;
    return items.filter((item) => `${item.title} ${item.categories.join(' ')} ${item.tags.join(' ')} ${item.description}`.toLowerCase().includes(searchValue));
  }, [search, setsQuery.data]);
  const filteredRemotePatches = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    const items = setQuery.data ?? [];
    return searchValue ? items.filter((patch) => `${patch.name} ${patch.note ?? ''}`.toLowerCase().includes(searchValue)) : items;
  }, [search, setQuery.data]);

  useEffect(() => () => {
    translateX.stopAnimation();
    backdropOpacity.stopAnimation();
  }, [backdropOpacity, translateX]);

  const openDrawer = () => {
    translateX.setValue(-drawerWidth);
    backdropOpacity.setValue(0);
    requestAnimationFrame(() => Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start());
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: -drawerWidth, duration: 180, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  const selectPatch = (patchId: string) => {
    onSelectPatch(patchId);
    closeDrawer();
  };

  const importPatches = () => {
    closeDrawer();
    onImport();
  };

  const exportPatches = (format: 'syx' | 'mid' | 'gcl') => {
    closeDrawer();
    onExport(format);
  };

  const selectToneCentralPatch = (patch: Gt1Patch) => {
    closeDrawer();
    onSelectToneCentralPatch(patch);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onShow={openDrawer} onRequestClose={closeDrawer}>
      <View style={styles.overlay}>
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar biblioteca de patches" onPress={closeDrawer} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.drawer, { width: drawerWidth, transform: [{ translateX }] }]}>
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <AppText variant="caption" style={styles.kicker}>{activeTab === 'library' ? t('BIBLIOTECA') : t('BOSS Tone Central')}</AppText>
              <AppText variant="headline">{activeTab === 'library' ? `${t('Patches')} · ${patches.length}` : t('Buscar patches')}</AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar biblioteca" onPress={closeDrawer} style={styles.closeButton}>
              <AppText variant="section">×</AppText>
            </Pressable>
          </View>

          <View style={styles.tabs}>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'library' }} onPress={() => setActiveTab('library')} style={[styles.tab, activeTab === 'library' ? styles.activeTab : null]}>
              <AppText variant="label" style={activeTab === 'library' ? styles.activeTabText : null}>{t('Minha biblioteca')}</AppText>
            </Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'tone-central' }} onPress={() => setActiveTab('tone-central')} style={[styles.tab, activeTab === 'tone-central' ? styles.activeTab : null]}>
              <AppText variant="label" style={activeTab === 'tone-central' ? styles.activeTabText : null}>{t('BOSS Tone Central')}</AppText>
            </Pressable>
          </View>

          {activeTab === 'library' ? <>
            <AppButton title={t('Importar arquivos')} variant="secondary" busy={busy} disabled={busy} onPress={importPatches} />
            {patches.length > 0 ? (
            <ScrollView style={styles.patchList} contentContainerStyle={styles.patchListContent} keyboardShouldPersistTaps="handled">
              {patches.map((patch, index) => {
                const selected = patch.id === activePatchId;
                return (
                  <Pressable
                    key={patch.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: busy }}
                    disabled={busy}
                    onPress={() => selectPatch(patch.id)}
                    style={({ pressed }) => [styles.patchRow, selected ? styles.patchSelected : null, pressed ? styles.patchPressed : null]}
                  >
                    <AppText variant="label" style={[styles.patchIndex, selected ? styles.patchSelectedText : null]}>{patch.userPatch ? destinationLabel(patch.userPatch) : String(index + 1).padStart(2, '0')}</AppText>
                    <View style={styles.patchRowCopy}>
                      <AppText variant="headline" numberOfLines={1}>{patch.name || 'Sem nome'}</AppText>
                      <AppText variant="label" numberOfLines={1}>{patch.sourceName ?? patch.sourceFormat.toUpperCase()}{dirtyPatchIds.has(patch.id) ? ' · alterado' : ''}</AppText>
                    </View>
                    {!patch.complete ? <AppText variant="caption" style={styles.warning}>INCOMPLETO</AppText> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.empty}>
              <AppText variant="headline">Nenhum patch carregado</AppText>
              <AppText variant="subhead">Conecte a GT-1 ou importe um arquivo de patches.</AppText>
            </View>
          )}

          <View style={styles.exportSection}>
            <AppText variant="caption">{t('EXPORTAR BIBLIOTECA')}</AppText>
            <View style={styles.exportActions}>
              <AppButton title=".SYX" variant="quiet" disabled={patches.length === 0 || busy} onPress={() => exportPatches('syx')} />
              <AppButton title=".MID" variant="quiet" disabled={patches.length === 0 || busy} onPress={() => exportPatches('mid')} />
              <AppButton title=".GCL" variant="quiet" disabled={patches.length === 0 || busy} onPress={() => exportPatches('gcl')} />
            </View>
          </View>
          </> : <View style={styles.remotePane}>
            {selectedSet ? <Pressable style={styles.backLink} onPress={() => { setSelectedSet(null); setSearch(''); }}>
              <AppText variant="label" style={styles.activeTabText}>‹ {t('Todos os live sets')}</AppText>
            </Pressable> : null}
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={selectedSet ? t('Buscar patch neste live set') : t('Buscar live sets, artistas ou estilos')}
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              accessibilityLabel={t('Buscar patches no Boss Tone Central')}
              returnKeyType="search"
            />
            {setsQuery.isLoading ? <View style={styles.remoteStatus}><ActivityIndicator color={colors.accent} /><AppText variant="subhead">{t('Carregando Tone Central…')}</AppText></View>
              : setsQuery.isError ? <View style={styles.remoteStatus}><AppText variant="subhead">{t('Não foi possível carregar o Tone Central.')}</AppText><AppButton title={t('Tentar novamente')} variant="secondary" onPress={() => { void setsQuery.refetch(); }} /></View>
                : selectedSet ? setQuery.isLoading ? <View style={styles.remoteStatus}><ActivityIndicator color={colors.accent} /><AppText variant="subhead">{t('Carregando patches…')}</AppText></View>
                  : setQuery.isError ? <View style={styles.remoteStatus}><AppText variant="subhead">{t('Não foi possível carregar este live set.')}</AppText><AppButton title={t('Tentar novamente')} variant="secondary" onPress={() => { void setQuery.refetch(); }} /></View>
                    : <ScrollView style={styles.patchList} contentContainerStyle={styles.patchListContent} keyboardShouldPersistTaps="handled">
                      {filteredRemotePatches.map((remotePatch) => {
                        const patch = convertToneCentralPatch(remotePatch, `tone-central-${selectedSet.basename}-${remotePatch.id}`, `Tone Central · ${selectedSet.title}`);
                        return <Pressable key={String(remotePatch.id)} accessibilityRole="button" disabled={busy} onPress={() => selectToneCentralPatch(patch)} style={({ pressed }) => [styles.remotePatchRow, pressed ? styles.patchPressed : null]}>
                          <View style={styles.patchRowCopy}><AppText variant="headline" numberOfLines={1}>{remotePatch.name || patch.name}</AppText><AppText variant="label" numberOfLines={2}>{remotePatch.note || selectedSet.title}</AppText></View>
                          <AppText variant="label" style={styles.activeTabText}>{t('Usar')}</AppText>
                        </Pressable>;
                      })}
                      {filteredRemotePatches.length === 0 ? <View style={styles.empty}><AppText variant="subhead">{t('Nenhum patch encontrado.')}</AppText></View> : null}
                    </ScrollView>
                  : <ScrollView style={styles.patchList} contentContainerStyle={styles.patchListContent} keyboardShouldPersistTaps="handled">
                    {filteredSets.map((item) => <Pressable key={item.basename} accessibilityRole="button" onPress={() => { setSelectedSet(item); setSearch(''); }} style={({ pressed }) => [styles.remoteSetRow, pressed ? styles.patchPressed : null]}>
                      <View style={styles.patchRowCopy}><AppText variant="headline" numberOfLines={2}>{item.title}</AppText><AppText variant="label" numberOfLines={2}>{[...item.tags, ...item.categories.filter((category) => category.toLowerCase() === 'gt-1')].join(' · ')}</AppText></View>
                      <AppText variant="section" style={styles.activeTabText}>›</AppText>
                    </Pressable>)}
                    {filteredSets.length === 0 ? <View style={styles.empty}><AppText variant="subhead">{t('Nenhum live set encontrado.')}</AppText></View> : null}
                  </ScrollView>}
          </View>}
        </Animated.View>
      </View>
    </Modal>
  );
}

function destinationLabel(userPatch: number): string {
  return `U${String(userPatch).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.68)' },
  drawer: { height: '100%', gap: spacing.lg, paddingTop: spacing.xxl, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, backgroundColor: colors.surface, borderRightWidth: 1, borderColor: colors.line, elevation: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headingCopy: { gap: spacing.xs },
  kicker: { color: colors.accent },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.input, borderRadius: radius.md },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: colors.accent },
  activeTabText: { color: colors.accent, fontWeight: '700' },
  patchList: { flex: 1, minHeight: 0 },
  patchListContent: { gap: spacing.sm, paddingVertical: spacing.xs },
  patchRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, borderCurve: 'continuous' },
  patchSelected: { backgroundColor: colors.surfaceSelected, borderColor: colors.accent },
  patchIndex: { color: colors.accent, minWidth: 34 },
  patchSelectedText: { fontWeight: '700' },
  patchRowCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  patchPressed: { opacity: 0.72 },
  warning: { color: colors.warning },
  empty: { flex: 1, justifyContent: 'center', gap: spacing.sm },
  remotePane: { flex: 1, minHeight: 0, gap: spacing.md },
  searchInput: { minHeight: 46, color: colors.text, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15 },
  remoteStatus: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  backLink: { minHeight: 30, justifyContent: 'center' },
  remoteSetRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, borderCurve: 'continuous' },
  remotePatchRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, borderCurve: 'continuous' },
  exportSection: { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  exportActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
