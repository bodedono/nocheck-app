'use client'

import { useEffect, useState, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { FieldRenderer } from '@/components/fields/FieldRenderer'
import Link from 'next/link'
import {
  FiArrowLeft,
  FiSend,
  FiCheckCircle,
  FiAlertCircle,
  FiCloudOff,
} from 'react-icons/fi'
import type { ChecklistTemplate, TemplateField, Store } from '@/types/database'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, ThemeToggle } from '@/components/ui'
import { processarValidacaoCruzada } from '@/lib/crossValidation'
import { saveOfflineChecklist } from '@/lib/offlineStorage'
import { getTemplatesCache, getStoresCache, getTemplateFieldsCache, getAuthCache } from '@/lib/offlineCache'

type TemplateWithFields = ChecklistTemplate & {
  fields: TemplateField[]
}

// Função para fazer upload de imagem para o Supabase Storage
async function uploadPhoto(base64Image: string, fileName: string): Promise<string | null> {
  try {
    console.log('[Upload] Iniciando upload para Supabase:', fileName)
    console.log('[Upload] Tamanho da imagem:', Math.round(base64Image.length / 1024), 'KB')

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Image,
        fileName,
      }),
    })

    const result = await response.json()
    console.log('[Upload] Resposta da API:', result)

    if (!response.ok) {
      console.error('[Upload] Erro HTTP:', response.status, result)
      return null
    }

    if (result.success && result.url) {
      console.log('[Upload] Sucesso! URL:', result.url)
      return result.url
    }

    console.error('[Upload] Falha no upload:', result.error || 'sem URL')
    return null
  } catch (err) {
    console.error('[Upload] Erro de rede:', err)
    return null
  }
}

function ChecklistForm() {
  const searchParams = useSearchParams()
  const templateId = searchParams.get('template')
  const storeId = searchParams.get('store')

  const [template, setTemplate] = useState<TemplateWithFields | null>(null)
  const [store, setStore] = useState<Store | null>(null)
  const [responses, setResponses] = useState<Record<number, unknown>>({})
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const fetchData = async () => {
      if (!templateId || !storeId) {
        router.push(APP_CONFIG.routes.dashboard)
        return
      }

      // Se offline, carrega do cache
      if (!navigator.onLine) {
        console.log('[Checklist] Modo offline - carregando do cache')
        await loadFromCache()
        return
      }

      // Fetch template
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: templateData } = await (supabase as any)
        .from('checklist_templates')
        .select(`
          *,
          fields:template_fields(*)
        `)
        .eq('id', templateId)
        .single()

      if (templateData) {
        // Sort fields by sort_order
        const tData = templateData as TemplateWithFields
        tData.fields.sort((a: TemplateField, b: TemplateField) =>
          (a.sort_order || 0) - (b.sort_order || 0)
        )
        setTemplate(tData)
      }

      // Fetch store
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: storeData } = await (supabase as any)
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .single()

      if (storeData) {
        setStore(storeData as Store)
      }

      setLoading(false)
    }

    // Carrega dados do cache quando offline
    const loadFromCache = async () => {
      try {
        // Carrega templates do cache
        const cachedTemplates = await getTemplatesCache()
        const cachedTemplate = cachedTemplates.find(t => t.id === Number(templateId))

        if (cachedTemplate) {
          // Carrega campos do template
          const cachedFields = await getTemplateFieldsCache(Number(templateId))
          cachedFields.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

          setTemplate({
            ...cachedTemplate,
            fields: cachedFields,
          } as TemplateWithFields)
        }

        // Carrega lojas do cache
        const cachedStores = await getStoresCache()
        const cachedStore = cachedStores.find(s => s.id === Number(storeId))

        if (cachedStore) {
          setStore(cachedStore as Store)
        }

        setLoading(false)
      } catch (error) {
        console.error('[Checklist] Erro ao carregar cache:', error)
        setLoading(false)
      }
    }

    fetchData()
  }, [templateId, storeId, supabase, router])

  const updateResponse = (fieldId: number, value: unknown) => {
    setResponses(prev => ({ ...prev, [fieldId]: value }))
    // Clear error when user fills the field
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[fieldId]
        return newErrors
      })
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<number, string> = {}

    template?.fields.forEach(field => {
      if (field.is_required) {
        const value = responses[field.id]
        if (value === undefined || value === null || value === '' ||
            (Array.isArray(value) && value.length === 0)) {
          newErrors[field.id] = 'Este campo é obrigatório'
        }
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const [savedOffline, setSavedOffline] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      // Scroll to first error
      const firstErrorId = Object.keys(errors)[0]
      document.getElementById(`field-${firstErrorId}`)?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    setSubmitting(true)

    // Get current user - tenta online primeiro, depois cache
    let userId: string | null = null

    try {
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id || null
    } catch {
      // Se falhar (offline), tenta o cache
      console.log('[Checklist] Falha ao obter user online, tentando cache...')
    }

    // Se não conseguiu online, tenta o cache
    if (!userId) {
      const cachedAuth = await getAuthCache()
      userId = cachedAuth?.userId || null
      console.log('[Checklist] UserId do cache:', userId)
    }

    if (!userId) {
      setErrors({ 0: 'Usuário não autenticado. Faça login novamente.' })
      setSubmitting(false)
      return
    }

    try {

      // Prepare response data (e faz upload das fotos para o Drive)
      const responseDataPromises = Object.entries(responses).map(async ([fieldId, value]) => {
        const field = template?.fields.find(f => f.id === Number(fieldId))
        if (!field) return null

        let valueText = null
        let valueNumber = null
        let valueJson = null

        if (field.field_type === 'number' || field.field_type === 'calculated') {
          valueNumber = value as number
        } else if (field.field_type === 'photo') {
          // Upload das fotos para o Google Drive
          const photos = value as string[]
          console.log('[Checklist] Campo foto encontrado:', field.name, '- Fotos:', photos?.length || 0)

          if (photos && photos.length > 0) {
            // Sempre tenta fazer upload, independente do status de navigator.onLine
            // porque o PWA às vezes reporta offline incorretamente
            const uploadedUrls: string[] = []
            for (let i = 0; i < photos.length; i++) {
              const timestamp = Date.now()
              const fileName = `checklist_${timestamp}_foto_${i + 1}.jpg`
              console.log('[Checklist] Fazendo upload da foto', i + 1, 'de', photos.length)

              try {
                const url = await uploadPhoto(photos[i], fileName)
                if (url) {
                  uploadedUrls.push(url)
                  console.log('[Checklist] Upload OK:', url.substring(0, 50) + '...')
                } else {
                  // Se falhar upload, mantém o base64 como fallback
                  console.log('[Checklist] Upload falhou, salvando base64')
                  uploadedUrls.push(photos[i])
                }
              } catch (uploadErr) {
                console.error('[Checklist] Erro no upload:', uploadErr)
                uploadedUrls.push(photos[i])
              }
            }
            valueJson = { photos: uploadedUrls, uploadedToDrive: uploadedUrls.some(u => u.startsWith('http')) }
            console.log('[Checklist] Resultado do upload:', uploadedUrls.some(u => u.startsWith('http')) ? 'Drive' : 'Base64')
          } else {
            valueJson = { photos: value || [], uploadedToDrive: false }
          }
        } else if (
          field.field_type === 'checkbox_multiple' ||
          field.field_type === 'gps' ||
          field.field_type === 'signature'
        ) {
          valueJson = value
        } else {
          valueText = value as string
        }

        return {
          fieldId: Number(fieldId),
          valueText,
          valueNumber,
          valueJson,
        }
      })

      const responseData = (await Promise.all(responseDataPromises)).filter(Boolean) as Array<{ fieldId: number; valueText: string | null; valueNumber: number | null; valueJson: unknown }>

      // Check if offline - save locally
      if (!navigator.onLine) {
        await saveOfflineChecklist({
          templateId: Number(templateId),
          storeId: Number(storeId),
          sectorId: null,
          userId: userId,
          responses: responseData,
        })

        setSavedOffline(true)
        setSuccess(true)

        // Redirect after 2 seconds
        setTimeout(() => {
          router.push(APP_CONFIG.routes.dashboard)
        }, 2000)
        return
      }

      // Online - submit normally
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: checklist, error: checklistError } = await (supabase as any)
        .from('checklists')
        .insert({
          template_id: Number(templateId),
          store_id: Number(storeId),
          status: 'concluido',
          created_by: userId,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (checklistError) throw checklistError

      // Create responses for database
      const responseRows = responseData.map(r => ({
        checklist_id: checklist.id,
        field_id: r.fieldId,
        value_text: r.valueText,
        value_number: r.valueNumber,
        value_json: r.valueJson,
        answered_by: userId,
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: responsesError } = await (supabase as any)
        .from('checklist_responses')
        .insert(responseRows)

      if (responsesError) throw responsesError

      // Log activity
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('activity_logs').insert({
        store_id: Number(storeId),
        user_id: userId,
        checklist_id: checklist.id,
        action: 'checklist_concluido',
        details: { template_name: template?.name },
      })

      // Processar validacao cruzada (se for checklist de recebimento)
      await processarValidacaoCruzada(
        supabase,
        checklist.id,
        Number(templateId),
        Number(storeId),
        userId,
        responseRows.map(r => ({ field_id: r.field_id, value_text: r.value_text, value_number: r.value_number, value_json: r.value_json })),
        template?.fields || []
      )

      setSuccess(true)

      // Redirect after 2 seconds
      setTimeout(() => {
        router.push(APP_CONFIG.routes.dashboard)
      }, 2000)

    } catch (err) {
      console.error('Error submitting checklist:', err)

      // If error, try to save offline
      try {
        if (userId) {
          const responseData = Object.entries(responses).map(([fieldId, value]) => {
            const field = template?.fields.find(f => f.id === Number(fieldId))
            if (!field) return null

            let valueText = null
            let valueNumber = null
            let valueJson = null

            if (field.field_type === 'number' || field.field_type === 'calculated') {
              valueNumber = value as number
            } else if (['photo', 'checkbox_multiple', 'gps', 'signature'].includes(field.field_type)) {
              valueJson = value
            } else {
              valueText = value as string
            }

            return { fieldId: Number(fieldId), valueText, valueNumber, valueJson }
          }).filter(Boolean) as Array<{ fieldId: number; valueText: string | null; valueNumber: number | null; valueJson: unknown }>

          await saveOfflineChecklist({
            templateId: Number(templateId),
            storeId: Number(storeId),
            sectorId: null,
            userId: userId,
            responses: responseData,
          })

          setSavedOffline(true)
          setSuccess(true)
          setTimeout(() => router.push(APP_CONFIG.routes.dashboard), 2000)
          return
        }
      } catch (offlineErr) {
        console.error('[Checklist] Erro ao salvar offline:', offlineErr)
      }

      setErrors({ 0: err instanceof Error ? err.message : APP_CONFIG.messages.error })
      setSubmitting(false)
    }
  }

  if (loading) {
    return <LoadingPage />
  }

  if (!template || !store) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-center">
          <FiAlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-main">Checklist não encontrado</p>
          <Link href={APP_CONFIG.routes.dashboard} className="text-primary mt-4 inline-block hover:underline">
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${savedOffline ? 'bg-warning/20' : 'bg-primary/20'}`}>
            {savedOffline ? (
              <FiCloudOff className="w-10 h-10 text-warning" />
            ) : (
              <FiCheckCircle className="w-10 h-10 text-primary" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-main mb-2">
            {savedOffline ? 'Salvo Offline' : APP_CONFIG.messages.checklistSent}
          </h2>
          <p className="text-muted">
            {savedOffline
              ? 'O checklist será enviado quando você estiver online.'
              : APP_CONFIG.messages.redirecting}
          </p>
        </div>
      </div>
    )
  }

  const progress = template.fields.length > 0
    ? Math.round((Object.keys(responses).filter(k => {
        const v = responses[Number(k)]
        return v !== undefined && v !== null && v !== '' &&
          !(Array.isArray(v) && v.length === 0)
      }).length / template.fields.length) * 100)
    : 0

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <header className="bg-surface border-b border-subtle sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href={APP_CONFIG.routes.dashboard}
                className="p-2 text-secondary hover:text-main hover:bg-surface-hover rounded-lg transition-colors"
              >
                <FiArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-lg font-bold text-main line-clamp-1">{template.name}</h1>
                <p className="text-xs text-muted">{store.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="text-right">
                <p className="text-sm font-medium text-primary">{progress}%</p>
                <p className="text-xs text-muted">completo</p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-surface-hover -mx-4 sm:-mx-6 lg:-mx-8">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {template.fields.map((field, index) => (
            <div
              key={field.id}
              id={`field-${field.id}`}
              className={`card p-6 transition-all ${
                errors[field.id]
                  ? 'border-red-500/50'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-4 text-sm text-muted">
                <span className="w-6 h-6 rounded-full bg-surface-hover flex items-center justify-center text-xs">
                  {index + 1}
                </span>
                <span>de {template.fields.length}</span>
              </div>

              <FieldRenderer
                field={field}
                value={responses[field.id]}
                onChange={(value) => updateResponse(field.id, value)}
                error={errors[field.id]}
              />
            </div>
          ))}

          {/* Global Error */}
          {errors[0] && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-400">{errors[0]}</p>
            </div>
          )}

          {/* Submit */}
          <div className="sticky bottom-4">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-4 text-base font-semibold rounded-2xl shadow-theme-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <FiSend className="w-5 h-5" />
                  Enviar Checklist
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

export default function NovoChecklistPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <ChecklistForm />
    </Suspense>
  )
}
