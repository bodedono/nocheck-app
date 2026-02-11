/**
 * IndexedDB helper for offline storage
 */

const DB_NAME = 'nocheck-offline'
const DB_VERSION = 1
const STORE_NAME = 'pending_checklists'

type PendingChecklistSection = {
  sectionId: number
  status: 'pendente' | 'concluido'
  completedAt: string | null
  responses: Array<{
    fieldId: number
    valueText: string | null
    valueNumber: number | null
    valueJson: unknown
  }>
}

type PendingChecklist = {
  id: string // UUID local
  templateId: number
  storeId: number
  sectorId: number | null
  userId: string
  responses: Array<{
    fieldId: number
    valueText: string | null
    valueNumber: number | null
    valueJson: unknown
  }>
  createdAt: string
  syncStatus: 'pending' | 'syncing' | 'failed'
  errorMessage?: string
  // Suporte a checklists com etapas (offline)
  sections?: PendingChecklistSection[]
}

let db: IDBDatabase | null = null

/**
 * Initialize IndexedDB
 */
export async function initDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.error('[OfflineDB] Error opening database:', request.error)
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      console.log('[OfflineDB] Database opened successfully')
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      // Create object store for pending checklists
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('syncStatus', 'syncStatus', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
        console.log('[OfflineDB] Object store created')
      }
    }
  })
}

/**
 * Save a checklist to the offline queue
 */
export async function saveOfflineChecklist(checklist: Omit<PendingChecklist, 'id' | 'createdAt' | 'syncStatus'>): Promise<string> {
  const database = await initDB()

  const id = crypto.randomUUID()
  const pendingChecklist: PendingChecklist = {
    ...checklist,
    id,
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.add(pendingChecklist)

    request.onsuccess = () => {
      console.log('[OfflineDB] Checklist saved:', id)
      resolve(id)
    }

    request.onerror = () => {
      console.error('[OfflineDB] Error saving checklist:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Get all pending checklists
 */
export async function getPendingChecklists(): Promise<PendingChecklist[]> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      resolve(request.result as PendingChecklist[])
    }

    request.onerror = () => {
      console.error('[OfflineDB] Error getting checklists:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Get count of pending checklists
 */
export async function getPendingCount(): Promise<number> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('syncStatus')
    const request = index.count(IDBKeyRange.only('pending'))

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

/**
 * Update checklist sync status
 */
export async function updateChecklistStatus(
  id: string,
  status: PendingChecklist['syncStatus'],
  errorMessage?: string
): Promise<void> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const checklist = getRequest.result as PendingChecklist
      if (checklist) {
        checklist.syncStatus = status
        if (errorMessage) checklist.errorMessage = errorMessage

        const updateRequest = store.put(checklist)
        updateRequest.onsuccess = () => resolve()
        updateRequest.onerror = () => reject(updateRequest.error)
      } else {
        resolve()
      }
    }

    getRequest.onerror = () => reject(getRequest.error)
  })
}

/**
 * Delete a checklist from offline storage
 */
export async function deleteOfflineChecklist(id: string): Promise<void> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => {
      console.log('[OfflineDB] Checklist deleted:', id)
      resolve()
    }

    request.onerror = () => {
      console.error('[OfflineDB] Error deleting checklist:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Clear all offline data
 */
export async function clearOfflineData(): Promise<void> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => {
      console.log('[OfflineDB] All data cleared')
      resolve()
    }

    request.onerror = () => reject(request.error)
  })
}

/**
 * Get a single offline checklist by ID
 */
export async function getOfflineChecklist(id: string): Promise<PendingChecklist | null> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onsuccess = () => {
      resolve(request.result as PendingChecklist | null)
    }
    request.onerror = () => reject(request.error)
  })
}

/**
 * Update a section in an offline sectioned checklist
 */
export async function updateOfflineChecklistSection(
  checklistId: string,
  sectionId: number,
  responses: PendingChecklistSection['responses']
): Promise<void> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const getRequest = store.get(checklistId)

    getRequest.onsuccess = () => {
      const checklist = getRequest.result as PendingChecklist
      if (!checklist || !checklist.sections) {
        reject(new Error('Checklist ou secoes nao encontrados'))
        return
      }

      // Atualiza a secao
      checklist.sections = checklist.sections.map(s =>
        s.sectionId === sectionId
          ? { ...s, status: 'concluido' as const, completedAt: new Date().toISOString(), responses }
          : s
      )

      // Se todas as secoes estao concluidas, marca como pending para sync
      const allDone = checklist.sections.every(s => s.status === 'concluido')
      if (allDone) {
        // Consolida todas as responses das secoes no campo principal
        checklist.responses = checklist.sections.flatMap(s => s.responses)
        checklist.syncStatus = 'pending'
      }

      const updateRequest = store.put(checklist)
      updateRequest.onsuccess = () => {
        console.log('[OfflineDB] Section updated:', sectionId, allDone ? '(all done)' : '')
        resolve()
      }
      updateRequest.onerror = () => reject(updateRequest.error)
    }

    getRequest.onerror = () => reject(getRequest.error)
  })
}

export type { PendingChecklist, PendingChecklistSection }
