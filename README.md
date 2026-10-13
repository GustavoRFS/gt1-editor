# GT-1 Editor

Editor offline para patches da BOSS GT-1. A interface React Native + Expo é compartilhada pelo Android e desktop: `expo export -p web` gera `dist`, que o Tauri carrega sem uma segunda implementação de frontend.

## Requisitos

- Node.js 24 LTS e npm (`.nvmrc` fixa a versão do projeto).
- Rust estável 1.90 ou posterior.
- Linux com as dependências Tauri da distribuição, ALSA e WebKitGTK 4.1. Em Debian/Ubuntu, o conjunto de desenvolvimento inclui `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libasound2-dev` e as demais dependências da [documentação Tauri para Linux](https://v2.tauri.app/start/prerequisites/).
- Android com suporte a USB host/OTG; a GT-1 conecta por cabo USB-C host/OTG para USB-B e pode precisar de alimentação própria.

## Desenvolvimento

- `npm install` instala as dependências JavaScript.
- `npm run web` inicia Expo Web em `http://localhost:8081`.
- `npm run export:web` gera o frontend estático usado pelo Tauri.
- `npm run tauri:dev` inicia o desktop Tauri sobre o servidor Expo.
- `npm run tauri:build` exporta a interface e empacota o aplicativo Linux.
- `npm run android:prebuild` gera o projeto Gradle Android e incorpora o módulo local MIDI em Kotlin.
- `npx expo run:android` compila e inicia um development build no dispositivo conectado; Expo Go não contém o módulo MIDI local.
- `npm run android` inicia o servidor Metro para um development build instalado.

## Fluxos disponíveis

- Descobrir, conectar e desconectar portas MIDI bidirecionais no desktop ou Android.
- Ler o patch no buffer atual, editar localmente os controles catalogados e enviar o patch ao buffer.
- Gravar os frames em um destino de usuário U01–U50, slots 1–5, com confirmação antes de substituir o destino.
- Importar vários arquivos `.syx`, `.mid` ou `.gcl`, escolher patches carregados e exportar a biblioteca nesses formatos.
- Exportar Android pelo compartilhamento do sistema; no Tauri, usar os diálogos nativos de abrir e salvar.

A primeira tela edita o nome, o Compressor, OD/DS e pré-amplificadores A/B, conforme o mapa portado. O FxFloorBoard continua sendo a fonte de protocolo e compatibilidade; controles não transcritos não são inventados.

## Limites conhecidos

O aplicativo transmite MIDI SysEx e não transporta áudio. O envio ao buffer ou a um slot de usuário não recebe confirmação de gravação permanente documentada no fluxo auditado; a interface avisa que é necessário conferir o resultado na GT-1. Não houve validação com pedaleira física nem com cabo OTG Android. Os tamanhos de resposta compacta e os layouts portados precisam de confirmação em hardware; detalhes estão em [`docs/gt1-protocol.md`](docs/gt1-protocol.md).

O projeto não é afiliado à Roland/BOSS. Consulte [`docs/third-party-notices.md`](docs/third-party-notices.md) e [`LICENSE`](LICENSE) para origem e licença do código derivado.
