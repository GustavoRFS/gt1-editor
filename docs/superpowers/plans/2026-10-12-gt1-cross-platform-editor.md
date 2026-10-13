# BOSS GT-1 Cross-platform Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um editor offline da BOSS GT-1 para Linux desktop e Android com interface React Native compartilhada e comunicação USB MIDI SysEx.

**Architecture:** O Expo fornece a UI comum e exporta o bundle web que o Tauri carrega de `dist`. Um contrato TypeScript de MIDI separa o protocolo GT-1 da implementação: Kotlin via Expo Modules no Android e comandos Rust/ALSA no Tauri/Linux. O código e os mapas do FxFloorBoard orientam o protocolo e a compatibilidade de patches.

**Tech Stack:** Node.js 24.x LTS, npm, Expo SDK 57 estável, React Native 0.86, React Native Web 0.21, Expo Router, Expo Modules API/Kotlin, Tauri 2, Rust, `midir` 0.11.0/ALSA, plugins Tauri Dialog e File System.

**Spec:** `docs/superpowers/specs/2026-10-12-gt1-cross-platform-editor-design.md`

## Global Constraints

- O desktop-alvo é Linux com Tauri 2; o alvo mobile é Android com React Native e Expo.
- O frontend Tauri é exatamente o resultado de `npx expo export -p web` em `dist`.
- A UI, o modelo de patch e a lógica de protocolo são compartilhados; MIDI nativo fica nos adaptadores por plataforma.
- O Android acessa USB MIDI por um módulo local Expo/Kotlin; requer development build ou build de produção, não Expo Go.
- O Tauri acessa MIDI pelo backend Rust e ALSA; a UI chama os comandos pela API Tauri.
- A fonte FxFloorBoard fornecida define os comandos, mapas e formatos suportados; não inventar bytes, checksums ou cobertura não confirmada nela.
- O projeto usa Node 24.x LTS e npm com `package-lock.json`; o ambiente atual tem Node 26.4, que ainda está no canal Current, portanto não é a versão-alvo LTS.
- A app comunica patches e parâmetros por MIDI; áudio USB, iOS, Windows, macOS, cloud e paridade não documentada estão fora do escopo inicial.

## Review Focus

- Nenhum dispositivo MIDI visível: Android e desktop exibem estado vazio e permitem tentar novamente sem travar.
- Android sem host USB, permissão ou porta compatível: o módulo retorna erro tipado que a UI consegue explicar.
- Dispositivo desconectado durante transferência: o workflow cancela a operação e não apresenta patch parcial como válido.
- SysEx truncado, malformado ou com checksum inválido: protocolo rejeita a resposta antes de atualizar o patch.
- Backend Tauri recebe SysEx em fragmentos: eventos encaminham frames completos ao mesmo parser usado no Android.

---

### Task 1: Bootstrap Expo web + Tauri

**Files:**
- Create: `.nvmrc`, `.gitignore`, `package.json`, `package-lock.json`, `app.json`, `tsconfig.json`, `metro.config.js`
- Create: `app/_layout.tsx`, `app/index.tsx`
- Create: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: a pasta de projeto vazia e o contrato de build descrito na especificação.
- Produces: `npm run web` serve o Expo web em `http://localhost:8081`; `npm run export:web` gera `dist`; `npm run tauri:dev` inicia Tauri sobre esse frontend; `npm run tauri:build` empacota o export web.

- [ ] Criar o scaffold TypeScript do Expo SDK 57 com Expo Router, fixar Node 24 em `.nvmrc`, adotar npm e registrar dependências no lockfile.
- [ ] Configurar `app.json`, TypeScript e Metro para os targets Android e web e criar a tela inicial adaptável do editor.
- [ ] Inicializar Tauri 2 e configurar `frontendDist: "../dist"`, `beforeBuildCommand: "npm run export:web"`, `beforeDevCommand: "npm run web"` e `devUrl: "http://localhost:8081"`.
- [ ] Adicionar scripts npm para Expo Android, Expo web, export web e CLI Tauri; registrar no README os comandos de desenvolvimento.

### Task 2: Auditar e portar o protocolo GT-1

**Files:**
- Create: `docs/gt1-protocol.md`, `docs/third-party-notices.md`
- Create: `src/gt1/types.ts`, `src/gt1/parameterMap.ts`, `src/gt1/checksum.ts`, `src/gt1/sysex.ts`, `src/gt1/patchFiles.ts`

**Interfaces:**
- Consumes: fontes `SysxIO.cpp`, `midiIO.cpp`, `midi.xml`, utilitários de arquivo e tabelas/controles do FxFloorBoard fornecido.
- Produces: `Gt1Patch`, `Gt1ParameterDefinition`, `encodeReadRequest(unitId: number): Uint8Array[]`, `decodePatchResponse(frames: Uint8Array[]): Gt1Patch`, `encodePatchWrite(patch: Gt1Patch, unitId: number): Uint8Array[]`, `parsePatchFile(name: string, bytes: Uint8Array): Gt1Patch[]` e `serializePatchFile(format: "syx" | "mid" | "gcl", patches: Gt1Patch[]): Uint8Array`.

- [ ] Registrar no documento de protocolo o cabeçalho, unit ID padrão, handshake, endereços, checagem de checksum, fragmentação, operações de leitura/escrita e formatos de arquivo confirmados na fonte.
- [ ] Verificar os avisos/licenças da fonte antes de portar código e registrar a procedência e atribuições necessárias.
- [ ] Modelar patches e metadados dos parâmetros com identificador estável, endereço, limite/faixa, tipo de controle e rótulos de enumeração extraídos da fonte.
- [ ] Implementar codificação/decodificação SysEx e validar tamanho, cabeçalho, terminador e checksum antes de expor um patch.
- [ ] Implementar leitura e gravação por uma fila serializada, correlacionando resposta com operação pendente e usando timeout documentado/configurado.
- [ ] Implementar importação/exportação `.syx`, `.mid` e `.gcl` somente segundo os layouts e limites confirmados na fonte.

### Task 3: Contrato MIDI compartilhado e backend Tauri/Linux

**Files:**
- Create: `src/transport/transport.ts`, `src/transport/transport.web.ts`, `src/gt1/client.ts`
- Create: `src-tauri/src/midi.rs`, `src-tauri/src/commands.rs`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: os tipos/protocolo de `src/gt1` e Tauri 2.
- Produces: `MidiTransport` com `listDevices(): Promise<MidiDevice[]>`, `connect(deviceId: string): Promise<void>`, `disconnect(): Promise<void>`, `sendSysEx(bytes: Uint8Array): Promise<void>` e `onSysEx(listener: (bytes: Uint8Array) => void): () => void`; `Gt1Client.readCurrentPatch(unitId: number): Promise<Gt1Patch>`, `writePatch(patch: Gt1Patch, unitId: number): Promise<void>` e `setParameter(patch: Gt1Patch, parameterId: string, value: number): Promise<Gt1Patch>`; comandos Tauri tipados e evento `gt1-sysex`.

- [ ] Definir `MidiDevice = { id: string; name: string }` e `MidiTransport` em TypeScript conforme a especificação, mantendo o ID do dispositivo opaco para a UI.
- [ ] Implementar enumeração, pareamento de portas de entrada/saída, conexão persistente, envio de SysEx e callbacks de entrada em Rust com `midir` 0.11.0 usando ALSA no Linux.
- [ ] Converter `Uint8Array` em `number[]` na fronteira IPC e reagrupar fragmentos SysEx no callback Rust antes de emitir eventos `gt1-sysex` completos.
- [ ] Implementar o adaptador web via `@tauri-apps/api`; detectar Tauri antes de carregar chamadas nativas e retornar indisponibilidade MIDI em navegador comum.
- [ ] Expor comandos Rust `list_midi_devices() -> Vec<MidiDevice>`, `connect_midi(device_id: String) -> Result<(), MidiError>`, `disconnect_midi() -> Result<(), MidiError>` e `send_sysex(data: Vec<u8>) -> Result<(), MidiError>`.
- [ ] Implementar `Gt1Client` sobre `MidiTransport`, serializando operações e entregando `readCurrentPatch`, `writePatch` e `setParameter` para a UI.
- [ ] Traduzir erros ALSA, porta ausente e desconexão em erros tipados consumíveis pela UI.

### Task 4: Módulo MIDI Android em Kotlin

**Files:**
- Create: `modules/gt1-midi/expo-module.config.json`, `modules/gt1-midi/index.ts`
- Create: `modules/gt1-midi/android/src/main/java/com/gt1midi/Gt1MidiModule.kt`
- Create: `src/transport/transport.android.ts`
- Modify: `package.json`, `app.json`

**Interfaces:**
- Consumes: `MidiTransport`, `MidiDevice`, e chamadas do protocolo compartilhado.
- Produces: módulo local `Gt1Midi` com `listDevices(): Promise<MidiDevice[]>`, `connect(deviceId: string): Promise<void>`, `disconnect(): Promise<void>`, `sendSysEx(bytes: number[]): Promise<void>` e evento JS `onSysEx(bytes: number[])`.

- [ ] Criar módulo Expo local em Kotlin com a Expo Modules API e conectá-lo ao projeto por autolinking.
- [ ] Usar `MidiManager` para listar dispositivos USB MIDI, abrir as portas de entrada/saída, enviar SysEx e fechar recursos ao desconectar ou encerrar o app.
- [ ] Tratar portas ausentes, abertura negada, remoção USB e callbacks concorrentes com erros/eventos tipados.
- [ ] Reagrupar fragmentos recebidos pelo `MidiReceiver` em mensagens SysEx completas antes de emitir `onSysEx`.
- [ ] Implementar `transport.android.ts` sobre o módulo e documentar que o fluxo de desenvolvimento exige development build próprio.

### Task 5: UI compartilhada de conexão e edição

**Files:**
- Create: `src/components/ConnectionPanel.tsx`, `src/components/PatchEditor.tsx`, `src/components/ParameterControl.tsx`, `src/gt1/editorState.ts`
- Modify: `app/index.tsx`, `app/_layout.tsx`

**Interfaces:**
- Consumes: contrato MIDI, cliente GT-1, modelo de patch e catálogo de parâmetros das tarefas 2–4.
- Produces: fluxo comum para escolher dispositivo, conectar/desconectar, ler patch, editar parâmetros e enviar/gravar alterações.

- [ ] Construir painel de conexão que mostre dispositivos, estado conectado, carregamento e erro sem exigir código específico de plataforma.
- [ ] Renderizar editor genérico por grupos/blocos e metadados do catálogo: controles numéricos para faixas e seletores para enums.
- [ ] Separar patch carregado do patch alterado localmente e indicar claramente se há alterações ainda não enviadas.
- [ ] Conectar as ações de leitura, envio de parâmetro e gravação aos workflows confirmados no código FxFloorBoard.
- [ ] Aplicar layout adaptável para tela Android estreita e janela desktop ampla usando os mesmos componentes React Native.

### Task 6: Importar, exportar e documentar a instalação

**Files:**
- Create: `src/patch-files/fileAccess.ts`, `src/patch-files/fileAccess.android.ts`, `src/patch-files/fileAccess.web.ts`
- Modify: `README.md`
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `app.json`

**Interfaces:**
- Consumes: codecs `parsePatchFile`/`serializePatchFile` e o estado do editor.
- Produces: `openPatchFile(): Promise<{ name: string; bytes: Uint8Array } | null>` e `savePatchFile(fileName: string, bytes: Uint8Array): Promise<void>` para Android e Tauri, com cancelamento do seletor tratado sem erro.

- [ ] Implementar seleção de arquivos no Android com Expo DocumentPicker/FileSystem e exportação de arquivo temporário pela folha de compartilhamento Expo Sharing.
- [ ] Adicionar os plugins Tauri Dialog e File System para abrir/salvar arquivos no Linux; limitar capabilities às operações e caminhos necessários.
- [ ] Ligar os seletores aos codecs e ao editor, preservando vários patches de arquivos em lote e mantendo a extensão/formato escolhido.
- [ ] Documentar requisitos Linux do Tauri, Node 24 LTS, npm, development build Android, cabo USB-C host/OTG e alimentação da pedaleira.
- [ ] Documentar que a validação final de comunicação depende de testar com GT-1 física e um dispositivo Android host/OTG; nenhum comportamento de hardware será declarado funcional apenas por build desktop.

## Referências técnicas

- [Expo SDK 57 e versões compatíveis](https://docs.expo.dev/versions/latest/)
- [Expo: criar projeto](https://docs.expo.dev/get-started/create-a-project/)
- [Node.js: ciclo de suporte das versões](https://github.com/nodejs/Release)
- [Tauri v2: frontendDist e build config](https://v2.tauri.app/reference/config/)
- [Tauri v2: chamadas Rust](https://v2.tauri.app/develop/calling-rust/)
- [`midir` 0.11 e backend ALSA/SysEx](https://github.com/Boddlnagg/midir)
- [Tauri Dialog](https://v2.tauri.app/plugin/dialog/)
- [Tauri File System](https://v2.tauri.app/plugin/file-system/)
- [Expo DocumentPicker](https://docs.expo.dev/versions/latest/sdk/document-picker/)
- [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [Expo Sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/)
