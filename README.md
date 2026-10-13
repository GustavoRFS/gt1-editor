# GT-1 Editor

Editor offline para patches da BOSS GT-1. A interface React Native + Expo é compartilhada pelo Android e pelo desktop: no desktop, `expo export -p web` gera `dist`, que é carregado pelo Tauri.

## Desenvolvimento

- Node.js 24.x LTS (`nvm use` lê `.nvmrc`) e npm.
- `npm install` instala as dependências.
- `npm run web` inicia a interface Expo Web em `http://localhost:8081`.
- `npm run android` inicia o Expo para Android. O módulo MIDI nativo exige development build próprio; Expo Go não inclui o código Kotlin local.
- `npm run export:web` gera o frontend estático em `dist`.
- `npm run tauri:dev` inicia o desktop Tauri usando o servidor Expo.
- `npm run tauri:build` exporta o frontend e empacota a aplicação.

No Linux, o desktop precisa de ALSA MIDI, WebKitGTK e das ferramentas Rust/Tauri documentadas para sua distribuição. A comunicação com a GT-1 usa MIDI SysEx por USB; o app não transporta áudio. O Android precisa de suporte a USB host/OTG e cabo USB-C host para USB-B; a pedaleira pode precisar da fonte própria.

O código de protocolo e as tabelas ainda estão em implementação. O funcionamento com pedaleira física precisa de validação em uma GT-1 real; nenhum fluxo de hardware é considerado funcional apenas por gerar o bundle ou o executável.
