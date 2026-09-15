/**
 * Personal OS — camada de dados (IndexedDB)
 *
 * Este arquivo é a ÚNICA parte do sistema que fala diretamente com o
 * IndexedDB. Nenhuma tela deve chamar indexedDB.* diretamente — sempre
 * passar por aqui. Isso é o que permite trocar a implementação de
 * armazenamento no futuro sem reescrever a interface.
 *
 * Schema V1 — personalOS
 */

const DB_NAME = 'personalOS';
const DB_VERSION = 1;
export const SCHEMA_VERSION = 1; // usado no backup/export (Fase 7)

const TRASH_RETENTION_DAYS = 30;

let dbInstance = null;

/**
 * Abre (ou cria) o banco. Idempotente — chamadas seguintes reutilizam
 * a mesma conexão.
 */
export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // tasks
      if (!db.objectStoreNames.contains('tasks')) {
        const store = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
        store.createIndex('state', 'state');
        store.createIndex('bucket', 'bucket');
        store.createIndex('dueDate', 'dueDate');
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('recurrenceRuleId', 'recurrenceRuleId');
      }

      // recurrence_rules
      if (!db.objectStoreNames.contains('recurrence_rules')) {
        const store = db.createObjectStore('recurrence_rules', { keyPath: 'id', autoIncrement: true });
        store.createIndex('active', 'active');
      }

      // habits
      if (!db.objectStoreNames.contains('habits')) {
        const store = db.createObjectStore('habits', { keyPath: 'id', autoIncrement: true });
        store.createIndex('active', 'active');
      }

      // habit_logs — fonte única de verdade da execução diária.
      // Chave única (habitId, date): nunca pode existir mais de um
      // registro do mesmo hábito na mesma data.
      if (!db.objectStoreNames.contains('habit_logs')) {
        const store = db.createObjectStore('habit_logs', { keyPath: 'id', autoIncrement: true });
        store.createIndex('habitId', 'habitId');
        store.createIndex('habitId_date', ['habitId', 'date'], { unique: true });
      }

      // routines
      if (!db.objectStoreNames.contains('routines')) {
        const store = db.createObjectStore('routines', { keyPath: 'id', autoIncrement: true });
        store.createIndex('period', 'period');
        store.createIndex('active', 'active');
      }

      // routine_items — nunca guarda estado de execução, só referências
      if (!db.objectStoreNames.contains('routine_items')) {
        const store = db.createObjectStore('routine_items', { keyPath: 'id', autoIncrement: true });
        store.createIndex('routineId', 'routineId');
      }

      // captures — inbox universal
      if (!db.objectStoreNames.contains('captures')) {
        const store = db.createObjectStore('captures', { keyPath: 'id', autoIncrement: true });
        store.createIndex('resolvedAs', 'resolvedAs');
        store.createIndex('createdAt', 'createdAt');
      }

      // purchases
      if (!db.objectStoreNames.contains('purchases')) {
        const store = db.createObjectStore('purchases', { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status');
      }

      // transactions — financeiro
      if (!db.objectStoreNames.contains('transactions')) {
        const store = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date');
        store.createIndex('type', 'type');
      }

      // ideas
      if (!db.objectStoreNames.contains('ideas')) {
        const store = db.createObjectStore('ideas', { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
      }

      // plans
      if (!db.objectStoreNames.contains('plans')) {
        const store = db.createObjectStore('plans', { keyPath: 'id', autoIncrement: true });
        store.createIndex('achieved', 'achieved');
      }

      // settings — key/value simples
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // activity_log — só auditoria, nunca fonte de verdade
      if (!db.objectStoreNames.contains('activity_log')) {
        const store = db.createObjectStore('activity_log', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('entityId', 'entityId');
      }

      // trash — exclusão lógica, retenção de 30 dias
      if (!db.objectStoreNames.contains('trash')) {
        const store = db.createObjectStore('trash', { keyPath: 'id', autoIncrement: true });
        store.createIndex('deletedAt', 'deletedAt');
        store.createIndex('entityType', 'entityType');
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// ---------------------------------------------------------------------
// CRUD genérico
// ---------------------------------------------------------------------

function tx(db, storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function add(storeName, obj) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, storeName, 'readwrite');
    const req = store.add(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(storeName, obj) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, storeName, 'readwrite');
    const req = store.put(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, storeName, 'readonly');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, storeName, 'readonly');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, storeName, 'readonly');
    const req = store.index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function remove(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, storeName, 'readwrite');
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function count(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, storeName, 'readonly');
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------
// habit_logs — upsert obrigatório, nunca insert solto (regra da spec)
// ---------------------------------------------------------------------

/**
 * Marca ou desmarca um hábito numa data específica.
 * Faz upsert real: se já existe log pra (habitId, date), atualiza;
 * senão, cria. Nunca gera duas linhas pro mesmo hábito no mesmo dia,
 * não importa se o toque veio da tela de Hábitos ou de dentro de uma rotina.
 */
export async function upsertHabitLog(habitId, date, completed) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'habit_logs', 'readwrite');
    const index = store.index('habitId_date');
    const lookup = index.get([habitId, date]);

    lookup.onsuccess = () => {
      const existing = lookup.result;
      const record = existing
        ? { ...existing, completed, completedAt: completed ? new Date().toISOString() : null }
        : { habitId, date, completed, completedAt: completed ? new Date().toISOString() : null };

      const writeReq = store.put(record);
      writeReq.onsuccess = () => resolve(writeReq.result);
      writeReq.onerror = () => reject(writeReq.error);
    };
    lookup.onerror = () => reject(lookup.error);
  });
}

export async function getHabitLog(habitId, date) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'habit_logs', 'readonly');
    const req = store.index('habitId_date').get([habitId, date]);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------
// Lixeira — exclusão lógica, nunca exclusão direta de entidade referenciável
// ---------------------------------------------------------------------

/**
 * Move um registro pra lixeira: guarda snapshot completo, remove da
 * coleção ativa. As duas operações acontecem numa única transação —
 * ou as duas persistem, ou nenhuma. Referências existentes (ex:
 * routine_item apontando pra esse id) não são tocadas — ficam
 * "quebradas" até restauração ou remoção manual, como definido na
 * especificação.
 */
export async function moveToTrash(entityType, entityId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['trash', entityType], 'readwrite');
    const sourceStore = transaction.objectStore(entityType);
    const trashStore = transaction.objectStore('trash');
    let trashId = null;

    const getReq = sourceStore.get(entityId);
    getReq.onsuccess = () => {
      const original = getReq.result;
      if (!original) return; // transação conclui sem nenhuma escrita

      const addReq = trashStore.add({
        entityType,
        entityId,
        entitySnapshot: original,
        deletedAt: new Date().toISOString(),
      });
      addReq.onsuccess = () => {
        trashId = addReq.result;
        sourceStore.delete(entityId);
      };
    };

    transaction.oncomplete = () => resolve(trashId);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function restoreFromTrash(trashId) {
  const db = await openDB();
  const trashEntry = await get('trash', trashId);
  if (!trashEntry) return false;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([trashEntry.entityType, 'trash'], 'readwrite');
    transaction.objectStore(trashEntry.entityType).put(trashEntry.entitySnapshot);
    transaction.objectStore('trash').delete(trashId);

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * Purga permanente de itens com mais de 30 dias na lixeira.
 * Deve ser chamada uma vez ao abrir o app.
 */
export async function purgeOldTrash() {
  const all = await getAll('trash');
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const expired = all.filter((entry) => new Date(entry.deletedAt).getTime() < cutoff);
  for (const entry of expired) {
    await remove('trash', entry.id);
  }
  return expired.length;
}

// ---------------------------------------------------------------------
// settings — helpers simples de key/value
// ---------------------------------------------------------------------

export async function getSetting(key, fallback = null) {
  const record = await get('settings', key);
  return record ? record.value : fallback;
}

export async function setSetting(key, value) {
  return put('settings', { key, value });
}

// ---------------------------------------------------------------------
// activity_log — auditoria, nunca fonte de verdade de estado
// ---------------------------------------------------------------------

export async function logActivity(entityType, entityId, action) {
  return add('activity_log', {
    entityType,
    entityId,
    action,
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------
// Diagnóstico — usado na tela "Mais" pra validar que o schema abriu certo
// ---------------------------------------------------------------------

const ALL_STORES = [
  'tasks', 'recurrence_rules', 'habits', 'habit_logs', 'routines',
  'routine_items', 'captures', 'purchases', 'transactions', 'ideas',
  'plans', 'settings', 'activity_log', 'trash',
];

export async function getStoreCounts() {
  const counts = {};
  for (const storeName of ALL_STORES) {
    counts[storeName] = await count(storeName);
  }
  return counts;
}
