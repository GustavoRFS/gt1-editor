# Backlog

## Gravar vídeo com o áudio da GT-1

**Implementado:** tela de gravação em Configurações; escolha de câmera e entrada de áudio; qualidade de vídeo (resolução, FPS e bitrate); ajuste A/V positivo ou negativo; gravação manual ou por evento MIDI/SysEx aprendido; arquivo exportado pelo navegador no desktop e compartilhado como MP4 no Android.

- Desktop/Tauri usa `getUserMedia` e `MediaRecorder`; o áudio é selecionado explicitamente pelo dispositivo de entrada da GT-1. Atraso positivo é aplicado ao áudio; atraso negativo é aplicado ao vídeo.
- Android usa Camera2/MediaRecorder, roteia para a entrada USB escolhida via `AudioDeviceInfo` e remuxa o MP4 para aplicar o offset em uma das trilhas. A seleção direta exige Android 9 (API 28) ou superior.
- A câmera Android não mostra preview durante a gravação; o arquivo fica disponível pelo diálogo de compartilhamento do sistema.
- As opções máximas dependem das capacidades da câmera/codec. Uma combinação não suportada pelo dispositivo retorna erro durante o início.

## Disparar requisições HTTP pelos controles da GT-1

**Implementado:** cadastrar método, URL, headers e body HTTP; aprender mensagens MIDI ou SysEx de acionamento e soltura; disparar ao pressionar, soltar, manter por tempo configurável ou cruzar um limite de pedal de expressão; aplicar uma regra a um patch selecionado ou a todos os patches. Configurações são persistidas no dispositivo.

- O transporte Android e o desktop agora encaminham eventos MIDI curtos além das mensagens SysEx.
- As atribuições da GT-1 são dependentes de patch/sistema; o editor não presume um sinal universal para CTL/EXP. Para capturar um controle, conecte a pedaleira, selecione o patch e use “Capturar acionamento/soltura”. O evento aprendido fica associado ao patch selecionado, podendo ser configurado para todos os patches.
- Pedal de expressão é tratado como MIDI Control Change com limite configurável e detecção de cruzamento, evitando enviar requisição em cada passo do pedal.
- No desktop, as chamadas são feitas pelo backend Tauri para não depender das regras CORS do WebView; no Android, o app usa `fetch` nativo. O app aceita HTTP e HTTPS para permitir integrações locais.
- Headers (inclusive tokens) e corpos das ações ficam em armazenamento local simples do app; credenciais não estão criptografadas.
- O plugin Android habilita tráfego HTTP sem TLS porque várias automações locais usam `http://`; para destinos fora de uma rede confiável, configure HTTPS.
- Ainda não há decodificador automático dos bytes internos de ASSIGN do patch para inferir semanticamente “CTL1”, “EXP SW” ou o alvo do efeito. O aprendizado por patch permite mapear o sinal real sem assumir um evento universal; para associação automática será necessário ampliar o decoder de assignments da GT-1 e confirmar os sinais que cada firmware transmite.
