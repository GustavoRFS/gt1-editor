# Protocolo GT-1

Este documento registra o protocolo portado de `SysxIO.cpp`, `midiIO.cpp`, `MidiTable.cpp`, `sysxWriter.cpp`, `bankTreeList.cpp` e `midi.xml` do FxFloorBoard fornecido. O programa comunica patches por MIDI SysEx; ele não transporta áudio.

## Frames e endereços

- O cabeçalho usa fabricante Roland `41`, modelo GT-1 identificado no mapa como `00 00 60` e comandos RQ1 `11` (pedido) e DT1 `12` (dados).
- A forma do cabeçalho é `F0 41 <device-id> 00 00 60 <command> <address:4> <data...> <checksum> F7`.
- O Device ID aceito pelo mapa é `00` a `1F`. A documentação do FxFloorBoard chama a configuração de fábrica de “1”; seu formato interno começa em `00`. O app usa protocolo `00` como padrão e deixa o Device ID explícito na conexão.
- O buffer temporário de patch começa no endereço `60 00`. Cada bloco de dados tem 128 bytes e o patch FxFloorBoard é convertido em 17 blocos, endereçados pelo terceiro byte `00` a `10`.
- Um pedido ao buffer usa endereço `60 00 00 00`, tamanho `00 00 12 17` e checksum Roland.
- A identificação usa Universal SysEx Identity Request `F0 7E <device-id> 06 01 F7`; a resposta esperada começa com `F0 7E <device-id> 06 02 41 33`, conforme o padrão de resposta do mapa FxFloorBoard.

## Checksum e resposta de leitura

O checksum é `(-soma dos bytes de endereço e dados) mod 128`, no intervalo `00` a `7F`. O app verifica `F0`, `F7`, fabricante, comando e checksum antes de aceitar frames DT1.

O conversor de `bankTreeList::updatePatch` reorganiza uma resposta compactada de 2316 bytes com intervalos de dados definidos no próprio código e recria 17 frames DT1. `midiIO.cpp` também declara a constante de leitura de patch como 2332 bytes. Como os intervalos do conversor cobrem o formato de 2316 bytes, o parser implementa esse formato e não remove os 16 bytes extras do outro caminho sem uma regra confirmada. Se o transporte enviar frames DT1 já separados, eles passam pela validação direta. Uma resposta interrompida ou com checksum inválido não vira patch utilizável.

## Escrita e parâmetros

- O comando DT1 escreve o patch no buffer temporário quando o destino não é informado.
- Para gravar permanentemente, o destino deve estar em um dos 50 bancos de usuário, com 5 slots por banco. O código do app calcula o mesmo endereço de memória usado por `floorBoardDisplay::writeToMemory`; bancos de preset não são graváveis por esse fluxo.
- Cada alteração individual é um frame DT1 no endereço do byte alterado; o mapa `midi.xml` descreve limites e enums. O catálogo inicial inclui controles de compressor, OD/DS e pré-amplificadores A/B.
- A função de escrita rejeita blocos incompletos. Isso inclui importações GCL, cujo layout documentado armazena 16 blocos completos mais 60 bytes do 17º bloco.
- O pacote original informa MIDI channel 1 na preferência/instalação. O fluxo de SysEx do app não requer áudio nem conversão de canal; seleção de canal MIDI será necessária apenas para comandos MIDI de mudança de programa.

## Arquivos

- `.syx`: sequência de frames SysEx, validada individualmente e agrupada a cada endereço inicial `60 00 00 00`.
- `.mid`: Standard MIDI File, com eventos SysEx F0/F7. A importação percorre cabeçalho, trilhas, status correntes, comprimentos variáveis e eventos SysEx.
- `.gcl`: contêiner `GCLLibrarianFile0001`; o número de patches está nos bytes 34–35, o marcador de registro é `08 82` no offset 170, cada registro ocupa 2194 bytes e contém 2108 bytes de patch em offset 172.

A importação GCL preserva o tamanho incompleto declarado pela fonte; a exportação escreve esses 2108 bytes. Não se completa o trecho ausente com valores presumidos. Essa versão não grava um patch GCL incompleto na pedaleira.

## Limites da implementação

Tamanhos, conversão compactada e offsets vêm do código-fonte FxFloorBoard, sem validação em hardware nesta etapa. O protocolo ainda precisa de confirmação com uma GT-1 física, inclusive variações de firmware, temporização e comportamento de ACK após escrita. Até essa validação, use importação/exportação de arquivos e evite tratar um sucesso de envio como confirmação de gravação persistente.
