'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const MODEL        = 'claude-sonnet-4-6';
const STORAGE_KEY  = 'gastos_entries';
const API_KEY_STOR = 'gastos_api_key';
const MAX_IMG_DIM  = 1600;

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const CATEGORIES = [
  { id: 'ALIMENTACAO', label: 'Alimentação', emoji: '🛒', color: '#e74c3c', bg: 'rgba(231,76,60,0.15)' },
  { id: 'MORADIA',     label: 'Moradia',     emoji: '🏠', color: '#3498db', bg: 'rgba(52,152,219,0.15)' },
  { id: 'TRANSPORTE',  label: 'Transporte',  emoji: '🚗', color: '#f39c12', bg: 'rgba(243,156,18,0.15)' },
  { id: 'SAUDE',       label: 'Saúde',       emoji: '💊', color: '#2ecc71', bg: 'rgba(46,204,113,0.15)' },
  { id: 'LAZER',       label: 'Lazer',       emoji: '🎭', color: '#9b59b6', bg: 'rgba(155,89,182,0.15)' },
  { id: 'ASSINATURAS', label: 'Assinaturas', emoji: '📱', color: '#1abc9c', bg: 'rgba(26,188,156,0.15)' },
  { id: 'VESTUARIO',   label: 'Vestuário',   emoji: '👗', color: '#e91e63', bg: 'rgba(233,30,99,0.15)' },
  { id: 'OUTROS',      label: 'Outros',      emoji: '📦', color: '#95a5a6', bg: 'rgba(149,165,166,0.15)' },
];

const TYPE_LABELS = { foto: '📷 Foto', galeria: '🖼️ Galeria', pdf: '📄 PDF', manual: '✏️ Manual' };

// ============================================================
// STATE
// ============================================================
let state = {
  entries: [],
  cameraStream: null,
  currentFileType: null,   // 'foto' | 'galeria' | 'pdf' | 'manual'
  currentBase64: null,
  currentMimeType: null,
  confirmPerson: 'João',
  confirmCategory: null,
  manualPerson: 'João',
  manualCategory: null,
};

// ============================================================
// STORAGE
// ============================================================
function loadEntries() {
  try { state.entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { state.entries = []; }
}
function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}
function getApiKey() { return localStorage.getItem(API_KEY_STOR) || ''; }
function setApiKey(k) { localStorage.setItem(API_KEY_STOR, k); }

// ============================================================
// UTILITIES
// ============================================================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function todayISO() { return new Date().toISOString().split('T')[0]; }

function isoToDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function displayToISO(dd) {
  if (!dd) return todayISO();
  const p = dd.split('/');
  if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`;
  return todayISO();
}

function fmtCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function fmtCurrencyShort(val) {
  return fmtCurrency(val).replace('R$\xa0', 'R$ ');
}

function currentMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthLabel() {
  const d = new Date();
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function catById(id) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[7]; }

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => t.classList.add('show'));
  });
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('active')));
}
function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('active');
  setTimeout(() => el.classList.add('hidden'), 320);
}

// ============================================================
// LOADING
// ============================================================
function showLoading(msg = 'Analisando documento...') {
  document.getElementById('loading-text').textContent = msg;
  document.getElementById('loading').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

// ============================================================
// CAMERA (getUserMedia)
// ============================================================
async function openCamera() {
  const overlay = document.getElementById('camera-overlay');
  const video   = document.getElementById('camera-video');

  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = state.cameraStream;
    overlay.classList.remove('hidden');
  } catch (err) {
    // Fallback to native file input
    document.getElementById('camera-input').click();
  }
}

function closeCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  const video = document.getElementById('camera-video');
  video.srcObject = null;
  document.getElementById('camera-overlay').classList.add('hidden');
}

function capturePhoto() {
  const video  = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  const vw = video.videoWidth  || 1280;
  const vh = video.videoHeight || 720;

  let w = vw, h = vh;
  if (w > MAX_IMG_DIM || h > MAX_IMG_DIM) {
    const scale = Math.min(MAX_IMG_DIM / w, MAX_IMG_DIM / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  canvas.width  = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);

  const dataUrl  = canvas.toDataURL('image/jpeg', 0.88);
  const base64   = dataUrl.split(',')[1];
  const mimeType = 'image/jpeg';

  closeCamera();
  processAndConfirm(base64, mimeType, 'foto', dataUrl);
}

// ============================================================
// FILE → BASE64
// ============================================================
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function resizeImageDataURL(dataUrl, maxDim = MAX_IMG_DIM) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxDim || h > maxDim) {
        const scale = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.src = dataUrl;
  });
}

// ============================================================
// API CALL
// ============================================================
async function callClaude(base64, mimeType) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('NO_API_KEY');

  const isPdf   = mimeType === 'application/pdf';
  const catList = CATEGORIES.map(c => c.id).join(', ');

  const prompt = `Analise este ${isPdf ? 'documento/boleto' : 'cupom fiscal ou nota'} e retorne APENAS um JSON válido (sem explicações) com este formato exato:
{
  "valor": <número decimal em reais, ex: 42.90>,
  "estabelecimento": "<nome do local ou beneficiário, máx 60 chars>",
  "data": "<data no formato DD/MM/YYYY>",
  "categoria": "<uma de: ${catList}>",
  "subcategoria": "<subcategoria específica, ex: Mercado, Delivery, Uber, Netflix, Aluguel/Financiamento, etc>"
}
Se não encontrar alguma informação, use null para o campo.`;

  const content = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: prompt },
      ]
    : [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: prompt },
      ];

  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'anthropic-dangerous-direct-browser-calls': 'true',
  };
  if (isPdf) headers['anthropic-beta'] = 'pdfs-2024-09-25';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erro ${res.status}`);
  }

  const data = await res.json();
  return parseAIResponse(data.content?.[0]?.text || '');
}

function parseAIResponse(text) {
  try {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* ignore */ }
  return {};
}

// ============================================================
// PROCESS & SHOW CONFIRM
// ============================================================
async function processAndConfirm(base64, mimeType, fileType, previewUrl) {
  state.currentBase64   = base64;
  state.currentMimeType = mimeType;
  state.currentFileType = fileType;

  if (!getApiKey()) {
    openModal('settings-modal');
    showToast('Configure sua chave da API primeiro', 'error');
    // Still open confirm with empty fields
    showConfirmModal({}, previewUrl, fileType);
    return;
  }

  showLoading(mimeType === 'application/pdf' ? 'Lendo boleto...' : 'Analisando cupom...');

  let extracted = {};
  try {
    extracted = await callClaude(base64, mimeType);
  } catch (err) {
    if (err.message === 'NO_API_KEY') {
      hideLoading();
      openModal('settings-modal');
      showToast('Configure sua chave da API', 'error');
      return;
    }
    showToast(`Erro na leitura: ${err.message}`, 'error');
  }

  hideLoading();
  showConfirmModal(extracted, previewUrl, fileType);
}

// ============================================================
// CONFIRM MODAL
// ============================================================
function showConfirmModal(data, previewUrl, fileType) {
  // Preview image
  const thumb = document.getElementById('preview-thumb');
  const img   = document.getElementById('preview-img');
  if (previewUrl && fileType !== 'pdf') {
    img.src = previewUrl;
    thumb.classList.remove('hidden');
  } else {
    thumb.classList.add('hidden');
  }

  // Fill fields
  document.getElementById('confirm-valor').value =
    data.valor != null ? String(data.valor) : '';
  document.getElementById('confirm-estabelecimento').value = data.estabelecimento || '';
  document.getElementById('confirm-data').value =
    data.data ? displayToISO(data.data) : todayISO();
  document.getElementById('confirm-subcategoria').value = data.subcategoria || '';

  // Person chips
  state.confirmPerson = 'João';
  setChips('person-chips', 'confirmPerson', 'João');

  // Category
  state.confirmCategory = data.categoria || null;
  renderCategoryGrid('category-grid', 'confirmCategory');

  openModal('confirm-modal');
}

function saveConfirmEntry() {
  const valor = parseFloat(document.getElementById('confirm-valor').value);
  const estab = document.getElementById('confirm-estabelecimento').value.trim();
  const data  = document.getElementById('confirm-data').value;
  const subcat = document.getElementById('confirm-subcategoria').value.trim();

  if (!valor || valor <= 0) { showToast('Informe um valor válido', 'error'); return; }
  if (!estab)               { showToast('Informe o estabelecimento', 'error'); return; }

  const entry = {
    id: uid(),
    valor,
    estabelecimento: estab,
    data,
    dataDisplay: isoToDisplay(data),
    categoria: state.confirmCategory || 'OUTROS',
    subcategoria: subcat || 'Outros',
    pessoa: state.confirmPerson,
    tipo: state.currentFileType || 'manual',
    ts: Date.now(),
  };

  state.entries.unshift(entry);
  saveEntries();
  closeModal('confirm-modal');
  renderRecent();
  updateSummary();
  showToast('Lançamento salvo! ✓', 'success');
}

// ============================================================
// MANUAL MODAL
// ============================================================
function showManualModal() {
  document.getElementById('manual-valor').value          = '';
  document.getElementById('manual-estabelecimento').value = '';
  document.getElementById('manual-data').value           = todayISO();
  document.getElementById('manual-subcategoria').value    = '';
  state.manualPerson   = 'João';
  state.manualCategory = null;
  setChips('manual-person-chips', 'manualPerson', 'João');
  renderCategoryGrid('manual-category-grid', 'manualCategory');
  state.currentFileType = 'manual';
  openModal('manual-modal');
}

function saveManualEntry() {
  const valor = parseFloat(document.getElementById('manual-valor').value);
  const estab = document.getElementById('manual-estabelecimento').value.trim();
  const data  = document.getElementById('manual-data').value;
  const subcat = document.getElementById('manual-subcategoria').value.trim();

  if (!valor || valor <= 0) { showToast('Informe um valor válido', 'error'); return; }
  if (!estab)               { showToast('Informe o estabelecimento', 'error'); return; }

  const entry = {
    id: uid(),
    valor,
    estabelecimento: estab,
    data,
    dataDisplay: isoToDisplay(data),
    categoria: state.manualCategory || 'OUTROS',
    subcategoria: subcat || 'Outros',
    pessoa: state.manualPerson,
    tipo: 'manual',
    ts: Date.now(),
  };

  state.entries.unshift(entry);
  saveEntries();
  closeModal('manual-modal');
  renderRecent();
  updateSummary();
  showToast('Lançamento salvo! ✓', 'success');
}

// ============================================================
// CATEGORY GRID
// ============================================================
function renderCategoryGrid(containerId, stateKey) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-btn' + (state[stateKey] === cat.id ? ' active' : '');
    btn.style.borderColor = state[stateKey] === cat.id ? cat.color : '';
    btn.style.background  = state[stateKey] === cat.id ? cat.bg : '';
    btn.innerHTML = `<span class="cat-dot" style="background:${cat.color}"></span>${cat.emoji} ${cat.label}`;
    btn.addEventListener('click', () => {
      state[stateKey] = cat.id;
      renderCategoryGrid(containerId, stateKey);
    });
    container.appendChild(btn);
  });
}

// ============================================================
// PERSON CHIPS
// ============================================================
function setChips(groupId, stateKey, defaultVal) {
  state[stateKey] = defaultVal;
  document.querySelectorAll(`#${groupId} .chip`).forEach(chip => {
    chip.classList.toggle('active', chip.dataset.person === defaultVal);
  });
}

function bindChips(groupId, stateKey) {
  document.getElementById(groupId).addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state[stateKey] = chip.dataset.person;
    document.querySelectorAll(`#${groupId} .chip`).forEach(c =>
      c.classList.toggle('active', c === chip)
    );
  });
}

// ============================================================
// ENTRY CARD
// ============================================================
function createEntryCard(entry) {
  const cat  = catById(entry.categoria);
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.setAttribute('role', 'listitem');
  card.innerHTML = `
    <div class="entry-cat-dot" style="background:${cat.bg}">
      <span>${cat.emoji}</span>
    </div>
    <div class="entry-body">
      <div class="entry-name">${entry.estabelecimento}</div>
      <div class="entry-meta">${entry.subcategoria} · ${entry.dataDisplay || entry.data}</div>
    </div>
    <div class="entry-right">
      <div class="entry-value">${fmtCurrencyShort(entry.valor)}</div>
      <div class="entry-person">${entry.pessoa}</div>
    </div>
    <span class="entry-type-badge">${TYPE_LABELS[entry.tipo] || entry.tipo}</span>
  `;
  return card;
}

// ============================================================
// RENDER RECENT
// ============================================================
function renderRecent() {
  const list  = document.getElementById('recent-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';

  const recents = state.entries.slice(0, 8);
  if (recents.length === 0) {
    if (empty) list.appendChild(empty);
    return;
  }
  if (empty) empty.remove();
  recents.forEach(e => list.appendChild(createEntryCard(e)));
}

// ============================================================
// RENDER HISTORY
// ============================================================
function renderHistory() {
  const month  = document.getElementById('filter-month').value;
  const person = document.getElementById('filter-person').value;
  const list   = document.getElementById('history-list');
  list.innerHTML = '';

  let filtered = state.entries.filter(e => {
    const mMatch = !month  || e.data.startsWith(month);
    const pMatch = !person || e.pessoa === person;
    return mMatch && pMatch;
  });

  if (filtered.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Nenhum lançamento encontrado.';
    list.appendChild(p);
    return;
  }
  filtered.forEach(e => list.appendChild(createEntryCard(e)));
}

function populateMonthFilter() {
  const sel = document.getElementById('filter-month');
  const months = [...new Set(state.entries.map(e => e.data.slice(0, 7)))].sort().reverse();
  sel.innerHTML = '<option value="">Todos os meses</option>';
  months.forEach(m => {
    const [y, mo] = m.split('-');
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `${MONTHS[parseInt(mo, 10) - 1]} ${y}`;
    sel.appendChild(opt);
  });
}

// ============================================================
// SUMMARY
// ============================================================
function updateSummary() {
  const cm = currentMonthISO();
  let joao = 0, maria = 0;
  state.entries.forEach(e => {
    if (!e.data.startsWith(cm)) return;
    if (e.pessoa === 'João')  joao  += e.valor;
    else if (e.pessoa === 'Maria') maria += e.valor;
  });
  document.getElementById('total-joao').textContent  = fmtCurrencyShort(joao);
  document.getElementById('total-maria').textContent = fmtCurrencyShort(maria);
  document.getElementById('total-mes').textContent   = fmtCurrencyShort(joao + maria);
}

// ============================================================
// CSV EXPORT
// ============================================================
function exportCSV() {
  if (state.entries.length === 0) {
    showToast('Nenhum lançamento para exportar', 'error');
    return;
  }

  const rows = [
    ['Data', 'Pessoa', 'Categoria', 'Subcategoria', 'Descricao', 'Tipo', 'Valor'].join(';'),
    ...state.entries.map(e => [
      e.dataDisplay || e.data,
      e.pessoa,
      e.categoria,
      e.subcategoria,
      `"${e.estabelecimento.replace(/"/g, '""')}"`,
      e.tipo,
      String(e.valor).replace('.', ','),
    ].join(';')),
  ].join('\r\n');

  const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `gastos_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV exportado com sucesso! 📥', 'success');
}

// ============================================================
// EVENT WIRING
// ============================================================
function wireEvents() {
  // --- Camera ---
  document.getElementById('camera-btn').addEventListener('click', () => {
    if (navigator.mediaDevices?.getUserMedia) {
      openCamera();
    } else {
      document.getElementById('camera-input').click();
    }
  });

  document.getElementById('camera-cancel').addEventListener('click', closeCamera);

  document.getElementById('capture-btn').addEventListener('click', capturePhoto);

  // Camera fallback file input
  document.getElementById('camera-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImageFile(file, 'foto');
    e.target.value = '';
  });

  // --- Gallery ---
  document.getElementById('gallery-btn').addEventListener('click', () => {
    document.getElementById('gallery-input').click();
  });
  document.getElementById('gallery-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImageFile(file, 'galeria');
    e.target.value = '';
  });

  // --- PDF ---
  document.getElementById('pdf-btn').addEventListener('click', () => {
    document.getElementById('pdf-input').click();
  });
  document.getElementById('pdf-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handlePdfFile(file);
    e.target.value = '';
  });

  // --- Manual ---
  document.getElementById('manual-btn').addEventListener('click', showManualModal);
  document.getElementById('manual-close').addEventListener('click', () => closeModal('manual-modal'));
  document.getElementById('save-manual').addEventListener('click', saveManualEntry);

  // Manual person chips
  bindChips('manual-person-chips', 'manualPerson');

  // --- Confirm ---
  document.getElementById('confirm-cancel').addEventListener('click', () => closeModal('confirm-modal'));
  document.getElementById('save-entry').addEventListener('click', saveConfirmEntry);
  bindChips('person-chips', 'confirmPerson');

  // --- Settings ---
  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('api-key-input').value = getApiKey();
    openModal('settings-modal');
  });
  document.getElementById('settings-close').addEventListener('click', () => closeModal('settings-modal'));
  document.getElementById('save-api-key').addEventListener('click', () => {
    const key = document.getElementById('api-key-input').value.trim();
    if (!key.startsWith('sk-')) { showToast('Chave inválida (deve começar com sk-)', 'error'); return; }
    setApiKey(key);
    checkApiBanner();
    closeModal('settings-modal');
    showToast('Chave salva! ✓', 'success');
  });
  document.getElementById('export-csv-settings').addEventListener('click', exportCSV);
  document.getElementById('clear-data').addEventListener('click', () => {
    if (!confirm('Apagar TODOS os lançamentos? Esta ação não pode ser desfeita.')) return;
    state.entries = [];
    saveEntries();
    renderRecent();
    updateSummary();
    closeModal('settings-modal');
    showToast('Dados apagados.', 'info');
  });

  // --- Bottom nav ---
  document.getElementById('nav-home').addEventListener('click', () => {
    document.getElementById('history-view').classList.add('hidden');
    document.getElementById('nav-home').classList.add('active');
    document.getElementById('nav-history').classList.remove('active');
  });
  document.getElementById('nav-history').addEventListener('click', showHistoryView);
  document.getElementById('nav-export').addEventListener('click', exportCSV);

  document.getElementById('view-all-btn').addEventListener('click', showHistoryView);
  document.getElementById('history-back').addEventListener('click', () => {
    document.getElementById('history-view').classList.add('hidden');
    document.getElementById('nav-home').classList.add('active');
    document.getElementById('nav-history').classList.remove('active');
  });

  // History filters
  document.getElementById('filter-month').addEventListener('change', renderHistory);
  document.getElementById('filter-person').addEventListener('change', renderHistory);

  // API banner click
  document.getElementById('api-banner').addEventListener('click', () => {
    document.getElementById('api-key-input').value = getApiKey();
    openModal('settings-modal');
  });

  // Dismiss modals on backdrop click
  ['confirm-modal', 'manual-modal', 'settings-modal'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target === document.getElementById(id)) closeModal(id);
    });
  });
}

// ============================================================
// FILE HANDLERS
// ============================================================
async function handleImageFile(file, fileType) {
  try {
    let dataUrl = await fileToDataURL(file);
    dataUrl     = await resizeImageDataURL(dataUrl);
    const base64   = dataUrl.split(',')[1];
    const mimeType = 'image/jpeg';
    await processAndConfirm(base64, mimeType, fileType, dataUrl);
  } catch (err) {
    showToast('Erro ao processar imagem', 'error');
  }
}

async function handlePdfFile(file) {
  if (file.size > 5 * 1024 * 1024) {
    showToast('PDF muito grande (máx. 5MB)', 'error');
    return;
  }
  try {
    const dataUrl = await fileToDataURL(file);
    const base64  = dataUrl.split(',')[1];
    await processAndConfirm(base64, 'application/pdf', 'pdf', null);
  } catch (err) {
    showToast('Erro ao processar PDF', 'error');
  }
}

// ============================================================
// HISTORY VIEW
// ============================================================
function showHistoryView() {
  populateMonthFilter();
  renderHistory();
  document.getElementById('history-view').classList.remove('hidden');
  document.getElementById('nav-history').classList.add('active');
  document.getElementById('nav-home').classList.remove('active');
}

// ============================================================
// API BANNER
// ============================================================
function checkApiBanner() {
  const banner = document.getElementById('api-banner');
  if (!getApiKey()) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ============================================================
// SERVICE WORKER
// ============================================================
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {/* ignore */});
  }
}

// ============================================================
// INIT
// ============================================================
function init() {
  loadEntries();
  document.getElementById('month-label').textContent = currentMonthLabel();
  updateSummary();
  renderRecent();
  checkApiBanner();
  wireEvents();
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
