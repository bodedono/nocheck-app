'use client'

import { createClient } from './supabase'
import {
  getPendingChecklists,
  updateChecklistStatus,
  deleteOfflineChecklist,
  type PendingChecklist,
} from './offlineStorage'
import { processarValidacaoCruzada } from './crossValidation'

/**
 * Aguarda um tempo antes de continuar
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Faz upload de uma imagem base64 para o Supabase Storage
 * Tenta até 3 vezes com intervalo de 2s entre tentativas
 */
async function uploadImageToStorage(base64Image: string, fileName: string): Promise<string | null> {
  const MAX_RETRIES = 3
  const RETRY_DELAY = 2000

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Sync] uploadImageToStorage - Tentativa ${attempt}/${MAX_RETRIES} de`, fileName)
      console.log('[Sync] uploadImageToStorage - Tamanho do base64:', base64Image.length, 'chars')

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Image,
          fileName,
        }),
      })

      console.log('[Sync] uploadImageToStorage - Response status:', response.status)
      const result = await response.json()
      console.log('[Sync] uploadImageToStorage - Response body:', JSON.stringify(result).substring(0, 200))

      if (response.ok && result.success && result.url) {
        console.log('[Sync] Upload de imagem OK:', fileName, '->', result.url.substring(0, 60))
        return result.url
      }

      console.error(`[Sync] Falha no upload (tentativa ${attempt}):`, result.error || 'Resposta inválida')
    } catch (err) {
      console.error(`[Sync] Erro de rede no upload (tentativa ${attempt}):`, err)
    }

    // Aguarda antes de tentar novamente (exceto na última tentativa)
    if (attempt < MAX_RETRIES) {
      console.log(`[Sync] Aguardando ${RETRY_DELAY}ms antes de tentar novamente...`)
      await delay(RETRY_DELAY)
    }
  }

  console.error('[Sync] Upload falhou após', MAX_RETRIES, 'tentativas:', fileName)
  return null
}

/**
 * Resultado do processamento de imagens
 */
type ProcessedResult = {
  responses: PendingChecklist['responses']
  allImagesUploaded: boolean
}

/**
 * Processa as respostas do checklist, fazendo upload das imagens base64
 * Retorna as respostas processadas e um flag indicando se TODAS as imagens foram enviadas
 */
async function processResponsesWithImages(
  responses: PendingChecklist['responses']
): Promise<ProcessedResult> {
  const processedResponses = []
  let allImagesUploaded = true
  console.log('[Sync] Processando', responses.length, 'respostas')

  for (const response of responses) {
    // Verifica se é um campo de foto com dados base64
    if (response.valueJson) {
      let photos: string[] | null = null

      // Formato correto: { photos: [...] }
      if (typeof response.valueJson === 'object' && !Array.isArray(response.valueJson)) {
        const json = response.valueJson as { photos?: string[]; uploadedToDrive?: boolean }
        if (json.photos && Array.isArray(json.photos)) {
          photos = json.photos
          console.log('[Sync] Campo de foto (objeto) com', photos.length, 'fotos')
        }
      }
      // Formato legado: array direto ['base64...', ...]
      else if (Array.isArray(response.valueJson)) {
        const arr = response.valueJson as unknown[]
        if (arr.length > 0 && typeof arr[0] === 'string') {
          // Verifica se parece ser foto (base64 ou URL)
          const first = arr[0] as string
          if (first.startsWith('data:image') || first.startsWith('http') || first.length > 1000) {
            photos = arr as string[]
            console.log('[Sync] Campo de foto (array legado) com', photos.length, 'fotos')
          }
        }
      }

      if (photos && photos.length > 0) {
        const uploadedUrls: string[] = []
        let hasUploaded = false

        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i]
          if (!photo || typeof photo !== 'string') {
            console.log('[Sync] Foto', i + 1, '- INVÁLIDA (não é string)')
            continue
          }

          const isUrl = photo.startsWith('http')
          const isBase64 = photo.startsWith('data:') || photo.length > 1000
          console.log('[Sync] Foto', i + 1, '- URL:', isUrl, '- Base64:', isBase64, '- Tamanho:', photo.length)

          // Se já é uma URL (já foi uploaded), mantém
          if (isUrl) {
            uploadedUrls.push(photo)
            hasUploaded = true
          } else if (isBase64) {
            // É base64, faz upload
            const timestamp = Date.now()
            const fileName = `sync_${timestamp}_foto_${i + 1}.jpg`
            console.log('[Sync] Tentando upload:', fileName)
            const url = await uploadImageToStorage(photo, fileName)

            if (url) {
              console.log('[Sync] Upload OK:', url.substring(0, 60))
              uploadedUrls.push(url)
              hasUploaded = true
            } else {
              // Upload falhou mesmo após retries - marca como falha
              console.error('[Sync] Upload FALHOU definitivamente para foto', i + 1)
              uploadedUrls.push(photo)
              allImagesUploaded = false
            }
          } else {
            console.log('[Sync] Foto ignorada (formato desconhecido)')
            uploadedUrls.push(photo)
          }
        }

        console.log('[Sync] Resultado: uploaded=', hasUploaded, 'allOk=', allImagesUploaded, 'urls=', uploadedUrls.length)
        processedResponses.push({
          ...response,
          valueJson: { photos: uploadedUrls, uploadedToDrive: hasUploaded },
        })
        continue
      }
    }

    processedResponses.push(response)
  }

  return { responses: processedResponses, allImagesUploaded }
}

let isSyncing = false
let syncListeners: Array<(status: SyncStatus) => void> = []

export type SyncStatus = {
  isSyncing: boolean
  pendingCount: number
  lastSyncAt: string | null
  lastError: string | null
}

let currentStatus: SyncStatus = {
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
}

/**
 * Subscribe to sync status changes
 */
export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncListeners.push(listener)
  listener(currentStatus) // Notify immediately with current status

  return () => {
    syncListeners = syncListeners.filter(l => l !== listener)
  }
}

/**
 * Notify all listeners of status change
 */
function notifyListeners() {
  syncListeners.forEach(listener => listener(currentStatus))
}

/**
 * Update sync status
 */
function updateStatus(updates: Partial<SyncStatus>) {
  currentStatus = { ...currentStatus, ...updates }
  notifyListeners()
}

/**
 * Sync a single checklist to the server
 */
async function syncChecklist(checklist: PendingChecklist): Promise<boolean> {
  const supabase = createClient()

  try {
    await updateChecklistStatus(checklist.id, 'syncing')

    // 0. Processa as respostas fazendo upload das imagens ANTES de criar o checklist
    console.log('[Sync] Processando imagens do checklist:', checklist.id)
    const { responses: processedResponses, allImagesUploaded } = await processResponsesWithImages(checklist.responses)

    if (!allImagesUploaded) {
      console.warn('[Sync] Algumas imagens falharam no upload, mas o checklist será sincronizado mesmo assim.')
    }

    // 1. Create the checklist record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newChecklist, error: checklistError } = await (supabase as any)
      .from('checklists')
      .insert({
        template_id: checklist.templateId,
        store_id: checklist.storeId,
        sector_id: checklist.sectorId,
        created_by: checklist.userId,
        status: 'concluido',
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (checklistError) throw checklistError

    // 2. Create responses (imagens podem ser URLs ou base64 se upload falhou)
    const responseRows = processedResponses.map(r => ({
      checklist_id: newChecklist.id,
      field_id: r.fieldId,
      value_text: r.valueText,
      value_number: r.valueNumber,
      value_json: r.valueJson,
    }))

    if (responseRows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: responsesError } = await (supabase as any)
        .from('checklist_responses')
        .insert(responseRows)

      if (responsesError) throw responsesError
    }

    // 2.5. If sectioned checklist, create checklist_sections entries
    if (checklist.sections && checklist.sections.length > 0) {
      const sectionRows = checklist.sections.map(s => ({
        checklist_id: newChecklist.id,
        section_id: s.sectionId,
        status: 'concluido',
        completed_at: s.completedAt || new Date().toISOString(),
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: sectionsError } = await (supabase as any)
        .from('checklist_sections')
        .insert(sectionRows)

      if (sectionsError) throw sectionsError
    }

    // 3. Log activity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('activity_log').insert({
      user_id: checklist.userId,
      store_id: checklist.storeId,
      checklist_id: newChecklist.id,
      action: 'checklist_synced',
      details: { synced_from: 'offline', original_date: checklist.createdAt },
    })

    // 4. Process cross validation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template } = await (supabase as any)
      .from('checklist_templates')
      .select('*, fields:template_fields(*)')
      .eq('id', checklist.templateId)
      .single()

    if (template) {
      await processarValidacaoCruzada(
        supabase,
        newChecklist.id,
        checklist.templateId,
        checklist.storeId,
        checklist.userId,
        processedResponses.map(r => ({
          field_id: r.fieldId,
          value_text: r.valueText,
          value_number: r.valueNumber,
          value_json: r.valueJson,
        })),
        template.fields || []
      )
    }

    // 5. Delete from offline storage
    await deleteOfflineChecklist(checklist.id)

    console.log('[Sync] Checklist synced successfully:', checklist.id)
    return true
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[Sync] Error syncing checklist:', err)
    await updateChecklistStatus(checklist.id, 'failed', errorMessage)
    return false
  }
}

/**
 * Sync all pending checklists
 */
export async function syncAll(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) {
    console.log('[Sync] Already syncing, skipping...')
    return { synced: 0, failed: 0 }
  }

  if (!navigator.onLine) {
    console.log('[Sync] Offline, skipping sync...')
    updateStatus({ lastError: 'Sem conexão com a internet' })
    return { synced: 0, failed: 0 }
  }

  isSyncing = true
  updateStatus({ isSyncing: true, lastError: null })

  const pending = await getPendingChecklists()
  const pendingOnly = pending.filter(c => c.syncStatus === 'pending' || c.syncStatus === 'failed')

  let synced = 0
  let failed = 0

  for (const checklist of pendingOnly) {
    const success = await syncChecklist(checklist)
    if (success) {
      synced++
    } else {
      failed++
    }
  }

  // Update pending count
  const remainingPending = await getPendingChecklists()

  isSyncing = false
  updateStatus({
    isSyncing: false,
    pendingCount: remainingPending.length,
    lastSyncAt: new Date().toISOString(),
    lastError: failed > 0 ? `${failed} checklist(s) falharam` : null,
  })

  console.log(`[Sync] Complete: ${synced} synced, ${failed} failed`)
  return { synced, failed }
}

/**
 * Initialize sync service - sets up online listener
 */
export function initSyncService(): () => void {
  let syncTimeout: ReturnType<typeof setTimeout> | null = null
  let retryTimeout: ReturnType<typeof setTimeout> | null = null

  // Sync when coming back online (com delay para rede estabilizar)
  const handleOnline = () => {
    console.log('[Sync] Back online, aguardando 3s para rede estabilizar...')
    if (syncTimeout) clearTimeout(syncTimeout)
    syncTimeout = setTimeout(async () => {
      console.log('[Sync] Iniciando sync após delay...')
      const result = await syncAll()

      // Se algum falhou (provavelmente imagens), tenta novamente após 15s
      if (result.failed > 0) {
        console.log('[Sync] Alguns falharam, agendando retry em 15s...')
        if (retryTimeout) clearTimeout(retryTimeout)
        retryTimeout = setTimeout(() => {
          console.log('[Sync] Retry automático...')
          syncAll()
        }, 15000)
      }
    }, 3000)
  }

  window.addEventListener('online', handleOnline)

  // Update pending count on init
  getPendingChecklists().then(pending => {
    updateStatus({ pendingCount: pending.length })
  })

  // Se já está online e tem pendentes, tenta sincronizar
  if (navigator.onLine) {
    getPendingChecklists().then(pending => {
      if (pending.length > 0) {
        console.log('[Sync] Online com', pending.length, 'pendentes, sincronizando...')
        syncAll()
      }
    })
  }

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline)
    if (syncTimeout) clearTimeout(syncTimeout)
    if (retryTimeout) clearTimeout(retryTimeout)
  }
}

/**
 * Get current sync status
 */
export function getSyncStatus(): SyncStatus {
  return currentStatus
}
