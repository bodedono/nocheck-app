'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiEye,
  FiEyeOff,
  FiCopy,
  FiSearch,
  FiClipboard,
  FiWifiOff,
} from 'react-icons/fi'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import type { ChecklistTemplate, TemplateField, TemplateVisibility, Store } from '@/types/database'
import { getAuthCache, getUserCache, getTemplatesCache, getStoresCache } from '@/lib/offlineCache'

type TemplateWithDetails = ChecklistTemplate & {
  fields: TemplateField[]
  visibility: (TemplateVisibility & { store: Store })[]
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    fetchTemplates()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchTemplates = async () => {
    let userId: string | null = null
    let isAdmin = false

    // Tenta verificar acesso online
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        userId = user.id
        const { data: profile } = await supabase
          .from('users')
          .select('is_admin')
          .eq('id', user.id)
          .single()
        isAdmin = profile && 'is_admin' in profile ? (profile as { is_admin: boolean }).is_admin : false
      }
    } catch {
      console.log('[Templates] Falha ao verificar online, tentando cache...')
    }

    // Fallback para cache se offline
    if (!userId) {
      try {
        const cachedAuth = await getAuthCache()
        if (cachedAuth) {
          userId = cachedAuth.userId
          const cachedUser = await getUserCache(cachedAuth.userId)
          isAdmin = cachedUser?.is_admin || false
        }
      } catch {
        console.log('[Templates] Falha ao buscar cache')
      }
    }

    if (!userId) {
      router.push(APP_CONFIG.routes.login)
      return
    }

    if (!isAdmin) {
      router.push(APP_CONFIG.routes.dashboard)
      return
    }

    // Tenta buscar online
    try {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select(`
          *,
          fields:template_fields(*),
          visibility:template_visibility(
            *,
            store:stores(*)
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      setTemplates(data as TemplateWithDetails[])
      setIsOffline(false)
    } catch (err) {
      console.error('[Templates] Erro ao buscar online:', err)

      // Fallback para cache offline
      try {
        const [cachedTemplates, cachedStores] = await Promise.all([
          getTemplatesCache(),
          getStoresCache(),
        ])

        const templatesWithDetails = cachedTemplates.map(template => ({
          ...template,
          fields: [],
          visibility: cachedStores.map(store => ({
            id: 0,
            template_id: template.id,
            store_id: store.id,
            sector_id: null,
            roles: [] as string[],
            assigned_by: null,
            assigned_at: new Date().toISOString(),
            store,
          })) as unknown as (TemplateVisibility & { store: Store })[],
        })) as TemplateWithDetails[]

        setTemplates(templatesWithDetails)
        setIsOffline(true)
        console.log('[Templates] Carregado do cache offline')
      } catch (cacheErr) {
        console.error('[Templates] Erro ao buscar cache:', cacheErr)
      }
    }

    setLoading(false)
  }

  const toggleTemplateStatus = async (templateId: number, currentStatus: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('checklist_templates')
      .update({ is_active: !currentStatus })
      .eq('id', templateId)

    if (error) {
      console.error('Error updating template:', error)
      return
    }

    fetchTemplates()
  }

  const duplicateTemplate = async (template: TemplateWithDetails) => {
    // Create new template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newTemplate, error: templateError } = await (supabase as any)
      .from('checklist_templates')
      .insert({
        name: `${template.name} (Cópia)`,
        description: template.description,
        category: template.category,
        is_active: false,
      })
      .select()
      .single()

    if (templateError || !newTemplate) {
      console.error('Error duplicating template:', templateError)
      return
    }

    // Copy fields
    if (template.fields.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: fieldsError } = await (supabase as any)
        .from('template_fields')
        .insert(
          template.fields.map(f => ({
            template_id: newTemplate.id,
            name: f.name,
            field_type: f.field_type,
            is_required: f.is_required,
            sort_order: f.sort_order,
            options: f.options,
            validation: f.validation,
            calculation: f.calculation,
            placeholder: f.placeholder,
            help_text: f.help_text,
          }))
        )

      if (fieldsError) {
        console.error('Error copying fields:', fieldsError)
      }
    }

    fetchTemplates()
  }

  const deleteTemplate = async (templateId: number) => {
    if (!confirm('Tem certeza que deseja excluir este checklist e todos os dados preenchidos? Esta ação não pode ser desfeita.')) return

    try {
      // Exclui checklists vinculados primeiro (responses são CASCADE)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('checklists')
        .delete()
        .eq('template_id', templateId)

      // Agora exclui o template (fields e visibility são CASCADE)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('checklist_templates')
        .delete()
        .eq('id', templateId)

      if (error) throw error

      fetchTemplates()
    } catch (error) {
      console.error('Error deleting template:', error)
      alert('Erro ao excluir checklist')
    }
  }

  const filteredTemplates = templates.filter(template => {
    const matchesSearch =
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCategory = !filterCategory || template.category === filterCategory

    return matchesSearch && matchesCategory
  })

  const categories = ['recebimento', 'limpeza', 'abertura', 'fechamento', 'outros']

  const getCategoryColor = (category: string | null) => {
    const colors: Record<string, string> = {
      recebimento: 'bg-emerald-500/20 text-emerald-400',
      limpeza: 'bg-blue-500/20 text-blue-400',
      abertura: 'bg-amber-500/20 text-amber-400',
      fechamento: 'bg-purple-500/20 text-purple-400',
      outros: 'bg-surface text-muted',
    }
    return colors[category || 'outros'] || colors.outros
  }

  const getFieldTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      text: 'Texto',
      number: 'Número',
      photo: 'Foto',
      dropdown: 'Lista',
      signature: 'Assinatura',
      datetime: 'Data/Hora',
      checkbox_multiple: 'Múltipla Escolha',
      gps: 'GPS',
      barcode: 'Código de Barras',
      calculated: 'Calculado',
    }
    return labels[type] || type
  }

  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        title="Modelos de Checklist"
        icon={FiClipboard}
        backHref={APP_CONFIG.routes.admin}
        actions={isOffline ? [] : [
          {
            label: 'Novo Checklist',
            href: APP_CONFIG.routes.adminTemplatesNew,
            icon: FiPlus,
            variant: 'primary',
          },
        ]}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Offline Warning */}
        {isOffline && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <FiWifiOff className="w-5 h-5 text-warning" />
            <p className="text-warning text-sm">
              Voce esta offline. Os dados mostrados sao do cache local. Edicoes nao estao disponiveis.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="Buscar checklists..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface border border-subtle rounded-xl text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterCategory(null)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                filterCategory === null
                  ? 'btn-primary'
                  : 'btn-secondary'
              }`}
            >
              Todos
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
                  filterCategory === cat
                    ? 'btn-primary'
                    : 'btn-secondary'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Templates Grid */}
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-16 card rounded-2xl">
            <p className="text-muted">Nenhum checklist encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredTemplates.map(template => (
              <div
                key={template.id}
                className={`card rounded-2xl p-6 transition-all ${
                  template.is_active
                    ? ''
                    : 'border-red-500/30 opacity-60'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-main">{template.name}</h3>
                      {!template.is_active && (
                        <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">
                          Inativo
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-sm text-secondary line-clamp-2">{template.description}</p>
                    )}
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-lg capitalize ${getCategoryColor(template.category)}`}>
                    {template.category || 'Outros'}
                  </span>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mb-4 text-sm text-muted">
                  <span>{template.fields.length} campos</span>
                  <span>{template.visibility.length} lojas</span>
                  <span>v{template.version}</span>
                </div>

                {/* Field Types Preview */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {[...new Set(template.fields.map(f => f.field_type))].map(type => (
                    <span
                      key={type}
                      className="px-2 py-1 text-xs bg-surface text-muted rounded"
                    >
                      {getFieldTypeLabel(type)}
                    </span>
                  ))}
                </div>

                {/* Visibility */}
                {template.visibility.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-muted mb-1">Visível em:</p>
                    <div className="flex flex-wrap gap-1">
                      {template.visibility.slice(0, 4).map(v => (
                        <span
                          key={v.id}
                          className="px-2 py-1 text-xs bg-emerald-500/10 text-emerald-400 rounded"
                        >
                          {v.store.name.split(' ').slice(1).join(' ') || v.store.name}
                        </span>
                      ))}
                      {template.visibility.length > 4 && (
                        <span className="px-2 py-1 text-xs bg-surface text-muted rounded">
                          +{template.visibility.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-4 border-t border-subtle">
                  <button
                    onClick={() => duplicateTemplate(template)}
                    className="p-2 text-muted hover:text-main hover:bg-surface rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Duplicar"
                    disabled={isOffline}
                  >
                    <FiCopy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleTemplateStatus(template.id, template.is_active)}
                    className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      template.is_active
                        ? 'text-amber-400 hover:bg-amber-500/20'
                        : 'text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                    title={template.is_active ? 'Desativar' : 'Ativar'}
                    disabled={isOffline}
                  >
                    {template.is_active ? (
                      <FiEyeOff className="w-4 h-4" />
                    ) : (
                      <FiEye className="w-4 h-4" />
                    )}
                  </button>
                  {!isOffline && (
                    <Link
                      href={`${APP_CONFIG.routes.adminTemplates}/${template.id}`}
                      className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <FiEdit2 className="w-4 h-4" />
                    </Link>
                  )}
                  <button
                    onClick={() => deleteTemplate(template.id)}
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Excluir"
                    disabled={isOffline}
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="mt-6 flex items-center justify-between text-sm text-muted">
          <p>
            Mostrando {filteredTemplates.length} de {templates.length} checklists
          </p>
          <p>
            {templates.filter(t => t.is_active).length} ativos
          </p>
        </div>
      </main>
    </div>
  )
}
