// Bot de teste LOCAL com FLUXO GUIADO — sem Mongo/Redis/Docker.
// foto → pergunta título → pergunta preço → IA trata imagem + gera anúncio →
// salva no catálogo local; /excel envia a planilha da Shopee no Telegram.
// Fica em scripts/ para resolver sharp/exceljs do node_modules da raiz.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import ExcelJS from 'exceljs';

const ROOT = 'C:/Users/gusta/OneDrive/Área de Trabalho/tercno plus';
const OUT = 'C:/Users/gusta/AppData/Local/Temp/claude/c--Users-gusta-OneDrive--rea-de-Trabalho-tercno-plus/c11cb4af-98b6-4fbb-ba6a-22838a758f2c/scratchpad';
const IMG_DIR = path.join(OUT, 'shopee-images');
const CATALOG = path.join(OUT, 'local-catalog.json');
fs.mkdirSync(IMG_DIR, { recursive: true });

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.TELEGRAM_BOT_TOKEN;
const GKEY = env.GEMINI_API_KEY;
const GMODEL = env.AI_VISION_MODEL || 'gemini-flash-latest';
const ALLOWED = new Set((process.env.TG_ALLOWED || '').split(',').map((s) => s.trim()).filter(Boolean));

const API = `https://api.telegram.org/bot${TOKEN}`;
const FILEAPI = `https://api.telegram.org/file/bot${TOKEN}`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function send(chatId, text) {
  await fetch(`${API}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }) });
}
async function sendDoc(chatId, buffer, filename) {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('document', new Blob([buffer]), filename);
  await fetch(`${API}/sendDocument`, { method: 'POST', body: fd });
}
async function downloadFile(fileId) {
  const r = await (await fetch(`${API}/getFile?file_id=${encodeURIComponent(fileId)}`)).json();
  return Buffer.from(await (await fetch(`${FILEAPI}/${r.result.file_path}`)).arrayBuffer());
}

function parseBRL(input) {
  const s = String(input).replace(/[^\d.,]/g, '');
  if (!s) return 0;
  if (s.includes('.') && s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (s.includes(',')) return Number(s.replace(',', '.'));
  const p = s.split('.');
  if (p.length > 1 && p[p.length - 1].length === 3) return Number(s.replace(/\./g, ''));
  return Number(s);
}
function slug(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function markup(p) { if (p <= 30) return 1.2; if (p <= 100) return 0.9; if (p <= 300) return 0.7; return 0.5; }
function psych(v) { if (v <= 0) return 0; return Number((Math.ceil((v + 0.1) / 10) * 10 - 0.1).toFixed(2)); }
const brl = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

function loadCatalog() { try { return JSON.parse(fs.readFileSync(CATALOG, 'utf8')); } catch { return []; } }
function saveCatalog(c) { fs.writeFileSync(CATALOG, JSON.stringify(c, null, 2)); }

async function geminiListing(buffer, title, price) {
  const prompt = `Você é copywriter de e-commerce brasileiro (Shopee). Com base na IMAGEM, no título do vendedor "${title}" e no custo R$${price}, gere um anúncio. Responda SOMENTE JSON:
{"titulo_shopee": string(<=100 chars, com palavras-chave), "descricao": string(2-4 frases), "categoria": string, "marca": string|null, "cor": string|null, "tamanho": string|null, "bullets": string[3..5], "specs": {chave:valor}, "codigo_barras": string|null}`;
  const body = {
    contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: buffer.toString('base64') } }, { text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent?key=${GKEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const txt = json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ?? '{}';
  let data = {}; try { data = JSON.parse(txt); } catch { /* ignore */ }
  return { data, tokens: json.usageMetadata?.totalTokenCount ?? 0 };
}

async function treatImage(buffer, id) {
  // Shopee gosta de quadrado com fundo branco
  const out = await sharp(buffer).resize(1200, 1200, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg({ quality: 90 }).toBuffer();
  const file = path.join(IMG_DIR, `${id}.jpg`);
  fs.writeFileSync(file, out);
  return file;
}

async function buildExcel(catalog) {
  const wb = new ExcelJS.Workbook();
  const sh = wb.addWorksheet('Shopee');
  sh.columns = [
    { header: 'Nome do Produto', key: 'name', width: 46 },
    { header: 'Descrição', key: 'desc', width: 60 },
    { header: 'Categoria', key: 'cat', width: 22 },
    { header: 'Marca', key: 'brand', width: 18 },
    { header: 'Preço de Venda', key: 'sale', width: 16 },
    { header: 'Estoque', key: 'stock', width: 10 },
    { header: 'SKU', key: 'sku', width: 18 },
    { header: 'Preço de Custo', key: 'cost', width: 16 },
    { header: 'Lucro', key: 'profit', width: 12 },
    { header: 'Imagem (arquivo)', key: 'img', width: 40 },
  ];
  sh.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sh.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEE4D2D' } };
  for (const p of catalog) {
    sh.addRow({
      name: p.listing?.titulo_shopee || p.title,
      desc: p.listing?.descricao || '',
      cat: p.listing?.categoria || '',
      brand: p.listing?.marca || '',
      sale: p.salePrice || '',
      stock: 1,
      sku: p.id,
      cost: p.price || '',
      profit: p.salePrice && p.price ? Number((p.salePrice - p.price).toFixed(2)) : '',
      img: p.image ? path.basename(p.image) : '',
    });
  }
  sh.eachRow((r) => r.eachCell((c) => (c.alignment = { vertical: 'top', wrapText: true })));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const convo = new Map(); // chatId -> { step, fileId, title }

async function handle(msg) {
  const chatId = msg.chat.id;
  if (!ALLOWED.has(String(chatId))) { log(`⛔ ignorado: ${chatId}`); return; }
  const photo = msg.photo?.length ? msg.photo[msg.photo.length - 1] : null;
  const text = (msg.text ?? '').trim();

  if (photo) {
    convo.set(chatId, { step: 'title', fileId: photo.file_id });
    return send(chatId, '📸 Foto recebida!\n📝 <b>Qual o título do produto?</b>');
  }

  if (/^\/excel/i.test(text)) return doExcel(chatId);
  if (/^\/(start|help|ajuda)/i.test(text)) {
    return send(chatId, '🤖 <b>Fluxo:</b> mande a <b>foto</b> → eu pergunto o <b>título</b> → depois o <b>preço pago</b>. No fim, /excel te envia a planilha da Shopee.');
  }

  const st = convo.get(chatId);
  if (!st) return send(chatId, '📷 Manda a <b>foto</b> do produto pra começar 🙂');

  if (st.step === 'title') {
    if (!text) return send(chatId, '📝 Me diga o <b>título</b> (texto).');
    st.title = text; st.step = 'price'; convo.set(chatId, st);
    return send(chatId, `✅ Título: <b>${escapeHtml(text)}</b>\n💰 <b>Quanto você pagou?</b> (só o valor, ex.: 16 ou 16,90)`);
  }
  if (st.step === 'price') {
    const price = parseBRL(text);
    if (!price) return send(chatId, '💰 Não entendi o valor. Manda só o número, ex.: <i>16</i> ou <i>16,90</i>.');
    convo.delete(chatId);
    return finalize(chatId, st.fileId, st.title, price);
  }
}

async function finalize(chatId, fileId, title, price) {
  const nameKey = slug(title);
  let buffer;
  try { buffer = await downloadFile(fileId); } catch (e) { return send(chatId, `❌ Erro ao baixar a foto: ${e.message}`); }
  const imageHash = crypto.createHash('sha256').update(buffer).digest('hex');

  const catalog = loadCatalog();
  const dup = catalog.find((p) => p.nameKey === nameKey || p.imageHash === imageHash);
  if (dup) return send(chatId, `⚠️ <b>Já cadastrado</b> — "${escapeHtml(dup.title)}". Repetido ignorado.`);

  const id = 'TP-' + String(catalog.length + 1).padStart(4, '0');
  let imageFile = '';
  try { imageFile = await treatImage(buffer, id); } catch (e) { log('img err', e.message); }

  let listing = {}, tokens = 0;
  try { const r = await geminiListing(buffer, title, price); listing = r.data; tokens = r.tokens; }
  catch (e) { return send(chatId, `❌ Gemini: ${e.message}`); }

  const salePrice = psych(price * (1 + markup(price)));
  const margin = salePrice > 0 ? Math.round(((salePrice - price) / salePrice) * 100) : 0;

  const item = { id, title, price, salePrice, margin, nameKey, imageHash, listing, image: imageFile, tokens, at: new Date().toISOString() };
  catalog.push(item);
  saveCatalog(catalog);

  await send(chatId, `✅ #${catalog.length} salvo — manda a próxima foto 📸`);
  log(`✅ ${id} "${title}" custo ${price} venda ${salePrice} — ${tokens} tk — total ${catalog.length}`);
}

async function doExcel(chatId) {
  const catalog = loadCatalog();
  if (!catalog.length) return send(chatId, '📭 Catálogo vazio. Cadastre um produto primeiro.');
  await send(chatId, '📊 Gerando a planilha…');
  try {
    const buf = await buildExcel(catalog);
    await sendDoc(chatId, buf, `shopee-lote-${new Date().toISOString().slice(0, 10)}.xlsx`);
    await send(chatId, `✅ Planilha com <b>${catalog.length}</b> produto(s) enviada!`);
    log(`📊 excel enviado (${catalog.length} itens)`);
  } catch (e) { await send(chatId, `❌ Erro no Excel: ${e.message}`); }
}

function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

let offset = 0;
async function loop() {
  log(`🟢 Bot (fluxo guiado) ativo — autorizado: ${[...ALLOWED].join(', ') || '(nenhum!)'}`);
  for (;;) {
    try {
      const r = await (await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`, { signal: AbortSignal.timeout(45000) })).json();
      for (const up of r.result ?? []) { offset = up.update_id + 1; if (up.message) await handle(up.message).catch((e) => log('handle err:', e.message)); }
    } catch (e) { log('poll err:', e.message); await new Promise((r) => setTimeout(r, 3000)); }
  }
}
loop();
