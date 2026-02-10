'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { APP_CONFIG } from '@/lib/config'
import { Header } from '@/components/ui'
import Link from 'next/link'
import {
  FiSave,
  FiTrash2,
  FiChevronDown,
  FiChevronUp,
  FiSettings,
  FiClipboard,
  FiGrid,
  FiBriefcase,
  FiPlus,
  FiLayers,
  FiArrowUp,
  FiArrowDown,
} from 'react-icons/fi'
import type { Store, FieldType, TemplateCategory, Sector, FunctionRow } from '@/types/database'

type SectionConfig = {
  id: string
  name: string
  description: string
  sort_order: number
}

type FieldConfig = {
  id: string
  section_id: string | null // local section id
  name: string
  field_type: FieldType
  is_required: boolean
  sort_order: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any
  validation: Record<string, unknown> | null
  placeholder: string
  help_text: string
}

type VisibilityConfig = {
  store_id: number
  sector_id: number | null
  function_id: number | null
}

type SectorWithStore = Sector & {
  store: Store
}

export default function NovoTemplatePage() {
  const [stores, setStores] = useState<Store[]>([])
  const [sectors, setSectors] = useState<SectorWithStore[]>([])
  const [functions, setFunctions] = useState<FunctionRow[]>([])
  const [selectedFunctionIds, setSelectedFunctionIds] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Template form
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('recebimento')

  // Sections
  const [sections, setSections] = useState<SectionConfig[]>([])

  // Fields
  const [fields, setFields] = useState<FieldConfig[]>([])
  const [editingField, setEditingField] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  // Visibility - now includes sector_id
  const [visibility, setVisibility] = useState<VisibilityConfig[]>([])

  useEffect(() => {
    const fetchData = async () => {
      // Fetch stores
      const { data: storesData } = await supabase
        .from('stores')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (storesData) setStores(storesData)

      // Fetch sectors with their stores
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sectorsData } = await (supabase as any)
        .from('sectors')
        .select(`
          *,
          store:stores(*)
        `)
        .eq('is_active', true)
        .order('name')

      if (sectorsData) setSectors(sectorsData)

      // Fetch functions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: functionsData } = await (supabase as any)
        .from('functions')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (functionsData) setFunctions(functionsData as FunctionRow[])
    }

    fetchData()
  }, [supabase])

  const fieldTypes: { value: FieldType; label: string; icon: string }[] = [
    { value: 'text', label: 'Texto', icon: 'Aa' },
    { value: 'number', label: 'Numero', icon: '#' },
    { value: 'photo', label: 'Foto', icon: '📷' },
    { value: 'dropdown', label: 'Lista', icon: '▼' },
    { value: 'signature', label: 'Assinatura', icon: '✍️' },
    { value: 'datetime', label: 'Data/Hora', icon: '📅' },
    { value: 'checkbox_multiple', label: 'Multipla Escolha', icon: '☑️' },
    { value: 'barcode', label: 'Codigo de Barras', icon: '▮▯▮' },
    { value: 'calculated', label: 'Calculado', icon: '∑' },
    { value: 'yes_no', label: 'Sim/Nao', icon: '?!' },
    { value: 'rating', label: 'Avaliacao', icon: '😊' },
  ]

  // Get sectors for a specific store
  const getSectorsForStore = (storeId: number) => {
    return sectors.filter(s => s.store_id === storeId)
  }

  const addSection = () => {
    const newSection: SectionConfig = {
      id: `section_${Date.now()}`,
      name: '',
      description: '',
      sort_order: sections.length + 1,
    }
    setSections([...sections, newSection])
  }

  const updateSection = (id: string, updates: Partial<SectionConfig>) => {
    setSections(sections.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const removeSection = (id: string) => {
    if (!confirm('Deseja realmente excluir esta etapa? Os campos dela ficarao sem etapa.')) return
    setSections(sections.filter(s => s.id !== id))
    // Unassign fields from this section
    setFields(fields.map(f => f.section_id === id ? { ...f, section_id: null } : f))
  }

  const moveSectionOrder = (id: string, direction: 'up' | 'down') => {
    const index = sections.findIndex(s => s.id === id)
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === sections.length - 1)) return
    const newSections = [...sections]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    const temp = newSections[index]
    newSections[index] = newSections[newIndex]
    newSections[newIndex] = temp
    setSections(newSections.map((s, i) => ({ ...s, sort_order: i + 1 })))
  }

  const addField = (type: FieldType, sectionId?: string | null) => {
    const newField: FieldConfig = {
      id: `field_${Date.now()}`,
      section_id: sectionId || null,
      name: '',
      field_type: type,
      is_required: true,
      sort_order: fields.length + 1,
      options: type === 'dropdown' || type === 'checkbox_multiple' ? [] : type === 'number' ? { numberSubtype: 'decimal' } : null,
      validation: null,
      placeholder: '',
      help_text: '',
    }
    setFields([...fields, newField])
    setEditingField(newField.id)
  }

  const updateField = (id: string, updates: Partial<FieldConfig>) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  const removeField = (id: string) => {
    if (!confirm('Deseja realmente excluir este campo?')) return
    setFields(fields.filter(f => f.id !== id))
    if (editingField === id) setEditingField(null)
  }

  const moveField = (id: string, direction: 'up' | 'down') => {
    const field = fields.find(f => f.id === id)
    if (!field) return

    // Scope movement within same section group
    const groupFields = fields
      .filter(f => f.section_id === field.section_id)
      .sort((a, b) => a.sort_order - b.sort_order)
    const idxInGroup = groupFields.findIndex(f => f.id === id)

    if (
      (direction === 'up' && idxInGroup === 0) ||
      (direction === 'down' && idxInGroup === groupFields.length - 1)
    ) return

    const neighbor = direction === 'up' ? groupFields[idxInGroup - 1] : groupFields[idxInGroup + 1]
    const fieldSort = field.sort_order
    const neighborSort = neighbor.sort_order

    setFields(fields.map(f => {
      if (f.id === id) return { ...f, sort_order: neighborSort }
      if (f.id === neighbor.id) return { ...f, sort_order: fieldSort }
      return f
    }))
  }

  // Toggle a sector's visibility
  const toggleSectorVisibility = (storeId: number, sectorId: number) => {
    const existing = visibility.find(v => v.store_id === storeId && v.sector_id === sectorId)
    if (existing) {
      setVisibility(visibility.filter(v => !(v.store_id === storeId && v.sector_id === sectorId)))
    } else {
      setVisibility([...visibility, { store_id: storeId, sector_id: sectorId, function_id: null }])
    }
  }

  // Check if a sector is enabled
  const isSectorEnabled = (storeId: number, sectorId: number) => {
    return visibility.some(v => v.store_id === storeId && v.sector_id === sectorId)
  }

  // Toggle all sectors of a store
  const toggleAllStoreSectors = (storeId: number) => {
    const storeSectors = getSectorsForStore(storeId)
    const allEnabled = storeSectors.every(s => isSectorEnabled(storeId, s.id))

    if (allEnabled) {
      // Remove all sectors of this store
      setVisibility(visibility.filter(v => v.store_id !== storeId))
    } else {
      // Add all sectors of this store
      const newVisibility = visibility.filter(v => v.store_id !== storeId)
      storeSectors.forEach(sector => {
        newVisibility.push({ store_id: storeId, sector_id: sector.id, function_id: null })
      })
      setVisibility(newVisibility)
    }
  }

  // Check if any sector of a store is enabled
  const isStorePartiallyEnabled = (storeId: number) => {
    return visibility.some(v => v.store_id === storeId)
  }

  // Check if all sectors of a store are enabled
  const isStoreFullyEnabled = (storeId: number) => {
    const storeSectors = getSectorsForStore(storeId)
    return storeSectors.length > 0 && storeSectors.every(s => isSectorEnabled(storeId, s.id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (fields.length === 0) {
      setError('Adicione pelo menos um campo ao checklist')
      setLoading(false)
      return
    }

    if (fields.some(f => !f.name.trim())) {
      setError('Todos os campos precisam ter um nome')
      setLoading(false)
      return
    }

    if (visibility.length === 0) {
      setError('Selecione pelo menos um setor para visibilidade')
      setLoading(false)
      return
    }

    try {
      // 1. Create template
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: template, error: templateError } = await (supabase as any)
        .from('checklist_templates')
        .insert({
          name,
          description: description || null,
          category,
        })
        .select()
        .single()

      if (templateError) throw templateError

      // 2. Create sections (if any)
      const sectionIdMap: Record<string, number> = {} // local id → db id
      if (sections.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sectionsData, error: sectionsError } = await (supabase as any)
          .from('template_sections')
          .insert(
            sections.map(s => ({
              template_id: template.id,
              name: s.name,
              description: s.description || null,
              sort_order: s.sort_order,
            }))
          )
          .select()

        if (sectionsError) throw sectionsError
        // Map local section ids to database ids (inserted in same order)
        if (sectionsData) {
          sections.forEach((s, i) => {
            sectionIdMap[s.id] = sectionsData[i].id
          })
        }
      }

      // 3. Create fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: fieldsError } = await (supabase as any)
        .from('template_fields')
        .insert(
          fields.map(f => ({
            template_id: template.id,
            section_id: f.section_id ? sectionIdMap[f.section_id] || null : null,
            name: f.name,
            field_type: f.field_type,
            is_required: f.is_required,
            sort_order: f.sort_order,
            options: Array.isArray(f.options) ? f.options.filter((o: string) => o.trim()) : f.options,
            validation: f.validation,
            placeholder: f.placeholder || null,
            help_text: f.help_text || null,
          }))
        )

      if (fieldsError) throw fieldsError

      // 3. Create visibility with sector_id and optional function_id
      if (visibility.length > 0) {
        const visibilityEntries: { template_id: number; store_id: number; sector_id: number | null; function_id: number | null; roles: string[] }[] = []

        if (selectedFunctionIds.length === 0) {
          visibility.forEach(v => {
            visibilityEntries.push({
              template_id: template.id,
              store_id: v.store_id,
              sector_id: v.sector_id,
              function_id: null,
              roles: [],
            })
          })
        } else {
          visibility.forEach(v => {
            selectedFunctionIds.forEach(fnId => {
              visibilityEntries.push({
                template_id: template.id,
                store_id: v.store_id,
                sector_id: v.sector_id,
                function_id: fnId,
                roles: [],
              })
            })
          })
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: visError } = await (supabase as any)
          .from('template_visibility')
          .insert(visibilityEntries)

        if (visError) throw visError
      }

      router.push(APP_CONFIG.routes.adminTemplates)
    } catch (err) {
      console.error('Error creating template:', err)
      const supaErr = err as { message?: string; details?: string; code?: string }
      const msg = supaErr?.message || supaErr?.details || 'Erro ao criar checklist'
      setError(msg)
      setLoading(false)
    }
  }

  const getFieldTypeLabel = (type: FieldType) => {
    return fieldTypes.find(f => f.value === type)?.label || type
  }

  const getFieldTypeIcon = (type: FieldType) => {
    return fieldTypes.find(f => f.value === type)?.icon || '?'
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        variant="page"
        title="Novo Checklist"
        icon={FiClipboard}
        backHref={APP_CONFIG.routes.adminTemplates}
        maxWidth="5xl"
      />

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-main mb-4">Informacoes do Checklist</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-secondary mb-2">
                  Nome do Checklist *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="input"
                  placeholder="Ex: Recebimento - Estoquista"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-secondary mb-2">
                  Descricao
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="input resize-none"
                  placeholder="Descricao breve do checklist..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Categoria
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                  className="input"
                >
                  <option value="recebimento">Recebimento</option>
                  <option value="limpeza">Limpeza</option>
                  <option value="abertura">Abertura</option>
                  <option value="fechamento">Fechamento</option>
                  <option value="outros">Outros</option>
                </select>
              </div>
            </div>
          </div>

          {/* Etapas e Campos */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-main flex items-center gap-2">
                <FiLayers className="w-5 h-5 text-primary" />
                Etapas e Campos
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted">{fields.length} campos</span>
                <button
                  type="button"
                  onClick={addSection}
                  className="btn-secondary flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <FiPlus className="w-4 h-4" />
                  Adicionar Etapa
                </button>
              </div>
            </div>
            <p className="text-sm text-muted mb-4">
              Divida o checklist em etapas para preenchimento em momentos diferentes do dia.
              Se nenhuma etapa for criada, o checklist sera preenchido de uma vez.
            </p>

            {sections.length > 0 ? (
              <div className="space-y-4">
                {/* Section accordions */}
                {sections.map((section, idx) => {
                  const sectionFields = fields
                    .filter(f => f.section_id === section.id)
                    .sort((a, b) => a.sort_order - b.sort_order)
                  const isExpanded = expandedSection === section.id

                  return (
                    <div key={section.id} className="border border-subtle rounded-xl overflow-hidden">
                      {/* Section header */}
                      <div
                        className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-primary/10 border-b border-subtle' : 'bg-surface hover:bg-surface-hover'
                        }`}
                        onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                      >
                        <div className="flex flex-col" onClick={e => e.stopPropagation()}>
                          <button type="button" onClick={() => moveSectionOrder(section.id, 'up')} disabled={idx === 0} className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-muted transition-colors">
                            <FiArrowUp className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => moveSectionOrder(section.id, 'down')} disabled={idx === sections.length - 1} className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-muted transition-colors">
                            <FiArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{idx + 1}</span>
                        <input
                          type="text"
                          value={section.name}
                          onChange={(e) => updateSection(section.id, { name: e.target.value })}
                          onClick={e => e.stopPropagation()}
                          placeholder="Nome da etapa"
                          className="flex-1 min-w-0 bg-transparent border-none text-main placeholder:text-muted focus:outline-none font-medium text-sm sm:text-base"
                        />
                        <span className="text-xs text-muted whitespace-nowrap hidden sm:inline">{sectionFields.length} campos</span>
                        {isExpanded ? <FiChevronUp className="w-4 h-4 text-primary shrink-0" /> : <FiChevronDown className="w-4 h-4 text-muted shrink-0" />}
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeSection(section.id) }} className="p-1.5 sm:p-2 text-error hover:bg-error/20 rounded-lg transition-colors shrink-0">
                          <FiTrash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>

                      {/* Section content */}
                      {isExpanded && (
                        <div className="p-4 space-y-3">
                          <div className="flex flex-wrap gap-2 p-3 bg-surface-hover rounded-xl border border-subtle">
                            <p className="w-full text-xs text-muted mb-1">Adicionar campo nesta etapa:</p>
                            {fieldTypes.map(type => (
                              <button key={type.value} type="button" onClick={() => addField(type.value, section.id)} className="btn-secondary flex items-center gap-1 px-2 py-1.5 text-xs">
                                <span>{type.icon}</span>
                                <span>{type.label}</span>
                              </button>
                            ))}
                          </div>

                          {sectionFields.length === 0 ? (
                            <p className="text-center text-muted text-sm py-4">Nenhum campo nesta etapa</p>
                          ) : (
                            sectionFields.map((field, fieldIdx) => (
                              <div key={field.id} className={`border rounded-xl transition-all ${editingField === field.id ? 'border-primary bg-surface-hover' : 'border-subtle bg-surface'}`}>
                                <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3">
                                  <div className="flex flex-col gap-0.5">
                                    <button type="button" onClick={() => moveField(field.id, 'up')} disabled={fieldIdx === 0} className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-muted transition-colors"><FiArrowUp className="w-3 h-3" /></button>
                                    <button type="button" onClick={() => moveField(field.id, 'down')} disabled={fieldIdx === sectionFields.length - 1} className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-muted transition-colors"><FiArrowDown className="w-3 h-3" /></button>
                                  </div>
                                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-surface-hover border border-subtle flex items-center justify-center text-sm shrink-0">{getFieldTypeIcon(field.field_type)}</div>
                                  <div className="flex-1 min-w-0">
                                    <input type="text" value={field.name} onChange={(e) => updateField(field.id, { name: e.target.value })} placeholder="Nome do campo" className="w-full bg-transparent border-none text-main placeholder:text-muted focus:outline-none font-medium text-xs sm:text-sm" />
                                    <p className="text-[10px] sm:text-xs text-muted">{getFieldTypeLabel(field.field_type)}</p>
                                  </div>
                                  <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                                    <label className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-secondary" title="Obrigatorio">
                                      <input type="checkbox" checked={field.is_required} onChange={(e) => updateField(field.id, { is_required: e.target.checked })} className="rounded border-default bg-surface text-primary focus:ring-primary w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                      <span className="hidden sm:inline">Obrig.</span><span className="sm:hidden">*</span>
                                    </label>
                                    <button type="button" onClick={() => setEditingField(editingField === field.id ? null : field.id)} className={`p-1 sm:p-1.5 rounded-lg transition-colors ${editingField === field.id ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface-hover'}`}><FiSettings className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                                    <button type="button" onClick={() => removeField(field.id)} className="p-1 sm:p-1.5 text-error hover:bg-error/20 rounded-lg transition-colors"><FiTrash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                                  </div>
                                </div>
                                {editingField === field.id && (
                                  <div className="px-2 pb-2 sm:px-3 sm:pb-3 pt-2 border-t border-subtle space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-xs text-muted mb-1">Placeholder</label>
                                        <input type="text" value={field.placeholder} onChange={(e) => updateField(field.id, { placeholder: e.target.value })} className="input text-sm" placeholder="Texto de exemplo..." />
                                      </div>
                                      <div>
                                        <label className="block text-xs text-muted mb-1">Texto de ajuda</label>
                                        <input type="text" value={field.help_text} onChange={(e) => updateField(field.id, { help_text: e.target.value })} className="input text-sm" placeholder="Instrucoes para o usuario..." />
                                      </div>
                                    </div>
                                    {sections.length > 0 && (
                                      <div>
                                        <label className="block text-xs text-muted mb-1">Mover para etapa</label>
                                        <select value={field.section_id || ''} onChange={(e) => updateField(field.id, { section_id: e.target.value || null })} className="input text-sm">
                                          <option value="">Sem etapa (geral)</option>
                                          {sections.map(s => (<option key={s.id} value={s.id}>{s.name || '(sem nome)'}</option>))}
                                        </select>
                                      </div>
                                    )}
                                    {field.field_type === 'number' && (
                                      <div>
                                        <label className="block text-xs text-muted mb-1">Tipo de numero</label>
                                        <div className="grid grid-cols-2 gap-2">
                                          {[{ value: 'monetario', label: 'Monetario (R$)' }, { value: 'quantidade', label: 'Quantidade (un)' }, { value: 'decimal', label: 'Decimal' }, { value: 'porcentagem', label: 'Porcentagem (%)' }].map(st => (
                                            <button key={st.value} type="button" onClick={() => updateField(field.id, { options: { numberSubtype: st.value } })} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${(field.options as { numberSubtype?: string } | null)?.numberSubtype === st.value ? 'bg-primary/15 border-primary text-primary' : 'bg-surface border-subtle text-muted hover:border-primary/40'}`}>{st.label}</button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {(field.field_type === 'dropdown' || field.field_type === 'checkbox_multiple') && (
                                      <div>
                                        <label className="block text-xs text-muted mb-2">Opcoes</label>
                                        <div className="space-y-2">
                                          {(Array.isArray(field.options) ? field.options : []).map((opt: string, optIdx: number) => (
                                            <div key={optIdx} className="flex items-center gap-2">
                                              <span className="text-muted cursor-grab text-sm select-none">☰</span>
                                              <input type="text" value={opt} onChange={(e) => { const newOpts = [...(Array.isArray(field.options) ? field.options : [])]; newOpts[optIdx] = e.target.value; updateField(field.id, { options: newOpts }) }} placeholder={`Opcao ${optIdx + 1}`} className="input text-sm flex-1" />
                                              <button type="button" onClick={() => { const newOpts = (Array.isArray(field.options) ? field.options : []).filter((_: string, i: number) => i !== optIdx); updateField(field.id, { options: newOpts }) }} className="p-1 text-error hover:bg-error/20 rounded transition-colors shrink-0"><FiTrash2 className="w-3 h-3" /></button>
                                            </div>
                                          ))}
                                        </div>
                                        <button type="button" onClick={() => updateField(field.id, { options: [...(Array.isArray(field.options) ? field.options : []), ''] })} className="mt-2 text-xs text-primary hover:text-primary/80 font-medium py-1.5 px-3 border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">+ Adicionar opcao</button>
                                      </div>
                                    )}
                                    {field.field_type === 'yes_no' && (
                                      <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                                          <input type="checkbox" checked={(field.options as { allowPhoto?: boolean } | null)?.allowPhoto || false} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), allowPhoto: e.target.checked, photoRequired: false } })} className="rounded border-default bg-surface text-primary focus:ring-primary" />
                                          Permitir foto
                                        </label>
                                        {(field.options as { allowPhoto?: boolean } | null)?.allowPhoto && (
                                          <select value={(field.options as { photoRequired?: boolean } | null)?.photoRequired ? 'required' : 'optional'} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), photoRequired: e.target.value === 'required' } })} className="input text-sm">
                                            <option value="optional">Foto opcional</option>
                                            <option value="required">Foto obrigatoria</option>
                                          </select>
                                        )}
                                      </div>
                                    )}
                                    {!['dropdown', 'checkbox_multiple'].includes(field.field_type) && (<div><label className="block text-xs text-muted mb-1">Validacao cruzada</label><select value={(field.options as { validationRole?: string } | null)?.validationRole || ''} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), validationRole: e.target.value || null } })} className="input text-sm"><option value="">Nenhum</option><option value="nota">Numero da nota</option><option value="valor">Valor</option></select></div>)}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Campos Gerais (without section) */}
                <div className="border border-dashed border-subtle rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-medium text-muted">Campos Gerais (sem etapa)</h3>
                  <div className="flex flex-wrap gap-2 p-3 bg-surface-hover rounded-xl border border-subtle">
                    <p className="w-full text-xs text-muted mb-1">Adicionar campo geral:</p>
                    {fieldTypes.map(type => (
                      <button key={type.value} type="button" onClick={() => addField(type.value)} className="btn-secondary flex items-center gap-1 px-2 py-1.5 text-xs">
                        <span>{type.icon}</span>
                        <span>{type.label}</span>
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const generalFields = fields.filter(f => !f.section_id).sort((a, b) => a.sort_order - b.sort_order)
                    return generalFields.length === 0 ? (
                      <p className="text-center text-muted text-sm py-2">Nenhum campo geral</p>
                    ) : (
                      generalFields.map((field, fieldIdx) => (
                        <div key={field.id} className={`border rounded-xl transition-all ${editingField === field.id ? 'border-primary bg-surface-hover' : 'border-subtle bg-surface'}`}>
                          <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3">
                            <div className="flex flex-col gap-0.5">
                              <button type="button" onClick={() => moveField(field.id, 'up')} disabled={fieldIdx === 0} className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-muted transition-colors"><FiArrowUp className="w-3 h-3" /></button>
                              <button type="button" onClick={() => moveField(field.id, 'down')} disabled={fieldIdx === generalFields.length - 1} className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-muted transition-colors"><FiArrowDown className="w-3 h-3" /></button>
                            </div>
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-surface-hover border border-subtle flex items-center justify-center text-sm shrink-0">{getFieldTypeIcon(field.field_type)}</div>
                            <div className="flex-1 min-w-0">
                              <input type="text" value={field.name} onChange={(e) => updateField(field.id, { name: e.target.value })} placeholder="Nome do campo" className="w-full bg-transparent border-none text-main placeholder:text-muted focus:outline-none font-medium text-xs sm:text-sm" />
                              <p className="text-[10px] sm:text-xs text-muted">{getFieldTypeLabel(field.field_type)}</p>
                            </div>
                            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                              <label className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-secondary" title="Obrigatorio">
                                <input type="checkbox" checked={field.is_required} onChange={(e) => updateField(field.id, { is_required: e.target.checked })} className="rounded border-default bg-surface text-primary focus:ring-primary w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                <span className="hidden sm:inline">Obrig.</span><span className="sm:hidden">*</span>
                              </label>
                              <button type="button" onClick={() => setEditingField(editingField === field.id ? null : field.id)} className={`p-1 sm:p-1.5 rounded-lg transition-colors ${editingField === field.id ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface-hover'}`}><FiSettings className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                              <button type="button" onClick={() => removeField(field.id)} className="p-1 sm:p-1.5 text-error hover:bg-error/20 rounded-lg transition-colors"><FiTrash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                            </div>
                          </div>
                          {editingField === field.id && (
                            <div className="px-2 pb-2 sm:px-3 sm:pb-3 pt-2 border-t border-subtle space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-muted mb-1">Placeholder</label>
                                  <input type="text" value={field.placeholder} onChange={(e) => updateField(field.id, { placeholder: e.target.value })} className="input text-sm" placeholder="Texto de exemplo..." />
                                </div>
                                <div>
                                  <label className="block text-xs text-muted mb-1">Texto de ajuda</label>
                                  <input type="text" value={field.help_text} onChange={(e) => updateField(field.id, { help_text: e.target.value })} className="input text-sm" placeholder="Instrucoes para o usuario..." />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs text-muted mb-1">Mover para etapa</label>
                                <select value={field.section_id || ''} onChange={(e) => updateField(field.id, { section_id: e.target.value || null })} className="input text-sm">
                                  <option value="">Sem etapa (geral)</option>
                                  {sections.map(s => (<option key={s.id} value={s.id}>{s.name || '(sem nome)'}</option>))}
                                </select>
                              </div>
                              {field.field_type === 'number' && (
                                <div>
                                  <label className="block text-xs text-muted mb-1">Tipo de numero</label>
                                  <div className="grid grid-cols-2 gap-2">
                                    {[{ value: 'monetario', label: 'Monetario (R$)' }, { value: 'quantidade', label: 'Quantidade (un)' }, { value: 'decimal', label: 'Decimal' }, { value: 'porcentagem', label: 'Porcentagem (%)' }].map(st => (
                                      <button key={st.value} type="button" onClick={() => updateField(field.id, { options: { numberSubtype: st.value } })} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${(field.options as { numberSubtype?: string } | null)?.numberSubtype === st.value ? 'bg-primary/15 border-primary text-primary' : 'bg-surface border-subtle text-muted hover:border-primary/40'}`}>{st.label}</button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {(field.field_type === 'dropdown' || field.field_type === 'checkbox_multiple') && (
                                <div>
                                  <label className="block text-xs text-muted mb-2">Opcoes</label>
                                  <div className="space-y-2">
                                    {(Array.isArray(field.options) ? field.options : []).map((opt: string, optIdx: number) => (
                                      <div key={optIdx} className="flex items-center gap-2">
                                        <span className="text-muted cursor-grab text-sm select-none">☰</span>
                                        <input type="text" value={opt} onChange={(e) => { const newOpts = [...(Array.isArray(field.options) ? field.options : [])]; newOpts[optIdx] = e.target.value; updateField(field.id, { options: newOpts }) }} placeholder={`Opcao ${optIdx + 1}`} className="input text-sm flex-1" />
                                        <button type="button" onClick={() => { const newOpts = (Array.isArray(field.options) ? field.options : []).filter((_: string, i: number) => i !== optIdx); updateField(field.id, { options: newOpts }) }} className="p-1 text-error hover:bg-error/20 rounded transition-colors shrink-0"><FiTrash2 className="w-3 h-3" /></button>
                                      </div>
                                    ))}
                                  </div>
                                  <button type="button" onClick={() => updateField(field.id, { options: [...(Array.isArray(field.options) ? field.options : []), ''] })} className="mt-2 text-xs text-primary hover:text-primary/80 font-medium py-1.5 px-3 border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">+ Adicionar opcao</button>
                                </div>
                              )}
                              {field.field_type === 'yes_no' && (
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                                    <input type="checkbox" checked={(field.options as { allowPhoto?: boolean } | null)?.allowPhoto || false} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), allowPhoto: e.target.checked, photoRequired: false } })} className="rounded border-default bg-surface text-primary focus:ring-primary" />
                                    Permitir foto
                                  </label>
                                  {(field.options as { allowPhoto?: boolean } | null)?.allowPhoto && (
                                    <select value={(field.options as { photoRequired?: boolean } | null)?.photoRequired ? 'required' : 'optional'} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), photoRequired: e.target.value === 'required' } })} className="input text-sm">
                                      <option value="optional">Foto opcional</option>
                                      <option value="required">Foto obrigatoria</option>
                                    </select>
                                  )}
                                </div>
                              )}
                              {!['dropdown', 'checkbox_multiple'].includes(field.field_type) && (<div><label className="block text-xs text-muted mb-1">Validacao cruzada</label><select value={(field.options as { validationRole?: string } | null)?.validationRole || ''} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), validationRole: e.target.value || null } })} className="input text-sm"><option value="">Nenhum</option><option value="nota">Numero da nota</option><option value="valor">Valor</option></select></div>)}
                            </div>
                          )}
                        </div>
                      ))
                    )
                  })()}
                </div>
              </div>
            ) : (
              <>
                {/* No sections: flat field list */}
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-6 p-2 sm:p-4 bg-surface-hover rounded-xl border border-subtle">
                  <p className="w-full text-xs sm:text-sm text-muted mb-1 sm:mb-2">Adicionar campo:</p>
                  {fieldTypes.map(type => (
                    <button key={type.value} type="button" onClick={() => addField(type.value)} className="btn-secondary flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                      <span>{type.icon}</span>
                      <span>{type.label}</span>
                    </button>
                  ))}
                </div>

                {fields.length === 0 ? (
                  <div className="text-center py-12 text-muted">
                    <p>Nenhum campo adicionado</p>
                    <p className="text-sm mt-1">Clique nos botoes acima para adicionar campos</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div key={field.id} className={`border rounded-xl transition-all ${editingField === field.id ? 'border-primary bg-surface-hover' : 'border-subtle bg-surface'}`}>
                        <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-4">
                          <div className="flex flex-col gap-0.5">
                            <button type="button" onClick={() => moveField(field.id, 'up')} disabled={index === 0} className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-muted transition-colors"><FiArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                            <button type="button" onClick={() => moveField(field.id, 'down')} disabled={index === fields.length - 1} className="p-1 rounded-md text-muted hover:text-primary hover:bg-primary/10 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-muted transition-colors"><FiArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                          </div>
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-surface-hover border border-subtle flex items-center justify-center text-sm sm:text-lg shrink-0">{getFieldTypeIcon(field.field_type)}</div>
                          <div className="flex-1 min-w-0">
                            <input type="text" value={field.name} onChange={(e) => updateField(field.id, { name: e.target.value })} placeholder="Nome do campo" className="w-full bg-transparent border-none text-main placeholder:text-muted focus:outline-none font-medium text-sm sm:text-base" />
                            <p className="text-[10px] sm:text-xs text-muted">{getFieldTypeLabel(field.field_type)}</p>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                            <label className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-sm text-secondary" title="Obrigatorio">
                              <input type="checkbox" checked={field.is_required} onChange={(e) => updateField(field.id, { is_required: e.target.checked })} className="rounded border-default bg-surface text-primary focus:ring-primary w-3 h-3 sm:w-4 sm:h-4" />
                              <span className="hidden sm:inline">Obrigatorio</span><span className="sm:hidden">*</span>
                            </label>
                            <button type="button" onClick={() => setEditingField(editingField === field.id ? null : field.id)} className={`p-1 sm:p-2 rounded-lg transition-colors ${editingField === field.id ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface-hover'}`}><FiSettings className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                            <button type="button" onClick={() => removeField(field.id)} className="p-1 sm:p-2 text-error hover:bg-error/20 rounded-lg transition-colors"><FiTrash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                          </div>
                        </div>
                        {editingField === field.id && (
                          <div className="px-2 pb-2 sm:px-4 sm:pb-4 pt-2 border-t border-subtle space-y-3 sm:space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                              <div>
                                <label className="block text-xs text-muted mb-1">Placeholder</label>
                                <input type="text" value={field.placeholder} onChange={(e) => updateField(field.id, { placeholder: e.target.value })} className="input text-sm" placeholder="Texto de exemplo..." />
                              </div>
                              <div>
                                <label className="block text-xs text-muted mb-1">Texto de ajuda</label>
                                <input type="text" value={field.help_text} onChange={(e) => updateField(field.id, { help_text: e.target.value })} className="input text-sm" placeholder="Instrucoes para o usuario..." />
                              </div>
                            </div>
                            {field.field_type === 'number' && (
                              <div>
                                <label className="block text-xs text-muted mb-1">Tipo de numero</label>
                                <div className="grid grid-cols-2 gap-2">
                                  {[{ value: 'monetario', label: 'Monetario (R$)' }, { value: 'quantidade', label: 'Quantidade (un)' }, { value: 'decimal', label: 'Decimal' }, { value: 'porcentagem', label: 'Porcentagem (%)' }].map(st => (
                                    <button key={st.value} type="button" onClick={() => updateField(field.id, { options: { numberSubtype: st.value } })} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${(field.options as { numberSubtype?: string } | null)?.numberSubtype === st.value ? 'bg-primary/15 border-primary text-primary' : 'bg-surface border-subtle text-muted hover:border-primary/40'}`}>{st.label}</button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {(field.field_type === 'dropdown' || field.field_type === 'checkbox_multiple') && (
                              <div>
                                <label className="block text-xs text-muted mb-2">Opcoes</label>
                                <div className="space-y-2">
                                  {(Array.isArray(field.options) ? field.options : []).map((opt: string, optIdx: number) => (
                                    <div key={optIdx} className="flex items-center gap-2">
                                      <span className="text-muted cursor-grab text-sm select-none">☰</span>
                                      <input type="text" value={opt} onChange={(e) => { const newOpts = [...(Array.isArray(field.options) ? field.options : [])]; newOpts[optIdx] = e.target.value; updateField(field.id, { options: newOpts }) }} placeholder={`Opcao ${optIdx + 1}`} className="input text-sm flex-1" />
                                      <button type="button" onClick={() => { const newOpts = (Array.isArray(field.options) ? field.options : []).filter((_: string, i: number) => i !== optIdx); updateField(field.id, { options: newOpts }) }} className="p-1 text-error hover:bg-error/20 rounded transition-colors shrink-0"><FiTrash2 className="w-3 h-3" /></button>
                                    </div>
                                  ))}
                                </div>
                                <button type="button" onClick={() => updateField(field.id, { options: [...(Array.isArray(field.options) ? field.options : []), ''] })} className="mt-2 text-xs text-primary hover:text-primary/80 font-medium py-1.5 px-3 border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">+ Adicionar opcao</button>
                              </div>
                            )}
                            {field.field_type === 'yes_no' && (
                              <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                                  <input type="checkbox" checked={(field.options as { allowPhoto?: boolean } | null)?.allowPhoto || false} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), allowPhoto: e.target.checked, photoRequired: false } })} className="rounded border-default bg-surface text-primary focus:ring-primary" />
                                  Permitir foto
                                </label>
                                {(field.options as { allowPhoto?: boolean } | null)?.allowPhoto && (
                                  <select value={(field.options as { photoRequired?: boolean } | null)?.photoRequired ? 'required' : 'optional'} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), photoRequired: e.target.value === 'required' } })} className="input text-sm">
                                    <option value="optional">Foto opcional</option>
                                    <option value="required">Foto obrigatoria</option>
                                  </select>
                                )}
                              </div>
                            )}
                            {!['dropdown', 'checkbox_multiple'].includes(field.field_type) && (<div><label className="block text-xs text-muted mb-1">Validacao cruzada</label><select value={(field.options as { validationRole?: string } | null)?.validationRole || ''} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), validationRole: e.target.value || null } })} className="input text-sm"><option value="">Nenhum</option><option value="nota">Numero da nota</option><option value="valor">Valor</option></select></div>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Visibility by Sector */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-main mb-2">Visibilidade por Setor</h2>
            <p className="text-sm text-muted mb-4">
              Selecione em quais setores este checklist estara disponivel.
              Apenas usuarios dos setores selecionados poderao preencher.
              Administradores sempre podem visualizar todos os checklists.
            </p>

            <div className="space-y-4">
              {stores.map(store => {
                const storeSectors = getSectorsForStore(store.id)
                const isFullyEnabled = isStoreFullyEnabled(store.id)
                const isPartiallyEnabled = isStorePartiallyEnabled(store.id)

                return (
                  <div
                    key={store.id}
                    className={`rounded-xl border transition-all ${
                      isPartiallyEnabled
                        ? 'border-primary bg-primary/5'
                        : 'border-subtle bg-surface'
                    }`}
                  >
                    {/* Store Header */}
                    <div className="p-4 flex items-center justify-between">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isFullyEnabled}
                          ref={input => {
                            if (input) {
                              input.indeterminate = isPartiallyEnabled && !isFullyEnabled
                            }
                          }}
                          onChange={() => toggleAllStoreSectors(store.id)}
                          className="w-5 h-5 rounded border-default bg-surface text-primary focus:ring-primary"
                        />
                        <span className={isPartiallyEnabled ? 'text-main font-medium' : 'text-secondary'}>
                          {store.name}
                        </span>
                      </label>

                      <span className="text-xs text-muted">
                        {storeSectors.filter(s => isSectorEnabled(store.id, s.id)).length} / {storeSectors.length} setores
                      </span>
                    </div>

                    {/* Sectors */}
                    {storeSectors.length > 0 && (
                      <div className="px-4 pb-4 flex flex-wrap gap-2">
                        {storeSectors.map(sector => (
                          <label
                            key={sector.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm ${
                              isSectorEnabled(store.id, sector.id)
                                ? 'bg-primary/20 text-primary border border-primary/30'
                                : 'bg-surface-hover text-muted border border-transparent hover:border-subtle'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSectorEnabled(store.id, sector.id)}
                              onChange={() => toggleSectorVisibility(store.id, sector.id)}
                              className="sr-only"
                            />
                            <FiGrid className="w-4 h-4" style={{ color: sector.color }} />
                            {sector.name}
                          </label>
                        ))}
                      </div>
                    )}

                    {storeSectors.length === 0 && (
                      <div className="px-4 pb-4">
                        <p className="text-xs text-muted">
                          Nenhum setor cadastrado nesta loja.{' '}
                          <Link href={APP_CONFIG.routes.adminSectors} className="text-primary hover:underline">
                            Criar setor
                          </Link>
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {visibility.length > 0 && (
              <div className="mt-4 p-3 bg-success/10 rounded-lg">
                <p className="text-sm text-success">
                  {visibility.length} setor{visibility.length > 1 ? 'es' : ''} selecionado{visibility.length > 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>

          {/* Function Filter (optional) */}
          {functions.length > 0 && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-main mb-2">Restringir por Funcao (Opcional)</h2>
              <p className="text-sm text-muted mb-4">
                Se nenhuma funcao for selecionada, o checklist estara disponivel para todas as funcoes.
                Selecione funcoes especificas para restringir o acesso.
              </p>

              <div className="flex flex-wrap gap-2">
                {functions.map(fn => (
                  <label
                    key={fn.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm ${
                      selectedFunctionIds.includes(fn.id)
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'bg-surface-hover text-muted border border-transparent hover:border-subtle'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFunctionIds.includes(fn.id)}
                      onChange={() => {
                        setSelectedFunctionIds(prev =>
                          prev.includes(fn.id)
                            ? prev.filter(id => id !== fn.id)
                            : [...prev, fn.id]
                        )
                      }}
                      className="sr-only"
                    />
                    <FiBriefcase className="w-4 h-4" style={{ color: fn.color }} />
                    {fn.name}
                  </label>
                ))}
              </div>

              {selectedFunctionIds.length > 0 && (
                <div className="mt-4 p-3 bg-info/10 rounded-lg">
                  <p className="text-sm text-info">
                    Restrito a {selectedFunctionIds.length} funcao{selectedFunctionIds.length > 1 ? 'es' : ''}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-error/10 rounded-xl border border-error/30">
              <p className="text-error text-sm">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <Link
              href={APP_CONFIG.routes.adminTemplates}
              className="btn-ghost"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center gap-2 px-6 py-3"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <FiSave className="w-4 h-4" />
                  Criar Checklist
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
