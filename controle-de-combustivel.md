# Controle de Combustível — Especificação do Projeto

> App simples para registrar abastecimentos direto na multimídia Android do carro,
> acompanhar o consumo real (km/l) e descobrir se compensa abastecer com **etanol** ou **gasolina**.

---

## 1. Visão geral

A cada abastecimento o usuário registra: tipo de combustível, quilometragem rodada
(trip zerado), litros abastecidos e, opcionalmente, o preço por litro. O app grava o
evento com data/hora automática e mantém um painel com:

- consumo médio (km/l) por combustível;
- custo por km rodado (R$/km) por combustível;
- qual combustível está sendo mais vantajoso **para este carro**, com base em dados reais.

Escopo intencionalmente enxuto: um único carro, uso pessoal, sem servidor.

---

## 2. Onde vai rodar (decisão de plataforma)

| Opção | Viável? | Observação |
|-------|---------|------------|
| **Android Auto** | ❌ Não | Só aceita apps de navegação, áudio e mensagens. Um app de digitação de dados não é aprovado. |
| **Central Android completa** (multimídia de mercado) | ✅ Sim | Roda Android "de verdade" → aceita APK e PWA. **Alvo do projeto.** |
| **Android Automotive OS** (embarcado de fábrica) | ⚠️ Parcial | Exige publicação na Play Store com regras de categoria; complexo demais pro escopo. |

**Recomendação: PWA offline-first.** Roda no navegador da central, instala como ícone na
tela inicial, funciona sem internet e guarda os dados localmente. Não depende de loja,
de aprovação nem de conexão dentro do carro.

> Alternativa: empacotar o mesmo PWA como APK (via WebView/Capacitor) se quiser um ícone
> mais "nativo". Mesma base de código.

---

## 3. Requisitos funcionais

### 3.1 Registro de abastecimento (entrada)

Campos por evento:

- **Combustível** — `gasolina` ou `etanol` (seleção obrigatória).
- **Km rodados** — leitura do trip que foi zerado no abastecimento anterior (número).
- **Litros abastecidos** — quantidade colocada agora (número, ex.: 38,5).
- **Preço por litro** — opcional, para análise de custo (R$).
- **Data/hora** — preenchida automaticamente no momento do registro (não editável por padrão, mas ajustável).

**Entrada por voz:** na central Android, o próprio teclado do sistema tem microfone —
basta tocar no campo numérico e ditar. Não precisa de API especial. (Opcional futuro:
Web Speech API para ditar o formulário inteiro, mas depende de rede/Google, então fica pra depois.)

### 3.2 Método de cálculo (importante)

O app usa o **método do tanque cheio**:

- Você enche o tanque e **zera o trip**.
- Roda normalmente.
- No próximo abastecimento, informa o km do trip e os litros que couberam.
- Os litros que couberam agora = o que foi consumido naquela distância.

Portanto, o consumo do intervalo que **termina** no abastecimento atual é:

```
consumo (km/l) = km_rodados / litros_abastecidos
```

> O **primeiro** registro serve só de marco inicial — ainda não há km rodados para
> calcular consumo. O painel só começa a ter números a partir do segundo abastecimento.
> Para máxima precisão, sempre encher o tanque até o mesmo ponto (bomba desligar).

### 3.3 Painel de consumo (saída)

- Consumo médio geral (km/l).
- Consumo médio **por combustível** (etanol x gasolina).
- Custo por km por combustível (quando houver preço informado).
- **Veredito etanol x gasolina** (ver seção 5.3).
- Histórico dos abastecimentos (lista/tabela).
- (Futuro) gráfico de consumo ao longo do tempo.

---

## 4. Modelo de dados

Uma única "tabela" `abastecimentos`. Em PWA, guardar em **IndexedDB** (ou `localStorage`
para começar simples).

```ts
type Abastecimento = {
  id: string;              // uuid
  criadoEm: string;        // ISO datetime — data/hora do registro (automático)
  combustivel: 'gasolina' | 'etanol';
  kmRodados: number;       // trip zerado no abastecimento anterior
  litros: number;          // litros abastecidos agora
  precoPorLitro?: number;  // R$ opcional
  precoOutro?: number;     // R$ opcional — preço do OUTRO combustível na mesma bomba
};
```

Campos **derivados** (calculados, não armazenados):

```ts
consumoKmL   = kmRodados / litros;              // km por litro do intervalo
custoTotal   = litros * precoPorLitro;          // R$ do abastecimento
custoPorKm   = precoPorLitro / consumoKmL;      // R$/km (= preço / (km/l))
```

---

## 5. Lógica de análise

### 5.1 Consumo médio por combustível

Média dos `consumoKmL` de todos os registros de cada combustível (ignorando o primeiro
registro sem intervalo válido).

```
mediaEtanol   = média(consumoKmL onde combustivel = etanol)
mediaGasolina = média(consumoKmL onde combustivel = gasolina)
```

### 5.2 Custo por km (métrica de comparação principal)

O que importa no bolso não é o preço do litro, é o **custo de cada km rodado**:

```
custoPorKm = precoPorLitro / consumoMedio
```

Compara-se `custoPorKm_etanol` vs `custoPorKm_gasolina`. Menor vence.

### 5.3 Veredito etanol x gasolina (personalizado)

A famosa "regra dos 70%" assume que o etanol rende 70% da gasolina. Mas isso é média de
mercado — **este app mede o número real do seu carro**:

```
rendimentoRelativo = mediaEtanol / mediaGasolina   // ex.: 0,68 → etanol rende 68% aqui
precoRelativo      = precoEtanol / precoGasolina    // ex.: 0,64
```

Regra do veredito:

```
se precoRelativo < rendimentoRelativo  → ETANOL compensa
se precoRelativo > rendimentoRelativo  → GASOLINA compensa
(empate técnico se muito próximos)
```

Exibir também o **preço de equilíbrio do etanol**: até quanto o litro de etanol vale a pena,
dado o preço atual da gasolina.

```
precoEquilibrioEtanol = precoGasolina * rendimentoRelativo
```

> Enquanto não houver dados suficientes dos dois combustíveis, o app assume rendimento
> inicial de **0,68** (preferência do usuário) e avisa que a estimativa vai ficando mais
> precisa a cada abastecimento registrado.

### 5.4 Economia por abastecimento

Se o usuário informar também o **preço do outro combustível** (`precoOutro`) na mesma
bomba, o app calcula quanto ele economizou (ou gastou a mais) pela escolha feita:

```
custoEscolhido    = litros * precoPorLitro
custoAlternativa  = escolheu etanol   → litros * rendimento * precoOutro   // gasolina usaria menos litros
                    escolheu gasolina → litros / rendimento * precoOutro   // etanol usaria mais litros
economia          = custoAlternativa - custoEscolhido   // >0 economizou, <0 gastou a mais
```

Exibir: economia do tanque ao salvar, coluna no histórico e total acumulado no painel.
O `precoOutro` também alimenta o veredito (§5.3) — os dois preços passam a vir da mesma
data/bomba, deixando a comparação mais fiel.

### 5.5 Comando de preços no posto (voz)

Fluxo de chegada ao posto: o usuário dita no campo de voz os dois preços de uma vez —
*"gasolina 5,89 etanol 3,99"*. O app então:

1. identifica o preço de cada combustível (dígitos ou por extenso);
2. seleciona o combustível que compensa e preenche `precoPorLitro` e `precoOutro`
   (trocar o combustível nos botões troca os preços de campo);
3. **fala em voz alta** (SpeechSynthesis pt-BR, offline com TTS local) o veredito e a
   economia estimada num tanque de referência de **45 litros** — citando a estimativa
   inicial de 68% quando ainda não há histórico dos dois combustíveis;
4. aguarda o ditado seguinte com km e litros (o texto acumula no mesmo campo e é
   reinterpretado; o anúncio de voz não se repete para os mesmos preços).

---

## 6. Stack técnica sugerida

Mantendo simples e offline-first:

- **Frontend:** HTML + JS puro *ou* React/Next em modo estático. Não precisa de framework pesado.
- **Armazenamento:** IndexedDB (recomendado) ou localStorage.
- **PWA:** `manifest.json` + Service Worker para instalar e rodar offline.
- **Sem backend, sem banco remoto, sem login** — tudo local no aparelho.
- **Backup/exportação:** botão para exportar CSV/JSON (e importar), para não perder dados se resetar a central.

> Opcional futuro: sincronizar o JSON com Google Sheets/Drive quando houver rede, para
> ter backup fora do carro.

---

## 7. Considerações de uso no carro

- **Telas grandes e botões grandes** — dedo, luva, solavanco. Nada de campos minúsculos.
- **Poucos toques** — fluxo de registro em uma tela só, tipo de combustível como dois botões grandes.
- **Teclado numérico** nos campos de número; microfone do teclado disponível para ditar.
- **Funciona 100% offline** — dentro do carro raramente há boa conexão.
- **Confirmação visual** clara ao salvar (o motorista não vai ficar conferindo).
- **Tema escuro** por padrão (uso noturno / brilho da central).

---

## 8. Roadmap por fases

**Fase 1 — MVP (essencial)**
- Formulário de registro (combustível, km, litros, preço opcional, data/hora automática).
- Armazenamento local.
- Painel: consumo médio por combustível + veredito etanol x gasolina.
- Lista de histórico.

**Fase 2 — Robustez**
- PWA instalável + service worker (offline).
- Exportar/importar CSV/JSON (backup).
- Editar/excluir registros.

**Fase 3 — Análise**
- Gráfico de consumo no tempo.
- Custo por km e gasto mensal.
- Preço de equilíbrio do etanol em destaque.

**Fase 4 — Extras (se fizer sentido)**
- Entrada por voz do formulário inteiro (Web Speech API).
- Sincronização com Google Drive/Sheets.
- Alertas de queda de consumo (possível problema mecânico).

---

## 8.1 Configurações (implementado)

Botão ⚙️ fixo (visível no velocímetro e no formulário) abre a tela de configurações,
persistida em `localStorage` (`config`):

- **Idioma:** português ou inglês (interface, feedbacks e falas de voz). **Padrão: inglês.**
- **Unidades:** Brasil (km, litros, km/l) ou EUA (milhas, galões, mpg; velocímetro em mph).
  **Padrão: EUA.**
  Os dados são sempre **gravados em km/litros/R$ por litro** — conversão só na exibição
  e na entrada.
- **Mascote:** Unicórnio (com arco-íris), Aviões, Passarinho, Dragão entre moinhos de
  vento (pás girando), ou Nenhum.
- **Resposta por voz:** ligada/desligada — desligada, o app responde só com o feedback
  textual na tela (o anúncio de economia do §5.5 deixa de ser falado).
- **Tamanho do tanque:** padrão 45 litros — usado no anúncio de economia (§5.5).
- **Rendimento inicial do etanol:** padrão 0,68 — usado enquanto não há histórico real.

Overrides de teste via URL (não salvos): `?mascote=dragao&idioma=en&unidades=us`.

---

## 9. Fora do escopo (por enquanto)

- Múltiplos veículos.
- Múltiplos usuários / login.
- Integração com dados do carro via OBD-II ou APIs da central.
- Publicação em loja de apps.
