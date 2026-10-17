# Protocolo GT-1

Este documento reúne o protocolo usado pelo editor e os fluxos confirmados na análise estática do BOSS Tone Studio para GT-1. O arquivo ZIP original fornecido pelo usuário foi preservado. A análise foi feita sobre os dados e o SWF ActionScript extraídos, sem executar o instalador, o aplicativo ou suas DLLs.

## Frames e endereço

- No fio, a GT-1 usa fabricante Roland `41`, model ID `00 00 00 30`, RQ1 `11` para pedidos e DT1 `12` para dados. O formato é `F0 41 <device-id> 00 00 00 30 <command> <address:4> <data...> <checksum> F7`.
- O Device ID permitido é `00` a `1F`. A resposta de identidade observada usa `F0 7E 00 06 02 41 30 03 ... F7`.
- O formato interno dos arquivos do editor conserva o cabeçalho compacto `00 00 60`; antes de enviar, o editor o converte ao model ID de quatro bytes da GT-1 e recalcula o checksum.
- O checksum Roland é o complemento de sete bits da soma do endereço e dos dados: `(-soma) mod 128`.

## Conexão e leitura

Ao conectar, o editor consulta o nível de comunicação no endereço `7F 00 00 00`, ativa o modo do editor enviando `01` para `7F 00 00 01` e espera 100 ms antes de iniciar as leituras.

No SWF ActionScript decompilado, `SystemExclusive.getUserPatchListNames()` envia um RQ1 de 16 bytes ao endereço `10 <slot> 00 00`; `setUserPatchListNames()` agenda a próxima solicitação 30 ms depois. `ToneCentralLogic` só inicia as leituras de dados de sistema e do buffer temporário após receber a lista. O Tone Studio não transfere os 99 patches completos na inicialização: `getPatchParamsFunc()` lê os dados completos quando um patch é aberto. O editor segue essa divisão: a conexão atualiza a lista compacta de nomes; ao selecionar U01–U99, o editor escreve o índice em `setup.current_patch_no` e depois lê o buffer ativo.

Uma leitura completa de patch usa três RQ1, todos com tamanho `00 00 08 00`. O endereço-base do patch (buffer atual `60 00` ou slot de usuário `10 <slot>`) é seguido por `00 00`, `08 00` e `10 00`. As respostas endereçadas avançam quando chegam aos marcadores `07 44`, `0F 44` e `10 10`. O editor recompõe os dados nos 17 blocos de 128 bytes usados pela biblioteca e pelos controles. O decoder antigo para respostas compactadas em dez frames continua disponível como compatibilidade.

Depois que o modo de comunicação é ativado, o app lê primeiro o buffer ativo e seleciona na biblioteca o slot de usuário cujo conteúdo corresponda. Se ainda não houver correspondência no cache, o buffer atual aparece provisoriamente como patch da GT-1; ao final da leitura de U01–U99, o app tenta associá-lo de novo aos slots recém-lidos. Uma falha em um slot não interrompe a leitura dos demais; o progresso é mostrado na biblioteca.

Enquanto conectado e sem outra operação MIDI em andamento, o app relê o buffer ativo a cada 900 ms. Assim, alterações feitas nos controles da pedaleira aparecem no editor mesmo quando a GT-1 não transmite mensagens espontâneas de Program Change ou DT1. Se o conteúdo corresponder a um slot conhecido, esse slot é selecionado; ajustes físicos sem correspondência atualizam o patch ativo como alterações pendentes.

O transporte encaminha também mensagens MIDI de canal curtas recebidas (`gt1-midi` no desktop e `onMidi` no Android), além do fluxo SysEx. As automações podem aprender um evento real e restringi-lo ao patch selecionado. O decoder atual ainda não interpreta os parâmetros ASSIGN internos para nomear automaticamente um controle como CTL1/EXP SW nem seu alvo de efeito; mudanças de atribuição devem ser reaprendidas para o patch correspondente.

A lista de nomes dos 99 slots é mantida no cache persistido do TanStack Query e aparece antes da próxima varredura USB, que sempre é repetida ao conectar. Quando o cache já tem dados completos de um slot, uma leitura compacta de nomes atualiza o nome e conserva os dados completos conhecidos; slots sem dados completos são hidratados ao serem abertos. Slots que falham preservam o último valor conhecido. Patches importados, o buffer atual e alterações ainda não salvas permanecem em estado local da sessão. Ativar um patch atualiza apenas o estado local do patch carregado no buffer temporário; não grava esse buffer no cache de patches salvos.

## Edição ao vivo e seleção

Cada ajuste de parâmetro e cada nome de patch confirmado no editor envia um DT1 ao buffer temporário `60 00`. Esses envios não incluem o comando `patch_write`; o áudio muda imediatamente, mas a memória do usuário só é alterada pelo comando explícito Salvar.

O Tone Studio troca para um patch de usuário escrevendo o índice de dois bytes no endereço `00 01 00 00` (`setup.current_patch_no`), repetindo o envio em intervalos de 500 ms até receber a confirmação do índice selecionado. O editor usa o mesmo caminho para U01–U99 e então lê o buffer ativo; não copia os parâmetros do slot em `60 00`. Patches importados não têm índice de usuário, então continuam sendo carregados no buffer temporário pelos 23 trechos mapeados. Nenhum dos fluxos envia `patch_write`; a memória permanente só muda ao salvar explicitamente.

Se o patch atual estiver alterado, a troca pede para salvar, trocar sem salvar ou cancelar. Salvar verifica a gravação antes de ativar o destino; patches importados pedem um slot. Trocar sem salvar só remove a alteração local depois que a ativação do destino é verificada. Cancelar mantém seleção e dados atuais.

## Escrita e verificação

O Tone Studio não grava cada bloco diretamente no endereço permanente do patch. Ele envia 23 trechos DT1 para endereços mapeados do buffer temporário `60 00`, espaçados por 30 ms. Depois envia um segundo DT1 para `7F 00 01 04`, com o índice do slot em dois bytes de base 128. O editor aguarda um segundo após esse comando e relê o slot para confirmar a gravação.

O mapa do Tone Studio também transmite 64 bytes no endereço `60 00 11 00`, mas esse intervalo fica fora do modelo atual de 17 blocos do editor. O app não inventa dados para essa faixa: grava os 23 trechos representáveis, terminando em `60 00 10 50`, e compara na verificação apenas os campos cobertos por esses trechos.

Os controles estão separados em FX1/Comp, OD/DS, Preamp, FX2/MOD, Delay e Reverb. Os seletores de efeito determinam qual algoritmo está ativo em cada seção.

## Arquivos

- `.syx`: sequência de frames SysEx, validada individualmente e agrupada pelo endereço inicial `60 00 00 00`.
- `.mid`: Standard MIDI File com eventos SysEx F0/F7. A importação percorre cabeçalho, trilhas, status correntes, comprimentos variáveis e eventos SysEx.
- `.gcl`: contêiner `GCLLibrarianFile0001`; a contagem de patches fica nos bytes 34–35, o marcador de registro é `08 82` no offset 170, cada registro ocupa 2194 bytes e contém 2108 bytes de patch no offset 172.

A importação GCL preserva o tamanho incompleto declarado pela fonte; a exportação escreve os 2108 bytes disponíveis. O app não completa trechos ausentes com valores presumidos e não grava um patch GCL incompleto na pedaleira.

## Verificação e limites

Os testes automatizados cobrem os checksums, os três pedidos de leitura, a montagem de respostas endereçadas, o fluxo de escrita em buffer seguido por `patch_write`, Program Change, edição ao vivo, cache, confirmação de troca e releitura dos campos transferidos. A porta “GT-1 MIDI 1” foi detectada pelo ALSA nesta sessão, mas o fluxo completo não foi exercitado contra a pedaleira; a ativação e edição ao vivo ainda precisam de confirmação física no app.
