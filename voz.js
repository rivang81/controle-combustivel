// Interpreta texto ditado (via microfone do teclado) e extrai os campos do registro.
// Ex.: "gasolina, 412 km, 38 litros e meio, preço cinco e oitenta e nove"
//   → { combustivel: 'gasolina', km: 412, litros: 38.5, preco: 5.89 }
// Roda 100% offline: a voz→texto é do teclado; aqui é só texto→campos.

const UNIDADES_NUM = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19,
};
const DEZENAS_NUM = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90,
};
const CENTENAS_NUM = {
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500,
  seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
  oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};
const PALAVRA_NUM = { ...UNIDADES_NUM, ...DEZENAS_NUM, ...CENTENAS_NUM };

const KM_UNIDADE = new Set(['km', 'kms', 'quilometro', 'quilometros', 'kilometro', 'kilometros', 'quilometragem',
  'milha', 'milhas', 'mi', 'mile', 'miles']);
const LITRO_UNIDADE = new Set(['litro', 'litros', 'l', 'lts', 'galao', 'galoes', 'gallon', 'gallons', 'gal']);
const PRECO_ANTES = new Set(['preco', 'custou', 'custando', 'valor', 'reais', 'real', 'price', 'cost']);
const KM_ANTES = new Set(['rodei', 'rodou', 'rodados', 'rodado', 'andei', 'fiz', 'drove']);
const COMB_PALAVRA = {
  gasolina: 'gasolina', gasoline: 'gasolina', gas: 'gasolina',
  etanol: 'etanol', alcool: 'etanol', ethanol: 'etanol', alcohol: 'etanol',
};

function tokenizarDitado(texto) {
  let s = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // remove acentos
  s = s.replace(/r\$\s*/g, ' reais ');
  s = s.replace(/(\d)[,.](\d)/g, '$1.$2');       // vírgula decimal → ponto
  s = s.replace(/(\d)(km|kms|l|lts)\b/g, '$1 $2'); // "412km" → "412 km"
  s = s.replace(/[^a-z0-9. ]+/g, ' ');
  return s.split(/\s+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);
}

// Lê um número por extenso a partir de tokens[i]. Para em continuação inválida
// ("cinco e oitenta" não é um número só → para após o 5).
function lerNumeroPorExtenso(tokens, i) {
  let total = 0;
  let atual = 0;
  let ultimo = Infinity;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === 'mil' && (atual > 0 || ultimo === Infinity)) {
      total += (atual || 1) * 1000;
      atual = 0;
      ultimo = 1000;
      i++;
      continue;
    }
    const v = PALAVRA_NUM[t];
    if (v !== undefined) {
      if (v >= ultimo) break;
      atual += v;
      ultimo = v;
      i++;
      continue;
    }
    if (t === 'e' && i + 1 < tokens.length) {
      const prox = PALAVRA_NUM[tokens[i + 1]];
      if ((prox !== undefined && prox < ultimo) || tokens[i + 1] === 'mil') { i++; continue; }
      break;
    }
    if (t === 'virgula') {
      const d = lerParteDecimal(tokens, i + 1);
      if (d) return { valor: total + atual + d.valor, prox: d.prox };
      break;
    }
    break;
  }
  return { valor: total + atual, prox: i };
}

function lerParteDecimal(tokens, i) {
  const t = tokens[i];
  if (t === undefined) return null;
  if (/^\d+$/.test(t)) return { valor: parseFloat('0.' + t), prox: i + 1 };
  if (PALAVRA_NUM[t] !== undefined) {
    const r = lerNumeroPorExtenso(tokens, i);
    const escala = r.valor < 10 ? 10 : r.valor < 100 ? 100 : 1000;
    return { valor: r.valor / escala, prox: r.prox };
  }
  return null;
}

// opts.sistema: 'br' (km, litros — padrão) ou 'us' (milhas, galões). Os valores
// retornados ficam nas unidades faladas; a conversão é responsabilidade do app.
function interpretarDitado(texto, opts = {}) {
  const us = opts.sistema === 'us';
  const PRECO_MAX = us ? 60 : 15;   // R$/galão chega a ~25; R$/litro raramente passa de 10
  const DIST_MIN = us ? 12 : 20;
  const DIST_MAX = us ? 6200 : 9999;
  const VOL_MAX = us ? 32 : 120;
  const tokens = tokenizarDitado(texto);

  // 1) Compõe números (dígitos e por extenso) numa lista de itens.
  const itens = []; // string (palavra) ou { n: number }
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i];
    if (/^\d+(\.\d+)?$/.test(t)) {
      let v = parseFloat(t);
      i++;
      if (tokens[i] === 'virgula') {
        const d = lerParteDecimal(tokens, i + 1);
        if (d) { v += d.valor; i = d.prox; }
      }
      itens.push({ n: v });
    } else if (PALAVRA_NUM[t] !== undefined || t === 'mil') {
      const r = lerNumeroPorExtenso(tokens, i);
      itens.push({ n: r.valor });
      i = r.prox;
    } else {
      itens.push(t);
      i++;
    }
  }

  const res = { combustivel: null, km: null, litros: null, preco: null, precoGasolina: null, precoEtanol: null };
  for (const it of itens) {
    const c = typeof it === 'string' ? COMB_PALAVRA[it] : undefined;
    if (c === 'gasolina' && res.combustivel === null) res.combustivel = 'gasolina';
    if (c === 'etanol') res.combustivel = 'etanol';
  }

  const numIdx = [];
  itens.forEach((it, i) => { if (typeof it === 'object') numIdx.push(i); });
  const usado = new Set();

  // Preço por combustível: "gasolina 5,89 etanol 3,99" (comando de posto).
  // Nome do combustível seguido de um número plausível de preço que não seja km/litragem.
  const precosPorComb = { gasolina: null, etanol: null };
  for (let i = 0; i < itens.length; i++) {
    const comb = typeof itens[i] === 'string' ? COMB_PALAVRA[itens[i]] : undefined;
    if (!comb || precosPorComb[comb] !== null) continue;

    // procura o número logo à frente, pulando até 2 conectores ("a", "por", "custa"…)
    let j = i + 1;
    let saltos = 0;
    let achou = true;
    while (j < itens.length && typeof itens[j] === 'string') {
      const w = itens[j];
      if (COMB_PALAVRA[w] || KM_UNIDADE.has(w) || LITRO_UNIDADE.has(w) || ++saltos > 2) { achou = false; break; }
      j++;
    }
    if (!achou || j >= itens.length) continue;

    let v = itens[j].n;
    const consumidos = [j];

    // centavos em duas partes: "5 e 89", "5 reais e 89 centavos"
    if (Number.isInteger(v) && v < 100) {
      let j2 = j + 1;
      const entre = [];
      while (j2 < itens.length && typeof itens[j2] === 'string') { entre.push(itens[j2]); j2++; }
      if (j2 < itens.length) {
        const cent = itens[j2].n;
        const soConectores = entre.length > 0 && entre.every((w) => w === 'e' || w === 'reais' || w === 'real');
        const centavosDepois = itens[j2 + 1] === 'centavos' || itens[j2 + 1] === 'centavo';
        if (Number.isInteger(cent) && cent < 100 && (centavosDepois || soConectores)) {
          v += cent / 100;
          consumidos.push(j2);
        }
      }
    }

    // se o número for seguido de unidade, não é preço ("gasolina 45 litros"),
    // exceto "por litro"/"o litro" ("gasolina 5,89 por litro")
    let k = consumidos[consumidos.length - 1] + 1;
    let rejeita = false;
    for (; k < itens.length && typeof itens[k] === 'string'; k++) {
      const w = itens[k];
      if (KM_UNIDADE.has(w)) { rejeita = true; break; }
      if (LITRO_UNIDADE.has(w)) {
        const ant = itens[k - 1];
        if (ant !== 'por' && ant !== 'o' && ant !== 'per' && ant !== 'a') rejeita = true;
        break;
      }
    }
    if (rejeita || !(v > 0 && v <= PRECO_MAX)) continue;

    precosPorComb[comb] = v;
    consumidos.forEach((x) => usado.add(x));
  }
  res.precoGasolina = precosPorComb.gasolina;
  res.precoEtanol = precosPorComb.etanol;
  if (res.precoGasolina !== null && res.precoEtanol !== null) {
    res.combustivel = null; // comando de comparação de preços — escolha fica com o app
  } else if (res.precoGasolina !== null || res.precoEtanol !== null) {
    res.preco = res.precoGasolina ?? res.precoEtanol; // preço do único combustível citado
  }

  // 2) Atribui cada número pelo contexto (rótulo antes ou unidade depois).
  for (let k = 0; k < numIdx.length; k++) {
    const i = numIdx[k];
    if (usado.has(i)) continue;
    let v = itens[i].n;

    const fim = k + 1 < numIdx.length ? numIdx[k + 1] : itens.length;
    const depois = itens.slice(i + 1, Math.min(fim, i + 5)).filter((x) => typeof x === 'string');
    const iniAntes = k > 0 ? numIdx[k - 1] + 1 : 0;
    const antes = itens.slice(Math.max(iniAntes, i - 3), i).filter((x) => typeof x === 'string');

    if (depois.includes('meio') || depois.includes('meia')) v += 0.5;

    let destino = null;
    if (antes.some((w) => PRECO_ANTES.has(w)) || antes[antes.length - 1] === 'a') destino = 'preco';
    else if (antes.some((w) => KM_ANTES.has(w))) destino = 'km';
    else {
      for (let d = 0; d < depois.length && !destino; d++) {
        const w = depois[d];
        if (KM_UNIDADE.has(w)) destino = 'km';
        else if (LITRO_UNIDADE.has(w)) {
          // "5,89 por litro" / "5,89 o litro" / "per gallon" é preço, não litragem
          destino = ['por', 'o', 'per'].includes(depois[d - 1]) ? 'preco' : 'litros';
        } else if (w === 'reais' || w === 'real') destino = 'preco';
      }
    }

    if (!destino || res[destino] !== null) continue;

    // Preço em duas partes: "5 e 89", "cinco reais e oitenta e nove centavos"
    if (destino === 'preco' && Number.isInteger(v) && v < 100 && k + 1 < numIdx.length) {
      const j = numIdx[k + 1];
      const cent = itens[j].n;
      const entre = itens.slice(i + 1, j).filter((x) => typeof x === 'string');
      const soConectores = entre.length > 0 && entre.every((w) => w === 'e' || w === 'reais' || w === 'real');
      const centavosDepois = itens[j + 1] === 'centavos' || itens[j + 1] === 'centavo';
      if (Number.isInteger(cent) && cent < 100 && (centavosDepois || soConectores)) {
        v += cent / 100;
        usado.add(j);
      }
    }

    res[destino] = v;
    usado.add(i);
  }

  // 3) Números sem contexto: encaixa por faixa de valor plausível.
  for (const i of numIdx) {
    if (usado.has(i)) continue;
    const v = itens[i].n;
    if (res.km === null && v >= DIST_MIN && v <= DIST_MAX) { res.km = v; usado.add(i); }
    else if (res.litros === null && v > 0 && v <= VOL_MAX) { res.litros = v; usado.add(i); }
    else if (res.preco === null && v > 0 && v <= PRECO_MAX) { res.preco = v; usado.add(i); }
  }

  return res;
}
