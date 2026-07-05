# Fix: compatibilidade com Chrome/WebView antigo da central

## Problema

No projeto **controle-combustivel**, o app abre e renderiza normalmente no navegador
da central multimídia Android do carro, **mas nenhum botão responde**.

Causa confirmada: `app.js` e `voz.js` usam sintaxe de JavaScript moderna que só é
suportada a partir do **Chrome 80 (2020)**:

- **Optional chaining** (`?.`) — ~7 ocorrências em `app.js`
- **Nullish coalescing** (`??`) — ~6 ocorrências entre `app.js` e `voz.js`
- Também há **optional catch binding** (`catch { }` sem parâmetro) e chamada opcional
  de método (`requestFullscreen?.()`), que dependem de motores recentes.

O WebView/Chrome dessas centrais de mercado geralmente é de Android 6/7/8 (anterior ao
Chrome 80). Quando o motor encontra sintaxe desconhecida, ele **descarta o arquivo `.js`
inteiro com erro de sintaxe** — por isso os `addEventListener` nunca são registrados e
os botões ficam mortos, embora HTML e CSS apareçam corretamente.

## Objetivo

Adicionar um passo de build que transpila o JavaScript para uma versão compatível com
navegadores antigos, sem alterar o comportamento do app.

## Tarefa

1. Configurar um build com **esbuild** que transpila `app.js` e `voz.js` para
   `target: es2015` (ou usar um browserslist equivalente, ex.: `"Android >= 5, Chrome >= 60"`).
2. Gerar os arquivos transpilados (ex.: `app.min.js` e `voz.min.js`).
3. Atualizar o `index.html` para apontar os `<script>` para os arquivos transpilados,
   no lugar dos originais.
4. Incrementar a versão do cache no `sw.js` (para a central baixar a versão nova na
   próxima abertura com internet).
5. Fazer commit e push.

## Critérios de aceite

- Os arquivos servidos pelo GitHub Pages **não contêm** mais `?.` nem `??` (verificar
  no bundle gerado, não no código-fonte).
- O app continua funcionando igual em navegador moderno.
- O comportamento (cálculos, painel, histórico, voz, configurações) permanece idêntico.
- Documentar no `CLAUDE.md`: o app precisa ser transpilado antes do deploy, e o motivo
  (compatibilidade com o WebView antigo da central).

## Observações

- Manter o fluxo de desenvolvimento funcionando: abrir o `index.html` local deve
  continuar operando (service worker só registra em http/https).
- Não introduzir dependências pesadas; esbuild é suficiente e rápido. Babel também
  serve, se preferir, com `@babel/preset-env` mirando o mesmo alvo antigo.
