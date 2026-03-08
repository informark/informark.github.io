// =========================
// index.js (COMPLETO)
// Mesma lógica original — ÚNICA mudança: "TELAS" são reconhecidas como "Tela" (não iPhone)
// =========================

// =========================
// 1) IMPORTS + CONSTANTES
// =========================
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");

const ARQUIVO_CSV = "precos.csv";
const ARQUIVO_ULTIMO_RELATORIO = "ultimo_relatorio.txt";
const ARQUIVO_PROMOCOES = "promocoes_enviadas.csv";

const ARQUIVO_ENVIADOS = "enviados.json";
//const DEDUPE_JANELA_MS = 30 * 60 * 1000; // 30 minutos
const DEDUPE_JANELA_MS = 12 * 60 * 60 * 1000; // 12 horas
const ARQUIVO_JBL_ULTIMO = "jbl_ultimo.json"; // guarda o último preço enviado por modelo

let jblUltimoCache = {}; // { "JBL|JBL BOOMBOX 4": { ts: 123, preco: 2700 } }
const ARQUIVO_ULTIMO_PRECO_NOVOS = "novos_ultimo.json";
let novosUltimoCache = {};
// { "iPhone|16|128GB|branco": { ts: 123, preco: 4600 } }
// =========================
// 2) DEDUPE (enviados.json)
// =========================
let enviadosCache = new Map(); // chave -> timestamp

function carregarJblUltimo() {
  try {
    if (!fs.existsSync(ARQUIVO_JBL_ULTIMO)) {
      jblUltimoCache = {};
      return;
    }
    jblUltimoCache = JSON.parse(fs.readFileSync(ARQUIVO_JBL_ULTIMO, "utf8")) || {};
  } catch (e) {
    console.log("⚠️ Falha ao carregar jbl_ultimo.json:", e.message);
    jblUltimoCache = {};
  }
}

function salvarJblUltimo() {
  try {
    fs.writeFileSync(ARQUIVO_JBL_ULTIMO, JSON.stringify(jblUltimoCache, null, 2));
  } catch (e) {
    console.log("⚠️ Falha ao salvar jbl_ultimo.json:", e.message);
  }
}

function carregarNovosUltimo() {
  try {
    if (!fs.existsSync(ARQUIVO_ULTIMO_PRECO_NOVOS)) {
      novosUltimoCache = {};
      return;
    }
    novosUltimoCache = JSON.parse(fs.readFileSync(ARQUIVO_ULTIMO_PRECO_NOVOS, "utf8")) || {};
  } catch (e) {
    console.log("⚠️ Falha ao carregar novos_ultimo.json:", e.message);
    novosUltimoCache = {};
  }
}

function salvarNovosUltimo() {
  try {
    fs.writeFileSync(ARQUIVO_ULTIMO_PRECO_NOVOS, JSON.stringify(novosUltimoCache, null, 2));
  } catch (e) {
    console.log("⚠️ Falha ao salvar novos_ultimo.json:", e.message);
  }
}

// pega 1 cor “canônica” pra chave
function obterCorCanonica(descricao) {
  const c = extrairCorDaDescricao(descricao); // sua função já existe
  return (c || "").toString().trim().toLowerCase();
}

// ✅ Regra NOVOS: só envia se novoPreco < último enviado nas últimas 12h
// compara Produto + Modelo + GB + Cor
function novoPodeEnviarPorPreco({ produto, modelo, armazenamento, cor, condicaoFinal, novoPreco }) {
  const prod = (produto || "").toString().trim();
  if (!["iPhone", "iPad", "Apple Watch"].includes(prod)) return true;

  const cond = (condicaoFinal || "").toString().trim().toLowerCase();
  if (cond !== "novo") return true; // só aplica para NOVO

  const m = (modelo || "modelo não informado").toString().trim();
  const gb = (armazenamento || "").toString().trim().toUpperCase(); // 128GB
  const c = (cor || "").toString().trim().toLowerCase(); // branco

  const key = `${prod}|${m}|${gb}|${c}`;
  const agora = Date.now();

  const last = novosUltimoCache[key];
  if (!last) return true;

  // janela 12h (usa seu DEDUPE_JANELA_MS)
  if (agora - last.ts > DEDUPE_JANELA_MS) return true;

  const lastPreco = Number(last.preco);
  const atual = Number(novoPreco);

  return atual < lastPreco; // só manda se for menor
}

function novoMarcarEnviado({ produto, modelo, armazenamento, cor, novoPreco, condicaoFinal }) {
  const prod = (produto || "").toString().trim();
  const cond = (condicaoFinal || "").toString().trim().toLowerCase();
  if (!["iPhone", "iPad", "Apple Watch"].includes(prod)) return;
  if (cond !== "novo") return;

  const m = (modelo || "modelo não informado").toString().trim();
  const gb = (armazenamento || "").toString().trim().toUpperCase();
  const c = (cor || "").toString().trim().toLowerCase();

  const key = `${prod}|${m}|${gb}|${c}`;
  novosUltimoCache[key] = { ts: Date.now(), preco: Number(novoPreco) };
  salvarNovosUltimo();
}

// ✅ Regra JBL: só envia se novoPreco < último enviado nas últimas X horas (usa DEDUPE_JANELA_MS)
function jblPodeEnviarPorPreco({ produto, modelo, novoPreco }) {
  if (produto !== "JBL") return true;

  const key = `JBL|${(modelo || "JBL (modelo não informado)").toString().trim()}`;
  const agora = Date.now();

  const last = jblUltimoCache[key];
  if (!last) return true;

  // se passou a janela (12h), libera
  if (agora - last.ts > DEDUPE_JANELA_MS) return true;

  const lastPreco = Number(last.preco);
  const atual = Number(novoPreco);

  // só envia se for menor
  return atual < lastPreco;
}

function jblMarcarEnviado({ modelo, novoPreco }) {
  const key = `JBL|${(modelo || "JBL (modelo não informado)").toString().trim()}`;
  jblUltimoCache[key] = { ts: Date.now(), preco: Number(novoPreco) };
  salvarJblUltimo();
}

function carregarEnviados() {
  try {
    if (!fs.existsSync(ARQUIVO_ENVIADOS)) return;
    const data = JSON.parse(fs.readFileSync(ARQUIVO_ENVIADOS, "utf8"));
    const agora = Date.now();
    for (const [k, ts] of Object.entries(data || {})) {
      if (agora - ts <= DEDUPE_JANELA_MS) enviadosCache.set(k, ts);
    }
  } catch (e) {
    console.log("⚠️ Falha ao carregar enviados.json:", e.message);
  }
}

function salvarEnviados() {
  try {
    const agora = Date.now();
    // limpa expirados antes de salvar
    for (const [k, ts] of enviadosCache.entries()) {
      if (agora - ts > DEDUPE_JANELA_MS) enviadosCache.delete(k);
    }
    const obj = Object.fromEntries(enviadosCache.entries());
    fs.writeFileSync(ARQUIVO_ENVIADOS, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.log("⚠️ Falha ao salvar enviados.json:", e.message);
  }
}

function salvarPromocaoCSV(produto, modelo, armazenamento, cor, condicao, precoOriginal, precoPromo) {
  try {
    const dataHoje = hojeISO_BR();

    // separador BR
    const SEP = ";";

    const esc = (s) => `"${(s || "").toString().replace(/"/g, '""')}"`;
    const numBR = (v) => {
      const n = Number(v);
      if (isNaN(n)) return "";
      return n.toFixed(2).replace(".", ","); // 2700,00
    };

    if (!fs.existsSync(ARQUIVO_PROMOCOES)) {
      fs.writeFileSync(
  ARQUIVO_PROMOCOES,
  `Produto${SEP}Modelo${SEP}Armazenamento${SEP}Cor${SEP}Condicao${SEP}PrecoOriginal${SEP}PrecoPromo${SEP}Data\n`,
  "utf8"
);
    }

    const linha = [
  esc(produto),
  esc(modelo),
  esc(armazenamento || ""),
  esc(cor || ""),
  esc(condicao || ""),
  esc(numBR(precoOriginal)),
  esc(numBR(precoPromo)),
  esc(dataHoje),
].join(SEP);

    fs.appendFileSync(ARQUIVO_PROMOCOES, linha + "\n", "utf8");
    console.log("📊 Promo registrada em:", ARQUIVO_PROMOCOES);
  } catch (e) {
    console.log("⚠️ Falha ao salvar promoções CSV:", e.message);
  }
}

function temDefeitoBloqueante(descricao) {
  const t = normTxt(descricao); // remove acentos e baixa tudo

  // palavras/trechos que indicam defeito (bloqueia envio pro grupo promo)
  const bloqueios = [
    // tela / vidro
    /tela (trincad|rachad|quebrad)/,
    /(vidro|glass) (trincad|rachad|quebrad)/,
    /\btrincad[ao]\b/,
    /\brachad[ao]\b/,
    /\bquebrad[ao]\b/,

    // tampa / carcaça / traseira
    /(tampa|traseira|carcaca) (trincad|rachad|quebrad)/,
    /\bcarcaca\b.*(trincad|rachad|quebrad)/,

    // defeitos gerais comuns
    /\bnao (liga|carrega)\b/,
    /\bsem (face id|touch id)\b/,
    /\bsem sinal\b/,
    /\bsem audio\b/,
    /\bmicrofone (ruim|nao funciona)\b/,
    /\bcamera (ruim|nao funciona|com defeito)\b/,
    /\bcom defeito\b/,
    /\bdefeito\b/,
    /\bmanutencao\b/,
    /\bem manutencao\b/,
    /\bprecisa de reparo\b/,
    /\bnao funciona\b/,

    // mensagens “chatas” que geralmente indicam peça/tela/bateria trocada
    /\bmensagem de tela\b/,
    /\bpeca desconhecida\b/,
    /\bbateria (em manutencao|ruim|viciada)\b/,
  ];

  return bloqueios.some((re) => re.test(t));
}

function normTxt(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function modeloIdentificado(produto, modelo) {
  const m = (modelo || "").toString().trim().toLowerCase();
  const p = (produto || "").toString().trim().toLowerCase();

  if (!m) return false;

  // padrões genéricos
  if (m === "nao informado" || m === "não informado") return false;
  if (m.includes("modelo nao informado") || m.includes("modelo não informado")) return false;
  if (m.includes(" (modelo nao informado") || m.includes(" (modelo não informado")) return false;

  // casos comuns por produto
  if (p === "jbl" && (m === "(modelo nao informado)" || m === "(modelo não informado)")) return false;
  if (p === "macbook" && m.includes("macbook (modelo")) return false;
  if (p === "apple watch" && m.includes("apple watch (modelo")) return false;
  if (p === "ipad" && m.includes("ipad (modelo")) return false;

  return true;
}

function normalizarDescricaoParaDedupe(desc) {
  return (desc || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acentos
    .replace(/[*_~]/g, "") // tira markdown do WhatsApp
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "") // tira emojis
    .replace(/\s+/g, " ") // colapsa espaços
    .trim();
}

function chaveDedupeGenerica({ produto, modelo, armazenamento, condicao, preco, descricao }) {
  const p = Math.round(Number(preco)); // arredonda
  const d = normalizarDescricaoParaDedupe(descricao);
  return [normTxt(produto), normTxt(modelo), normTxt(armazenamento), normTxt(condicao), String(p), d].join("|");
}

function chaveDedupeIphone({ modelo, armazenamento, condicao, preco, descricao }) {
  return chaveDedupeGenerica({
    produto: "iPhone",
    modelo,
    armazenamento,
    condicao,
    preco,
    descricao,
  });
}

function jaEnviadoRecentemente(chave) {
  const ts = enviadosCache.get(chave);
  if (!ts) return false;
  return Date.now() - ts <= DEDUPE_JANELA_MS;
}

function marcarEnviado(chave) {
  enviadosCache.set(chave, Date.now());
  salvarEnviados();
}

// =========================
// 3) HELPERS GERAIS (hora, texto, envio, debounce, etc.)
// =========================
function extrairCorDaDescricao(texto) {
  if (!texto) return "";

  const original = texto.toString();

  const original2 = original.replace(/([a-záéíóúãõç])([A-ZÁÉÍÓÚÃÕÇ])/g, "$1 $2");

  // Normaliza para comparação sem acento
  const t = original2
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, " ")
  .replace(/[^\p{L}\p{N}\s|\/\-]/gu, " ");
  // Só considera cor se vier como palavra inteira
  const cores = [
    "preto",
    "branco",
    "azul",
    "verde",
    "rosa",
    "roxo",
    "vermelho",
    "prata",
    "cinza",
    "grafite",
    "dourado",
    "laranja",
    "amarelo",
    "black",
    "white",
    "blue",
    "green",
    "pink",
    "purple",
    "red",
    "silver",
    "gray",
    "graphite",
    "gold",
    "natural",
    "desert",
    "midnight",
    "starlight",
    "titanium",
    "titanio",
    "titânio",
  ];

  for (const c of cores) {
    const re = new RegExp(`(^|[|/\\-\\s])${c}([\\s|/\\-]|$)`, "i");
    if (re.test(t)) return c;
  }

  return "";
}

function horaRecebidaMsg(msg) {
  const ts = msg?.timestamp ? Number(msg.timestamp) : Math.floor(Date.now() / 1000);
  const d = new Date(ts * 1000);

  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Fortaleza",
  });
}

async function enviarParaGrupoPromo(grupoDestino, mensagemPromo, msg, { anexarMidia = true } = {}) {
  try {
    if (!grupoDestino) return;

    if (anexarMidia && msg?.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media) {
          await grupoDestino.sendMessage(media, { caption: mensagemPromo });
          return;
        }
      } catch (e) {
        console.log("⚠️ Falha ao baixar/enviar mídia, enviando só texto:", e.message);
      }
    }

    await grupoDestino.sendMessage(mensagemPromo);
  } catch (e) {
    console.log("⚠️ Erro ao enviar para grupo promo:", e.message);
  }
}

/* =========================
   Atualização automática do relatório (debounce)
========================= */
let timerRelatorio = null;

function agendarAtualizacaoRelatorio(ms = 15000) {
  if (timerRelatorio) clearTimeout(timerRelatorio);

  timerRelatorio = setTimeout(() => {
    try {
      gerarRelatorioMenorPrecoDoDia();
      console.log("🔄 Relatório atualizado automaticamente.");
    } catch (e) {
      console.error("⚠️ Falha ao atualizar relatório:", e.message);
    }
  }, ms);
}

/* =========================
   Helpers gerais
========================= */
function soDigitos(s) {
  return (s || "").toString().replace(/\D/g, "");
}

function hojeISO_BR() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

function normKey(s) {
  return (s || "")
    .toString()
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase();
}

function normalizarTexto(s) {
  return (s || "")
    .toString()
    .replace(/\u00A0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function corrigirOcrRuim(t) {
  if (!t) return "";

  return (t || "")
    .toString()
    .replace(/\bat[eé]\s+[\p{L}\p{M}]{1,3}\b/giu, "")
    .replace(/\bat[eé]\s*[$€£]\b/giu, "")
    .replace(/\bchip\s*[íi]sico\b/gi, "chip fisico")
    .replace(/\bf[ií]sico\b/gi, "fisico")
    .replace(/\bgarant[ií]a\s*apple\b/gi, "garantia apple")
    .replace(/\bcaixa\s*\+\s*cabo\b/gi, "caixa e cabo")
    .replace(/\+\s*cabo\b/gi, "e cabo")
    .replace(/\bat[eé]\s+\p{L}\s*[$€£]\b/giu, "")
    .trim();
}

function limparLixoSolto(t) {
  if (!t) return "";
  return (t || "")
    .toString()
    .replace(/[$€£]/g, " ")
    .replace(/\bat[eé]\b(?!\s*(\d|20\d{2}|\d{1,2}\/\d{1,2}))/gi, " ")
    .replace(/\bat[eé]\s+[\p{L}\p{M}]{1,3}\b/giu, " ")
    .replace(/\b(?!e\b)\p{L}\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function limparDescricao(desc) {
  let t = (desc || "").toString().toLowerCase();

  // remove frases completas antes de quebrar elas
  t = t.replace(/_?s[oó]\s*sai\s*no\s*pix_?/gi, " ");
  t = t.replace(/pix\s*apenas/gi, " ");
  t = t.replace(/somente\s*pix/gi, " ");
  // =========================
// REMOVE frases que NÃO devem ir para o grupo
// =========================
t = t.replace(/\bpra ganhar dinheiro\b/gi, " ");
t = t.replace(/\bpara ganhar dinheiro\b/gi, " ");
t = t.replace(/\bgarantia\s+de\s+\d+\s*horas?\s+para\s+lojista\b/gi, " ");
t = t.replace(/\blojista\b/gi, " ");
t = t.replace(/\bdinheiro\b/gi, " ");
t = t.replace(/\bmax+x+\b/gi, " ");
t = t.replace(/\bzerado+o*\b/gi, " ");
t = t.replace(/\bnovinho\b/gi, " ");
t = t.replace(/\s+/g, " ").trim();
  // =========================
// EXTRA (promo): limpar gritaria/marketing + pagamento/retirada + hashtags
// =========================

// remove linhas/trechos começando com "#"
t = t.replace(/(^|\s)#\s*[^|]+/g, " ");

// remove gritaria comum
t = t.replace(/\b(preca(o+)|precao+|preç[aã]o+)\b/gi, " ");
t = t.replace(/\b(vendid[ao]s?|vendida+|vendido+)\b/gi, " ");
t = t.replace(/\b(lancamento+|lan[cç]amento+)\b/gi, " ");
t = t.replace(/\b(202[0-9])\b/g, " "); // remove ano isolado tipo 2025

// remove "pagamento/retirada" e variações
t = t.replace(/\bpagamento\s+no\s+ato\b/gi, " ");
t = t.replace(/\bno\s+ato\s+da\s+(retirada|entrega)\b/gi, " ");
t = t.replace(/\b(retirada|retirar)\b/gi, " ");
t = t.replace(/\b(dinheiro|pix)\b/gi, " "); // já tem preço na mensagem

// remove exageros tipo "toppp", "lacradxinha", "nova - lacrada"
t = t.replace(/\btop+\b/gi, " ");
t = t.replace(/\blacrad\w*\b/gi, "lacrada"); // normaliza "lacradxinha" -> "lacrada"
t = t.replace(/\bnova\b/gi, " "); // opcional: se quiser remover "nova" do resumo
  // remove lixo comum de "preço" / "envio" / localização (não deve ir pra descrição)
  t = t.replace(/\brs\b/gi, " "); // ex: "RS 5700"
  t = t.replace(/\b(r\$)\b/gi, " ");
  t = t.replace(/\b(mercadoria|produto)\s*(se\s*)?(encontra|encontrase|esta|t[aá])\s*(em|na)\s+[a-zçãõ\s]{2,40}\b/gi, " ");
  t = t.replace(/\b(fa[cç]o|fazemos)\s*envio(s)?\b/gi, " ");
  t = t.replace(/\b(envio|enviamos|frete|entrego|entrega|retirada|retirar)\b/gi, " ");
  t = t.replace(/\b(s[oó]\s*)?paga\s*(quando|ao|na\s*hora\s*que)\s*(chegar|chegue)\b/gi, " ");
  t = t.replace(/\b(paga|pagar)\s*s[oó]\s*(quando|depois)\s*(chegar|chegue)\b/gi, " ");

  t = t.replace(/\bno\s*pix\b/gi, " ");

  t = t.replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFE0E\uFE0F]/g, " ");
  t = corrigirOcrRuim(t);

  t = t.replace(/[*_~]/g, "");
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2705}\u{2714}\u{1F197}\u{1F44D}]/gu, " ");

  t = t.replace(/[•·∙]/g, " ");
  t = t.replace(/[–—−]/g, " ");
  t = t.replace(/[➡➔➜→←⬆⬇⤴⤵↗↘⇧⇩]/g, " ");
  t = t.replace(/[|]/g, " ");

  t = t.replace(/[(){}\[\],;:]+/g, " ");
  t = t.replace(/[%!]+/g, " ");

  t = t.replace(/(?:r\$|\$)\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/gi, " ");

  t = t.replace(/\b\d{1,5}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\b/g, (m) => {
    const puro = m.replace(/[^\d]/g, "");
    if (/^(64|128|256|512|1024)$/.test(puro)) return m;
    return " ";
  });

  t = t.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ");

  t = t.replace(
    /\b(pix|cada|por|valor|preco|preço|promo|oferta|apenas|chama no privado|anatel|vista çã|mod igual|laranja|ã foi|PROMOÇÃO|vista|nf|NF|saúde|saude|nota fiscal)\b/gi,
    " "
  );

  t = t.replace(/\b(64|128|256|512)\s*gb\b/gi, " ");
  t = t.replace(/\b(1\s*tb|1024\s*gb)\b/gi, " ");
  t = t.replace(/\b(64|128|256|512|1024)\s*g\b/gi, " ");
  t = t.replace(/\b(64|128|256|512|1024)\b(?=\s*[,.;:|•-]|\s|$)/g, " ");

  t = t.replace(/\b\d{2,3}\s*%\b/g, " ");
  t = t.replace(/\b(bat|bateria|baterias|ciclo|ciclos)\b/gi, " ");

  t = t.replace(/\b\d{1,3}\s*dias?\s*de\s*garantia\b/gi, " ");
  t = t.replace(/\bgarantia\s*\d{1,3}\s*dias?\b/gi, " ");
  t = t.replace(/\bdias?\s*de\s*garantia\b/gi, " ");

  t = t.replace(/\biphone\s*\d{1,2}\s*(pro\s*max|pro|max|mini|plus)?\b/gi, " ");

  t = t.replace(/\b(up|upado|upgrade|restante|acima de|acima)\b/gi, " ");

  t = t.replace(
    /\b(preto|branco|azul|verde|rosa|roxo|vermelho|prata|cinza|grafite|dourado|natural|desert)\b/gi,
    " "
  );

  t = t.replace(/\b(oportunidade|promo|oferta|imperdivel|imperdível|urgente)\b/gi, " ");
  t = t.replace(/🇺🇸/g, " ");

  t = t.replace(/\bcompra\s*m[ií]nima\s*\d*\s*pe[çc]as?\b/gi, " ");

  t = t.replace(/\b(vendo|vendo|vendo|vendo|vendo|vendo|vendo|vendo)\b/gi, " ");

  t = t.replace(
    /\b(pix|sem mais desconto|sem desconto|desconto|negocio|negociavel|negociável|pra vim buscar|para vir buscar|retirar no local|buscar|entrega)\b/gi,
    " "
  );

  t = t.replace(
    /\b(?:iphone\s*)?(?:x|xr|xs|max|plus|mini|\d{1,2})(?:\s*(?:pro\s*max|pro|max|plus|mini))?\b/gi,
    " "
  );

  t = t.replace(/\bpro\s*max\b/gi, " ");
  t = t.replace(/\bno\s*pix\b/gi, " ");

  t = t.replace(/\biphone\b/gi, " ");
  t = t.replace(/\bplus\b/gi, " ");
  t = t.replace(/\bpro\b/gi, " ");
  t = t.replace(/\bpro\s*max\b/gi, " ");

  t = t.replace(/^[^\wáéíóúãõç]+/i, "");
  t = t.replace(/\bpequenas marca\b/gi, "pequenas marcas");

  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/\b(?!e\b)[a-z]\b/gi, " ");
  t = t.replace(/\b(\w+)\b(?:\s+\1\b)+/gi, "$1");
  t = t.replace(/\bpro\s*max\b/gi, " ");
  t = t.replace(/[./\\]+/g, " ");
  t = t.replace(/\s+/g, " ").trim();

  t = limparLixoSolto(t);

  if (!t || t === "-" || t === "–" || t === "—") return "";

  // remove frases comuns de marketing
  t = t.replace(
    /\b(completo|com caixa|caixa e cabo|acompanha caixa|acompanha cabo|meses? de garantia|gar talvez n ative|garantia talvez nao ative|sem marcas de uso|sem marca de uso|pouco uso|estado impecavel|estado impecável|top|perfeito estado)\b/gi,
    " "
  );

  // remove emojis soltos e símbolos restantes
  t = t.replace(/[✨🔥🚨📱💻⌚🛍️📦📲💳]/g, " ");

  // remove múltiplos espaços novamente
  t = t.replace(/\s+/g, " ").trim();

  // -------------------------
  // EXTRA: limpar modelo "solto" (sem escrever iPhone)
  // Ex: "17 PRO MAX 256 SILVER"
  // -------------------------
  t = t.replace(/\b(8|9|10|11|12|13|14|15|16|17)\s*(pro\s*max|promax|pro|max|plus|mini|pm)\b/gi, " ");
  t = t.replace(/\b(8|9|10|11|12|13|14|15|16|17)\b/gi, " ");

  // remove armazenamento isolado
  t = t.replace(/\b(64|128|256|512)\b/gi, " ");
  t = t.replace(/\b(1024)\b/gi, " ");

  // remove cores em PT/EN
  t = t.replace(
    /\b(preto|black|branco|white|azul|blue|verde|green|rosa|pink|roxo|purple|vermelho|red|prata|silver|cinza|gray|grey|grafite|graphite|dourado|gold|natural|desert|midnight|starlight|titanium|titanio|tit[aâ]nio)\b/gi,
    " "
  );

  t = t.replace(/\s+/g, " ").trim();

  return t;
}

function resumirDescricao(desc, max = 200) {
  const limpo = limparDescricao(desc).trim();
  if (!limpo) return "";
  return limpo.length > max ? limpo.slice(0, max - 3) + "..." : limpo;
}

function filtrarDescricaoPremium(desc, produto, modelo, armazenamento, condicao) {
  if (!desc) return "";

  let t = desc.toLowerCase();

  // remove modelo e armazenamento da descrição
  if (modelo) {
    const reModelo = new RegExp(modelo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    t = t.replace(reModelo, " ");
  }

  if (armazenamento) {
    const reArm = new RegExp(armazenamento.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    t = t.replace(reArm, " ");
  }

  // remove palavras inúteis / marketing
  t = t.replace(/\b(pra ganhar dinheiro|preca+o+|vendid[ao]+|top+|imperdivel|lan[cç]amento+)\b/gi, " ");
  t = t.replace(/\b(lojista|dinheiro|pix|pagamento no ato|retirada)\b/gi, " ");
  t = t.replace(/\b(novo|nova|seminovo|lacrado|lacrada)\b/gi, " ");

  // remove excesso de letras repetidas (maxxx, zeradooo)
  t = t.replace(/(\w)\1{2,}/g, "$1");

  // remove emojis
  t = t.replace(/[\u{1F300}-\u{1FAFF}]/gu, " ");

  // remove lixo comum
  t = t.replace(/[|*#]/g, " ");
  t = t.replace(/\s+/g, " ").trim();

  // só mantém informações realmente úteis
  const infoRelevante = [];

  if (/unico dono/i.test(desc)) infoRelevante.push("Único dono");
  if (/primeiro uso/i.test(desc)) infoRelevante.push("Primeiro uso recente");
  if (/cabo/i.test(desc)) infoRelevante.push("Cabo original");
  if (/caixa/i.test(desc) && !/sem\s+caixa/i.test(desc)) infoRelevante.push("Acompanha caixa");
  if (/original/i.test(desc)) infoRelevante.push("Todo original");

  return infoRelevante.join(" • ");
}

function obterNumeroMsg(msg, contato) {
  const n1 = contato?.id?.user;
  const n2 = msg?.from ? soDigitos(msg.from) : "";
  const n3 = contato?.number;
  return soDigitos(n1 || n2 || n3 || "");
}

// =========================
// 4) CONFIG: GRUPOS/CONTATOS/CLIENT + CARTÃO + PROMO
// =========================
const GRUPOS_MONITORADOS = [
  "P̶E̶I̶X̶A̶D̶A̶ ̶C̶E̶L̶L̶ ̶2̶0̶2̶5̶ ̶̶ ̶ ̶",
  "APPLE - NOVOS E SEMINOVOS",
  " Apple Natal",
  "84 APPLE",
  "📱 LISTA - MIXCELL NATAL",
  "LISTA DE TRANSMISSÃO 📱💻⌚️",
];

const CONTATOS_MONITORADOS = ["558487998007", "558491189996", "558488334633"];

const CONTATOS_MONITORADOS_NORM = new Set(CONTATOS_MONITORADOS.map(soDigitos));
const GRUPOS_MONITORADOS_NORM = new Set(GRUPOS_MONITORADOS.map(normKey));

const client = new Client({ authStrategy: new LocalAuth() });

const MARGEM_PROMO = 300;

function obterMargemPorProduto(produto) {
  return produto === "MacBook" ? 500 : MARGEM_PROMO;
}

// =========================
// CARTÃO (taxas)
// =========================
const TAXA_12X_PCT = 13.01;
const TAXA_18X_PCT = 18.39;

function formatBRL(v) {
  const n = Number(v);
  if (isNaN(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

function calcularParcelado(precoAvista, taxaPct, vezes) {
  const avista = Number(precoAvista);
  const taxa = Number(taxaPct) / 100;
  if (isNaN(avista) || isNaN(taxa)) return { total: NaN, parcela: NaN };

  const total = avista * (1 + taxa);
  const parcela = total / vezes;

  return { total, parcela };
}

const GRUPO_PROMO = "iPhone Chegouuu 🔔 | INFORMARK";
let grupoPromoRef = null;

// =========================
// 5) LIMITES (TABELAS + REGRAS)
// =========================
const LIMITES_SEMINOVO_MAX_AVISTA = {

  X: { "64GB": 700.00, "128GB": 800.00 },

  XR: { "64GB": 900.00, "128GB": 1100.00 },

  11: { "64GB": 1200.00, "128GB": 1300.00 },
  "11 Pro": { "64GB": 1500.00 },
  "11 Pro Max": { "64GB": 1700.00 },

  12: { "64GB": 1500.00 },
  "12 Pro": { "128GB": 2200.00, "256GB": 2400.00 },
  "12 Pro Max": { "128GB": 2500.00, "256GB": 2700.00 },

  13: { "128GB": 2300.00, "256GB": 2500.00 },
  "13 Pro": { "128GB": 2800.00 },
  "13 Pro Max": { "128GB": 2900.00 },

  14: { "128GB": 2399.99 },
  "14 Pro": { "128GB": 3400.00, "256GB": 3600.00 },
  "14 Pro Max": { "128GB": 3800.00, "256GB": 4100.00 },

  15: { "128GB": 3300.00 },
  "15 Plus": { "128GB": 3500.00 },
  "15 Pro": { "128GB": 4250.00, "256GB": 4400.00 },
  "15 Pro Max": { "256GB": 4900.00 },

  "16 Pro": { "128GB": 5250.00 },
  "16 Pro Max": { "256GB": 6000.00 },
};

const LIMITES_NOVO_MAX_AVISTA = {
  13: { "128GB": 3100.0, "256GB": 3500.00 },

  14: { "128GB": 3599.99, "256GB": 4099.99 },

  15: { "128GB": 4099.99, "256GB": 4699.99 },

  16: { "128GB": 4800.99, "256GB": 5400.00 },

  "16 Pro": { "128GB": 5999.99, "256GB": 6899.99 },

  "16 Pro Max": { "256GB": 7199.99, "512GB": 8599.99 },

  "17 Pro Max": { "256GB": 8700.00 },
};

const REGRA_SEMINOVO = { addMax: 0, minDiff: 500 };
const REGRA_NOVO = { addMax: 300, minDiff: 800 };

function normalizarModeloIphoneParaLimite(modeloQualquer) {
  const raw = (modeloQualquer || "").toString();
  const t = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/\bxr\b/.test(t)) return "XR";

  const n = t.match(/\b(11|12|13|14|15|16|17)\b/);
  if (!n) return "";

  const base = n[1];

  const promax = /\b(pro\s*max|promax|\bpm\b)\b/.test(t);
  const pro = /\bpro\b/.test(t);
  const plus = /\bplus\b/.test(t);

  if (promax) return `${base} Pro Max`;
  if (pro) return `${base} Pro`;
  if (plus) return `${base} Plus`;
  return `${base}`;
}

function normalizarCondicaoParaLimite(condicaoFinal) {
  const c = (condicaoFinal || "").toString().trim().toLowerCase();
  if (c === "seminovo") return "Seminovo";
  if (c === "novo") return "Novo";
  return "Não informado";
}

function obterTabelaERegra(condicaoFinal) {
  const cond = normalizarCondicaoParaLimite(condicaoFinal);

  if (cond === "Seminovo") {
    return { tabela: LIMITES_SEMINOVO_MAX_AVISTA, regra: REGRA_SEMINOVO };
  }

  if (cond === "Novo" || cond === "Não informado") {
    return { tabela: LIMITES_NOVO_MAX_AVISTA, regra: REGRA_NOVO };
  }

  return { tabela: null, regra: null };
}

function normalizarStorageParaLimite(armazenamento) {
  const t = (armazenamento || "").toString().toLowerCase().trim();

  // pega "64GB", "64 gb", etc
  let m = t.match(/\b(64|128|256|512)\s*gb\b/i);
  if (m) return `${m[1]}GB`;

  // fallback: se vier só "64"
  m = t.match(/\b(64|128|256|512)\b/);
  if (m) return `${m[1]}GB`;

  return "";
}

// =========================
// 5.x) INFERÊNCIA DE CONDIÇÃO (somente por tabelas + folgas)
// Regra:
// - Se preco <= (maxSeminovo - 150) => Seminovo
// - Se preco >= (maxNovo + 300) e NÃO tem bateria/"seminovo" => Novo
// - Senão => Não informado (retorna null)
// =========================
const FOLGA_SEMINOVO = 150;
const FOLGA_NOVO = 300;

function temBateriaOuSeminovoNoTexto(texto) {
  const t = normTxt(texto);
  const temSeminovo = /(semi\W*nov[oa]|seminov[oa]|usado|vitrine|revisado)/i.test(t);
  const temBateria = extrairBateria(texto) !== null; // sua função já existe
  return temSeminovo || temBateria;
}

// retorna "Seminovo" | "Novo" | null
// ajustes finos (você pode calibrar)
const JANELA_SEMI = 600; // abaixo disso é "suspeito"
const GAP_NOVO = 200;    // evita "novo" colado no teto do seminovo
const FOLGA_NOVO_SEM_SEMI = 500;

function inferirCondicaoPorTabelas({ produto, modelo, armazenamento, preco, descricao }) {
  // mantém suas regras de MacBook aqui (igual está)
  if (produto === "MacBook") {
    // ... seu bloco atual ...
    return null;
  }

  if (produto !== "iPhone") return null;

  const p = Number(preco);
  if (isNaN(p)) return null;

  const modeloKey = normalizarModeloIphoneParaLimite(modelo);
  const storageKey = normalizarStorageParaLimite(armazenamento);
  if (!modeloKey || !storageKey) return null;

  const maxSemi = LIMITES_SEMINOVO_MAX_AVISTA?.[modeloKey]?.[storageKey];
  const maxNovo  = LIMITES_NOVO_MAX_AVISTA?.[modeloKey]?.[storageKey];

  if (maxSemi == null && maxNovo == null) return null;

  // Se tem bateria% ou "seminovo/usado" no texto, NÃO tenta marcar como novo
  const textoPuxaSemi = temBateriaOuSeminovoNoTexto(descricao || "");

  // 1) SEMINOVO: só se estiver no corredor [maxSemi - JANELA_SEMI, maxSemi]
  if (maxSemi != null) {
    const minSemi = Number(maxSemi) - JANELA_SEMI;

    if (p >= minSemi && p <= Number(maxSemi)) {
      return "Seminovo";
    }

    // abaixo do corredor => suspeito (não classifica)
    if (p < minSemi) {
      return null; // ou "Suspeito" se você quiser registrar isso
    }
  }

  // 2) NOVO: só se estiver acima do teto do semi + GAP e até o teto do novo
 if (maxNovo != null && !textoPuxaSemi) {

  // ✅ caso NÃO exista seminovo na tabela para esse modelo/GB
  // regra: se estiver até 500 abaixo do teto do novo, ou acima do teto, é NOVO
  if (maxSemi == null) {
    const minNovoSemSemi = Number(maxNovo) - FOLGA_NOVO_SEM_SEMI;

    if (p >= minNovoSemSemi) {
      return "Novo";
    }
    return null;
  }

  // ✅ caso exista seminovo e novo (mantém sua lógica atual por “corredor”)
  const minNovo = Number(maxSemi) + GAP_NOVO;

  // aqui você pode manter o teto do novo OU liberar acima também:
  // - se quiser liberar acima: p >= minNovo
  // - se quiser manter teto: p <= maxNovo
  if (p >= minNovo) {
    return "Novo";
  }
}

  return null;
}

// aplica só quando estiver "Não informado"
function aplicarInferenciaSeNaoInformado(condicaoAtual, payload) {
  const c = (condicaoAtual || "").toString().trim().toLowerCase();
  if (c !== "não informado" && c !== "nao informado") return condicaoAtual;

  const inferida = inferirCondicaoPorTabelas(payload);
  return inferida ? inferida : condicaoAtual;
}

function podeEnviarPromo(novoPreco, modeloQualquer, armazenamento, condicaoFinal) {
  const { tabela, regra } = obterTabelaERegra(condicaoFinal);
  if (!tabela || !regra) return true; // se não tiver regra/tabela, não bloqueia nada

  const modeloKey = normalizarModeloIphoneParaLimite(modeloQualquer);
  const storageKey = normalizarStorageParaLimite(armazenamento);

  // Se não conseguiu normalizar modelo/GB, NÃO aplica limite (não está "na tabela")
  if (!modeloKey || !storageKey) return true;

  const porModelo = tabela[modeloKey];
  if (!porModelo) return true;              // modelo não tabelado
  const maxAvista = porModelo[storageKey];
  if (!maxAvista) return true;              // GB não tabelado (ex: 13 Pro Max 256)

  const max = maxAvista + regra.addMax;
  const min = max - regra.minDiff;

  const p = Math.round(Number(novoPreco) * 100) / 100;
  return p >= min && p <= max;
}

// =========================
// 6) CSV + VCARD + EXTRAÇÕES
// =========================
function garantirCSV() {
  if (!fs.existsSync(ARQUIVO_CSV)) {
    fs.writeFileSync(
      ARQUIVO_CSV,
      'Produto,Modelo,Armazenamento,Cor,Condicao,Preco,Descricao,Data,HoraRecebida,Vendedor,Numero,Grupo\n'
    );
  }
}

function formatarPrecoCSVBR(valor) {
  const n = Number(valor);
  if (isNaN(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

function parsePrecoCSV(s) {
  const txt = (s || "").toString().trim();
  if (!txt) return NaN;

  let x = txt.replace(/[Rr]\$\s?/g, "").replace(/\s+/g, "");
  if (x.includes(",")) {
    x = x.replace(/\./g, "").replace(",", ".");
  }
  x = x.replace(/[^0-9.]/g, "");
  return parseFloat(x);
}

function salvarLinhaCSV({ produto, modelo, armazenamento, cor, condicao, preco, descricao, data, horaRecebida, nome, numero, grupo }) {
  const esc = (s) => (s || "").toString().replace(/"/g, '""');

  const linhaCSV =
    `"${esc(produto)}","${esc(modelo)}","${esc(armazenamento)}","${esc(cor)}","${esc(condicao)}","${esc(
      formatarPrecoCSVBR(preco)
    )}","${esc(descricao)}","${esc(data)}","${esc(horaRecebida)}","${esc(nome)}","${esc(numero)}","${esc(grupo)}"\n`;

  fs.appendFileSync(ARQUIVO_CSV, linhaCSV);
}

function sanitizarModeloParaSalvar(produto, modelo) {
  const p = (produto || "").toString().trim();
  const m = (modelo || "").toString().trim();

  if (!m) return "Não informado";

  if (p === "Acessório" && modeloAcessorioEhGenericoOuLixo(m)) {
    return "Não informado";
  }

  return m;
}

function ehVCard(texto) {
  return /BEGIN:VCARD/i.test(texto) || /END:VCARD/i.test(texto) || /X-WA-LID:/i.test(texto) || /TEL;waid=/i.test(texto);
}

function normalizarNumeroPreco(bruto) {
  if (!bruto) return null;

  let s = bruto.toString().trim();

  // remove moeda e espaços
  s = s.replace(/[Rr]\$\s?/g, "").replace(/\$/g, "").replace(/\s+/g, "");

  // caso BR: 5.150,00
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // caso BR sem milhar: 2350,00
  else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  // caso 5.150
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }

  s = s.replace(/[^0-9.]/g, "");

  const n = parseFloat(s);
  if (isNaN(n)) return null;

  if (n < 50 || n > 50000) return null;

  return n;
}

function extrairPrecoLinhaVariacao(linha) {
  if (!linha) return null;

  const matches = [...linha.matchAll(/\b(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{3,5}(?:[.,]\d{2})?)\b/g)];
  if (!matches.length) return null;

  const ultimo = matches[matches.length - 1][1];
  const valor = normalizarNumeroPreco(ultimo);

  if (valor === null) return null;
  if (valor < 500 || valor > 50000) return null;

  return valor;
}

function extrairPrecoDaLinhaComMoeda(texto) {
  if (!texto) return null;

  const linhas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // prioridade total para linhas com 💰, R$, $
  for (const linha of linhas) {
    if (!/(💰|r\$|\$)/i.test(linha)) continue;

    const m = linha.match(/(?:💰|r\$|\$)\s*([\d.,]{2,20})/i);
    if (m) {
      const valor = normalizarNumeroPreco(m[1]);
      if (valor !== null) {
        return valor;
      }
    }
  }

  return null;
}

function extrairPrecoFallbackUltimoNumero(texto) {
  if (!texto) return null;

  // ✅ sem contexto de produto e sem contexto de preço = não pega
  const contextoProduto = temContextoDeProduto(texto);
  const contextoPreco = temContextoForteDePreco(texto);

  // regra principal: só aceita fallback se houver contexto de produto
  if (!contextoProduto && !contextoPreco) return null;

  const linhas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = linhas.length - 1; i >= 0; i--) {
    const linha = linhas[i];

    // ignora linha de bateria/saúde
    if (/🔋|bateria|saude|saúde|%\b/i.test(linha)) continue;

    // ignora telefone
    const soDigitos = linha.replace(/\D/g, "");
    const pareceTelefone = /^\+?\s*\d[\d\s().\-–—]{6,}\d\s*$/.test(linha);
    if (pareceTelefone && soDigitos.length >= 10 && soDigitos.length <= 13) continue;

    // ignora ano
    if (/^\s*(19|20)\d{2}\s*$/.test(linha)) continue;

    const matches = [...linha.matchAll(/\b(\d{3,5}(?:[.,]\d{2})?|\d{1,3}(?:\.\d{3})+(?:,\d{2})?)\b/g)];
    if (!matches.length) continue;

    const ultimo = matches[matches.length - 1][1];
    const valor = normalizarNumeroPreco(ultimo);

    if (valor === null) continue;
    if (valor < 500) continue;

    // ✅ se não tem símbolo de moeda, exige que a linha tenha contexto de item
    const linhaTemContextoItem =
      /\b(iphone|ipad|macbook|watch|jbl)\b/i.test(linha) ||
      !!extrairModeloIphoneDefinitivo(linha) ||
      /\b(64|128|256|512)\s*gb\b/i.test(linha) ||
      /\b(pro\s*max|pro|max|plus|mini|xr|xs|16e)\b/i.test(linha);

    // aceita:
    // - linha com contexto de item
    // - ou mensagem geral com contexto de preço forte
    if (!linhaTemContextoItem && !contextoPreco) continue;

    return valor;
  }

  return null;
}

function temContextoForteDePreco(texto) {
  if (!texto) return false;

  const t = texto.toString().toLowerCase();

  // moeda ou palavras de preço
  if (/[💰$]|r\$/i.test(t)) return true;
  if (/\b(preco|preço|valor|pix|avista|à vista|a vista|por)\b/i.test(t)) return true;
  if (/\bde\b.*\bpor\b/i.test(t)) return true;

  return false;
}

function limparTextoBase(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s\$\.,\-\(\)\*]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferirIphoneSemPalavra(bloco) {
  const x = limparTextoBase(bloco)
    .replace(/\bpromax\b/g, "pro max")
    .replace(/\b17pm\b/g, "17 pro max")
    .replace(/\b(\d{2})pm\b/g, "$1 pro max");

  const m =
    x.match(/\b(1[0-9])\s*(pro\s*max|pro|max|plus|mini)?\s*(64|128|256|512)\s*(gb)?\b/i) ||
    x.match(/\bip\s*(1[0-9])\s*(pro\s*max|pro|max|plus|mini)?\s*(64|128|256|512)\s*(gb)?\b/i);

  if (!m) return null;

  const modeloNum = m[1];
  const sufRaw = (m[2] || "").trim().replace(/\s+/g, " ").toLowerCase();
  const arm = m[3] + "GB";

  let suf = "";
  if (sufRaw === "pro max") suf = "Pro Max";
  else if (sufRaw === "pro") suf = "Pro";
  else if (sufRaw === "plus") suf = "Plus";
  else if (sufRaw === "max") suf = "Max";
  else if (sufRaw === "mini") suf = "Mini";

  return { produto: "iPhone", modelo: [modeloNum, suf].filter(Boolean).join(" "), armazenamento: arm };
}

function temContextoDeProduto(texto) {
  if (!texto) return false;

  const t = texto.toString();

  const produto = detectarProduto(t);
  const modeloIphone = extrairModeloIphoneDefinitivo(t);
  const armazenamento = detectarArmazenamento(t);
  const iphoneInferido = inferirIphoneSemPalavra(t);

  if (produto && produto !== "Outro") return true;
  if (modeloIphone) return true;
  if (iphoneInferido) return true;

  if (armazenamento && /\b(iphone|ipad|macbook|watch|jbl)\b/i.test(t)) return true;

  return false;
}


// =========================
// 7) EXTRAÇÃO DE PREÇO / PRODUTO / MODELO / ETC.
// =========================
function extrairPreco(texto) {
  if (!texto) return null;

  const original = texto.toString();
  const contextoProduto = temContextoDeProduto(original);
  const contextoPreco = temContextoForteDePreco(original);

  // =========================
  // 1) PRIORIDADE MÁXIMA:
  // preço em linha com 💰 / R$ / $
  // =========================
  const precoLinhaMoeda = extrairPrecoDaLinhaComMoeda(original);
  if (precoLinhaMoeda !== null) {
  console.log("💲 Preço capturado por linha com moeda:", precoLinhaMoeda);
  return precoLinhaMoeda;
}

  // =========================
  // 2) CASO "DE X POR Y"
  // =========================
  const t = original.replace(/@\d{8,}/g, " ");
  const tt = t.replace(/(\d),(?=\d{3}\b)/g, "$1.");
  const ttt = tt.replace(/(\d{1,5}(?:\.\d{3})*),(?!\d)/g, "$1,00");

  const reDePor =
    /de\s*(?:r\$|\$)?\s*(\d{1,3}(?:\.\d{3})+|\d{3,5})(?:,(\d{2}))?\s*por\s*(?:r\$|\$)?\s*(\d{1,3}(?:\.\d{3})+|\d{3,5})(?:,(\d{2}))?/i;

  const mp = ttt.match(reDePor);

  if (mp) {
    const a = parseFloat(mp[1].replace(/\./g, "") + "." + (mp[2] || "00"));
    const b = parseFloat(mp[3].replace(/\./g, "") + "." + (mp[4] || "00"));

    if (!isNaN(b) && b >= 200 && b <= 50000) return b;
    if (!isNaN(a) && a >= 200 && a <= 50000) return a;
  }

  // =========================
  // 3) FALLBACK PROFISSIONAL:
  // pega último número confiável da mensagem
  // =========================
  const fallback = extrairPrecoFallbackUltimoNumero(original);
  if (fallback !== null) {
  console.log("💲 Preço capturado por fallback:", fallback);
  return fallback;
}

  // =========================
  // 4) ÚLTIMO RECURSO:
  // scanner geral antigo, mas mais protegido
  // =========================
  const re = /(?:r\$|\$)?\s*\b(\d{1,3}(?:\.\d{3})+|\d{3,5})(?:,(\d{2}))?\b/gi;

  const valores = [];
  let m;

  while ((m = re.exec(ttt)) !== null) {
    const inteiroRaw = m[1];
    const inteiro = inteiroRaw.replace(/\./g, "");
    const decimal = m[2] || "00";
    const valor = parseFloat(`${inteiro}.${decimal}`);

    if (isNaN(valor) || valor < 50 || valor > 50000) continue;

    const rawMatch = m[0] || "";

    const contextoAntes = ttt.slice(Math.max(0, m.index - 20), m.index).toLowerCase();
    const contextoDepois = ttt.slice(m.index + rawMatch.length, Math.min(ttt.length, m.index + rawMatch.length + 20)).toLowerCase();
    const contexto = `${contextoAntes} ${contextoDepois}`;

    // evita bateria e porcentagem
    if (/bateria|saude|saúde|🔋|%/.test(contexto)) continue;

    const hasCurrency =
      /r\$|\$/.test(rawMatch) || /r\$|\$/.test(ttt.slice(Math.max(0, m.index - 5), m.index + rawMatch.length + 5));

    const hasDecimal = !!m[2];
    const hasThousands = inteiroRaw.includes(".");

    const temContextoDePreco =
      hasCurrency ||
      hasDecimal ||
      hasThousands ||
      /\b(r\$|pix|reais|por|preco|preço|valor|\$|avista|à vista)\b/.test(contexto);

    if (!temContextoDePreco && !contextoProduto) continue;
    if (!temContextoDePreco && valor < 1000) continue;

    const isYear = Number.isInteger(valor) && valor >= 1900 && valor <= 2099;
    if (isYear && !hasCurrency && !hasDecimal && !hasThousands) continue;

    // sem contexto real, não aceita número solto
    if (!contextoProduto && !contextoPreco) continue;

    valores.push(valor);
    
  }

  if (!valores.length) return null;

  return Math.max(...valores);
}

function extrairCoresDisponiveis(texto) {
  if (!texto) return [];

  const raw = texto.toString();

// ✅ quebra camelCase / palavras grudadas: "SeminovoDourado" -> "Seminovo Dourado"
const raw2 = raw.replace(/([a-záéíóúãõç])([A-ZÁÉÍÓÚÃÕÇ])/g, "$1 $2");

const t = raw2
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\p{L}\p{N}\s|\/\-]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

  const mapa = {
    preto: ["preto", "black"],
    branco: ["branco", "white"],
    azul: ["azul", "blue"],
    verde: ["verde", "green"],
    rosa: ["rosa", "pink"],
    roxo: ["roxo", "purple"],
    vermelho: ["vermelho", "red"],
    prata: ["prata", "silver"],
    cinza: ["cinza", "gray", "grey"],
    grafite: ["grafite", "graphite"],
    dourado: ["dourado", "gold"],
    laranja: ["laranja", "orange"],
    natural: ["natural"],
    desert: ["desert"],
    midnight: ["midnight"],
    starlight: ["starlight"],
    titanio: ["titanio", "titânio", "titanium"],
  };

  const achadas = new Set();

  for (const [canon, sinonimos] of Object.entries(mapa)) {
    for (const s of sinonimos) {
      const re = new RegExp(`(^|[\\s|/\\-])${s}([\\s|/\\-]|$)`, "i");
      if (re.test(t)) achadas.add(canon);
    }
  }

  return Array.from(achadas);
}

function formatarCor(c) {
  if (!c) return "";
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function ehMarcaConcorrente(texto) {
  return /(samsung|galaxy|xiaomi|redmi|lenovo|motorola|moto|realme|poco)/i.test(texto);
}

function extrairTipoAcessorio(texto) {
  const t = (texto || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/\b(pelicula|pelicula\s*3d|3d|hydrogel|vidro)\b/.test(t)) return "Película";
  if (/\b(capinha|case|capa|bumper)\b/.test(t)) return "Capinha";
  if (/\b(fonte|fonte\s*original|power\s*adapter|adaptador)\b/.test(t)) return "Fonte";
  if (/\b(carregador|charger)\b/.test(t)) return "Carregador";
  if (/\b(cabo|usb\-?c|type\-?c|lightning)\b/.test(t)) return "Cabo";
  if (/\b(caixa)\b/.test(t)) return "Caixa";
  if (/\b(fone|earpods|headset)\b/.test(t)) return "Fone";
  if (/\b(suporte|base)\b/.test(t)) return "Suporte";
  if (/\b(carregamento\s*sem\s*fio|magsafe)\b/.test(t)) return "MagSafe";

  return "Acessório (tipo não informado)";
}

function modeloAcessorioEhGenericoOuLixo(texto) {
  const t = (texto || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*_~]/g, "")
    .replace(/[🔌💰📦📲📱💻⌚🛍️✨🔥🚨]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!t) return true;

  // só traços ou símbolos
  if (/^[-—–_\s]+$/.test(t)) return true;

  // texto muito grande = descrição, não modelo
  if (t.length > 45) return true;

  // frases genéricas
  if (
    /\b(importada|original|originais|premium|qualidade|garantia|meses? de garantia|unidade|unidades|caixa|atacado|varejo|disponivel|disponiveis|oferta|promo|promocao)\b/i.test(t)
  ) {
    return true;
  }

  // tipo genérico sem modelo
  if (
    /^(fonte|cabo|capinha|pelicula|película|carregador|adaptador|case|caixa|fone|suporte|magsafe)$/i.test(t)
  ) {
    return true;
  }

  return false;
}

function ehListaDeTelas(texto) {
  if (!texto) return false;

  const t = texto
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const temContextoDeLista =
    /\btelas\b/.test(t) ||
    /\btelas disponiveis\b/.test(t) ||
    /\bdisplays?\b/.test(t) ||
    /\blcds?\b/.test(t) ||
    /\boleds?\b/.test(t);

  // NÃO pode ter armazenamento (se tiver GB, é aparelho)
  const temGB =
  /\b(64|128|256|512)\s*gb\b/.test(t) ||
  /\b(64|128|256|512)\b(?!\s*(reais|r\$|%))/.test(t);

  // NÃO pode ter bateria %
  const temBateria = /\b\d{2,3}\s*%\b/.test(t);

  // exige que a palavra "telas"/"display" apareça e que não haja indicações fortes de iPhone (GB/%)
  return temContextoDeLista && !temGB && !temBateria;
}

// =========================
// 7.x) MODELO PARA TELAS (extrai o(s) modelo(s) de iPhone da linha)
// =========================
function extrairModeloTela(texto) {
  const raw = (texto || "").toString();
  const t = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // quebra por separadores comuns ("12 /12 pro", "12 e 12 pro", etc)
  const partes = t
    .split(/\s*(?:\/|\||,|;|\be\b|\bou\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const modelos = [];
  const pushUniq = (m) => {
    if (!m) return;
    if (!modelos.includes(m)) modelos.push(m);
  };

  for (const p of partes.length ? partes : [t]) {
    // se a parte não contém "iphone", mas parece um modelo, força contexto
    const candidato = /\biphone\b/.test(p) ? p : `iphone ${p}`;
    const m = extrairModeloIphoneDefinitivo(candidato);
    if (m) pushUniq(m);
  }

  if (!modelos.length) {
    const m = extrairModeloIphoneDefinitivo(t);
    if (m) pushUniq(m);
  }

  if (!modelos.length) return "Tela (modelo não informado)";

  // Produto já é "Tela" — aqui o modelo vira o(s) modelo(s) do iPhone
  // Ex: "iPhone 12 / iPhone 12 Pro"
  return modelos.map((m) => `iPhone ${m}`).join(" / ");
}

function extrairModeloIphoneDefinitivo(texto) {
  const t0 = (texto || "").toString();

  if (/\b(3[8-9]|4[0-9])\s*mm\b/i.test(texto)) return null;
  if (/\b(watch|apple watch|s\d{1,2}|ultra|mm)\b/i.test(t0)) return null;

  const t = t0
    .replace(/[*_~]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // "SE" só deve contar como modelo quando vier junto de iPhone (evita "se encontra", etc.)
  const temSE = /\biphone\s*se\b/.test(t) || /\bip\s*se\b/.test(t) || (/\bse\b/.test(t) && /\b(2020|2022|2|2a|2ª|3|3a|3ª)\b/.test(t) && /\b(iphone|ip)\b/.test(t));
  if (temSE) {
    if (/\b(3|3a|3ª|3a\.)\b/.test(t) || /\b2022\b/.test(t)) return "SE (3ª geração)";
    if (/\b(2|2a|2ª|2a\.)\b/.test(t) || /\b2020\b/.test(t)) return "SE (2ª geração)";
    return "SE";
  }

  if (/\bxr\b/.test(t)) return "XR";
  if (/\bxs\s*max\b/.test(t) || /\bxsmax\b/.test(t)) return "XS Max";
  if (/\bxs\b/.test(t)) return "XS";
  if (/\biphone\s*x\b/.test(t) || /\bx\s*(64|128|256|512|1\s*tb)\b/.test(t)) return "X";

  if ((/\biphone\s*air\b/.test(t) || /\bair\b/.test(t)) && /\biphone\b/.test(t)) return "Air";

  if (/\b16e\b/.test(t) || /\biphone\s*16\s*e\b/.test(t) || /\b16\s*e\b/.test(t)) return "16e";


  // ✅ Blindagem anti "falso iPhone":
  // - Se aparecer marca não-Apple, RAM+armazenamento (ex: "4+256"), ou não houver indícios de iPhone,
  //   não tenta inferir modelo numérico.
  const temPalavraIphone = /\b(i\s*phone|iphone)\b/.test(t);
  const temAbrevIp = /\bip\b/.test(t) || /\bip\s*\d{1,2}\b/.test(t0) || /\bip\d{1,2}\b/.test(t0);
  const temSufixoIphone = /\b(pro\s*max|promax|\bpm\b|pro|plus|mini|max)\b/.test(t);
  const temModeloLetra = /\b(xr|xs|max|x)\b/.test(t);
  const temPadraoRamMaisStorage = /\b\d{1,2}\s*\+\s*(64|128|256|512)\b/.test(t0);
  const temMarcaNaoApple =
    /(samsung|galaxy|xiaomi|redmi|lenovo|motorola|\bmoto\b|realme|poco|amazfit|huawei|miband|mi\s*band|garmin|forerunner|partybox|jbl|nintendo|switch|ps5|tv|split|inverter|ar\s*condicionado|taramps|hoverboard|starlink)/i.test(t0);

  if ((temMarcaNaoApple || temPadraoRamMaisStorage) && !(temPalavraIphone || temAbrevIp)) return null;

  if (!(temPalavraIphone || temAbrevIp || temSufixoIphone || temModeloLetra || temSE)) return null;
  const mNum = t.match(/\b(8|11|12|13|14|15|16|17)\b(?![.,]\d{3}\b)/);
  if (!mNum) return null;

  const base = mNum[1];

  const temProMax = /\bpro\s*max\b|\bpromax\b|\bpm\b/.test(t);
  const temPro = /\bpro\b/.test(t);
  const temPlus = /\bplus\b/.test(t);
  const temMini = /\bmini\b/.test(t);
  const temMax = /\bmax\b/.test(t);

  let suf = "";
  if (temProMax) suf = "Pro Max";
  else if (temPro) suf = "Pro";
  else if (temPlus) suf = "Plus";
  else if (temMini) suf = "mini";
  else if (temMax) suf = "Max";

  return [base, suf].filter(Boolean).join(" ");
}

// ✅ armazenamento focado em iPhone (mantido como estava)
function detectarArmazenamento(texto) {
  if (!texto) return "";

  const t = (texto || "").toString().toLowerCase().replace(/[*_~]/g, "");

  const pareceIphoneOuIpad =
  /\biphone\b/i.test(t) ||
  /\bipad\b/i.test(t) ||
  /\b(pro|max|mini|plus|xr|xs|se)\b/i.test(t);

  if (!pareceIphoneOuIpad && /\b(fonte|carregador|cabo|caixa|capinha|pelicula|película|adaptador)\b/i.test(t)) {
  return "";
}

  if (/\b(apple\s*watch|watch|ultra|s\d{1,2})\b/i.test(t) && !/\biphone\b/i.test(t)) {
    return "";
  }

  const limpo = (texto || "")
    .toString()
    .toLowerCase()
    .replace(/[*_~]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/\b1\s*tb\b/.test(limpo) || /\b1024\s*gb\b/.test(limpo)) return "1TB";

  let m = limpo.match(/\b(64|128|256|512)\s*gb\b/i);
  if (m) return `${m[1]}GB`;

  m = limpo.match(/\b(64|128|256|512)\s*g\b/i);
  if (m) return `${m[1]}GB`;

  const temIndicioIphone =
    /\biphone\b/i.test(t) ||
    /\b(xr|xs|max|mini|plus|pro)\b/i.test(t) ||
    /\b(8|x|xr|xs|1[1-7]|16e|se)\b/i.test(t) ||
    /\bip\s*(1[0-9])\b/i.test(t);

  if (ehMarcaConcorrente(t) && !temIndicioIphone) return "";

  if (temIndicioIphone || /\bipad\b/i.test(t)) {
  m = t.match(/\b(64|128|256|512)\b/);
  if (m) return `${m[1]}GB`;
}

  const curto = t.match(/\b(1[0-9])\s+(64|128|256|512)\b/);
  if (curto) {
    return `${curto[2]}GB`;
  }

  return "";
}

// ✅ bateria só para iPhone
function extrairBateria(texto) {
  if (!texto) return null;

  // pega "73%" OU "bateria 73"
  const m =
    texto.match(/(\d{2,3})\s?%/) ||
    texto.match(/\bbateria\b\D{0,10}(\d{2,3})\b/i);

  if (!m) return null;

  const n = parseInt(m[1], 10);
  if (isNaN(n)) return null;

  // valida faixa
  if (n < 40 || n > 100) return null;
  return n;
}

function extrairConfigMacBook(texto) {
  if (!texto) return { ram: "", ssd: "" };

  const t0 = (texto || "").toString();

  // normaliza texto
  const t = t0
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*_~]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let ram = "";
  let ssd = "";

  // detecta se existe contexto de MacBook
  const temContextoMacBook = /\b(macbook|mba|mbp|m[1-9])\b/i.test(t);

  // =========================
  // 1) formato clássico
  // 16GB RAM 256GB SSD
  // =========================
  let m = t.match(/\b(8|16|24|32|64)\s*gb\s*(ram)?\b.*\b(128|256|512|1024)\s*gb\s*(ssd)?\b/i);
  if (m) {
    ram = `${m[1]}GB RAM`;
    ssd = m[3] === "1024" ? "1TB SSD" : `${m[3]}GB SSD`;
  }

  // =========================
  // 2) formato invertido
  // 256GB SSD 16GB RAM
  // =========================
  if (!ram || !ssd) {
    m = t.match(/\b(128|256|512|1024)\s*gb\s*(ssd)?\b.*\b(8|16|24|32|64)\s*gb\s*(ram)?\b/i);
    if (m) {
      if (!ssd) ssd = m[1] === "1024" ? "1TB SSD" : `${m[1]}GB SSD`;
      if (!ram) ram = `${m[3]}GB RAM`;
    }
  }

  // =========================
  // 3) formato simples
  // 16 256
  // =========================
  if ((!ram || !ssd) && temContextoMacBook) {
    m = t.match(/\b(8|16|24|32|64)\b\s+(128|256|512|1024)\b/);
    if (m) {
      if (!ram) ram = `${m[1]}GB RAM`;
      if (!ssd) ssd = m[2] === "1024" ? "1TB SSD" : `${m[2]}GB SSD`;
    }
  }

  // =========================
  // 4) formato com GB separado
  // 16gb 256gb
  // =========================
  if ((!ram || !ssd) && temContextoMacBook) {
    m = t.match(/\b(8|16|24|32|64)\s*gb\b.*\b(128|256|512|1024)\s*gb\b/i);
    if (m) {
      if (!ram) ram = `${m[1]}GB RAM`;
      if (!ssd) ssd = m[2] === "1024" ? "1TB SSD" : `${m[2]}GB SSD`;
    }
  }

  // =========================
  // 5) formato misto
  // 16 ram 256 ssd
  // =========================
  if (!ram) {
    m = t.match(/\b(8|16|24|32|64)\s*(gb)?\s*(ram)\b/i);
    if (m) {
      ram = `${m[1]}GB RAM`;
    }
  }

  if (!ssd) {
    m = t.match(/\b(128|256|512|1024)\s*(gb)?\s*(ssd)\b/i);
    if (m) {
      ssd = m[1] === "1024" ? "1TB SSD" : `${m[1]}GB SSD`;
    }
  }

  return { ram, ssd };
}

function detectarCondicaoPorProduto(texto, produto) {
  if (!texto) return "Não informado";
  const t = (texto || "")
  .toString()
  .replace(/\u00A0/g, " ") // NBSP
  .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFE0E\uFE0F]/g, " ") // zero-width
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "") // tira acentos
  .replace(/\s+/g, " ")
  .trim();

 // ✅ 1) SEMINOVO primeiro (evita "semi novo" cair em "novo")
if (/(semi\W*nov[oa]|seminov[oa]|usado|vitrine|revisado)/i.test(t)) return "Seminovo";
if (/estado de novo/i.test(t)) return "Seminovo";

// ✅ 2) depois sim "NOVO" + lacrado/selado/zerado
const reNovo = /\b(novo|nova|lacrado|lacrada|selado|selada|zerado|zerada|zero|lacrad(?:inho|inha|xinha)?)\b/i;
if (reNovo.test(t)) return "Novo";

  // ✅ bateria/percentual só força "Seminovo" se for iPhone
  if ((produto || "") === "iPhone") {
  if (/\bbateria\b/i.test(texto) && extrairBateria(texto) !== null) return "Seminovo";
}
  if ((produto || "") === "iPhone") {
    if (extrairBateria(texto) !== null) return "Seminovo";
    if (/\bcom\s*caixa\b/i.test(t)) return "Seminovo";
  }

  // se tiver "novo" perdido em contexto ruim, cai aqui
  if (/\bnovo\b/i.test(t) && !/(bateria|estado de novo|todo original|aparelho e caixa|usado|%|com caixa)/i.test(t)) {
    return "Novo";
  }

  return "Não informado";
}

// mantido para compatibilidade: se alguém chamar direto, continua igual (sem produto)
function detectarCondicao(texto) {
  return detectarCondicaoPorProduto(texto, "");
}
/* =========================
   Produto (DETector)  ✅ AQUI FOI AJUSTADO: Tela antes de iPhone
========================= */
function detectarProduto(texto) {
  const raw = (texto || "").toString();

  const t = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // aceita 40m, 40mm, 49m, 49mm
  if (/\b(3[8-9]|4[0-9])\s*m(?:\s*m)?\b/i.test(t)) return "Apple Watch";

  if (/(samsung|galaxy)/i.test(t)) return "Samsung";
  if (/(xiaomi|redmi|mi\s?pad)/i.test(t)) return "Xiaomi";
  if (/(lenovo)/i.test(t)) return "Lenovo";
  if (/(motorola|moto)/i.test(t)) return "Motorola";
  if (/(realme|poco)/i.test(t)) return "Realme";

  if (/(ipad)\b/i.test(t)) return "iPad";
  if (/(macbook|mac\s*book|mbp|mba)\b/i.test(t)) return "MacBook";
  if (/(airpods)\b/i.test(t)) return "AirPods";
  if (/(apple\s*watch)\b/i.test(t)) return "Apple Watch";

  if (/(apple\s*pencil|pencil)\b/i.test(t)) return "Apple Pencil";

  if (ehListaDeTelas(raw)) return "Tela";

  if (/(iphone|i\s*phone)\b/i.test(t)) return "iPhone";
  if (extrairModeloIphoneDefinitivo(raw)) return "iPhone";

  // 🔒 evita "Bose S1" virar Apple Watch S1
  if (/\bbose\b/i.test(t)) return "Outro";

  // ✅ Samsung Sxx FE (ex: S23 FE, S24 FE, S25 FE) — não é Apple Watch
if (/\bs\d{1,2}\s*fe\b/i.test(t)) return "Samsung";

// ✅ Samsung Sxx com GB (sem falar "galaxy")
if (/\bs\d{1,2}\b/i.test(t) && /\b(64|128|256|512)\s*gb\b/i.test(t)) return "Samsung";

// ✅ Apple Watch só se tiver contexto forte de Watch
const temContextoWatch = /\b(apple\s*watch|watch|series|ultra|se|\bmm\b)\b/i.test(t);
const temSerieS = /\bs\d{1,2}\b/i.test(t);

if (temContextoWatch && (temSerieS || /\bultra\b/i.test(t))) return "Apple Watch";

  // ✅ JBL primeiro (pra "cabo" não derrubar pra acessório)
if (/\bjbl\b/i.test(t) || /(partybox|boom?box|encore)/i.test(t)) return "JBL";

const temAcessorio =
  /\b(fonte|carregador|cabo|pelicula|película|capinha|case|adaptador|airtag|earpods|fone|pencil)\b/i.test(t);

if (temAcessorio) return "Acessório";

  if (/\bgarmin\b/i.test(t) || /\bfr\d{2,3}\b/i.test(t) || /\bvivo\s*active\b/i.test(t)) {
    return "Garmin";
  }

  return "Outro";
}

/* =========================
   Modelo (por produto)
========================= */
function extrairModelo(texto, produto) {
  const t = (texto || "")
    .toString()
    .replace(/[*_~]/g, "")
    .replace(/\u00A0/g, " ")
    .trim();

  if (produto === "iPhone") {
    const modelo = extrairModeloIphoneDefinitivo(t);
    return modelo || "Não informado";
  }

  // ✅ Telas: produto = Tela, modelo = modelo(s) do iPhone
  if (produto === "Tela") {
    return extrairModeloTela(t);
  }

  const tx = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (produto === "iPad") {
  let tipo = "";
  if (/\bpro\b/i.test(tx)) tipo = "Pro";
  else if (/\bair\b/i.test(tx)) tipo = "Air";
  else if (/\bmini\b/i.test(tx)) tipo = "mini";

  let m = tx.match(/\bipad\s*(\d{1,2})\b/i);
  if (m) {
    let modeloLimpo = ["iPad", tipo, m[1]].filter(Boolean).join(" ");
    // ✅ aqui
    if (modeloLimpo.trim().toLowerCase() === "ipad") modeloLimpo = "Não informado";
    return modeloLimpo;
  }

  m = tx.match(/\b(10\.9|11|12\.9)\s*"\b/i);
  if (m) {
    let modeloLimpo = ["iPad", tipo, `${m[1]}"`].filter(Boolean).join(" ");
    // ✅ aqui
    if (modeloLimpo.trim().toLowerCase() === "ipad") modeloLimpo = "Não informado";
    return modeloLimpo;
  }

  let modeloLimpo = ["iPad", tipo].filter(Boolean).join(" ") || "iPad (modelo não informado)";
  // ✅ aqui
  if (modeloLimpo.trim().toLowerCase() === "ipad") modeloLimpo = "Não informado";
  return modeloLimpo;
}

  if (produto === "MacBook") {
    const chip = tx.match(/\bm[1-9]\b/i);
    const size = tx.match(/\b(12|13|14|15|16)\s*"\b/);

    let tipo = "";
    if (/\bair\b|\bmba\b/i.test(tx)) tipo = "Air";
    else if (/\bpro\b|\bmbp\b/i.test(tx)) tipo = "Pro";

    const out = ["MacBook", tipo, chip ? chip[0].toUpperCase() : "", size ? `${size[1]}"` : ""]
      .filter(Boolean)
      .join(" ");

    return out || "MacBook (modelo não informado)";
  }

  if (produto === "Apple Watch") {
    const tx2 = (texto || "").toLowerCase();

    let m = tx2.match(/\bultra\s*(\d{1,2})?\b/i);
    const ultra = m ? `ULTRA${m[1] ? " " + m[1] : ""}` : "";

    m = tx2.match(/\bse\s*(\d{1,2})\b/i);
    const se = m ? `SE ${m[1]}` : "";

    // ✅ aceita "Series 11" como "S11"
m = tx2.match(/\bseries\s*(\d{1,2})\b/i);
const series = m ? `S${m[1]}` : "";

    m = tx2.match(/\bs(\d{1,2})\b/i);
    const serie = m ? `S${m[1]}` : "";

    const mm = tx2.match(/\b(3[8-9]|4[0-9])\s*m(?:\s*m)?\b/i);
    const tamanho = mm ? `${mm[1]}mm` : "";

    const base = ultra || se || series || serie;

    const modelo = [base, tamanho].filter(Boolean).join(" ");
    return modelo || "Apple Watch (modelo não informado)";
  }

  if (produto === "AirPods") {
    let m = tx.match(/\bpro\s*(\d{1,2})\b/i);
    if (m) return `AirPods Pro ${m[1]}`;
    if (/\bpro\b/i.test(tx)) return "AirPods Pro";

    if (/\bmax\b/i.test(tx)) return "AirPods Max";

    m = tx.match(/\bairpods\s*(\d{1,2})\b/i);
    if (m) return `AirPods ${m[1]}`;

    m = tx.match(/\b(\d{1,2})\b/);
    if (m) return `AirPods ${m[1]}`;

    return "AirPods (modelo não informado)";
  }

  if (produto === "JBL") {
  const tx = (texto || "")
    .toString()
    .toLowerCase()
    .replace(/[*_~]/g, "");

  // PARTYBOX
  let m =
    tx.match(/\bparty\s*box\s*(\d{2,4})\b/i) ||
    tx.match(/\bpartybox\s*(\d{2,4})\b/i);
  if (m) return `JBL PARTYBOX ${m[1]}`.toUpperCase();

  // BOOMBOX (aceita BOOMBOX e BOMBOOX)
  m = tx.match(/\bboom?box\s*(\d{1,2})\b/i); 
  if (m) return `JBL BOOMBOX ${m[1]}`.toUpperCase();

  // ENCORE + número (ex: ENCORE 2)
  m = tx.match(/\bencore\s*(\d+)\b/i);
  if (m) return `JBL ENCORE ${m[1]}`.toUpperCase();

  // ENCORE ESSENTIAL
  m = tx.match(/\bencore\s*(essential)\b/i);
  if (m) return `JBL ENCORE ESSENTIAL`.toUpperCase();

  // ENCORE simples
  if (/\bencore\b/i.test(tx)) return `JBL ENCORE`;

  return "JBL (modelo não informado)";
}

  if (produto === "Apple Pencil") {
    const tx2 = (t || "").toLowerCase();

    if (/\busb\s*-\s*c\b|\busb\s*c\b/i.test(tx2)) return "Pencil USB-C";
    if (/\bpro\b/i.test(tx2)) return "Pencil Pro";
    const m = tx2.match(/\bpencil\s*(\d)\b/i);
    if (m) return `Pencil ${m[1]}`;

    return "Apple Pencil";
  }

  if (produto === "Acessório") {
  const tipo = extrairTipoAcessorio(t);

  let semPreco = (t || "")
    .replace(/(?:r\$|\$)\s*\d[\d.,]*/gi, " ")
    .replace(/\b\d{1,3}(?:\.\d{3})*(?:,\d{2})?\b/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  semPreco = semPreco
    .replace(/^[-—–_\s🔌💰📦()]+/i, "")
    .replace(new RegExp("^" + tipo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "i"), "")
    .trim();

  if (modeloAcessorioEhGenericoOuLixo(semPreco)) {
    return "Não informado";
  }

  return semPreco || "Não informado";
}

  if (produto === "Garmin") {
    const tx2 = (t || "").toLowerCase();

    let m = tx2.match(/\bfr\s*(\d{2,3})\b/i);
    if (m) return `FR${m[1]}`;

    m = tx2.match(/\bvivo\s*active\s*(\d{1,2})\b/i);
    if (m) return `Vivo Active ${m[1]}`;

    m = tx2.match(/\b([a-z]{3,})\s*(\d{2,3})\b/i);
    if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}`;

    return "Garmin (modelo não informado)";
  }

  return "Não informado";
}

/* =========================
   LISTAS: extrair vários itens em uma mensagem
========================= */
function extrairItensDeLista(texto) {
  const linhas = normalizarTexto(texto)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let itens = [];
  let contextoProduto = null;
  let buffer = [];
  let contextoCondicao = null;
  let ultimoItemBase = null;
  let ultimoWatchBase = null;

  const limpar = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s\$\.,\-\(\)\*]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const ehRodape = (l) => {
    const x = limpar(l);
    return /^(tabelas|boas vendas|obs|garantia|consulte|aparelhos lacrados)\b/i.test(x);
  };

  const ehHeaderVenda = (l) => {
    const x = limpar(l);
    return /^(vendo|vendendo|a venda|disponivel|disponível|estoque)\b/i.test(x);
  };

  function ehTituloSecaoNaoApple(linha) {
    const raw = (linha || "").trim();
    const x = limpar(raw);

    if (extrairPreco(raw)) return false;

    const marcas = /(garmin|amazfit|huawei|samsung|xiaomi|motorola|realme|poco|redmi)/i;

    if (marcas.test(x) && x.length <= 30) return true;

    if (/^\*{1,3}.+\*{1,3}$/.test(raw) && marcas.test(raw)) return true;
    if (/^[-–—]{1,6}\s*.+\s*[-–—]{1,6}$/.test(raw) && marcas.test(raw)) return true;

    return false;
  }

  function ehLinhaVariacaoCorPreco(linha) {
    const raw = linha || "";
    const x = limpar(raw);

    const p = extrairPrecoLinhaVariacao(raw);
    if (!p) return false;

    const temCor =
      /\b(azul|blue|preto|black|branco|white|prata|silver|cinza|gray|grafite|graphite|gold|dourado|verde|green|roxo|purple|vermelho|red|rosa|pink|natural|desert|titanium|titanio|tit[aâ]nio|starlight|midnight)\b/i.test(
        x
      );

    if (!temCor) return false;

    if (/\b[a-z]{1,6}\d{2,4}\b/i.test(raw)) return false;
    if (/\b(garmin|vivo|active|watch|forerunner|amazfit|huawei)\b/i.test(x)) return false;

    if (x.length > 45) return false;

    const temModeloIphoneNaLinha =
      /\biphone\b/i.test(raw) || /\b(8|x|xr|xs|1[0-7]|16e|se)\b(?![.,]\d{3}\b)/i.test(raw);

    if (temModeloIphoneNaLinha) return false;

    return true;
  }

  function detectarCategoriaTitulo(linha) {
    const x = limpar(linha);

    const pareceItemIphone =
      /\biphone\b/.test(x) &&
      (/\b1[0-9]\b/.test(x) || /\b1[0-9]\s*e\b/.test(x) || /\b(64|128|256|512)\b/.test(x));

    if (pareceItemIphone) return null;

    if (x === "iphone" || x === "iphones") return "iPhone";
    if (x === "ipad" || x === "ipads") return "iPad";
    if (x === "macbook") return "MacBook";
    if (x === "airpods") return "AirPods";
    if (x === "apple watch" || x === "watch") return "Apple Watch";
    if (x === "apple pencil" || x === "pencil") return "Apple Pencil";
    if (x === "garmin") return "Garmin";

    return null;
  }

  function ehTituloTelas(linha) {
    const raw = (linha || "").trim();
    const x = limpar(raw);

    // evita confundir com anúncio de iPhone com "tela" (ex: "mensagem de tela")
    // aqui é "TELAS" como lista/estoque (plural) e sem preço na mesma linha
    if (extrairPreco(raw)) return false;

    if (/\btelas\b/.test(x) && (x.length <= 60)) return true;
    if (/\btelas\s+disponiveis\b/.test(x)) return true;
    if (/\btelas\s+originais\b/.test(x)) return true;

    return false;
  }

  // (modelo de Tela agora é tratado por extrairModeloTela() global)

  function precoPareceArmazenamento(bloco, preco) {
    const t = limpar(bloco);
    const temGB = /\b(64|128|256|512)\s*(gb|gigas|g)\b/i.test(t) || /\b(64|128|256|512)\b/i.test(t);

    const temSinalPreco =
      /r\$\s*/i.test(bloco) || /\$\s*/.test(bloco) || /,\d{2}\b/.test(bloco) || /\b\d{1,3}\.\d{3}\b/.test(bloco);

    return temGB && !temSinalPreco && preco <= 512;
  }

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];

    if (/^\*?\s*apple\s*\*?$/i.test(linha.trim())) {
      contextoProduto = "Acessório";
      buffer = [];
      continue;
    }

    if (ehRodape(linha)) continue;

    if (ehHeaderVenda(linha)) {
      buffer = [];
      continue;
    }

    if (ehTituloSecaoNaoApple(linha)) {
      contextoProduto = null;
      contextoCondicao = null;
      buffer = [];
      ultimoItemBase = null;
      continue;
    }

    // =========================
    // TÍTULO: LISTA DE TELAS
    // Ex: "TELAS DISPONÍVEIS", "TELAS ORIGINAIS"
    // =========================
    if (ehTituloTelas(linha)) {
      contextoProduto = "Tela";
      contextoCondicao = null;
      buffer = [];
      ultimoItemBase = null;
      ultimoWatchBase = null;
      continue;
    }


    const low = limpar(linha);

   // Só muda contexto quando a linha for praticamente um "título" (sem preço)
if (/^\s*(semi[-\s]?novos?|seminovos?|usados?|vitrine|revisados?)\s*$/i.test(low)) {
  contextoCondicao = "Seminovo";
  buffer = [];
  continue;
}

if (/^\s*(lacrados?|novo(s)?|zero|selado(s)?)\s*$/i.test(low)) {
  contextoCondicao = "Novo";
  buffer = [];
  continue;
}

    if (/^\s*(com\s*nf|c\/nf|nf)\s*$/i.test(low)) continue;

    const cat = detectarCategoriaTitulo(linha);
    if (cat) {
      contextoProduto = cat;
      contextoCondicao = null;
      buffer = [];
      ultimoItemBase = null;
      continue;
    }

    const baseIphoneCompleta =
      ultimoItemBase &&
      ultimoItemBase.produto === "iPhone" &&
      ultimoItemBase.modelo &&
      ultimoItemBase.modelo !== "Não informado" &&
      ultimoItemBase.armazenamento &&
      ultimoItemBase.armazenamento !== "";

    if (baseIphoneCompleta && buffer.length === 0 && ehLinhaVariacaoCorPreco(linha)) {
      const precoLinha = extrairPrecoLinhaVariacao(linha);

      itens.push({
        produto: ultimoItemBase.produto,
        modelo: ultimoItemBase.modelo,
        armazenamento: ultimoItemBase.armazenamento,
        condicao: ultimoItemBase.condicao,
        preco: precoLinha,
        descricaoItem: `${linha}`,
      });

      continue;
    }

    // =========================
    // VARIAÇÃO DE APPLE WATCH (linha só com cor/preço, sem "Watch")
    // Ex: "(silver e preto) - 1.550,00 (sem cx)"
    // =========================
    const baseWatchCompleta =
      ultimoWatchBase && ultimoWatchBase.produto === "Apple Watch" && ultimoWatchBase.modelo && ultimoWatchBase.modelo !== "Apple Watch (modelo não informado)";

    if (baseWatchCompleta && buffer.length === 0 && /^\s*\(/.test(linha)) {
      const precoLinha = extrairPrecoLinhaVariacao(linha);
      if (precoLinha) {
        itens.push({
          produto: ultimoWatchBase.produto,
          modelo: ultimoWatchBase.modelo,
          armazenamento: "",
          condicao: ultimoWatchBase.condicao,
          preco: precoLinha,
          descricaoItem: `${linha}`,
        });
        continue;
      }
    }

    if (baseIphoneCompleta && buffer.length === 0) {
      const precoLinha = extrairPrecoLinhaVariacao(linha);

      if (precoLinha) {
        const pareceNovoItem =
          /\b(iphone|ipad|macbook|airpods|watch|garmin|jbl|samsung|xiaomi|motorola|realme|poco)\b/i.test(linha) ||
          /\b(1[0-9])\b(?![.,]\d{3}\b)/i.test(linha);

        if (!pareceNovoItem) {
          itens.push({
            produto: ultimoItemBase.produto,
            modelo: ultimoItemBase.modelo,
            armazenamento: ultimoItemBase.armazenamento,
            condicao: ultimoItemBase.condicao,
            preco: precoLinha,
            descricaoItem: `${linha}`,
          });
          continue;
        }
      }
    }

    // Se for seção de Acessório e a linha não tem preço, não carrega para o próximo item
if ((contextoProduto === "Acessório") && !extrairPreco(linha)) {
  continue;
}

    buffer.push(linha);

    const bloco = buffer.join(" ");
   const preco = extrairPreco(bloco);

if (!preco) continue;
if (preco < 500 && /\b(iphone|11|12|13|14|15|16|17)\b/i.test(bloco)) continue;
if (precoPareceArmazenamento(bloco, preco)) continue;

    let detectado = detectarProduto(bloco);

    if (contextoProduto === "Apple Watch" && detectado === "iPhone") {
  const temSinalForteIphone =
    /\biphone\b/i.test(bloco) ||
    /\b(1[0-9])\s*(pro\s*max|pro|max|plus|mini)?\s*(64|128|256|512)\s*gb\b/i.test(bloco) ||
    !!inferirIphoneSemPalavra(bloco);

  // Se não tiver sinal forte de iPhone, aí sim bloqueia
  if (!temSinalForteIphone) detectado = null;
}

    let produto = detectado && detectado !== "Outro" ? detectado : contextoProduto || "Outro";

    // Se estamos dentro de uma lista de TELAS, força produto = "Tela"
    if (contextoProduto === "Tela") {
      produto = "Tela";
    }


    // ✅ AJUSTE: lista de telas vira "Tela" SEMPRE
    if (ehListaDeTelas(bloco)) {
      produto = "Tela";
    }

    if (contextoProduto === "Acessório" || contextoProduto === "Apple") {
      if (!["iPhone", "iPad", "MacBook", "Apple Watch", "AirPods", "Tela"].includes(produto)) {
        produto = "Acessório";
      }
    }

    let armazenamento = detectarArmazenamento(bloco);
    let modelo = extrairModelo(bloco, produto);

    // ✅ MacBook: pega RAM/SSD do texto e joga SSD no campo "armazenamento"
if (produto === "MacBook") {
  const { ram, ssd } = extrairConfigMacBook(bloco);

  // "256GB SSD" -> "256GB"
  if (ssd) armazenamento = ssd.replace(/\s*SSD\b/i, "").trim();

  // (opcional) se você quiser guardar RAM também, melhor deixar na descrição
  // e não no campo armazenamento
}
    // Se for TELA (lista), não tem armazenamento e o "modelo" vira o(s) modelo(s) do iPhone
    // Ex: "iPhone 13 Pro" ou "iPhone 12 / iPhone 12 Pro"
    if (produto === "Tela") {
      armazenamento = "";
      modelo = extrairModeloTela(bloco);
    }

    if (produto === "iPhone" && !armazenamento) {
      const m = bloco.toLowerCase().match(/\b(64|128|256|512)\s*gb\b/i);
      if (m) armazenamento = `${m[1]}GB`;
    }

    if (produto === "Apple Watch") armazenamento = "";

    if (produto === "iPhone" && !armazenamento) {
      const inf2 = inferirIphoneSemPalavra(bloco);
      if (inf2) {
        modelo = modelo && modelo !== "Não informado" ? modelo : inf2.modelo;
        armazenamento = inf2.armazenamento;
      }
    }

    if (!contextoProduto && produto === "Outro") {
      const inf = inferirIphoneSemPalavra(bloco);
      if (inf) {
        produto = inf.produto;
        modelo = inf.modelo;
        armazenamento = armazenamento || inf.armazenamento;
      }
    }

    if (
      produto === "Outro" &&
      (/\bparty\s*box\b/i.test(bloco) || /\bpartybox\b/i.test(bloco) || /\bboombox\b/i.test(bloco) || /\bencore\b/i.test(bloco))
    ) {
      produto = "JBL";
      modelo = extrairModelo(bloco, "JBL");
    }

    if (/\bultra\s*\d\b/i.test(bloco)) {
      produto = "Apple Watch";
      modelo = extrairModelo(bloco, "Apple Watch");
      armazenamento = "";
    }

    // ✅ condição com bateria apenas para iPhone
    let condicao = detectarCondicaoPorProduto(bloco, produto);

    if (contextoCondicao) {
      condicao = contextoCondicao;
    }

    if (produto === "Tela") {
      condicao = "Não informado";
    }

    condicao = aplicarInferenciaSeNaoInformado(condicao, {
  produto,
  modelo,
  armazenamento,
  preco,
  descricao: bloco
});

    let descricaoItem = buffer.join(" | ");
    descricaoItem = descricaoItem.replace(/\b(lacrados?|novo(s)?|seminovos?|usados?)\b/gi, "").trim();

    itens.push({
      produto,
      modelo,
      armazenamento,
      condicao,
      preco,
      descricaoItem,
    });

    if (produto === "iPhone") {
      ultimoItemBase = { produto, modelo, armazenamento, condicao };
    } else {
      ultimoItemBase = null;
    }

    // ✅ base do Apple Watch para herdar linhas só de variação (cor/preço)
    if (produto === "Apple Watch") {
      ultimoWatchBase = { produto, modelo, condicao };
    } else if (!/^\s*\(/.test(linha)) {
      // se não é linha de variação, zera para não herdar errado
      ultimoWatchBase = null;
    }

    buffer = [];
  }

  return itens.length >= 2 ? itens : [];
}



// =========================
// 7.1) MONTAGEM DA MENSAGEM (PASSO A PASSO)
// =========================
function montarMensagemPromo({ produto, modelo, armazenamento, condicaoFinal, precoAvista, descricao, bateriaItem }) {
  const produtoStr = (produto || "").toString().trim();
  const modeloStr = (modelo || "").toString().trim();

  // evita "JBL JBL ..." e similares
  const modeloSemDuplicar =
    modeloStr.toLowerCase().startsWith(produtoStr.toLowerCase() + " ")
      ? modeloStr
      : `${produtoStr} ${modeloStr}`.trim();

  const tituloProduto =
    produto === "iPhone"
      ? `📲 iPhone ${modeloStr}${armazenamento ? " " + armazenamento : ""}`
      : produto === "iPad"
      ? `📱 ${modeloStr.toLowerCase().includes("ipad") ? modeloStr : "iPad " + modeloStr}`
      : produto === "MacBook"
      ? `💻 ${modeloStr.toLowerCase().includes("macbook") ? modeloStr : "MacBook " + modeloStr}`
      : produto === "Apple Watch"
      ? `⌚ ${modeloStr.toLowerCase().includes("watch") ? modeloStr : "Apple Watch " + modeloStr}`
      : produto === "JBL"
      ? `🔊 ${modeloSemDuplicar}`
      : `🛍️ ${modeloSemDuplicar}`;

  let linhaConfig = "";
  if (produto === "MacBook") {
    const { ram, ssd } = extrairConfigMacBook(descricao);
    const partes = [ram, ssd].filter(Boolean);
    if (partes.length) linhaConfig = `⚙️ ${partes.join(" | ")}\n`;
  }

  const p12 = calcularParcelado(precoAvista, TAXA_12X_PCT, 12);
  const p18 = calcularParcelado(precoAvista, TAXA_18X_PCT, 18);

  const linhaCartao =
    `\n💳 Cartão:\n` + `• 12x de R$ ${formatBRL(p12.parcela)}\n` + `• 18x de R$ ${formatBRL(p18.parcela)}\n`;

  const cond = (condicaoFinal || "").toString().trim().toLowerCase();
  const linhaCondicao = cond === "nao informado" || cond === "não informado" ? "" : `📦 ${condicaoFinal}\n`;

  const cores = extrairCoresDisponiveis(descricao);
  const linhaCores =
    cores.length === 0
      ? ""
      : cores.length === 1
      ? `🎨 Cor: ${formatarCor(cores[0])}\n`
      : `🎨 Cores: ${cores.map(formatarCor).join(", ")}\n`;

  const linhaBateria = produto === "iPhone" && bateriaItem ? `🔋 Bateria ${bateriaItem}%\n` : "";

  const resumo = filtrarDescricaoPremium(descricao, produto, modeloStr, armazenamento, condicaoFinal);
  const linhaDesc = resumo ? `📝 ${resumo}\n` : "";

  return (
    `🔥 OFERTA DISPONÍVEL 🔥\n\n` +
    `${tituloProduto}\n` +
    `💰 À vista: R$ ${Number(precoAvista).toFixed(2).replace(".", ",")}` +
    `${linhaCartao}\n` +
    `${linhaConfig}${linhaCondicao}${linhaCores}${linhaBateria}${linhaDesc}` +
    `📲 Chama no privado`
  );
}
// =========================
// 8) RELATÓRIO: menor preço do dia por chave
// =========================
function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function extrairDiaDaData(dataStr) {
  const s = (dataStr || "").trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

function gerarRelatorioMenorPrecoDoDia() {
  garantirCSV();
  const hoje = hojeISO_BR();

  const linhas = fs.readFileSync(ARQUIVO_CSV, "utf8").split("\n").filter(Boolean);

  if (linhas.length <= 1) {
    console.log("📄 Relatório: CSV vazio (sem dados).");
    return;
  }

  const dados = linhas.slice(1);
  const mapMin = new Map();

for (const l of dados) {
  const c = parseCSVLine(l);

  const produto = c[0] || "";
  const modelo = c[1] || "";
  const armazenamento = c[2] || "";
  const cor = c[3] || "";
  const condicao = c[4] || "";
  const preco = parsePrecoCSV(c[5]);
  const descricao = c[6] || "";
  const dataStr = c[7] || "";
  const horaRecebida = c[8] || "";
  const vendedor = c[9] || "";
  const numero = c[10] || "";
  const grupo = c[11] || "";

  const dataDia = extrairDiaDaData(dataStr);
  if (!dataDia || dataDia !== hoje) continue;
  if (!preco || isNaN(preco)) continue;

  const chave = `${normKey(produto)}||${normKey(modelo)}||${normKey(armazenamento)}||${normKey(cor)}||${normKey(condicao)}`;

  const atual = mapMin.get(chave);
  if (!atual || preco < atual.preco) {
    mapMin.set(chave, {
      preco,
      produto,
      modelo,
      armazenamento,
      cor,
      condicao,
      descricao,
      dataStr,
      horaRecebida,
      vendedor,
      numero,
      grupo,
    });
  }
} // ✅ FECHA O FOR AQUI

if (mapMin.size === 0) {
  console.log("📄 Relatório: nenhum item encontrado para hoje.");
  return;
}

  const saida = [];
  saida.push("Produto,Modelo,Armazenamento,Cor,Condicao,MenorPreco,Descricao,Data,HoraRecebida,Vendedor,Numero,Grupo");

  const esc = (s) => (s || "").toString().replace(/"/g, '""');

  for (const v of mapMin.values()) {
    const numeroExcel = v.numero ? `="${v.numero}"` : "";

    saida.push(
      `"${esc(v.produto)}","${esc(v.modelo)}","${esc(v.armazenamento)}","${esc(v.cor)}","${esc(v.condicao)}","${formatarPrecoCSVBR(
        v.preco
      )}","${esc(v.descricao)}","${hoje}","${esc(v.horaRecebida)}","${esc(v.vendedor)}","${esc(numeroExcel)}","${esc(
        v.grupo
      )}"`
    );
  }

  const nomeArquivo = `relatorio_menor_preco_${hoje}.csv`;
  fs.writeFileSync(nomeArquivo, saida.join("\n") + "\n");

  console.log(`📄 Relatório gerado: ${nomeArquivo}`);
  console.log(`✅ Itens no relatório: ${mapMin.size}`);
}

function relatorioJaGeradoHoje() {
  const hoje = hojeISO_BR();
  if (!fs.existsSync(ARQUIVO_ULTIMO_RELATORIO)) return false;
  const last = fs.readFileSync(ARQUIVO_ULTIMO_RELATORIO, "utf8").trim();
  return last === hoje;
}

function marcarRelatorioGeradoHoje() {
  fs.writeFileSync(ARQUIVO_ULTIMO_RELATORIO, hojeISO_BR());
}

// =========================
// 9) WHATSAPP EVENTS
// =========================
client.on("qr", (qr) => qrcode.generate(qr, { small: true }));

client.on("ready", async () => {
  console.log("✅ WhatsApp conectado!");
  console.log("🎯 Monitorando grupos:", GRUPOS_MONITORADOS.join(" | "));
  console.log("🎯 Monitorando CONTATOS (privado):");
  console.log("   - " + CONTATOS_MONITORADOS.join("\n   - "));

  carregarEnviados();
  carregarJblUltimo();
  carregarNovosUltimo();
  garantirCSV();

  if (!relatorioJaGeradoHoje()) {
    gerarRelatorioMenorPrecoDoDia();
    marcarRelatorioGeradoHoje();
  }

  const chats = await client.getChats();
  grupoPromoRef = chats.find((c) => c.isGroup && c.name === GRUPO_PROMO);

  if (grupoPromoRef) {
    console.log("🚀 Grupo promo encontrado:", GRUPO_PROMO);
  } else {
    console.log("⚠️ Grupo promo NÃO encontrado!");
  }
});

client.on("message", async (msg) => {
  try {
    if (!msg || !msg.body) return;

    const texto = normalizarTexto(msg.body);
    if (ehVCard(texto)) {
      console.log("ℹ️ Ignorado: mensagem é um contato (VCARD).");
      return;
    }

    const chat = await msg.getChat().catch(() => null);
    if (!chat || chat.isChannel) return;

    const contato = await msg.getContact().catch(() => null);
    const numero = obterNumeroMsg(msg, contato);
    const nome = contato?.pushname || numero || "Desconhecido";
    const horaRecebida = horaRecebidaMsg(msg);

    const ehGrupo = chat.isGroup;
    const grupo = ehGrupo ? chat.name : `PRIVADO - ${nome}`;

    const autorizado =
      (ehGrupo && GRUPOS_MONITORADOS_NORM.has(normKey(chat.name))) || (!ehGrupo && CONTATOS_MONITORADOS_NORM.has(numero));

    if (!autorizado) return;

    if (!ehGrupo) {
      console.log("📩 Privado de:", nome, "| numero capturado:", numero, "| msg.from:", msg.from);
    }

    console.log("---------------");
    console.log(ehGrupo ? "Grupo:" : "Privado:", grupo);
    console.log("De:", nome);
    console.log("Número:", numero);
    console.log("Mensagem (bruta):", texto);

    // =========================
// ANTI-CONTATO (telefone puro) — não deixa virar "preço"
// Aceita: 4000 / 4.000 / 4,000 (mas só considera preço se tiver contexto)
// =========================
const textoTrim = (texto || "").trim();

// 1) Se for VCARD, já é ignorado acima (você já fez)
// 2) Ignora mensagens que são basicamente um telefone (com +55, espaços, traços, parênteses)
const textoSoDigitos = textoTrim.replace(/\D/g, "");

// Se tiver contexto de preço, NÃO bloqueia (ex: "R$ 2.825" ou "pix 2825")
const temContextoDePrecoForte = /\b(r\$|\$|reais|pix|preco|preço|valor|por|promo|oferta|avista|à vista)\b/i.test(textoTrim);

// Detecta "mensagem só telefone": começa e termina com dígito e só tem símbolos comuns de telefone no meio
const pareceTelefonePuro = /^\+?\s*\d[\d\s().\-–—]{6,}\d\s*$/.test(textoTrim);

// Bloqueio: se parece telefone e tiver 10 a 13 dígitos (BR), e NÃO tem contexto de preço
if (pareceTelefonePuro && textoSoDigitos.length >= 10 && textoSoDigitos.length <= 13 && !temContextoDePrecoForte) {
  console.log("ℹ️ Ignorado: mensagem é só contato/telefone.");
  return;
}

    // LISTA: salva vários itens
    
    const itensLista = extrairItensDeLista(texto);

    if (itensLista.length) {
      let midiaEnviadaNaLista = false;

      for (const item of itensLista) {
        salvarLinhaCSV({
          produto: item.produto,
          modelo: sanitizarModeloParaSalvar(item.produto, item.modelo),
          armazenamento: item.armazenamento,
          cor: extrairCorDaDescricao(item.descricaoItem),
          condicao: item.condicao,
          preco: item.preco,
          descricao: item.descricaoItem,
          data: hojeISO_BR(),
          horaRecebida,
          nome,
          numero,
          grupo,
        });

        console.log(
          `✅ Item salvo: ${item.produto} | ${item.modelo} | ${item.armazenamento} | ${item.condicao} | ${item.preco}`
        );

        agendarAtualizacaoRelatorio();

        // =========================
        // ENVIO AUTOMÁTICO (LISTA): iPhone + iPad + MacBook + Apple Watch + JBL
        // =========================
        const podeEnviarProdutoNoGrupoPromo = ["iPhone", "iPad", "MacBook", "Apple Watch", "JBL"].includes(item.produto);

        // ✅ Se for lista de telas, salva no CSV mas NÃO manda promo (já está como "Tela")
        if (item.produto === "Tela") {
          continue;
        }

        if (
          podeEnviarProdutoNoGrupoPromo &&
          modeloIdentificado(item.produto, item.modelo) &&   // ✅ aqui
          item.preco &&
          !msg.fromMe &&
          grupoPromoRef
        ) {
          try {
            const novoPreco = item.preco + obterMargemPorProduto(item.produto);
            // ✅ Regra JBL: só envia se for menor que o último nas últimas 12h
if (item.produto === "JBL") {
  if (!jblPodeEnviarPorPreco({ produto: "JBL", modelo: item.modelo, novoPreco })) {
    console.log("⛔ JBL ignorado: preço não é menor que o último enviado nas 12h:", item.modelo, "R$", novoPreco);
    continue;
  }
}

            // ✅ bateria só para iPhone
const bateriaItem = item.produto === "iPhone" ? extrairBateria(item.descricaoItem) : null;

if (item.produto === "iPhone" && bateriaItem !== null && bateriaItem < 80) {
  console.log("⛔ Ignorado: bateria muito baixa");
  continue;
}

let condicaoFinal = item.condicao;
if (item.produto === "iPhone" && bateriaItem !== null) condicaoFinal = "Seminovo";

// ✅ Regra NOVOS (iPhone/iPad/Apple Watch): só envia se baixar preço vs último 12h
const corCanonica = obterCorCanonica(item.descricaoItem);

if (["iPhone", "iPad", "Apple Watch"].includes(item.produto)) {
  const armazenamentoChave = item.produto === "Apple Watch" ? "" : (item.armazenamento || "");

  if (!novoPodeEnviarPorPreco({
    produto: item.produto,
    modelo: item.modelo,
    armazenamento: armazenamentoChave,
    cor: corCanonica,
    condicaoFinal,
    novoPreco
  })) {
    console.log("⛔ NOVO ignorado (LISTA): preço não é menor que o último 12h:", item.produto, item.modelo, armazenamentoChave, corCanonica, "R$", novoPreco);
    continue;
  }
}

// ✅ BLOQUEIO POR DEFEITO (LISTA) — COLOCA AQUI
if (item.produto === "iPhone" && temDefeitoBloqueante(item.descricaoItem || "")) {
  console.log("⛔ Promo BLOQUEADA por defeito (lista):", item.modelo, "|", item.descricaoItem);
  continue;
}

// ✅ limites só para iPhone

if (item.produto === "iPhone") {
  if (!item.armazenamento) {
    console.log("⛔ Ignorado: iPhone sem armazenamento na lista");
    continue;
  }


  console.log("DEBUG LIMITES (LISTA):", {
    modeloOriginal: item.modelo,
    armazenamentoOriginal: item.armazenamento,
    condicaoFinal,
    modeloKey: normalizarModeloIphoneParaLimite(item.modelo),
    storageKey: normalizarStorageParaLimite(item.armazenamento),
    novoPreco
  });

  if (!podeEnviarPromo(novoPreco, item.modelo, item.armazenamento, condicaoFinal)) {
    console.log("⛔ Ignorado (fora do limite):", item.modelo, item.armazenamento, condicaoFinal, "R$", novoPreco);
    continue;
  }
}



// ✅ SÓ DEPOIS monta a promo
const mensagemPromo = montarMensagemPromo({
  produto: item.produto,
  modelo: item.modelo,
  armazenamento: item.produto === "iPhone" ? item.armazenamento : "",
  condicaoFinal,
  precoAvista: novoPreco,
  descricao: item.descricaoItem,
  bateriaItem,
});

            const chave =
              item.produto === "iPhone"
                ? chaveDedupeIphone({
                    modelo: item.modelo,
                    armazenamento: item.armazenamento,
                    condicao: condicaoFinal,
                    preco: novoPreco,
                    descricao: item.descricaoItem,
                  })
                : chaveDedupeGenerica({
                    produto: item.produto,
                    modelo: item.modelo,
                    armazenamento: "",
                    condicao: condicaoFinal,
                    preco: novoPreco,
                    descricao: item.descricaoItem,
                  });

            if (jaEnviadoRecentemente(chave)) {
              console.log("⛔ DEDUPE (descrição igual):", chave);
              continue;
            }

            marcarEnviado(chave);

            try {
              await enviarParaGrupoPromo(grupoPromoRef, mensagemPromo, msg, {
                anexarMidia: !midiaEnviadaNaLista,
              });
              if (item.produto === "JBL") {
                  jblMarcarEnviado({ modelo: item.modelo, novoPreco });
                }

                novoMarcarEnviado({
                  produto: item.produto,
                  modelo: item.modelo,
                  armazenamento: item.produto === "Apple Watch" ? "" : (item.armazenamento || ""),
                  cor: corCanonica,
                  condicaoFinal,
                  novoPreco
                });
              salvarPromocaoCSV(
              item.produto,
              item.modelo,
              item.produto === "iPhone" ? item.armazenamento : "",
              extrairCorDaDescricao(item.descricaoItem),
              condicaoFinal,
              item.preco,
              novoPreco
            );
              if (msg?.hasMedia) midiaEnviadaNaLista = true;
            } catch (e) {
              enviadosCache.delete(chave);
              salvarEnviados();
              console.log("⚠️ Falha no envio (desmarcado dedupe):", e.message);
            }
          } catch (e) {
            console.log("⚠️ Erro ao enviar promoção:", e.message);
          }
        }
      }

      return;
    }

    // NORMAL: 1 item
const preco = extrairPreco(texto);
const produto = detectarProduto(texto);

if (!preco) {
  console.log("ℹ️ Ignorado: mensagem sem preço.");
  return;
}

if (["iPhone", "iPad", "MacBook", "Apple Watch"].includes(produto) && preco < 500 && !ehListaDeTelas(texto)) {
  console.log("ℹ️ Ignorado: preço muito baixo para esse produto (provável ruído).");
  return;
}

let armazenamento = detectarArmazenamento(texto);

// ✅ condição inicial (sem inferência ainda)
let condicao = detectarCondicaoPorProduto(texto, produto);

// ✅ modelo
let modelo = extrairModelo(texto, produto);

// ✅ MacBook: SSD -> armazenamento
if (produto === "MacBook") {
  const { ssd } = extrairConfigMacBook(texto);
  if (ssd) armazenamento = ssd.replace(/\s*SSD\b/i, "").trim();
}

// ✅ Tela: zera armazenamento, modelo vira modelo(s) do iPhone, e não envia promo
if (produto === "Tela") {
  armazenamento = "";
  modelo = extrairModeloTela(texto);
  condicao = "Não informado";
}

// helper local (você já tem)
function escapeRegExp(s) {
  return (s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ✅ modeloLimpo (agora existe antes de usar)
let modeloLimpo = (modelo || "").trim();
const prodPrefix = new RegExp("^" + escapeRegExp(produto) + "\\s+", "i");
modeloLimpo = modeloLimpo.replace(prodPrefix, "").trim();

// ✅ bateria só força Seminovo se for iPhone
const pct = produto === "iPhone" ? extrairBateria(texto) : null;
if (produto === "iPhone" && pct !== null) {
  condicao = "Seminovo";
}

// ✅ Agora SIM: inferência por tabelas (1x só, com modeloLimpo pronto)
condicao = aplicarInferenciaSeNaoInformado(condicao, {
  produto,
  modelo: sanitizarModeloParaSalvar(produto, modeloLimpo),
  armazenamento,
  preco,
  descricao: texto
});

// 🔧 Correção para evitar "iPad iPad"
if (produto === "iPad") {
  const m = (modeloLimpo || "").trim().toLowerCase();
  if (m === "ipad") modeloLimpo = "Não informado";
}
 

    if (produto === "iPhone" && (!armazenamento || armazenamento === "")) {
      const m1 = texto.match(/(?:^|\s)(64|128|256|512)\s*G\s*B(?:\s|$)/i);
      if (m1) armazenamento = `${m1[1]}GB`;
    }

    if (produto === "iPhone" && (!armazenamento || armazenamento === "")) {
      const m2 = texto.match(/(?:^|\s)(64|128|256|512)\s*G(?:\s|$)/i);
      if (m2) armazenamento = `${m2[1]}GB`;
    }

    if (produto === "Apple Watch") armazenamento = "";

    const descricao = texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" | ");

      if (produto === "iPhone" && temDefeitoBloqueante(descricao || "")) {
  console.log("⛔ Promo BLOQUEADA por defeito (normal):", modeloLimpo, "|", descricao);
  return;
}

    salvarLinhaCSV({
      produto,
      modelo: modeloLimpo,
      armazenamento,
      cor: extrairCorDaDescricao(descricao),
      condicao,
      preco,
      descricao,
      data: hojeISO_BR(),
      horaRecebida,
      nome,
      numero,
      grupo,
    });

    agendarAtualizacaoRelatorio();

    console.log(`📝 Descrição salva: ${descricao}`);

    // =========================
    // ENVIO AUTOMÁTICO PARA GRUPO PROMO (iPhone + iPad + MacBook + Apple Watch + JBL)
    // =========================
    const podeEnviarProdutoNoGrupoPromoNormal = ["iPhone", "iPad", "MacBook", "Apple Watch", "JBL"].includes(produto);

    // ✅ Tela NÃO envia (já está fora da lista)
    if (
      podeEnviarProdutoNoGrupoPromoNormal &&
      modeloIdentificado(produto, modeloLimpo) &&     // ✅ aqui
      preco &&
      !msg.fromMe
    ) {
      try {
        const novoPreco = preco + obterMargemPorProduto(produto);

        // ✅ Regra JBL: só envia se for menor que o último nas últimas 12h
if (produto === "JBL") {
  if (!jblPodeEnviarPorPreco({ produto: "JBL", modelo: modeloLimpo, novoPreco })) {
    console.log("⛔ JBL ignorado: preço não é menor que o último enviado nas 12h:", modeloLimpo, "R$", novoPreco);
    return;
  }
}

        // ✅ bateria só para iPhone
        const bateriaItem = produto === "iPhone" ? extrairBateria(texto) : null;

        if (produto === "iPhone" && bateriaItem !== null) {
          const bateriaNumero = Number(bateriaItem);
          if (!isNaN(bateriaNumero) && bateriaNumero < 80) {
            console.log("⛔ Ignorado: bateria muito baixa");
            return;
          }
        }

        let condicaoFinal = condicao;
        if (produto === "iPhone" && bateriaItem !== null) condicaoFinal = "Seminovo";

        // ✅ Regra NOVOS (iPhone/iPad/Apple Watch): só envia se baixar preço vs último 12h
          const corCanonica = obterCorCanonica(descricao);

          if (["iPhone", "iPad", "Apple Watch"].includes(produto)) {
            const armazenamentoChave = produto === "Apple Watch" ? "" : (armazenamento || "");

            if (!novoPodeEnviarPorPreco({
              produto,
              modelo: modeloLimpo,
              armazenamento: armazenamentoChave,
              cor: corCanonica,
              condicaoFinal,
              novoPreco
            })) {
              console.log("⛔ NOVO ignorado (NORMAL): preço não é menor que o último 12h:", produto, modeloLimpo, armazenamentoChave, corCanonica, "R$", novoPreco);
              return;
            }
          }

        // ✅ limites só para iPhone
        
        if (produto === "iPhone") {
          if (!armazenamento && !ehListaDeTelas(texto)) {
            console.log("⛔ Ignorado: iPhone sem armazenamento");
            return;
          }

          console.log("DEBUG LIMITES (NORMAL):", {
            modeloOriginal: modeloLimpo,
            armazenamentoOriginal: armazenamento,
            condicaoFinal,
            modeloKey: normalizarModeloIphoneParaLimite(modeloLimpo),
            storageKey: normalizarStorageParaLimite(armazenamento),
            novoPreco
          });

          if (!podeEnviarPromo(novoPreco, modeloLimpo, armazenamento, condicaoFinal)) {
            console.log("⛔ Ignorado (fora do limite):", modeloLimpo, armazenamento, condicaoFinal, "R$", novoPreco);
            return;
          }
        }

        const mensagemPromo = montarMensagemPromo({
          produto,
          modelo: modeloLimpo,
          armazenamento: produto === "iPhone" ? armazenamento : "",
          condicaoFinal,
          precoAvista: novoPreco,
          descricao,
          bateriaItem,
        });

        const grupoDestino = grupoPromoRef;

        const chave =
          produto === "iPhone"
            ? chaveDedupeIphone({
                modelo: modeloLimpo,
                armazenamento,
                condicao: condicaoFinal,
                preco: novoPreco,
                descricao,
              })
            : chaveDedupeGenerica({
                produto,
                modelo: modeloLimpo,
                armazenamento: "",
                condicao: condicaoFinal,
                preco: novoPreco,
                descricao,
              });

        if (jaEnviadoRecentemente(chave)) {
          console.log("⛔ DEDUPE (descrição igual):", chave);
          return;
        }

        marcarEnviado(chave);

        if (grupoDestino) {
          try {
            await enviarParaGrupoPromo(grupoDestino, mensagemPromo, msg);
            if (produto === "JBL") {
                jblMarcarEnviado({ modelo: modeloLimpo, novoPreco });
              }

              novoMarcarEnviado({
                produto,
                modelo: modeloLimpo,
                armazenamento: produto === "Apple Watch" ? "" : (armazenamento || ""),
                cor: corCanonica,
                condicaoFinal,
                novoPreco
              });
            console.log("🚀 Enviado para grupo promo:", GRUPO_PROMO);
            console.log("🚀 Promo enviada:", produto, modeloLimpo, "R$", novoPreco);
            salvarPromocaoCSV(
  produto,
  modeloLimpo,
  produto === "iPhone" ? armazenamento : "",
  extrairCorDaDescricao(descricao),
  condicaoFinal,
  preco,
  novoPreco
);
          } catch (e) {
            enviadosCache.delete(chave);
            salvarEnviados();
            console.log("⚠️ Falha no envio (desmarcado dedupe):", e.message);
          }
        } else {
          console.log("⚠️ Grupo de promo não encontrado.");
        }
      } catch (e) {
        console.log("⚠️ Erro ao enviar promoção:", e.message);
      }
    }
  } catch (err) {
    console.error("⚠️ Erro interno capturado:", err.message);
  }
});

// =========================
// 10) CLI + INIT
// =========================
/* =========================
   CLI: gerar relatório manual
   node index.js --relatorio
========================= */
if (process.argv.includes("--relatorio")) {
  gerarRelatorioMenorPrecoDoDia();
  console.log("📄 Relatório inicial gerado.");
  process.exit(0);
}

client.initialize();