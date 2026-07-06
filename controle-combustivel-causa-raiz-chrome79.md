# Controle de Combustível — Causa raiz do "botões mortos / telas não abrem" no Chrome 79

## Diagnóstico (confirmado no código)

O app **não** está quebrado por sintaxe (o build esbuild `es2015` corrigiu corretamente
`?.` e `??`). O que resta são **3 incompatibilidades de runtime/CSS** que só afetam o
Chrome 79 da central — invisíveis em navegador moderno e em testes com jsdom, e por isso
o navegador e o APK se comportam igual (ambos são Chrome 79 no aparelho).

| # | Item | Suportado a partir de | Efeito no Chrome 79 |
|---|------|----------------------|---------------------|
| 1 | CSS `inset: 0` | Chrome 87 | `.painel-vel` e `.painel-config` não se esticam → telas do velocímetro e de configurações ficam colapsadas/invisíveis |
| 2 | `crypto.randomUUID()` | Chrome 92 | `aoSalvar()` lança erro → não grava o abastecimento (botão Salvar "não funciona") |
| 3 | `gap` em flexbox | Chrome 84 | espaçamentos somem (apenas visual; não trava) |

Isso explica todos os sintomas: o app "abre no formulário" porque o velocímetro (tela
inicial) é aberto pelo JS mas fica invisível; configurações não aparecem pelo mesmo
motivo; e Salvar falha por causa do UUID.

---

## Fix 1 (CRÍTICO) — trocar `inset: 0` por propriedades individuais

Em `style.css`, nas regras `.painel-vel` (≈ linha 163) e `.painel-config` (≈ linha 254),
substituir:

```css
  inset: 0;
```

por:

```css
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
```

(São os dois únicos usos de `inset` no arquivo. Funcionam em qualquer navegador.)

## Fix 2 (CRÍTICO) — substituir `crypto.randomUUID()`

Em `app.js`, criar uma função de ID compatível com Chrome 79 (que **tem**
`crypto.getRandomValues`, só não tem `randomUUID`). Adicionar perto do topo dos helpers:

```js
function gerarId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  if (window.crypto && crypto.getRandomValues) {
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // versão 4
    b[8] = (b[8] & 0x3f) | 0x80; // variante
    var h = [];
    for (var i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
    return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-'
         + h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-'
         + h.slice(10, 16).join('');
  }
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
```

E na função `aoSalvar()` (≈ linha 427) trocar:

```js
    id: crypto.randomUUID(),
```

por:

```js
    id: gerarId(),
```

## Fix 3 (cosmético) — fallback de `gap` em flexbox

Somente os contêineres **flex** perdem o espaçamento no Chrome 79 (os `gap` de **grid**,
como `.stats`, funcionam normal — não mexer). Contêineres flex afetados: `main` (≈26),
`.fuel-toggle` (≈38), conteúdo do `.painel-config` (≈273) e `.seg` (≈278).

Opção recomendada: manter o `gap` (funciona onde há suporte) e adicionar um fallback por
margem para navegadores antigos, por exemplo:

```css
.fuel-toggle > * + * { margin-left: .8rem; }
.seg > * { margin: 0 .6rem .6rem 0; }
```

(Ajustar conforme o layout. É só polimento visual; não bloqueia o uso.)

---

## Deploy

1. Reconstruir os bundles: `npm run build` (regenera `app.min.js`/`voz.min.js` a partir
   do `app.js` corrigido).
2. Incrementar a versão do cache no `sw.js`: `combustivel-v4` → `combustivel-v5`.
3. Se o APK empacota arquivos locais, **reconstruir o APK** a partir dos arquivos atuais.
4. Commit + push.

## Teste limpo no aparelho (importante)

Para não pegar cache antigo:
- No navegador da central: limpar dados do site (ou abrir uma vez com internet para o
  service worker v5 substituir o v4).
- No APK: limpar dados do app (Config → Apps → app → Armazenamento → Limpar dados) ou
  reinstalar.

## Critérios de aceite

- Ao abrir, o app mostra a **tela do velocímetro** (não o formulário).
- O botão de **configurações** abre o painel corretamente.
- **Salvar** grava o abastecimento sem erro no Chrome 79.
- Espaçamentos visíveis (sem elementos grudados).
- Nenhum uso de `inset`, `crypto.randomUUID` ou `gap` em flexbox sem fallback.

## Observação

Isto complementa o outro documento (diagnóstico + funcionalidades). O capturador de erro
na tela sugerido lá continua valendo: com ele, qualquer erro futuro de runtime aparece
direto na tela da central, sem precisar de console.
