# Controle de Combustível — Microfone de voz (compatível com Chrome 79)

## Contexto

O parser já existe: `interpretarDitado(texto, { sistema })` (em `voz.js`) e a função
`aoDitar()` (em `app.js`) já leem o campo `#ditado`, interpretam e preenchem o formulário.
**Falta só a etapa de fala → texto.** Hoje quem faz isso é o microfone do teclado do
Android; o objetivo é ter um microfone dentro do próprio app.

### Restrição de hardware (decisiva)

Central CSK Smart, **Chrome 79**, Android 7.1.1, provavelmente **sem serviços Google**.
Consequências:

- `webkitSpeechRecognition` **existe** no Chrome 79, mas em builds AOSP de central quase
  sempre **não retorna resultado** (falta a chave do serviço de fala do Google) e/ou
  exige internet. Não dá pra assumir que funciona.
- `SpeechRecognizer` nativo do Android também costuma estar **ausente** nesses aparelhos.
- O microfone do teclado funciona porque delega a um motor que já existe no sistema.
- Caminho mais confiável e independente do Google: **gravar o áudio e transcrever no
  servidor** (`enviaai.org`) — mas exige **internet no carro**.

Por isso: **primeiro sondar o que o aparelho realmente suporta, depois implementar.**

---

## Fase 0 — Sonda de capacidade (fazer PRIMEIRO)

Criar uma pequena tela/ботão de diagnóstico (pode ser oculta atrás de `?diag=1` na URL)
que roda **no aparelho** e mostra o resultado **na tela** (a central não tem console).
Código em ES5 seguro (sem `?.`, sem `crypto.randomUUID`, etc.). Testar:

1. **Web Speech API:** existe `('webkitSpeechRecognition' in window)`? Ao chamar
   `.start()`, dispara `onresult` (funciona) ou `onerror` (mostrar o `event.error`:
   ex. `not-allowed`, `service-not-allowed`, `network`, `no-speech`)?
2. **Microfone via getUserMedia:** `navigator.mediaDevices.getUserMedia({ audio: true })`
   resolve (mic acessível) ou rejeita (`NotAllowedError`, `NotFoundError`)?
3. **MediaRecorder:** existe `window.MediaRecorder`? Qual `mimeType` é suportado
   (`MediaRecorder.isTypeSupported('audio/webm;codecs=opus')` etc.)?

**Saída:** um relatório na tela com o status de cada item. Isso decide qual camada abaixo
é viável. (Reaproveitar o capturador de erro na tela, se já implementado.)

---

## Fase 1 — Microfone no app, em camadas com fallback

Adicionar um **botão de microfone** ao lado do campo `#ditado`. Ao capturar texto por
qualquer camada, o fluxo é sempre o mesmo:

1. Escrever o texto em `#ditado` e chamar `aoDitar()` (reaproveita todo o parsing e
   preenchimento que já existem).
2. **Auto-limpar** `#ditado` após processar, mantendo o resumo em `#ditadoFeedback`.
3. Dar feedback visual curto ("capturado ✓") e ficar pronto para a próxima captura.

Camadas (detectadas em runtime conforme a sonda):

- **Camada A — Web Speech API:** se a sonda confirmar que `onresult` funciona. Usar
  `webkitSpeechRecognition` (prefixado), `lang` conforme `config.idioma`
  (`pt-BR`/`en-US`), `interimResults = false`.
- **Camada B — gravar + transcrever no servidor** (`enviaai.org`): se houver microfone
  (getUserMedia ok) e `MediaRecorder`, mas a Camada A não funcionar. Gravar um clipe
  curto, enviar ao endpoint STT, receber o texto. Requer internet.
- **Camada C — fallback teclado:** sempre disponível. Focar `#ditado` para o usuário usar
  o microfone do teclado (comportamento atual). Nunca deixar sem opção.

Mostrar na interface **qual camada está ativa**, para não dar falsa impressão de que o
mic in-app funciona quando não funciona no aparelho.

---

## Fase 2 — Backend de transcrição em enviaai.org (só se a Camada B for necessária)

Endpoint simples, atrás do Nginx que já existe no servidor ARM da Oracle:

- **Contrato:** `POST /stt` com o áudio (multipart ou binário `audio/webm;codecs=opus`
  vindo do `MediaRecorder`); resposta `{ "text": "..." }`.
- **Motor sugerido:** `whisper.cpp` com modelo `base` ou `small`, `-l pt`, rodando na
  própria VM ARM (grátis, sem depender de API paga; clipes curtos transcrevem em poucos
  segundos). Alternativa: um fluxo n8n com nó de transcrição, ou uma API de STER paga.
- **CORS:** liberar a origem do app (o domínio do GitHub Pages ou o domínio próprio).
- **Considerar:** custo (self-host = grátis), latência aceitável para clipes de ~5–10s,
  e privacidade — o áudio sai do carro para o servidor (documentar isso).

> Observação: isso contraria o "offline-first". Só faz sentido quando houver internet no
> momento do abastecimento (hotspot do celular, por exemplo). Para uso offline, a Camada
> C (teclado) continua sendo a garantida.

---

## Permissão de microfone no APK (importante)

Se o mic in-app for usado dentro do APK (WebView), não basta o `getUserMedia`:

- Adicionar `<uses-permission android:name="android.permission.RECORD_AUDIO" />` no
  manifest do APK.
- O WebView precisa **conceder** o pedido de mídia em `onPermissionRequest`
  (`request.grant(request.getResources())`), senão `getUserMedia` falha mesmo com a
  permissão declarada.
- No navegador comum, o Chrome pede a permissão normalmente.

---

## Checklist de compatibilidade Chrome 79

- Sem `?.`, `??`, `crypto.randomUUID`, `inset`, `gap` em flexbox sem fallback (ver o outro
  documento de causa raiz).
- Usar `webkitSpeechRecognition` (prefixado), não `SpeechRecognition`.
- `MediaRecorder`: checar `isTypeSupported` antes de escolher o `mimeType`.
- `getUserMedia`: usar `navigator.mediaDevices.getUserMedia` (existe no 79) com fallback
  defensivo se `navigator.mediaDevices` for indefinido.
- Todo código novo passa pelo build esbuild `--target=es2015` (ou `--target=chrome79`).

---

## Critérios de aceite

- A sonda roda no aparelho e mostra, na tela, o status de Web Speech / getUserMedia /
  MediaRecorder.
- O botão de microfone captura texto pela melhor camada disponível e alimenta `aoDitar()`.
- Após processar, `#ditado` limpa sozinho e fica pronto para a próxima captura.
- Se nenhuma camada de fala funcionar no aparelho, o app cai no teclado sem quebrar e
  informa o usuário.
- Nada novo usa API incompatível com Chrome 79.
- `sw.js`: incrementar a versão do cache ao publicar.
