'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import { ReadOnlyFieldRenderer } from '@/components/fields/ReadOnlyFieldRenderer'
import type { TemplateField, GPSValue } from '@/types/database'
import {
  FiMapPin,
  FiUser,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiTag,
  FiLayers,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi'
import {
  getAuthCache,
  getUserCache,
  getChecklistsCache,
  getChecklistResponsesCache,
  getChecklistSectionsCache,
  getTemplateFieldsCache,
  getTemplateSectionsCache,
} from '@/lib/offlineCache'

type ChecklistDetail = {
  id: number
  template_id: number
  store_id: number
  sector_id: number | null
  status: string
  created_by: string
  started_at: string | null
  completed_at: string | null
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  created_at: string
  store: { id: number; name: string } | null
  sector: { id: number; name: string } | null
  user: { id: string; full_name: string } | null
  template: { id: number; name: string; category: string | null } | null
}

type ResponseRow = {
  id: number
  field_id: number
  value_text: string | null
  value_number: number | null
  value_json: unknown
}

type TemplateSection = {
  id: number
  template_id: number
  name: string
  description: string | null
  sort_order: number
}

type ChecklistSectionRow = {
  id: number
  checklist_id: number
  section_id: number
  status: string
  completed_at: string | null
}

export default function ChecklistViewPage() {
  const [loading, setLoading] = useState(true)
  const [checklist, setChecklist] = useState<ChecklistDetail | null>(null)
  const [fields, setFields] = useState<TemplateField[]>([])
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [sections, setSections] = useState<TemplateSection[]>([])
  const [checklistSections, setChecklistSections] = useState<ChecklistSectionRow[]>([])
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const params = useParams()
  const checklistId = params.id as string
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    fetchChecklist()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistId])

  /**
   * Carrega checklist do cache IndexedDB (modo offline)
   */
  const loadFromCache = async (): Promise<boolean> => {
    try {
      const cachedAuth = await getAuthCache()
      if (!cachedAuth) return false

      const cachedUser = await getUserCache(cachedAuth.userId)
      if (!cachedUser) return false

      const cachedChecklists = await getChecklistsCache()
      const cl = cachedChecklists.find(c => c.id === Number(checklistId))
      if (!cl) return false

      // Verifica permissao
      const isAdmin = cachedUser.is_admin === true
      const isCreator = cl.created_by === cachedAuth.userId
      if (!isAdmin && !isCreator) {
        setError('Voce nao tem permissao para ver este checklist')
        setLoading(false)
        return true
      }

      // Monta o objeto ChecklistDetail com dados denormalizados do cache
      const checklistDetail: ChecklistDetail = {
        id: cl.id,
        template_id: cl.template_id,
        store_id: cl.store_id,
        sector_id: cl.sector_id,
        status: cl.status,
        created_by: cl.created_by,
        started_at: cl.started_at,
        completed_at: cl.completed_at,
        latitude: cl.latitude,
        longitude: cl.longitude,
        accuracy: cl.accuracy,
        created_at: cl.created_at,
        store: cl.store_name ? { id: cl.store_id, name: cl.store_name } : null,
        sector: cl.sector_name && cl.sector_id ? { id: cl.sector_id, name: cl.sector_name } : null,
        user: cl.user_name ? { id: cl.created_by, full_name: cl.user_name } : null,
        template: cl.template_name ? { id: cl.template_id, name: cl.template_name, category: cl.template_category || null } : null,
      }
      setChecklist(checklistDetail)

      // Busca campos, secoes, responses e checklist_sections do cache
      const [cachedFields, cachedSections, cachedResponses, cachedClSections] = await Promise.all([
        getTemplateFieldsCache(cl.template_id),
        getTemplateSectionsCache(cl.template_id),
        getChecklistResponsesCache(cl.id),
        getChecklistSectionsCache(cl.id),
      ])

      const sortedFields = [...cachedFields].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      const sortedSections = [...cachedSections].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

      setFields(sortedFields)
      setSections(sortedSections)
      setResponses(cachedResponses.map(r => ({
        id: r.id,
        field_id: r.field_id,
        value_text: r.value_text,
        value_number: r.value_number,
        value_json: r.value_json,
      })))
      setChecklistSections(cachedClSections)
      setLoading(false)

      console.log('[ChecklistView] Carregado do cache offline')
      return true
    } catch (err) {
      console.error('[ChecklistView] Erro ao carregar do cache:', err)
      return false
    }
  }

  const fetchChecklist = async () => {
    // Se offline, vai direto ao cache
    if (!navigator.onLine) {
      const loaded = await loadFromCache()
      if (!loaded) {
        setError('Checklist nao disponivel offline')
        setLoading(false)
      }
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase nao configurado')
      setLoading(false)
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push(APP_CONFIG.routes.login)
        return
      }

      // Fetch user profile for auth check
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase as any)
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      // Fetch checklist with relations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: checklistData, error: checklistError } = await (supabase as any)
        .from('checklists')
        .select(`
          *,
          store:stores(id, name),
          sector:sectors(id, name),
          user:users!checklists_created_by_fkey(id, full_name),
          template:checklist_templates(id, name, category)
        `)
        .eq('id', Number(checklistId))
        .single()

      if (checklistError || !checklistData) {
        setError('Checklist nao encontrado')
        setLoading(false)
        return
      }

      // Auth check: admin or creator
      const isAdmin = profile?.is_admin === true
      const isCreator = checklistData.created_by === user.id

      if (!isAdmin && !isCreator) {
        setError('Voce nao tem permissao para ver este checklist')
        setLoading(false)
        return
      }

      setChecklist(checklistData)

      // Fetch template fields + sections + checklist_sections in parallel
      const [fieldsRes, sectionsRes, responsesRes, checklistSectionsRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('template_fields')
          .select('*')
          .eq('template_id', checklistData.template_id)
          .order('sort_order', { ascending: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('template_sections')
          .select('*')
          .eq('template_id', checklistData.template_id)
          .order('sort_order', { ascending: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('checklist_responses')
          .select('id, field_id, value_text, value_number, value_json')
          .eq('checklist_id', Number(checklistId)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('checklist_sections')
          .select('*')
          .eq('checklist_id', Number(checklistId)),
      ])

      setFields(fieldsRes.data || [])
      setSections(sectionsRes.data || [])
      setResponses(responsesRes.data || [])
      setChecklistSections(checklistSectionsRes.data || [])
    } catch (err) {
      console.error('[ChecklistView] Erro:', err)
      // Tenta carregar do cache como fallback
      const loaded = await loadFromCache()
      if (!loaded) {
        setError('Erro ao carregar checklist')
      }
    }

    setLoading(false)
  }

  const getFieldValue = (field: TemplateField): unknown => {
    const response = responses.find(r => r.field_id === field.id)
    if (!response) return null

    switch (field.field_type) {
      case 'number':
        if (response.value_json && typeof response.value_json === 'object' && 'subtype' in (response.value_json as Record<string, unknown>)) {
          return { subtype: (response.value_json as Record<string, unknown>).subtype, number: response.value_number }
        }
        return response.value_number
      case 'calculated':
        return response.value_number
      case 'photo': {
        const json = response.value_json as { photos?: string[] } | null
        return json?.photos || []
      }
      case 'yes_no': {
        const yJson = response.value_json as { photos?: string[] } | null
        if (yJson?.photos && yJson.photos.length > 0) {
          return { answer: response.value_text || '', photos: yJson.photos }
        }
        return response.value_text
      }
      case 'checkbox_multiple':
      case 'signature':
      case 'gps':
        return response.value_json
      default:
        return response.value_text
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const toggleSectionCollapse = (sectionId: number) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const hasSections = sections.length > 0

  // Group fields by section
  const fieldsBySection = useMemo(() => {
    if (!hasSections) return null
    const map = new Map<number | null, TemplateField[]>()
    for (const field of fields) {
      const sectionId = (field as TemplateField & { section_id: number | null }).section_id
      if (!map.has(sectionId)) map.set(sectionId, [])
      map.get(sectionId)!.push(field)
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, sections])

  const statusLabel: Record<string, { text: string; color: string }> = {
    concluido: { text: 'Concluido', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    em_andamento: { text: 'Em andamento', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    rascunho: { text: 'Rascunho', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  }

  if (loading) return <LoadingPage />

  if (error) {
    return (
      <div className="min-h-screen bg-page">
        <Header title="Checklist" backHref={APP_CONFIG.routes.dashboard} />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="card p-8 text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={() => router.back()} className="btn-primary px-6 py-2 rounded-xl">
              Voltar
            </button>
          </div>
        </main>
      </div>
    )
  }

  if (!checklist) return null

  const status = statusLabel[checklist.status] || { text: checklist.status, color: 'bg-gray-500/20 text-gray-400' }

  return (
    <div className="min-h-screen bg-page">
      <Header
        title={checklist.template?.name || 'Checklist'}
        backHref={APP_CONFIG.routes.dashboard}
      />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Metadata Card */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-main text-lg">{checklist.template?.name}</h2>
            <span className={`px-3 py-1 rounded-lg text-xs font-medium border ${status.color}`}>
              {status.text}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {checklist.user && (
              <div className="flex items-center gap-2 text-secondary">
                <FiUser className="w-4 h-4 text-muted" />
                <span>{checklist.user.full_name}</span>
              </div>
            )}
            {checklist.store && (
              <div className="flex items-center gap-2 text-secondary">
                <FiMapPin className="w-4 h-4 text-muted" />
                <span>{checklist.store.name}</span>
              </div>
            )}
            {checklist.sector && (
              <div className="flex items-center gap-2 text-secondary">
                <FiTag className="w-4 h-4 text-muted" />
                <span>{checklist.sector.name}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-secondary">
              <FiCalendar className="w-4 h-4 text-muted" />
              <span>{formatDate(checklist.created_at)}</span>
            </div>
            {checklist.completed_at && (
              <div className="flex items-center gap-2 text-secondary">
                <FiCheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Concluido {formatDate(checklist.completed_at)}</span>
              </div>
            )}
            {checklist.started_at && !checklist.completed_at && (
              <div className="flex items-center gap-2 text-secondary">
                <FiClock className="w-4 h-4 text-amber-400" />
                <span>Iniciado {formatDate(checklist.started_at)}</span>
              </div>
            )}
          </div>

          {/* GPS info */}
          {checklist.latitude && checklist.longitude && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
              <div className="flex items-center gap-2 text-primary text-sm">
                <FiMapPin className="w-4 h-4" />
                <span className="font-medium">GPS do checklist</span>
              </div>
              <p className="text-xs text-secondary mt-1">
                Lat: {(checklist.latitude as number).toFixed(6)}, Lng: {(checklist.longitude as number).toFixed(6)}
                {checklist.accuracy && ` (precisao: ${(checklist.accuracy as number).toFixed(0)}m)`}
              </p>
            </div>
          )}
        </div>

        {/* Fields */}
        <div className="space-y-4">
          <h3 className="font-semibold text-main">Respostas ({responses.length}/{fields.length})</h3>

          {hasSections && fieldsBySection ? (
            <>
              {/* Render fields grouped by section */}
              {sections.map(section => {
                const sectionFields = fieldsBySection.get(section.id) || []
                const sectionStatus = checklistSections.find(cs => cs.section_id === section.id)
                const isCollapsed = collapsedSections.has(section.id)
                const sectionResponses = sectionFields.filter(f => responses.some(r => r.field_id === f.id))

                return (
                  <div key={section.id} className="card overflow-hidden">
                    {/* Section header */}
                    <button
                      onClick={() => toggleSectionCollapse(section.id)}
                      className="w-full p-4 flex items-center justify-between bg-surface-hover/50 hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          sectionStatus?.status === 'concluido'
                            ? 'bg-success/20'
                            : 'bg-warning/20'
                        }`}>
                          {sectionStatus?.status === 'concluido' ? (
                            <FiCheckCircle className="w-4 h-4 text-success" />
                          ) : (
                            <FiLayers className="w-4 h-4 text-warning" />
                          )}
                        </div>
                        <div className="text-left">
                          <h4 className="font-semibold text-main text-sm">{section.name}</h4>
                          <p className="text-xs text-muted">
                            {sectionResponses.length}/{sectionFields.length} campos preenchidos
                            {sectionStatus?.completed_at && ` - Concluido ${formatDate(sectionStatus.completed_at)}`}
                          </p>
                        </div>
                      </div>
                      {isCollapsed ? (
                        <FiChevronDown className="w-5 h-5 text-muted" />
                      ) : (
                        <FiChevronUp className="w-5 h-5 text-muted" />
                      )}
                    </button>

                    {/* Section fields */}
                    {!isCollapsed && (
                      <div className="p-4 space-y-3">
                        {sectionFields.map(field => {
                          const value = getFieldValue(field)
                          const gpsVal = field.field_type === 'gps' ? value as GPSValue : null
                          return (
                            <div key={field.id} className="p-3 bg-surface rounded-xl">
                              <ReadOnlyFieldRenderer field={field} value={value} />
                              {gpsVal?.latitude && gpsVal?.longitude && (
                                <a
                                  href={`https://www.google.com/maps?q=${gpsVal.latitude},${gpsVal.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline mt-2 inline-block"
                                >
                                  Ver no Google Maps
                                </a>
                              )}
                            </div>
                          )
                        })}
                        {sectionFields.length === 0 && (
                          <p className="text-sm text-muted text-center py-2">Nenhum campo nesta secao</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Fields without section (orphan fields) */}
              {(() => {
                const unsectionedFields = fieldsBySection.get(null) || []
                if (unsectionedFields.length === 0) return null
                return (
                  <div className="space-y-3">
                    <h4 className="font-medium text-secondary text-sm">Outros Campos</h4>
                    {unsectionedFields.map(field => {
                      const value = getFieldValue(field)
                      const gpsVal = field.field_type === 'gps' ? value as GPSValue : null
                      return (
                        <div key={field.id} className="card p-4">
                          <ReadOnlyFieldRenderer field={field} value={value} />
                          {gpsVal?.latitude && gpsVal?.longitude && (
                            <a
                              href={`https://www.google.com/maps?q=${gpsVal.latitude},${gpsVal.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline mt-2 inline-block"
                            >
                              Ver no Google Maps
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </>
          ) : (
            /* Original flat rendering for templates without sections */
            <>
              {fields.map((field) => {
                const value = getFieldValue(field)
                const gpsVal = field.field_type === 'gps' ? value as GPSValue : null

                return (
                  <div key={field.id} className="card p-4">
                    <ReadOnlyFieldRenderer field={field} value={value} />
                    {gpsVal?.latitude && gpsVal?.longitude && (
                      <a
                        href={`https://www.google.com/maps?q=${gpsVal.latitude},${gpsVal.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-2 inline-block"
                      >
                        Ver no Google Maps
                      </a>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {fields.length === 0 && (
            <div className="card p-8 text-center text-muted">
              Nenhum campo encontrado neste template
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
