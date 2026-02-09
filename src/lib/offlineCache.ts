/**
 * Sistema de Cache Offline Completo
 * Armazena todos os dados necessarios para funcionamento 100% offline
 */

import type { User, Store, ChecklistTemplate, TemplateField, Sector, FunctionRow } from '@/types/database'

const DB_NAME = 'nocheck-cache'
const DB_VERSION = 3

// Stores do IndexedDB
const STORES = {
  AUTH: 'auth_cache',
  USER: 'user_cache',
  STORES: 'stores_cache',
  TEMPLATES: 'templates_cache',
  TEMPLATE_FIELDS: 'template_fields_cache',
  USER_ROLES: 'user_roles_cache',
  SECTORS: 'sectors_cache',
  FUNCTIONS: 'functions_cache',
  SYNC_META: 'sync_metadata',
} as const

// Tipos para os dados cacheados
export type CachedAuth = {
  id: 'current'
  userId: string
  email: string
  accessToken: string
  refreshToken: string
  expiresAt: number
  cachedAt: string
}

export type CachedUser = User & {
  cachedAt: string
}

export type CachedStore = Store & {
  cachedAt: string
}

export type CachedTemplate = ChecklistTemplate & {
  cachedAt: string
}

export type CachedTemplateField = TemplateField & {
  cachedAt: string
}

export type CachedSector = Sector & {
  cachedAt: string
}

export type CachedFunction = FunctionRow & {
  cachedAt: string
}

export type SyncMetadata = {
  id: string
  lastSyncAt: string
  syncStatus: 'success' | 'partial' | 'failed'
}

let db: IDBDatabase | null = null

/**
 * Inicializa o banco de dados IndexedDB
 */
export async function initOfflineCache(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.error('[OfflineCache] Erro ao abrir banco:', request.error)
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      console.log('[OfflineCache] Banco aberto com sucesso')
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      // Auth cache - armazena sessao do usuario
      if (!database.objectStoreNames.contains(STORES.AUTH)) {
        database.createObjectStore(STORES.AUTH, { keyPath: 'id' })
      }

      // User cache
      if (!database.objectStoreNames.contains(STORES.USER)) {
        database.createObjectStore(STORES.USER, { keyPath: 'id' })
      }

      // Stores cache
      if (!database.objectStoreNames.contains(STORES.STORES)) {
        database.createObjectStore(STORES.STORES, { keyPath: 'id' })
      }

      // Templates cache
      if (!database.objectStoreNames.contains(STORES.TEMPLATES)) {
        database.createObjectStore(STORES.TEMPLATES, { keyPath: 'id' })
      }

      // Template fields cache
      if (!database.objectStoreNames.contains(STORES.TEMPLATE_FIELDS)) {
        const store = database.createObjectStore(STORES.TEMPLATE_FIELDS, { keyPath: 'id' })
        store.createIndex('template_id', 'template_id', { unique: false })
      }

      // User roles cache
      if (!database.objectStoreNames.contains(STORES.USER_ROLES)) {
        const store = database.createObjectStore(STORES.USER_ROLES, { keyPath: 'id' })
        store.createIndex('user_id', 'user_id', { unique: false })
        store.createIndex('store_id', 'store_id', { unique: false })
      }

      // Sectors cache
      if (!database.objectStoreNames.contains(STORES.SECTORS)) {
        const store = database.createObjectStore(STORES.SECTORS, { keyPath: 'id' })
        store.createIndex('store_id', 'store_id', { unique: false })
      }

      // Functions cache
      if (!database.objectStoreNames.contains(STORES.FUNCTIONS)) {
        database.createObjectStore(STORES.FUNCTIONS, { keyPath: 'id' })
      }

      // Sync metadata
      if (!database.objectStoreNames.contains(STORES.SYNC_META)) {
        database.createObjectStore(STORES.SYNC_META, { keyPath: 'id' })
      }

      console.log('[OfflineCache] Stores criados/atualizados')
    }
  })
}

// ============================================
// AUTH CACHE
// ============================================

export async function saveAuthCache(auth: Omit<CachedAuth, 'id' | 'cachedAt'>): Promise<void> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.AUTH], 'readwrite')
    const store = transaction.objectStore(STORES.AUTH)

    const data: CachedAuth = {
      ...auth,
      id: 'current',
      cachedAt: new Date().toISOString(),
    }

    const request = store.put(data)
    request.onsuccess = () => {
      console.log('[OfflineCache] Auth salvo')
      resolve()
    }
    request.onerror = () => reject(request.error)
  })
}

export async function getAuthCache(): Promise<CachedAuth | null> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.AUTH], 'readonly')
    const store = transaction.objectStore(STORES.AUTH)
    const request = store.get('current')

    request.onsuccess = () => {
      resolve(request.result || null)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function clearAuthCache(): Promise<void> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.AUTH], 'readwrite')
    const store = transaction.objectStore(STORES.AUTH)
    const request = store.delete('current')

    request.onsuccess = () => {
      console.log('[OfflineCache] Auth removido')
      resolve()
    }
    request.onerror = () => reject(request.error)
  })
}

// ============================================
// USER CACHE
// ============================================

export async function saveUserCache(user: User): Promise<void> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.USER], 'readwrite')
    const store = transaction.objectStore(STORES.USER)

    const data: CachedUser = {
      ...user,
      cachedAt: new Date().toISOString(),
    }

    const request = store.put(data)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getUserCache(userId: string): Promise<CachedUser | null> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.USER], 'readonly')
    const store = transaction.objectStore(STORES.USER)
    const request = store.get(userId)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

export async function getAllUsersCache(): Promise<CachedUser[]> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.USER], 'readonly')
    const store = transaction.objectStore(STORES.USER)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

// ============================================
// STORES CACHE
// ============================================

export async function saveStoresCache(stores: Store[]): Promise<void> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.STORES], 'readwrite')
    const store = transaction.objectStore(STORES.STORES)

    // Limpa stores antigos e adiciona novos
    const clearRequest = store.clear()

    clearRequest.onsuccess = () => {
      const now = new Date().toISOString()
      let completed = 0

      if (stores.length === 0) {
        resolve()
        return
      }

      stores.forEach(s => {
        const data: CachedStore = { ...s, cachedAt: now }
        const addRequest = store.add(data)

        addRequest.onsuccess = () => {
          completed++
          if (completed === stores.length) resolve()
        }
        addRequest.onerror = () => reject(addRequest.error)
      })
    }

    clearRequest.onerror = () => reject(clearRequest.error)
  })
}

export async function getStoresCache(): Promise<CachedStore[]> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.STORES], 'readonly')
    const store = transaction.objectStore(STORES.STORES)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

// ============================================
// TEMPLATES CACHE
// ============================================

export async function saveTemplatesCache(templates: ChecklistTemplate[]): Promise<void> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.TEMPLATES], 'readwrite')
    const store = transaction.objectStore(STORES.TEMPLATES)

    const clearRequest = store.clear()

    clearRequest.onsuccess = () => {
      const now = new Date().toISOString()
      let completed = 0

      if (templates.length === 0) {
        resolve()
        return
      }

      templates.forEach(t => {
        const data: CachedTemplate = { ...t, cachedAt: now }
        const addRequest = store.add(data)

        addRequest.onsuccess = () => {
          completed++
          if (completed === templates.length) resolve()
        }
        addRequest.onerror = () => reject(addRequest.error)
      })
    }

    clearRequest.onerror = () => reject(clearRequest.error)
  })
}

export async function getTemplatesCache(): Promise<CachedTemplate[]> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.TEMPLATES], 'readonly')
    const store = transaction.objectStore(STORES.TEMPLATES)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

// ============================================
// TEMPLATE FIELDS CACHE
// ============================================

export async function saveTemplateFieldsCache(fields: TemplateField[]): Promise<void> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.TEMPLATE_FIELDS], 'readwrite')
    const store = transaction.objectStore(STORES.TEMPLATE_FIELDS)

    const clearRequest = store.clear()

    clearRequest.onsuccess = () => {
      const now = new Date().toISOString()
      let completed = 0

      if (fields.length === 0) {
        resolve()
        return
      }

      fields.forEach(f => {
        const data: CachedTemplateField = { ...f, cachedAt: now }
        const addRequest = store.add(data)

        addRequest.onsuccess = () => {
          completed++
          if (completed === fields.length) resolve()
        }
        addRequest.onerror = () => reject(addRequest.error)
      })
    }

    clearRequest.onerror = () => reject(clearRequest.error)
  })
}

export async function getTemplateFieldsCache(templateId: number): Promise<CachedTemplateField[]> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.TEMPLATE_FIELDS], 'readonly')
    const store = transaction.objectStore(STORES.TEMPLATE_FIELDS)
    const index = store.index('template_id')
    const request = index.getAll(templateId)

    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

// ============================================
// SECTORS CACHE
// ============================================

export async function saveSectorsCache(sectors: Sector[]): Promise<void> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.SECTORS], 'readwrite')
    const store = transaction.objectStore(STORES.SECTORS)

    const clearRequest = store.clear()

    clearRequest.onsuccess = () => {
      const now = new Date().toISOString()
      let completed = 0

      if (sectors.length === 0) {
        resolve()
        return
      }

      sectors.forEach(s => {
        const data: CachedSector = { ...s, cachedAt: now }
        const addRequest = store.add(data)

        addRequest.onsuccess = () => {
          completed++
          if (completed === sectors.length) resolve()
        }
        addRequest.onerror = () => reject(addRequest.error)
      })
    }

    clearRequest.onerror = () => reject(clearRequest.error)
  })
}

export async function getSectorsCache(storeId?: number): Promise<CachedSector[]> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.SECTORS], 'readonly')
    const store = transaction.objectStore(STORES.SECTORS)

    if (storeId !== undefined) {
      const index = store.index('store_id')
      const request = index.getAll(storeId)
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    } else {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    }
  })
}

// ============================================
// FUNCTIONS CACHE
// ============================================

export async function saveFunctionsCache(functions: FunctionRow[]): Promise<void> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.FUNCTIONS], 'readwrite')
    const store = transaction.objectStore(STORES.FUNCTIONS)

    const clearRequest = store.clear()

    clearRequest.onsuccess = () => {
      const now = new Date().toISOString()
      let completed = 0

      if (functions.length === 0) {
        resolve()
        return
      }

      functions.forEach(f => {
        const data: CachedFunction = { ...f, cachedAt: now }
        const addRequest = store.add(data)

        addRequest.onsuccess = () => {
          completed++
          if (completed === functions.length) resolve()
        }
        addRequest.onerror = () => reject(addRequest.error)
      })
    }

    clearRequest.onerror = () => reject(clearRequest.error)
  })
}

export async function getFunctionsCache(): Promise<CachedFunction[]> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.FUNCTIONS], 'readonly')
    const store = transaction.objectStore(STORES.FUNCTIONS)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

// ============================================
// SYNC METADATA
// ============================================

export async function saveSyncMetadata(key: string, status: SyncMetadata['syncStatus']): Promise<void> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.SYNC_META], 'readwrite')
    const store = transaction.objectStore(STORES.SYNC_META)

    const data: SyncMetadata = {
      id: key,
      lastSyncAt: new Date().toISOString(),
      syncStatus: status,
    }

    const request = store.put(data)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getSyncMetadata(key: string): Promise<SyncMetadata | null> {
  const database = await initOfflineCache()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.SYNC_META], 'readonly')
    const store = transaction.objectStore(STORES.SYNC_META)
    const request = store.get(key)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

// ============================================
// CLEAR ALL CACHE
// ============================================

export async function clearAllCache(): Promise<void> {
  const database = await initOfflineCache()

  const storeNames = Object.values(STORES)

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, 'readwrite')

    let completed = 0

    storeNames.forEach(storeName => {
      const store = transaction.objectStore(storeName)
      const request = store.clear()

      request.onsuccess = () => {
        completed++
        if (completed === storeNames.length) {
          console.log('[OfflineCache] Todo cache limpo')
          resolve()
        }
      }

      request.onerror = () => reject(request.error)
    })
  })
}

// ============================================
// CHECK IF HAS CACHED DATA
// ============================================

export async function hasCachedData(): Promise<boolean> {
  try {
    const auth = await getAuthCache()
    return auth !== null
  } catch {
    return false
  }
}

// ============================================
// CACHE ALL DATA FOR OFFLINE (chamado após login)
// ============================================

import { createClient } from './supabase'

/**
 * Cacheia todos os dados necessários para funcionamento offline
 * Deve ser chamado após login bem-sucedido
 */
export async function cacheAllDataForOffline(userId: string): Promise<void> {
  console.log('[OfflineCache] Iniciando cache de dados para offline...')

  try {
    const supabase = createClient()

    // 1. Salva auth
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await saveAuthCache({
        userId: session.user.id,
        email: session.user.email || '',
        accessToken: session.access_token,
        refreshToken: session.refresh_token || '',
        expiresAt: session.expires_at || 0,
      })
      console.log('[OfflineCache] Auth salvo')
    }

    // 2. Busca e salva perfil do usuário
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userData } = await (supabase as any)
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userData) {
      await saveUserCache(userData as User)
      console.log('[OfflineCache] Usuário salvo')
    }

    // 3. Busca e salva TODAS as lojas (não só ativas, para admin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: storesData } = await (supabase as any)
      .from('stores')
      .select('*')
      .order('name')

    if (storesData && storesData.length > 0) {
      await saveStoresCache(storesData as Store[])
      console.log('[OfflineCache] Lojas salvas:', storesData.length)
    }

    // 4. Busca e salva TODOS os templates (não só ativos, para admin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: templatesData } = await (supabase as any)
      .from('checklist_templates')
      .select('*')
      .order('name')

    if (templatesData && templatesData.length > 0) {
      await saveTemplatesCache(templatesData as ChecklistTemplate[])
      console.log('[OfflineCache] Templates salvos:', templatesData.length)
    }

    // 5. Busca e salva campos dos templates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fieldsData } = await (supabase as any)
      .from('template_fields')
      .select('*')
      .order('sort_order')

    if (fieldsData && fieldsData.length > 0) {
      await saveTemplateFieldsCache(fieldsData as TemplateField[])
      console.log('[OfflineCache] Campos salvos:', fieldsData.length)
    }

    // 6. Busca e salva setores
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sectorsData } = await (supabase as any)
      .from('sectors')
      .select('*')

    if (sectorsData && sectorsData.length > 0) {
      await saveSectorsCache(sectorsData as Sector[])
      console.log('[OfflineCache] Setores salvos:', sectorsData.length)
    }

    // 7. Busca e salva funções
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: functionsData } = await (supabase as any)
      .from('functions')
      .select('*')
      .eq('is_active', true)

    if (functionsData && functionsData.length > 0) {
      await saveFunctionsCache(functionsData as FunctionRow[])
      console.log('[OfflineCache] Funções salvas:', functionsData.length)
    }

    // 8. Se for admin, busca e salva TODOS os usuários
    if (userData?.is_admin) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: allUsersData } = await (supabase as any)
        .from('users')
        .select('*')
        .order('full_name')

      if (allUsersData && allUsersData.length > 0) {
        // Salva cada usuário no cache
        for (const user of allUsersData) {
          await saveUserCache(user as User)
        }
        console.log('[OfflineCache] Todos os usuários salvos:', allUsersData.length)
      }
    }

    // Salva metadata de sync
    await saveSyncMetadata('full_sync', 'success')

    console.log('[OfflineCache] Cache completo!')
  } catch (error) {
    console.error('[OfflineCache] Erro ao cachear dados:', error)
    await saveSyncMetadata('full_sync', 'failed')
  }
}
