// Controle de Combustível — app principal
// Armazenamento: localStorage. Método do tanque cheio (ver spec §3.2).
// Dados sempre gravados em km / litros / moeda por litro; unidades US só na exibição.
// A moeda nunca é convertida — exibida como "$" neutro, vale para qualquer moeda.

const STORAGE_KEY = 'abastecimentos';
const CONFIG_KEY = 'config';
const EMPATE_TOLERANCIA = 0.02;
const KM_POR_MILHA = 1.609344;
const LITROS_POR_GALAO = 3.785411784;

// ---------- Configurações ----------

const CONFIG_PADRAO = {
  idioma: 'en',             // 'pt' | 'en'
  unidades: 'us',           // 'br' (km, litros) | 'us' (milhas, galões)
  mascote: 'unicornio',     // 'unicornio' | 'avioes' | 'passarinho' | 'dragao' | 'nenhum'
  voz: true,                // responder também com voz (false = só texto na tela)
  tanqueLitros: 45,         // tanque de referência para anunciar economia (sempre litros)
  rendimentoInicial: 0.68,  // etanol/gasolina enquanto não há histórico real do carro
};

function carregarConfig() {
  try { return { ...CONFIG_PADRAO, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') }; }
  catch { return { ...CONFIG_PADRAO }; }
}
let config = carregarConfig();
function salvarConfig() { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }

// ---------- Unidades ----------

function usaUS() { return config.unidades === 'us'; }
const distExib = (km) => (usaUS() ? km / KM_POR_MILHA : km);
const distInterna = (v) => (usaUS() ? v * KM_POR_MILHA : v);
const volExib = (l) => (usaUS() ? l / LITROS_POR_GALAO : l);
const volInterno = (v) => (usaUS() ? v * LITROS_POR_GALAO : v);
const precoExib = (porLitro) => (usaUS() ? porLitro * LITROS_POR_GALAO : porLitro);
const precoInterno = (v) => (usaUS() ? v / LITROS_POR_GALAO : v);
const consumoExib = (kmL) => (usaUS() ? (kmL * LITROS_POR_GALAO) / KM_POR_MILHA : kmL); // km/l → mpg
const custoDistExib = (porKm) => (usaUS() ? porKm * KM_POR_MILHA : porKm);              // $/km → $/mi

const uDist = () => (usaUS() ? 'mi' : 'km');
const uVol = () => (usaUS() ? 'gal' : 'l');
const uConsumo = () => (usaUS() ? 'mpg' : 'km/l');
const uPreco = () => (usaUS() ? '$/gal' : '$/l');
const uCustoDist = () => (usaUS() ? '$/mi' : '$/km');
const uVel = () => (usaUS() ? 'mph' : 'km/h');

// ---------- Utilitários ----------

// Chrome 79 não tem crypto.randomUUID (Chrome 92+); tem crypto.getRandomValues.
function gerarId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  if (window.crypto && crypto.getRandomValues) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // versão 4
    b[8] = (b[8] & 0x3f) | 0x80; // variante
    const h = [];
    for (let i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
    return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-'
         + h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-'
         + h.slice(10, 16).join('');
  }
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

// Aceita vírgula decimal ("38,5") e ponto ("38.5").
function parseNumero(texto) {
  const n = parseFloat(String(texto).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function fmt(n, casas = 1) {
  const locale = config.idioma === 'pt' ? 'pt-BR' : 'en-US';
  return n.toLocaleString(locale, { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtInput(n) {
  return String(n).replace('.', config.idioma === 'pt' ? ',' : '.');
}

function fmtData(iso) {
  const locale = config.idioma === 'pt' ? 'pt-BR' : 'en-US';
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// ---------- Textos (pt/en) ----------

const T = {
  pt: {
    tituloApp: '⛽ Controle de Combustível',
    btnVel: '🚘 Modo velocímetro',
    tituloForm: 'Novo abastecimento',
    labelDitado: '🎤 Ditar registro',
    optDitado: 'toque no 🎤 e use o microfone do teclado (voz offline: teclado Sayboard)',
    micLabel: 'Ditar por voz',
    phDitado: () => (usaUS()
      ? 'ex.: "gasolina 22,30 etanol 15,10" ou "256 milhas, 10,2 galões"'
      : 'ex.: "gasolina 5,89 etanol 3,99" ou "412 km, 38,5 litros"'),
    gasolina: 'Gasolina',
    etanol: 'Etanol',
    labelKm: () => (usaUS() ? 'Milhas rodadas (trip)' : 'Km rodados (trip)'),
    labelLitros: () => (usaUS() ? 'Galões abastecidos' : 'Litros abastecidos'),
    labelPreco: () => (usaUS() ? 'Preço por galão ($)' : 'Preço por litro ($)'),
    opcional: 'opcional',
    optPrecoOutro: 'opcional — para medir a economia',
    precoOutroGasolina: 'Preço da gasolina hoje',
    precoOutroEtanol: 'Preço do etanol hoje',
    precoOutroNeutro: 'Preço do outro combustível',
    ajustarData: 'Ajustar data/hora',
    salvar: 'SALVAR',
    hintPrimeiro: 'Primeiro registro: serve como marco inicial. Encha o tanque e zere o trip — o consumo aparece a partir do próximo abastecimento.',
    tituloPainel: 'Painel',
    tituloHistorico: 'Histórico',
    thData: 'Data', thComb: 'Comb.',
    thKm: () => (usaUS() ? 'Mi' : 'Km'),
    thLitros: () => (usaUS() ? 'Gal' : 'Litros'),
    thConsumo: () => uConsumo(),
    thPreco: () => uPreco(),
    vazio: 'Nenhum abastecimento registrado ainda.',
    marcoInicial: 'marco inicial',
    gasAbrev: 'Gas.', etaAbrev: 'Eta.',
    mediaGeral: 'Média geral',
    custoDistGas: () => `${uCustoDist()} gasolina`,
    custoDistEta: () => `${uCustoDist()} etanol`,
    economiaAcum: 'Economia acumulada',
    gastoAcum: 'Gasto a mais acumulado',
    infPreco: 'Informe o preço nos abastecimentos de gasolina e etanol para ver qual compensa.',
    vEmpate: '⚖️ Empate técnico',
    vEtanol: '✅ ETANOL compensa',
    vGasolina: '✅ GASOLINA compensa',
    vEquilibrio: (p) => `Etanol vale a pena até <b>$ ${fmt(precoExib(p), 2)}</b>/${usaUS() ? 'galão' : 'litro'}.`,
    vBasePadrao: () => `Usando rendimento estimado (${fmt(config.rendimentoInicial * 100, 0)}%) — registre abastecimentos dos dois combustíveis para calibrar com o seu carro.`,
    vBaseReal: (r) => `Rendimento real do seu carro: etanol faz ${fmt(r * 100, 0)}% da gasolina.`,
    escolhaComb: '⚠ Escolha o combustível',
    informeKm: () => (usaUS() ? '⚠ Informe as milhas rodadas' : '⚠ Informe os km rodados'),
    informeLitros: () => (usaUS() ? '⚠ Informe os galões' : '⚠ Informe os litros'),
    salvo: '✓ Salvo',
    salvoEconomia: (v) => `✓ Salvo · você economizou $ ${fmt(v, 2)}`,
    salvoGasto: (v) => `✓ Salvo · $ ${fmt(v, 2)} a mais neste tanque`,
    confirmaExcluir: 'Excluir este registro?',
    entendi: (p) => `✓ Entendi: ${p}`,
    naoEntendi: () => `Não entendi — fale ${T.pt.phDitado()}`,
    fbEmpate: ' — empate técnico, tanto faz.',
    fbVencedor: (nome, e) => ` — ${nome.toUpperCase()} compensa: ~$ ${fmt(e, 0)} no tanque de ${fmt(volExib(config.tanqueLitros), 0)} ${uVol()}.`,
    fbDite: () => (usaUS() ? ' Agora dite as milhas e os galões.' : ' Agora dite os km e os litros.'),
    falaEmpate: 'Empate técnico: tanto faz etanol ou gasolina neste posto.',
    falaVencedor: (nome, econ) => `${nome} compensa: economia de aproximadamente ${Math.round(econ)} no tanque de ${fmt(volExib(config.tanqueLitros), 0)} ${usaUS() ? 'galões' : 'litros'}.`,
    falaEstimativa: () => ` Estimativa inicial, com etanol rendendo ${fmt(config.rendimentoInicial * 100, 0)} por cento da gasolina.`,
    velAtivando: 'Ativando GPS…',
    velAguardando: 'Aguardando leitura de velocidade…',
    velPrecisao: (m) => `Sinal GPS: precisão ±${m} m`,
    velNegada: 'Permissão de localização negada — libere a localização para o navegador.',
    velProcurando: 'Procurando sinal de GPS…',
    velSemGps: 'Este navegador não dá acesso ao GPS.',
    abastecer: '⛽ Abastecer',
    btnGraficos: '📊 Gráficos',
    grafTitulo: '📊 Gráficos',
    grafVoltar: '← Voltar',
    grafSemana: 'Semana', grafMes: 'Mês', grafAno: 'Ano',
    grafVolume: () => `Volume abastecido (${uVol()})`,
    grafCusto: 'Custo por período ($)',
    grafEconomia: 'Economia por período ($)',
    kpiVolume: 'Volume total',
    kpiCusto: 'Custo total',
    kpiEconomia: 'Economia líquida',
    grafSemCusto: () => (usaUS()
      ? 'Informe o preço por galão nos abastecimentos para ver o custo.'
      : 'Informe o preço por litro nos abastecimentos para ver o custo.'),
    grafSemEconomia: 'Informe também o preço do outro combustível para medir a economia.',
    ttTotal: 'total',
    ttEconomia: 'economia', ttGasto: 'gasto a mais',
    cfgTitulo: 'Configurações',
    cfgIdioma: 'Idioma',
    cfgUnidades: 'Unidades',
    cfgBr: 'Brasil (km, litros)',
    cfgUs: 'EUA (milhas, galões)',
    cfgMascote: 'Mascote',
    mUnicornio: '🦄 Unicórnio', mAvioes: '✈️ Aviões', mPassarinho: '🐦 Passarinho',
    mDragao: '🐉 Dragão', mNenhum: '🚫 Nenhum',
    cfgVoz: 'Resposta por voz',
    vozOn: '🔊 Ativada', vozOff: '🔇 Desligada (só texto)',
    cfgTanque: () => (usaUS() ? 'Tamanho do tanque (galões)' : 'Tamanho do tanque (litros)'),
    cfgRendimento: 'Rendimento inicial do etanol (ex.: 0,68)',
    cfgFechar: 'Fechar',
  },
  en: {
    tituloApp: '⛽ Fuel Tracker',
    btnVel: '🚘 Speedometer mode',
    tituloForm: 'New fill-up',
    labelDitado: '🎤 Dictate entry',
    optDitado: 'tap 🎤 and use the keyboard mic (offline voice: Sayboard keyboard)',
    micLabel: 'Dictate by voice',
    phDitado: () => (usaUS()
      ? 'e.g. "gas 22.30 ethanol 15.10" or "256 miles, 10.2 gallons"'
      : 'e.g. "gas 5.89 ethanol 3.99" or "412 km, 38.5 liters"'),
    gasolina: 'Gasoline',
    etanol: 'Ethanol',
    labelKm: () => (usaUS() ? 'Miles driven (trip)' : 'Km driven (trip)'),
    labelLitros: () => (usaUS() ? 'Gallons added' : 'Liters added'),
    labelPreco: () => (usaUS() ? 'Price per gallon ($)' : 'Price per liter ($)'),
    opcional: 'optional',
    optPrecoOutro: 'optional — to measure savings',
    precoOutroGasolina: "Today's gasoline price",
    precoOutroEtanol: "Today's ethanol price",
    precoOutroNeutro: 'Price of the other fuel',
    ajustarData: 'Adjust date/time',
    salvar: 'SAVE',
    hintPrimeiro: 'First record is just a baseline. Fill the tank and reset the trip — consumption shows up from the next fill-up on.',
    tituloPainel: 'Dashboard',
    tituloHistorico: 'History',
    thData: 'Date', thComb: 'Fuel',
    thKm: () => (usaUS() ? 'Mi' : 'Km'),
    thLitros: () => (usaUS() ? 'Gal' : 'Liters'),
    thConsumo: () => uConsumo(),
    thPreco: () => uPreco(),
    vazio: 'No fill-ups recorded yet.',
    marcoInicial: 'baseline',
    gasAbrev: 'Gas', etaAbrev: 'Eth',
    mediaGeral: 'Overall average',
    custoDistGas: () => `${uCustoDist()} gasoline`,
    custoDistEta: () => `${uCustoDist()} ethanol`,
    economiaAcum: 'Total saved',
    gastoAcum: 'Extra spent overall',
    infPreco: 'Enter prices on gasoline and ethanol fill-ups to see which one pays off.',
    vEmpate: '⚖️ Too close to call',
    vEtanol: '✅ ETHANOL pays off',
    vGasolina: '✅ GASOLINE pays off',
    vEquilibrio: (p) => `Ethanol is worth it up to <b>$ ${fmt(precoExib(p), 2)}</b>/${usaUS() ? 'gallon' : 'liter'}.`,
    vBasePadrao: () => `Using estimated efficiency (${fmt(config.rendimentoInicial * 100, 0)}%) — log fill-ups with both fuels to calibrate for your car.`,
    vBaseReal: (r) => `Your car's real numbers: ethanol does ${fmt(r * 100, 0)}% of gasoline.`,
    escolhaComb: '⚠ Pick a fuel',
    informeKm: () => (usaUS() ? '⚠ Enter the miles driven' : '⚠ Enter the km driven'),
    informeLitros: () => (usaUS() ? '⚠ Enter the gallons' : '⚠ Enter the liters'),
    salvo: '✓ Saved',
    salvoEconomia: (v) => `✓ Saved · you saved $ ${fmt(v, 2)}`,
    salvoGasto: (v) => `✓ Saved · $ ${fmt(v, 2)} extra on this tank`,
    confirmaExcluir: 'Delete this record?',
    entendi: (p) => `✓ Got it: ${p}`,
    naoEntendi: () => `Didn't catch that — say ${T.en.phDitado()}`,
    fbEmpate: ' — too close to call, either works.',
    fbVencedor: (nome, e) => ` — ${nome.toUpperCase()} pays off: ~$ ${fmt(e, 0)} on a ${fmt(volExib(config.tanqueLitros), 0)} ${uVol()} tank.`,
    fbDite: () => (usaUS() ? ' Now dictate the miles and gallons.' : ' Now dictate the km and liters.'),
    falaEmpate: 'Too close to call: either ethanol or gasoline works at this station.',
    falaVencedor: (nome, econ) => `${nome} pays off: about ${Math.round(econ)} saved on a ${fmt(volExib(config.tanqueLitros), 0)}-${usaUS() ? 'gallon' : 'liter'} tank.`,
    falaEstimativa: () => ` Initial estimate, assuming ethanol does ${fmt(config.rendimentoInicial * 100, 0)} percent of gasoline.`,
    velAtivando: 'Starting GPS…',
    velAguardando: 'Waiting for a speed reading…',
    velPrecisao: (m) => `GPS signal: accuracy ±${m} m`,
    velNegada: 'Location permission denied — allow location for the browser.',
    velProcurando: 'Searching for GPS signal…',
    velSemGps: 'This browser has no GPS access.',
    abastecer: '⛽ Fill up',
    btnGraficos: '📊 Charts',
    grafTitulo: '📊 Charts',
    grafVoltar: '← Back',
    grafSemana: 'Week', grafMes: 'Month', grafAno: 'Year',
    grafVolume: () => `Fuel volume (${uVol()})`,
    grafCusto: 'Cost per period ($)',
    grafEconomia: 'Savings per period ($)',
    kpiVolume: 'Total volume',
    kpiCusto: 'Total cost',
    kpiEconomia: 'Net savings',
    grafSemCusto: () => (usaUS()
      ? 'Enter the price per gallon on fill-ups to see cost.'
      : 'Enter the price per liter on fill-ups to see cost.'),
    grafSemEconomia: "Also enter the other fuel's price to measure savings.",
    ttTotal: 'total',
    ttEconomia: 'saved', ttGasto: 'extra spent',
    cfgTitulo: 'Settings',
    cfgIdioma: 'Language',
    cfgUnidades: 'Units',
    cfgBr: 'Brazil (km, liters)',
    cfgUs: 'US (miles, gallons)',
    cfgMascote: 'Mascot',
    mUnicornio: '🦄 Unicorn', mAvioes: '✈️ Planes', mPassarinho: '🐦 Little bird',
    mDragao: '🐉 Dragon', mNenhum: '🚫 None',
    cfgVoz: 'Voice replies',
    vozOn: '🔊 On', vozOff: '🔇 Off (text only)',
    cfgTanque: () => (usaUS() ? 'Tank size (gallons)' : 'Tank size (liters)'),
    cfgRendimento: 'Initial ethanol efficiency (e.g. 0.68)',
    cfgFechar: 'Close',
  },
};

function t(chave, ...args) {
  const dic = T[config.idioma] || T.pt;
  const v = dic[chave] ?? T.pt[chave] ?? chave;
  return typeof v === 'function' ? v(...args) : v;
}

// ---------- Armazenamento ----------

function carregar() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function salvar(registros) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
}

// ---------- Cálculos (spec §5) — sempre em km / litros / moeda por litro ----------

// Ordena por data e marca o primeiro registro como marco inicial (sem intervalo válido).
function comIntervalos(registros) {
  const ordenados = [...registros].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  return ordenados.map((r, i) => ({
    ...r,
    marcoInicial: i === 0,
    consumoKmL: i > 0 && r.litros > 0 ? r.kmRodados / r.litros : null,
  }));
}

function media(valores) {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null;
}

function calcularEstatisticas(registros) {
  const lista = comIntervalos(registros);
  const validos = lista.filter((r) => r.consumoKmL !== null);

  const porComb = (c) => validos.filter((r) => r.combustivel === c).map((r) => r.consumoKmL);
  const mediaGasolina = media(porComb('gasolina'));
  const mediaEtanol = media(porComb('etanol'));
  const mediaGeral = media(validos.map((r) => r.consumoKmL));

  // Preço mais recente por combustível — vale tanto o preço do que foi abastecido
  // quanto o "preço do outro" anotado num abastecimento do combustível oposto.
  const ultimoPreco = (c) =>
    [...lista].reverse()
      .map((r) => (r.combustivel === c ? r.precoPorLitro : r.precoOutro))
      .find((p) => p > 0) ?? null;
  const precoGasolina = ultimoPreco('gasolina');
  const precoEtanol = ultimoPreco('etanol');

  const rendimentoReal = mediaEtanol && mediaGasolina ? mediaEtanol / mediaGasolina : null;
  const rendimento = rendimentoReal ?? config.rendimentoInicial;

  // Economia por abastecimento: custo do tanque escolhido vs. quanto custaria
  // rodar os mesmos km com o outro combustível (litros ajustados pelo rendimento).
  const listaComEconomia = lista.map((r) => {
    if (!(r.precoPorLitro > 0) || !(r.precoOutro > 0)) return { ...r, economia: null };
    const custoEscolhido = r.litros * r.precoPorLitro;
    const custoAlternativa = r.combustivel === 'etanol'
      ? r.litros * rendimento * r.precoOutro   // alternativa: gasolina (menos litros)
      : (r.litros / rendimento) * r.precoOutro; // alternativa: etanol (mais litros)
    return { ...r, economia: custoAlternativa - custoEscolhido };
  });
  const economias = listaComEconomia.filter((r) => r.economia !== null);
  const economiaTotal = economias.length
    ? economias.reduce((s, r) => s + r.economia, 0)
    : null;

  let veredito = null;
  if (precoEtanol && precoGasolina) {
    const precoRelativo = precoEtanol / precoGasolina;
    veredito = {
      vencedor:
        Math.abs(precoRelativo - rendimento) < EMPATE_TOLERANCIA
          ? 'empate'
          : precoRelativo < rendimento ? 'etanol' : 'gasolina',
      precoEquilibrioEtanol: precoGasolina * rendimento,
      rendimento,
      usandoPadrao: rendimentoReal === null,
    };
  }

  return {
    lista: listaComEconomia,
    mediaGeral, mediaGasolina, mediaEtanol,
    precoGasolina, precoEtanol, veredito, rendimentoReal, economiaTotal,
  };
}

// ---------- Estado do formulário ----------

let combustivelSelecionado = null;

// ---------- Renderização ----------

function statHtml(label, valor, unidade, classe = '') {
  const casas = unidade === 'km/l' || unidade === 'mpg' ? 1 : 2;
  const v = valor === null ? '—' : `${fmt(valor, casas)} <small>${unidade}</small>`;
  return `<div class="stat ${classe}"><div class="label">${label}</div><div class="value">${v}</div></div>`;
}

function renderPainel(stats) {
  const el = document.getElementById('stats');
  el.innerHTML =
    statHtml(t('mediaGeral'), stats.mediaGeral === null ? null : consumoExib(stats.mediaGeral), uConsumo()) +
    statHtml(t('gasolina'), stats.mediaGasolina === null ? null : consumoExib(stats.mediaGasolina), uConsumo(), 'gasolina') +
    statHtml(t('etanol'), stats.mediaEtanol === null ? null : consumoExib(stats.mediaEtanol), uConsumo(), 'etanol') +
    (stats.precoGasolina && stats.mediaGasolina
      ? statHtml(t('custoDistGas'), custoDistExib(stats.precoGasolina / stats.mediaGasolina), uCustoDist(), 'gasolina') : '') +
    (stats.precoEtanol && stats.mediaEtanol
      ? statHtml(t('custoDistEta'), custoDistExib(stats.precoEtanol / stats.mediaEtanol), uCustoDist(), 'etanol') : '') +
    (stats.economiaTotal !== null
      ? statHtml(
          stats.economiaTotal >= 0 ? t('economiaAcum') : t('gastoAcum'),
          Math.abs(stats.economiaTotal), '$',
          stats.economiaTotal >= 0 ? 'eco-pos' : 'eco-neg',
        ) : '');

  const vEl = document.getElementById('veredito');
  const v = stats.veredito;
  if (!v) {
    vEl.className = 'veredito';
    vEl.innerHTML = t('infPreco');
    return;
  }
  const titulo =
    v.vencedor === 'empate' ? t('vEmpate') :
    v.vencedor === 'etanol' ? t('vEtanol') : t('vGasolina');
  const base = v.usandoPadrao ? t('vBasePadrao') : t('vBaseReal', v.rendimento);
  vEl.className = `veredito ${v.vencedor}`;
  vEl.innerHTML =
    `<strong>${titulo}</strong>` +
    t('vEquilibrio', v.precoEquilibrioEtanol) +
    `<span class="sub">${base}</span>`;
}

function renderHistorico(stats) {
  const tbody = document.getElementById('listaHistorico');
  const vazio = document.getElementById('vazio');
  const desc = [...stats.lista].reverse();

  vazio.hidden = desc.length > 0;
  tbody.innerHTML = desc.map((r) => `
    <tr>
      <td>${fmtData(r.criadoEm)}</td>
      <td class="comb-${r.combustivel}">${r.combustivel === 'gasolina' ? t('gasAbrev') : t('etaAbrev')}</td>
      <td>${fmt(distExib(r.kmRodados), 1)}</td>
      <td>${fmt(volExib(r.litros), 1)}</td>
      <td>${r.consumoKmL !== null ? fmt(consumoExib(r.consumoKmL), 1) : `<span class="marco">${t('marcoInicial')}</span>`}</td>
      <td>${r.precoPorLitro ? fmt(precoExib(r.precoPorLitro), 2) : '—'}</td>
      <td>${r.economia !== null
        ? `<span class="${r.economia >= 0 ? 'eco-pos' : 'eco-neg'}">${r.economia >= 0 ? '+' : '−'}${fmt(Math.abs(r.economia), 2)}</span>`
        : '—'}</td>
      <td><button class="del-btn" data-id="${r.id}" aria-label="&times;">✕</button></td>
    </tr>`).join('');
}

function renderTudo() {
  const registros = carregar();
  const stats = calcularEstatisticas(registros);
  renderPainel(stats);
  renderHistorico(stats);
  renderGraficos(); // só desenha se o painel de gráficos estiver aberto
  document.getElementById('hintPrimeiro').hidden = registros.length > 0;
}

// ---------- Ações ----------

function mostrarToast(texto, duracao = 2000) {
  const toast = document.getElementById('toast');
  toast.textContent = texto;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, duracao);
}

function aoSalvar() {
  const km = parseNumero(document.getElementById('km').value);
  const litros = parseNumero(document.getElementById('litros').value);
  const preco = parseNumero(document.getElementById('preco').value);
  const precoOutro = parseNumero(document.getElementById('precoOutro').value);
  const dataAjustada = document.getElementById('dataHora').value;

  if (!combustivelSelecionado) return mostrarToast(t('escolhaComb'));
  if (km === null || km < 0) return mostrarToast(t('informeKm'));
  if (litros === null || litros <= 0) return mostrarToast(t('informeLitros'));

  const registro = {
    id: gerarId(),
    criadoEm: dataAjustada ? new Date(dataAjustada).toISOString() : new Date().toISOString(),
    combustivel: combustivelSelecionado,
    kmRodados: distInterna(km),
    litros: volInterno(litros),
    ...(preco !== null && preco > 0 ? { precoPorLitro: precoInterno(preco) } : {}),
    ...(precoOutro !== null && precoOutro > 0 ? { precoOutro: precoInterno(precoOutro) } : {}),
  };

  const registros = carregar();
  registros.push(registro);
  salvar(registros);

  // Economia deste tanque (se os dois preços foram informados).
  const salvo = calcularEstatisticas(registros).lista.find((r) => r.id === registro.id);
  const economia = salvo?.economia ?? null;

  // Limpa o formulário para o próximo registro.
  precosDitados = null;
  ultimoAnuncio = '';
  document.getElementById('ditado').value = '';
  document.getElementById('ditadoFeedback').textContent = '';
  document.getElementById('km').value = '';
  document.getElementById('litros').value = '';
  document.getElementById('preco').value = '';
  document.getElementById('precoOutro').value = '';
  document.getElementById('dataHora').value = '';
  document.querySelector('.ajuste-data').open = false;

  renderTudo();
  if (economia === null) mostrarToast(t('salvo'));
  else if (economia >= 0) mostrarToast(t('salvoEconomia', economia), 3500);
  else mostrarToast(t('salvoGasto', -economia), 3500);
}

function aoExcluir(id) {
  if (!confirm(t('confirmaExcluir'))) return;
  salvar(carregar().filter((r) => r.id !== id));
  renderTudo();
}

function atualizarLabelPrecoOutro() {
  document.getElementById('labelPrecoOutro').textContent =
    combustivelSelecionado === 'gasolina' ? t('precoOutroEtanol') :
    combustivelSelecionado === 'etanol' ? t('precoOutroGasolina') : t('precoOutroNeutro');
}

function selecionarCombustivel(fuel) {
  combustivelSelecionado = fuel;
  document.querySelectorAll('.fuel-btn').forEach((b) => b.classList.toggle('selected', b.dataset.fuel === fuel));
  atualizarLabelPrecoOutro();
  preencherPrecosDitados();
}

// ---------- Comando de preços no posto ----------
// "gasolina 5,89 etanol 3,99" → preenche os dois preços, escolhe o combustível
// que compensa e fala a economia estimada num tanque cheio.

let precosDitados = null; // { gasolina, etanol } nas unidades de exibição
let ultimoAnuncio = '';

function falar(texto) {
  if (!config.voz) return; // resposta por voz desligada nas configurações
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = config.idioma === 'pt' ? 'pt-BR' : 'en-US';
    speechSynthesis.speak(u);
  } catch { /* sem síntese de voz, segue só com o feedback visual */ }
}

function recomendacaoTanque() {
  const stats = calcularEstatisticas(carregar());
  const rendimento = stats.rendimentoReal ?? config.rendimentoInicial;
  const pG = precoInterno(precosDitados.gasolina);
  const pE = precoInterno(precosDitados.etanol);
  const precoRelativo = pE / pG;
  const vencedor = Math.abs(precoRelativo - rendimento) < EMPATE_TOLERANCIA
    ? 'empate'
    : precoRelativo < rendimento ? 'etanol' : 'gasolina';
  const economia = vencedor === 'etanol'
    ? config.tanqueLitros * (rendimento * pG - pE)
    : vencedor === 'gasolina'
      ? config.tanqueLitros * (pE / rendimento - pG)
      : 0;
  return { vencedor, economia, usandoPadrao: stats.rendimentoReal === null };
}

function preencherPrecosDitados() {
  if (!precosDitados || !combustivelSelecionado) return;
  const outro = combustivelSelecionado === 'gasolina' ? 'etanol' : 'gasolina';
  document.getElementById('preco').value = fmtInput(precosDitados[combustivelSelecionado]);
  document.getElementById('precoOutro').value = fmtInput(precosDitados[outro]);
}

function anunciarRecomendacao(rec) {
  const chave = `${precosDitados.gasolina}|${precosDitados.etanol}`;
  if (chave === ultimoAnuncio) return; // não repete a cada letra do ditado seguinte
  ultimoAnuncio = chave;

  let frase;
  if (rec.vencedor === 'empate') {
    frase = t('falaEmpate');
  } else {
    frase = t('falaVencedor', t(rec.vencedor), rec.economia);
  }
  if (rec.usandoPadrao) frase += t('falaEstimativa');
  falar(frase);
}

// Campo de ditado: o teclado transcreve a fala; interpretarDitado (voz.js)
// distribui o texto nos campos conforme o usuário fala.
function aoDitar() {
  const texto = document.getElementById('ditado').value;
  const fb = document.getElementById('ditadoFeedback');
  if (!texto.trim()) { fb.textContent = ''; return; }

  const r = interpretarDitado(texto, { sistema: config.unidades });
  const partes = [];
  let veredito = '';

  // Comando de posto: os dois preços na mesma frase.
  if (r.precoGasolina !== null && r.precoEtanol !== null) {
    precosDitados = { gasolina: r.precoGasolina, etanol: r.precoEtanol };
    const rec = recomendacaoTanque();
    if (!combustivelSelecionado && rec.vencedor !== 'empate') selecionarCombustivel(rec.vencedor);
    preencherPrecosDitados();
    anunciarRecomendacao(rec);
    partes.push(
      `${t('gasolina').toLowerCase()} $ ${fmtInput(r.precoGasolina)}`,
      `${t('etanol').toLowerCase()} $ ${fmtInput(r.precoEtanol)}`,
    );
    veredito = rec.vencedor === 'empate'
      ? t('fbEmpate')
      : t('fbVencedor', t(rec.vencedor), rec.economia);
    if (r.km === null || r.litros === null) veredito += t('fbDite');
  }

  if (r.combustivel) { selecionarCombustivel(r.combustivel); partes.push(t(r.combustivel).toLowerCase()); }
  if (r.km !== null) { document.getElementById('km').value = fmtInput(r.km); partes.push(`${fmtInput(r.km)} ${uDist()}`); }
  if (r.litros !== null) { document.getElementById('litros').value = fmtInput(r.litros); partes.push(`${fmtInput(r.litros)} ${uVol()}`); }
  if (r.preco !== null) { document.getElementById('preco').value = fmtInput(r.preco); partes.push(`$ ${fmtInput(r.preco)}/${uVol()}`); }

  fb.textContent = partes.length ? t('entendi', partes.join(' · ')) + veredito : t('naoEntendi');
}

// ---------- Velocímetro (GPS) ----------
// Velocidade vem do GPS da central — funciona offline, mas só com a página em
// primeiro plano. Wake Lock impede a tela de apagar enquanto o modo está aberto.

let velWatchId = null;
let wakeLock = null;
let ultimaPosicao = null;
let ultimaKmh = null; // última leitura, para re-exibir na troca de unidades

function distanciaMetros(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function velocidadeKmh(pos) {
  let ms = pos.coords.speed;
  if (ms === null && ultimaPosicao) {
    // Nem todo GPS informa velocidade — calcula pela distância entre leituras.
    const dt = (pos.timestamp - ultimaPosicao.timestamp) / 1000;
    if (dt > 0.5) ms = distanciaMetros(ultimaPosicao.coords, pos.coords) / dt;
  }
  ultimaPosicao = pos;
  if (ms === null) return null;
  const kmh = ms * 3.6;
  return kmh < 2 ? 0 : kmh; // parado, GPS "treme" 1-2 km/h
}

function exibirVelocidade() {
  const valor = document.getElementById('velValor');
  valor.textContent = ultimaKmh === null ? '0' : String(Math.round(usaUS() ? ultimaKmh / KM_POR_MILHA : ultimaKmh));
  valor.classList.toggle('aguardando', ultimaKmh === null);
}

function aoLerPosicao(pos) {
  ultimaKmh = velocidadeKmh(pos);
  exibirVelocidade();
  document.getElementById('velStatus').textContent = ultimaKmh === null
    ? t('velAguardando')
    : t('velPrecisao', Math.round(pos.coords.accuracy));
}

function aoErroGps(err) {
  document.getElementById('velStatus').textContent =
    err.code === 1 ? t('velNegada') : t('velProcurando');
}

async function abrirVelocimetro() {
  document.getElementById('painelVel').hidden = false;
  if (!('geolocation' in navigator)) {
    document.getElementById('velStatus').textContent = t('velSemGps');
    return;
  }
  document.getElementById('velStatus').textContent = t('velAtivando');
  velWatchId = navigator.geolocation.watchPosition(aoLerPosicao, aoErroGps, {
    enableHighAccuracy: true, maximumAge: 0, timeout: 15000,
  });
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* sem suporte, segue sem */ }
  document.documentElement.requestFullscreen?.().catch(() => {});
}

function fecharVelocimetro() {
  document.getElementById('painelVel').hidden = true;
  ultimaKmh = null;
  exibirVelocidade();
  if (velWatchId !== null) { navigator.geolocation.clearWatch(velWatchId); velWatchId = null; }
  ultimaPosicao = null;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// Sistema solta o Wake Lock quando a página sai de foco; retoma ao voltar.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !document.getElementById('painelVel').hidden) {
    navigator.wakeLock?.request('screen').then((l) => { wakeLock = l; }).catch(() => {});
  }
});

// ---------- Gráficos históricos ----------
// Colunas SVG geradas à mão — sem bibliotecas, a central roda Chrome antigo e
// tudo precisa funcionar offline. Volume nas unidades da config (volExib);
// custo e economia sempre em $ (moeda neutra, nunca convertida).

let granularidade = 'mes'; // 'semana' | 'mes' | 'ano' — não persistido
let periodosVisiveis = []; // última agregação renderizada (fonte do tooltip)
let hitAtivo = null;

function inicioPeriodo(d, gran) {
  if (gran === 'ano') return new Date(d.getFullYear(), 0, 1);
  if (gran === 'semana') {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - (x.getDay() + 6) % 7); // semana começa na segunda
    return x;
  }
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function avancarPeriodo(d, gran) {
  if (gran === 'ano') return new Date(d.getFullYear() + 1, 0, 1);
  if (gran === 'semana') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

function rotuloPeriodo(d, gran) {
  const locale = config.idioma === 'pt' ? 'pt-BR' : 'en-US';
  if (gran === 'ano') return String(d.getFullYear());
  if (gran === 'semana') return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  const m = d.toLocaleDateString(locale, { month: 'short' }).replace('.', '');
  return d.getMonth() === 0 ? `${m} ${String(d.getFullYear()).slice(-2)}` : m;
}

function rotuloPeriodoLongo(d, gran) {
  const locale = config.idioma === 'pt' ? 'pt-BR' : 'en-US';
  if (gran === 'ano') return String(d.getFullYear());
  if (gran === 'mes') return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const fim = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
  const dm = (x) => x.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  return `${dm(d)} – ${dm(fim)}`;
}

// Soma volume, custo e economia por período, numa linha do tempo contínua
// (períodos sem abastecimento entram zerados), e devolve só os últimos `max`.
// Recebe a lista já enriquecida por calcularEstatisticas (campo `economia`).
function agruparPorPeriodo(lista, gran, max = 12) {
  if (!lista.length) return [];
  const vazio = (inicio) => ({
    inicio, litrosGasolina: 0, litrosEtanol: 0,
    custoGasolina: 0, custoEtanol: 0, economia: 0, temEconomia: false,
  });
  const porInicio = {};
  for (const r of lista) {
    const inicio = inicioPeriodo(new Date(r.criadoEm), gran);
    const p = porInicio[inicio.getTime()] ?? (porInicio[inicio.getTime()] = vazio(inicio));
    const custo = r.precoPorLitro > 0 ? r.litros * r.precoPorLitro : 0;
    if (r.combustivel === 'gasolina') { p.litrosGasolina += r.litros; p.custoGasolina += custo; }
    else { p.litrosEtanol += r.litros; p.custoEtanol += custo; }
    if (r.economia !== null) { p.economia += r.economia; p.temEconomia = true; }
  }
  const tempos = Object.keys(porInicio).map(Number).sort((a, b) => a - b);
  const fim = tempos[tempos.length - 1];
  const seq = [];
  for (let d = new Date(tempos[0]); d.getTime() <= fim; d = avancarPeriodo(d, gran)) {
    seq.push(porInicio[d.getTime()] || vazio(new Date(d)));
  }
  return seq.slice(-max);
}

// Geometria comum dos gráficos (viewBox fixo, escala pelo CSS).
const GRAF_W = 600;
const GRAF_H = 220;
const GRAF_M = { topo: 20, dir: 8, baixo: 26, esq: 52 };

function px(v) { return Math.round(v * 10) / 10; }

function passoLimpo(bruto) {
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const m = bruto / pot;
  return (m > 5 ? 10 : m > 2.5 ? 5 : m > 2 ? 2.5 : m > 1 ? 2 : 1) * pot;
}

// Ticks "limpos" (1/2/5×10ⁿ) cobrindo [minV, maxV], ~4 divisões.
function escalaLimpa(minV, maxV) {
  const passo = passoLimpo(Math.max(maxV - minV, 1e-9) / 4);
  const topo = Math.ceil(maxV / passo - 1e-9) * passo;
  const fundo = Math.floor(minV / passo + 1e-9) * passo;
  const ticks = [];
  for (let v = fundo; v <= topo + passo / 2; v += passo) ticks.push(v);
  return { topo, fundo, passo, ticks };
}

// Coluna com topo arredondado (extremidade do dado) e base reta.
function barraCimaPath(x, y, w, h, r) {
  const rr = Math.min(r, h, w / 2);
  return `M${px(x)},${px(y + h)} V${px(y + rr)} Q${px(x)},${px(y)} ${px(x + rr)},${px(y)} `
    + `H${px(x + w - rr)} Q${px(x + w)},${px(y)} ${px(x + w)},${px(y + rr)} V${px(y + h)} Z`;
}

// Barra negativa: base reta na linha zero, ponta arredondada embaixo.
function barraBaixoPath(x, y, w, h, r) {
  const rr = Math.min(r, h, w / 2);
  return `M${px(x)},${px(y)} H${px(x + w)} V${px(y + h - rr)} Q${px(x + w)},${px(y + h)} ${px(x + w - rr)},${px(y + h)} `
    + `H${px(x + rr)} Q${px(x)},${px(y + h)} ${px(x)},${px(y + h - rr)} Z`;
}

function gradeHtml(escala, yDe, casas) {
  return escala.ticks.map((v) => {
    const y = px(yDe(v));
    return `<line class="graf-grid" x1="${GRAF_M.esq}" y1="${y}" x2="${GRAF_W - GRAF_M.dir}" y2="${y}"/>`
      + `<text class="graf-eixo" x="${GRAF_M.esq - 8}" y="${y + 4}" text-anchor="end">${fmt(v, casas)}</text>`;
  }).join('');
}

function rotulosXHtml(periodos, xCentro) {
  const salto = periodos.length > 8 ? 2 : 1; // pula rótulos alternados quando aperta
  let s = '';
  for (let i = periodos.length - 1; i >= 0; i -= salto) {
    s += `<text class="graf-eixo" x="${px(xCentro(i))}" y="${GRAF_H - 6}" text-anchor="middle">`
      + `${rotuloPeriodo(periodos[i].inicio, granularidade)}</text>`;
  }
  return s;
}

function geometriaColunas(n) {
  const plotW = GRAF_W - GRAF_M.esq - GRAF_M.dir;
  const banda = plotW / n;
  const larg = Math.min(24, banda * 0.6);
  return {
    banda, larg,
    x: (i) => GRAF_M.esq + banda * i + (banda - larg) / 2,
    xCentro: (i) => GRAF_M.esq + banda * (i + 0.5),
  };
}

// Alvo de toque: a banda inteira da coluna, da borda superior à linha de base.
function hitHtml(grafico, i, banda) {
  return `<rect class="graf-hit" data-grafico="${grafico}" data-i="${i}" `
    + `x="${px(GRAF_M.esq + banda * i)}" y="0" width="${px(banda)}" height="${GRAF_H - GRAF_M.baixo}"/>`;
}

// Colunas empilhadas gasolina+etanol; valorG/valorE já em unidades de exibição.
function svgEmpilhado(grafico, periodos, valorG, valorE, rotularUltimo) {
  const totais = periodos.map((p) => valorG(p) + valorE(p));
  const maxTotal = Math.max(...totais);
  if (maxTotal <= 0) return null;
  const escala = escalaLimpa(0, maxTotal);
  const plotH = GRAF_H - GRAF_M.topo - GRAF_M.baixo;
  const y0 = GRAF_H - GRAF_M.baixo;
  const yDe = (v) => y0 - (v / escala.topo) * plotH;
  const geo = geometriaColunas(periodos.length);
  const casas = escala.passo % 1 ? 1 : 0;

  let marcas = '';
  periodos.forEach((p, i) => {
    const g = valorG(p);
    const e = valorE(p);
    const x = geo.x(i);
    const hG = (g / escala.topo) * plotH;
    const hE = (e / escala.topo) * plotH;
    if (g > 0 && e > 0) {
      // Etanol no topo (ordem fixa) leva o arredondado; separador de 2px na cor
      // da superfície entre os segmentos, sem mentir a altura total.
      marcas += `<rect class="fg-gas" x="${px(x)}" y="${px(y0 - hG)}" width="${px(geo.larg)}" height="${px(hG)}"/>`
        + `<path class="fg-eta" d="${barraCimaPath(x, y0 - hG - hE, geo.larg, hE, 4)}"/>`
        + `<line class="graf-sep" x1="${px(x)}" y1="${px(y0 - hG)}" x2="${px(x + geo.larg)}" y2="${px(y0 - hG)}"/>`;
    } else if (g > 0) {
      marcas += `<path class="fg-gas" d="${barraCimaPath(x, y0 - hG, geo.larg, hG, 4)}"/>`;
    } else if (e > 0) {
      marcas += `<path class="fg-eta" d="${barraCimaPath(x, y0 - hE, geo.larg, hE, 4)}"/>`;
    }
    marcas += hitHtml(grafico, i, geo.banda);
  });

  // Rótulo direto só na coluna mais recente — o eixo e o toque cobrem o resto.
  let rotulo = '';
  const iUlt = periodos.length - 1;
  if (rotularUltimo && totais[iUlt] > 0) {
    rotulo = `<text class="graf-rotulo" x="${px(geo.xCentro(iUlt))}" `
      + `y="${px(yDe(totais[iUlt]) - 7)}" text-anchor="middle">${fmt(totais[iUlt], 0)}</text>`;
  }

  return `<svg class="graf-svg" viewBox="0 0 ${GRAF_W} ${GRAF_H}">`
    + gradeHtml(escala, yDe, casas) + marcas + rotulo
    + rotulosXHtml(periodos, geo.xCentro) + '</svg>';
}

// Barras divergentes da economia: verde acima de zero, vermelho abaixo.
function svgDivergente(grafico, periodos) {
  if (!periodos.some((p) => p.temEconomia)) return null;
  const vals = periodos.map((p) => (p.temEconomia ? p.economia : 0));
  const escala = escalaLimpa(Math.min(0, ...vals), Math.max(0, ...vals));
  const plotH = GRAF_H - GRAF_M.topo - GRAF_M.baixo;
  const amplitude = escala.topo - escala.fundo || 1;
  const yDe = (v) => (GRAF_H - GRAF_M.baixo) - ((v - escala.fundo) / amplitude) * plotH;
  const geo = geometriaColunas(periodos.length);
  const casas = escala.passo % 1 ? 1 : 0;
  const y0 = yDe(0);

  let marcas = '';
  periodos.forEach((p, i) => {
    const v = p.temEconomia ? p.economia : 0;
    const x = geo.x(i);
    const h = (Math.abs(v) / amplitude) * plotH;
    if (v > 0) marcas += `<path class="fg-pos" d="${barraCimaPath(x, y0 - h, geo.larg, h, 4)}"/>`;
    else if (v < 0) marcas += `<path class="fg-neg" d="${barraBaixoPath(x, y0, geo.larg, h, 4)}"/>`;
    marcas += hitHtml(grafico, i, geo.banda);
  });

  return `<svg class="graf-svg" viewBox="0 0 ${GRAF_W} ${GRAF_H}">`
    + gradeHtml(escala, yDe, casas)
    + `<line class="graf-zero" x1="${GRAF_M.esq}" y1="${px(y0)}" x2="${GRAF_W - GRAF_M.dir}" y2="${px(y0)}"/>`
    + marcas + rotulosXHtml(periodos, geo.xCentro) + '</svg>';
}

function legendaCombustiveisHtml() {
  return '<div class="graf-legenda">'
    + `<span><i class="sw sw-gas"></i>${t('gasolina')}</span>`
    + `<span><i class="sw sw-eta"></i>${t('etanol')}</span></div>`;
}

function cardGraficoHtml(titulo, legenda, corpo, msgVazio) {
  return `<section class="card graf-card"><h3>${titulo}</h3>`
    + (corpo ? legenda + corpo : `<p class="hint">${msgVazio}</p>`)
    + '</section>';
}

function renderGraficos() {
  const painel = document.getElementById('painelGraficos');
  if (!painel || painel.hidden) return;
  esconderTooltipGrafico();

  const stats = calcularEstatisticas(carregar());
  periodosVisiveis = agruparPorPeriodo(stats.lista, granularidade);
  const cont = document.getElementById('graficosConteudo');
  if (!periodosVisiveis.length) {
    cont.innerHTML = `<p class="hint">${t('vazio')}</p>`;
    return;
  }

  const soma = (f) => periodosVisiveis.reduce((s, p) => s + f(p), 0);
  const volTotal = soma((p) => p.litrosGasolina + p.litrosEtanol);
  const custoTotal = soma((p) => p.custoGasolina + p.custoEtanol);
  const econTotal = periodosVisiveis.some((p) => p.temEconomia) ? soma((p) => p.economia) : null;

  const kpis = '<div class="stats">'
    + statHtml(t('kpiVolume'), volExib(volTotal), uVol())
    + statHtml(t('kpiCusto'), custoTotal > 0 ? custoTotal : null, '$')
    + (econTotal !== null
      ? statHtml(t('kpiEconomia'), econTotal, '$', econTotal >= 0 ? 'eco-pos' : 'eco-neg')
      : '')
    + '</div>';

  cont.innerHTML = kpis
    + cardGraficoHtml(t('grafVolume'), legendaCombustiveisHtml(),
        svgEmpilhado('volume', periodosVisiveis,
          (p) => volExib(p.litrosGasolina), (p) => volExib(p.litrosEtanol), false),
        t('vazio'))
    + cardGraficoHtml(t('grafCusto'), legendaCombustiveisHtml(),
        svgEmpilhado('custo', periodosVisiveis,
          (p) => p.custoGasolina, (p) => p.custoEtanol, true),
        t('grafSemCusto'))
    + cardGraficoHtml(t('grafEconomia'), '',
        svgDivergente('economia', periodosVisiveis),
        t('grafSemEconomia'));
}

// Tooltip ao toque numa coluna (o valor exato também vive na tabela do
// Histórico — o tooltip só encurta o caminho). Montado com textContent.
function esconderTooltipGrafico() {
  document.getElementById('grafTooltip').hidden = true;
  if (hitAtivo) { hitAtivo.classList.remove('ativo'); hitAtivo = null; }
}

function ttLinhaEl(classeChave, valor, nome, classeValor) {
  const linha = document.createElement('div');
  linha.className = 'tt-linha';
  if (classeChave) {
    const chave = document.createElement('i');
    chave.className = `tt-chave ${classeChave}`;
    linha.appendChild(chave);
  }
  const v = document.createElement('span');
  v.className = classeValor ? `tt-valor ${classeValor}` : 'tt-valor';
  v.textContent = valor;
  linha.appendChild(v);
  const n = document.createElement('span');
  n.className = 'tt-nome';
  n.textContent = nome;
  linha.appendChild(n);
  return linha;
}

function mostrarTooltipGrafico(hit) {
  const p = periodosVisiveis[Number(hit.dataset.i)];
  if (!p) return;
  const tt = document.getElementById('grafTooltip');
  tt.textContent = '';

  const titulo = document.createElement('div');
  titulo.className = 'tt-titulo';
  titulo.textContent = rotuloPeriodoLongo(p.inicio, granularidade);
  tt.appendChild(titulo);

  const grafico = hit.dataset.grafico;
  if (grafico === 'volume') {
    tt.appendChild(ttLinhaEl('sw-gas', `${fmt(volExib(p.litrosGasolina), 1)} ${uVol()}`, t('gasolina').toLowerCase()));
    tt.appendChild(ttLinhaEl('sw-eta', `${fmt(volExib(p.litrosEtanol), 1)} ${uVol()}`, t('etanol').toLowerCase()));
    tt.appendChild(ttLinhaEl(null, `${fmt(volExib(p.litrosGasolina + p.litrosEtanol), 1)} ${uVol()}`, t('ttTotal')));
  } else if (grafico === 'custo') {
    tt.appendChild(ttLinhaEl('sw-gas', `$ ${fmt(p.custoGasolina, 2)}`, t('gasolina').toLowerCase()));
    tt.appendChild(ttLinhaEl('sw-eta', `$ ${fmt(p.custoEtanol, 2)}`, t('etanol').toLowerCase()));
    tt.appendChild(ttLinhaEl(null, `$ ${fmt(p.custoGasolina + p.custoEtanol, 2)}`, t('ttTotal')));
  } else if (p.temEconomia) {
    const pos = p.economia >= 0;
    tt.appendChild(ttLinhaEl(null, `${pos ? '+' : '−'}$ ${fmt(Math.abs(p.economia), 2)}`,
      pos ? t('ttEconomia') : t('ttGasto'), pos ? 'tt-pos' : 'tt-neg'));
  } else {
    tt.appendChild(ttLinhaEl(null, '—', ''));
  }

  if (hitAtivo) hitAtivo.classList.remove('ativo');
  hitAtivo = hit;
  hit.classList.add('ativo');

  // Posiciona acima da coluna, preso à janela (tooltip é position: fixed).
  tt.hidden = false;
  const r = hit.getBoundingClientRect();
  const esq = Math.max(8, Math.min(r.left + r.width / 2 - tt.offsetWidth / 2,
    window.innerWidth - tt.offsetWidth - 8));
  let topo = r.top - tt.offsetHeight - 6;
  if (topo < 8) topo = r.bottom + 6;
  tt.style.left = `${Math.round(esq)}px`;
  tt.style.top = `${Math.round(topo)}px`;
}

const GRANULARIDADES = { btnGranSemana: 'semana', btnGranMes: 'mes', btnGranAno: 'ano' };

function marcarGranularidade() {
  for (const [id, g] of Object.entries(GRANULARIDADES)) {
    document.getElementById(id).classList.toggle('selected', granularidade === g);
  }
}

function abrirGraficos() {
  document.getElementById('painelGraficos').hidden = false;
  marcarGranularidade();
  renderGraficos();
}

function fecharGraficos() {
  esconderTooltipGrafico();
  document.getElementById('painelGraficos').hidden = true;
}

// ---------- Configurações: aplicação e tela ----------

function aplicarTextos() {
  document.documentElement.lang = config.idioma === 'pt' ? 'pt-BR' : 'en';
  const st = (id, chave) => {
    const e = document.getElementById(id);
    if (e) e.textContent = t(chave);
  };
  st('tituloApp', 'tituloApp'); st('btnVel', 'btnVel'); st('tituloForm', 'tituloForm');
  st('labelDitado', 'labelDitado'); st('optDitado', 'optDitado');
  st('btnGasolina', 'gasolina'); st('btnEtanol', 'etanol');
  st('labelKm', 'labelKm'); st('labelLitros', 'labelLitros'); st('labelPreco', 'labelPreco');
  st('optPreco', 'opcional'); st('optPrecoOutro', 'optPrecoOutro');
  st('ajusteDataSummary', 'ajustarData'); st('btnSalvar', 'salvar'); st('hintPrimeiro', 'hintPrimeiro');
  st('tituloPainel', 'tituloPainel'); st('tituloHistorico', 'tituloHistorico');
  st('thData', 'thData'); st('thComb', 'thComb'); st('thKm', 'thKm'); st('thLitros', 'thLitros');
  st('thConsumo', 'thConsumo'); st('thPreco', 'thPreco'); st('vazio', 'vazio');
  st('btnFecharVel', 'abastecer');
  st('btnGraficos', 'btnGraficos'); st('grafTitulo', 'grafTitulo'); st('btnFecharGraficos', 'grafVoltar');
  st('btnGranSemana', 'grafSemana'); st('btnGranMes', 'grafMes'); st('btnGranAno', 'grafAno');
  st('cfgTitulo', 'cfgTitulo'); st('cfgIdiomaLabel', 'cfgIdioma'); st('cfgUnidadesLabel', 'cfgUnidades');
  st('optBr', 'cfgBr'); st('optUs', 'cfgUs'); st('cfgMascoteLabel', 'cfgMascote');
  st('btnMascUnicornio', 'mUnicornio'); st('btnMascAvioes', 'mAvioes'); st('btnMascPassarinho', 'mPassarinho');
  st('btnMascDragao', 'mDragao'); st('btnMascNenhum', 'mNenhum');
  st('cfgVozLabel', 'cfgVoz'); st('btnVozOn', 'vozOn'); st('btnVozOff', 'vozOff');
  st('cfgTanqueLabel', 'cfgTanque'); st('cfgRendimentoLabel', 'cfgRendimento'); st('btnFecharConfig', 'cfgFechar');

  const dit = document.getElementById('ditado');
  if (dit) dit.placeholder = t('phDitado');
  const mic = document.getElementById('btnMic');
  if (mic) mic.setAttribute('aria-label', t('micLabel'));
  const velU = document.getElementById('velUnidade');
  if (velU) velU.textContent = uVel();
  atualizarLabelPrecoOutro();
}

const SEGMENTOS = [
  ['idioma', { btnIdiomaPt: 'pt', btnIdiomaEn: 'en' }],
  ['unidades', { btnUniBr: 'br', btnUniUs: 'us' }],
  ['mascote', {
    btnMascUnicornio: 'unicornio', btnMascAvioes: 'avioes',
    btnMascPassarinho: 'passarinho', btnMascDragao: 'dragao', btnMascNenhum: 'nenhum',
  }],
  ['voz', { btnVozOn: true, btnVozOff: false }],
];

function marcarSegmentos() {
  for (const [chave, botoes] of SEGMENTOS) {
    for (const [id, valor] of Object.entries(botoes)) {
      document.getElementById(id)?.classList.toggle('selected', config[chave] === valor);
    }
  }
}

function preencherCamposConfig() {
  document.getElementById('cfgTanque').value = fmtInput(Math.round(volExib(config.tanqueLitros) * 10) / 10);
  document.getElementById('cfgRendimento').value = fmtInput(config.rendimentoInicial);
}

function aplicarConfig() {
  document.body.dataset.mascote = config.mascote;
  aplicarTextos();
  marcarSegmentos();
  preencherCamposConfig();
  exibirVelocidade(); // reconverte a leitura atual se as unidades mudaram
  renderTudo();
}

function abrirConfig() { document.getElementById('painelConfig').hidden = false; }
function fecharConfig() { document.getElementById('painelConfig').hidden = true; }

// ---------- Inicialização ----------

document.querySelectorAll('.fuel-btn').forEach((btn) => {
  btn.addEventListener('click', () => selecionarCombustivel(btn.dataset.fuel));
});

document.getElementById('ditado').addEventListener('input', aoDitar);

// Botão 🎤: foca o campo de ditado — o Android abre o teclado ativo (Sayboard,
// se definido como padrão, oferece voz offline). A página não tem como escolher
// o teclado nem iniciar a escuta; isso é sempre do sistema/usuário.
// Cada toque limpa o campo para a próxima etapa da coleta; os campos do
// formulário já preenchidos pela fala anterior ficam como estão.
document.getElementById('btnMic').addEventListener('click', () => {
  const campo = document.getElementById('ditado');
  campo.value = '';
  document.getElementById('ditadoFeedback').textContent = '';
  campo.focus();
  campo.scrollIntoView({ block: 'center' });
});

document.getElementById('btnSalvar').addEventListener('click', aoSalvar);

document.getElementById('listaHistorico').addEventListener('click', (e) => {
  const btn = e.target.closest('.del-btn');
  if (btn) aoExcluir(btn.dataset.id);
});

document.getElementById('btnVel').addEventListener('click', abrirVelocimetro);
document.getElementById('btnFecharVel').addEventListener('click', fecharVelocimetro);

document.getElementById('btnGraficos').addEventListener('click', abrirGraficos);
document.getElementById('btnFecharGraficos').addEventListener('click', fecharGraficos);

for (const [id, gran] of Object.entries(GRANULARIDADES)) {
  document.getElementById(id).addEventListener('click', () => {
    granularidade = gran;
    marcarGranularidade();
    renderGraficos();
  });
}

// Toque numa coluna mostra o tooltip; toque fora esconde.
document.getElementById('painelGraficos').addEventListener('click', (e) => {
  const hit = e.target.closest('.graf-hit');
  if (hit) mostrarTooltipGrafico(hit);
  else esconderTooltipGrafico();
});

document.getElementById('btnConfig').addEventListener('click', abrirConfig);
document.getElementById('btnFecharConfig').addEventListener('click', fecharConfig);

for (const [chave, botoes] of SEGMENTOS) {
  for (const [id, valor] of Object.entries(botoes)) {
    document.getElementById(id)?.addEventListener('click', () => {
      config[chave] = valor;
      salvarConfig();
      aplicarConfig();
    });
  }
}

document.getElementById('cfgTanque').addEventListener('change', () => {
  const v = parseNumero(document.getElementById('cfgTanque').value);
  if (v !== null && v > 0) { config.tanqueLitros = volInterno(v); salvarConfig(); }
  aplicarConfig();
});

document.getElementById('cfgRendimento').addEventListener('change', () => {
  let v = parseNumero(document.getElementById('cfgRendimento').value);
  if (v !== null) {
    if (v > 1.5) v /= 100; // aceita "68" como 68%
    if (v >= 0.3 && v <= 1) { config.rendimentoInicial = v; salvarConfig(); }
  }
  aplicarConfig();
});

// Override via URL para testes (não é salvo): index.html?mascote=dragao&idioma=en&unidades=us
if (location.search) {
  const qs = new URLSearchParams(location.search);
  for (const chave of ['mascote', 'idioma', 'unidades']) {
    const v = qs.get(chave);
    if (v) config[chave] = v;
  }
}

// O velocímetro é a tela inicial; #abastecimento abre direto no formulário,
// #config nas configurações e #graficos na visão gráfica histórica.
if (location.hash === '#config') abrirConfig();
else if (location.hash === '#graficos') abrirGraficos();
else if (location.hash !== '#abastecimento') abrirVelocimetro();

aplicarConfig();

// PWA: service worker deixa o app offline (só quando servido por http/https).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
