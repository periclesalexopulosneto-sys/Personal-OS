import { openDB, purgeOldTrash, getStoreCounts, SCHEMA_VERSION } from './db.js';
// (arquivo permanece na raiz do projeto, sem subpasta js/ — mais fácil de
// enviar pelo seletor de arquivos do iPhone, que não preserva pastas)

const TABS = ['hoje', 'tarefas', 'vida', 'mais'];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formattedDate() {
  const now = new Date();
  const formatted = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function renderHojeHeader() {
  document.getElementById('hoje-greeting').textContent = `${greeting()}, Péricles`;
  document.getElementById('hoje-date').textContent = formattedDate();
}

function showTab(name) {
  if (!TABS.includes(name)) name = 'hoje';

  for (const tab of TABS) {
    const screen = document.getElementById(`screen-${tab}`);
    const button = document.querySelector(`.tab-button[data-tab="${tab}"]`);
    const isActive = tab === name;
    screen.classList.toggle('screen--active', isActive);
    button.classList.toggle('tab-button--active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  }

  window.scrollTo(0, 0);
}

function wireTabBar() {
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      window.location.hash = tab;
    });
  });

  window.addEventListener('hashchange', () => {
    showTab(window.location.hash.replace('#', ''));
  });
}

async function renderDiagnostics() {
  const el = document.getElementById('diagnostics');
  try {
    const counts = await getStoreCounts();
    const rows = Object.entries(counts)
      .map(([store, n]) => `<div class="diag-row"><span>${store}</span><span>${n}</span></div>`)
      .join('');
    el.innerHTML = `
      <div class="diag-status diag-status--ok">Banco aberto — schema v${SCHEMA_VERSION}</div>
      ${rows}
    `;
  } catch (err) {
    el.innerHTML = `<div class="diag-status diag-status--error">Erro ao abrir o banco: ${err.message}</div>`;
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./service-worker.js');
  } catch (err) {
    console.error('Falha ao registrar service worker:', err);
  }
}

async function requestPersistentStorage() {
  if (!(navigator.storage && navigator.storage.persist)) return;
  try {
    await navigator.storage.persist();
  } catch {
    // Solicitação, não garantia — segue o fluxo normal se for negada.
  }
}

async function init() {
  renderHojeHeader();
  wireTabBar();
  showTab(window.location.hash.replace('#', '') || 'hoje');

  await registerServiceWorker();
  await requestPersistentStorage();

  await openDB();
  await purgeOldTrash();
  await renderDiagnostics();
}

document.addEventListener('DOMContentLoaded', init);
