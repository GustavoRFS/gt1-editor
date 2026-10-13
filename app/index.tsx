import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function EditorScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>BOSS GT-1 · PATCH EDITOR</Text>
            <Text style={styles.title}>GT-1 Editor</Text>
          </View>
          <View style={styles.connectionPill}>
            <View style={styles.dot} />
            <Text style={styles.connectionText}>Desconectada</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.overline}>SEU PRÓXIMO SOM</Text>
            <Text style={styles.patchName}>Nenhum patch carregado</Text>
            <Text style={styles.supporting}>Conecte a pedaleira para ler ou editar um patch.</Text>
          </View>
          <View style={styles.patchNumber}>
            <Text style={styles.patchNumberLabel}>USER</Text>
            <Text style={styles.patchNumberValue}>—</Text>
          </View>
        </View>

        <View style={styles.connectionCard}>
          <View style={styles.cardHeading}>
            <Text style={styles.sectionLabel}>CONEXÃO MIDI</Text>
            <Text style={styles.stepLabel}>USB · MIDI SysEx</Text>
          </View>
          <Text style={styles.emptyTitle}>Pronta para encontrar sua GT-1</Text>
          <Text style={styles.body}>No Linux, conecte por USB e abra o app. No Android, use um cabo host USB-C para USB-B e um build próprio do app.</Text>
          <View style={styles.button}>
            <Text style={styles.buttonText}>Procurar dispositivos</Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionLabel}>EDIÇÃO DO PATCH</Text>
            <Text style={styles.sectionTitle}>Efeitos e parâmetros</Text>
          </View>
          <Text style={styles.muted}>Aguardando leitura</Text>
        </View>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyMark}>✳</Text>
          <Text style={styles.emptyTitle}>Seu patch aparecerá aqui</Text>
          <Text style={styles.body}>Conecte-se à pedaleira e leia o patch atual. As alterações ficam locais até você enviá-las.</Text>
        </View>
        <Text style={styles.footer}>Funciona offline · O áudio continua passando pela GT-1</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: '#0b1211', paddingHorizontal: 20, paddingVertical: 26 },
  shell: { width: '100%', maxWidth: 1040, alignSelf: 'center', gap: 22 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  kicker: { color: '#8b9e99', fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  title: { color: '#f1f7f4', fontSize: 27, fontWeight: '800', marginTop: 5 },
  connectionPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 99, borderColor: '#293632', borderWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 8, backgroundColor: '#e59b68' },
  connectionText: { color: '#c2cfca', fontSize: 12, fontWeight: '600' },
  hero: { backgroundColor: '#16211e', borderColor: '#273a33', borderWidth: 1, borderRadius: 22, minHeight: 170, padding: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  heroCopy: { flex: 1 },
  overline: { color: '#7fe0bd', fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  patchName: { color: '#f5faf7', fontSize: 24, fontWeight: '700', marginTop: 12 },
  supporting: { color: '#9eaea7', fontSize: 14, marginTop: 7 },
  patchNumber: { width: 82, height: 82, borderRadius: 18, borderColor: '#38574a', borderWidth: 1, backgroundColor: '#1d3029', alignItems: 'center', justifyContent: 'center' },
  patchNumberLabel: { color: '#8acfb4', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  patchNumberValue: { color: '#f3fff8', fontSize: 28, fontWeight: '800', marginTop: 2 },
  connectionCard: { backgroundColor: '#121b19', borderColor: '#26332f', borderWidth: 1, borderRadius: 18, padding: 20, gap: 12 },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  sectionLabel: { color: '#7fe0bd', fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  stepLabel: { color: '#81918b', fontSize: 12 },
  emptyTitle: { color: '#eaf1ed', fontSize: 17, fontWeight: '700' },
  body: { color: '#9caaa4', fontSize: 14, lineHeight: 21, maxWidth: 740 },
  button: { backgroundColor: '#8de5c2', borderRadius: 12, paddingHorizontal: 17, paddingVertical: 13, alignSelf: 'flex-start', marginTop: 3 },
  buttonText: { color: '#10231b', fontWeight: '800', fontSize: 14 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginTop: 4 },
  sectionTitle: { color: '#edf5f0', fontSize: 20, fontWeight: '700', marginTop: 6 },
  muted: { color: '#81918b', fontSize: 12, paddingBottom: 3 },
  emptyCard: { minHeight: 170, borderRadius: 18, borderColor: '#26332f', borderWidth: 1, backgroundColor: '#101816', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 9 },
  emptyMark: { color: '#83dfbc', fontSize: 25, marginBottom: 2 },
  footer: { color: '#64736e', fontSize: 12, textAlign: 'center', paddingBottom: 14 },
});
