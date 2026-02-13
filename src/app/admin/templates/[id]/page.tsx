'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { APP_CONFIG } from '@/lib/config'
import { Header, LoadingPage, IconPicker } from '@/components/ui'
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
} from 'react-icons/fi'
import { RiDraggable } from 'react-icons/ri'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Store, FieldType, TemplateCategory, Sector, TemplateField, FunctionRow } from '@/types/database'
import { FieldConditionEditor, type ConditionConfig } from '@/components/admin/FieldConditionEditor'

type SectionConfig = {
  id: string
  dbId?: number
  name: string
  description: string
  sort_order: number
}

type FieldConfig = {
  id: string
  dbId?: number // ID from database for existing fields
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
  id?: number // ID from database for existing visibility
  store_id: number
  sector_id: number | null
  function_id: number | null
}

type SectorWithStore = Sector & {
  store: Store
}

function SortableItem({ id, children, className }: { id: string; className?: string; children: (listeners: Record<string, unknown>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: 'relative', zIndex: isDragging ? 50 : undefined }} className={className} {...attributes}>
      {children(listeners || {})}
    </div>
  )
}

export default function EditTemplatePage() {
  const params = useParams()
  const templateId = params.id as string

  const [stores, setStores] = useState<Store[]>([])
  const [sectors, setSectors] = useState<SectorWithStore[]>([])
  const [functions, setFunctions] = useState<FunctionRow[]>([])
  const [selectedFunctionIds, setSelectedFunctionIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Template form
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('recebimento')
  const [isActive, setIsActive] = useState(true)

  // Sections
  const [sections, setSections] = useState<SectionConfig[]>([])
  const [deletedSectionIds, setDeletedSectionIds] = useState<number[]>([])

  // Fields
  const [fields, setFields] = useState<FieldConfig[]>([])
  const [editingField, setEditingField] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [deletedFieldIds, setDeletedFieldIds] = useState<number[]>([])

  // Visibility - now includes sector_id
  const [visibility, setVisibility] = useState<VisibilityConfig[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_originalVisibilityIds, setOriginalVisibilityIds] = useState<number[]>([])
  const [fieldConditions, setFieldConditions] = useState<Record<string, ConditionConfig | null>>({})
  const [conditionUsers, setConditionUsers] = useState<{ id: string; name: string }[]>([])

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

      // Fetch users for condition editor
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: usersData } = await (supabase as any)
        .from('users')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name')
      if (usersData) setConditionUsers((usersData as { id: string; full_name: string }[]).map((u) => ({ id: u.id, name: u.full_name })))

      // Fetch template data with sections
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: templateData, error: templateError } = await (supabase as any)
        .from('checklist_templates')
        .select(`
          *,
          fields:template_fields(*),
          sections:template_sections(*),
          visibility:template_visibility(*)
        `)
        .eq('id', templateId)
        .single()

      if (templateError || !templateData) {
        setError('Checklist nao encontrado')
        setLoading(false)
        return
      }

      // Populate form with existing data
      setName(templateData.name)
      setDescription(templateData.description || '')
      setCategory(templateData.category || 'outros')
      setIsActive(templateData.is_active)

      // Convert sections to SectionConfig format
      type RawSection = { id: number; name: string; description: string | null; sort_order: number }
      const existingSections: SectionConfig[] = (templateData.sections || [])
        .sort((a: RawSection, b: RawSection) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((s: RawSection) => ({
          id: `section_${s.id}`,
          dbId: s.id,
          name: s.name,
          description: s.description || '',
          sort_order: s.sort_order || 0,
        }))
      setSections(existingSections)

      // Build db section id → local section id map
      const dbSectionToLocalMap: Record<number, string> = {}
      existingSections.forEach(s => {
        if (s.dbId) dbSectionToLocalMap[s.dbId] = s.id
      })

      // Convert fields to FieldConfig format
      type RawField = TemplateField & { section_id: number | null }
      const existingFields: FieldConfig[] = (templateData.fields || [])
        .sort((a: TemplateField, b: TemplateField) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((f: RawField) => ({
          id: `field_${f.id}`,
          dbId: f.id,
          section_id: f.section_id ? dbSectionToLocalMap[f.section_id] || null : null,
          name: f.name,
          field_type: f.field_type,
          is_required: f.is_required,
          sort_order: f.sort_order || 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          options: f.options as any,
          validation: f.validation as Record<string, unknown> | null,
          placeholder: f.placeholder || '',
          help_text: f.help_text || '',
        }))
      setFields(existingFields)

      // Load existing field conditions
      const dbFieldIds = existingFields.filter(f => f.dbId).map(f => f.dbId!)
      if (dbFieldIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existingConditions } = await (supabase as any)
          .from('field_conditions')
          .select('*')
          .in('field_id', dbFieldIds)
          .eq('is_active', true)
        if (existingConditions) {
          const condMap: Record<string, ConditionConfig | null> = {}
          existingConditions.forEach((ec: { field_id: number; condition_type: string; condition_value: Record<string, unknown>; severity: string; default_assignee_id: string | null; deadline_days: number; description_template: string | null }) => {
            const localField = existingFields.find(f => f.dbId === ec.field_id)
            if (localField) {
              condMap[localField.id] = {
                enabled: true,
                conditionType: ec.condition_type as ConditionConfig['conditionType'],
                conditionValue: ec.condition_value,
                severity: ec.severity as ConditionConfig['severity'],
                defaultAssigneeId: ec.default_assignee_id,
                deadlineDays: ec.deadline_days,
                descriptionTemplate: ec.description_template || '',
              }
            }
          })
          setFieldConditions(condMap)
        }
      }

      // Convert visibility to VisibilityConfig format
      // Extract unique (store, sector) pairs and collect function_ids separately
      const existingVisibility: VisibilityConfig[] = []
      const functionIdsSet = new Set<number>()

      ;(templateData.visibility || []).forEach((v: { id: number; store_id: number; sector_id: number | null; function_id: number | null }) => {
        if (v.function_id) {
          functionIdsSet.add(v.function_id)
        }
        const exists = existingVisibility.some(
          ev => ev.store_id === v.store_id && ev.sector_id === v.sector_id
        )
        if (!exists) {
          existingVisibility.push({
            id: v.id,
            store_id: v.store_id,
            sector_id: v.sector_id,
            function_id: null,
          })
        }
      })

      setVisibility(existingVisibility)
      setSelectedFunctionIds([...functionIdsSet])
      setOriginalVisibilityIds(existingVisibility.map((v: VisibilityConfig) => v.id!).filter(Boolean))

      setLoading(false)
    }

    fetchData()
  }, [supabase, templateId])

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
    const section = sections.find(s => s.id === id)
    if (section?.dbId) setDeletedSectionIds(prev => [...prev, section.dbId!])
    setSections(sections.filter(s => s.id !== id))
    setFields(fields.map(f => f.section_id === id ? { ...f, section_id: null } : f))
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSections(prev => {
      const oldIdx = prev.findIndex(s => s.id === active.id)
      const newIdx = prev.findIndex(s => s.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return prev
      return arrayMove(prev, oldIdx, newIdx).map((s, i) => ({ ...s, sort_order: i + 1 }))
    })
  }

  const handleFieldDragEnd = (sectionId: string | null) => (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setFields(prev => {
      const group = prev.filter(f => f.section_id === sectionId).sort((a, b) => a.sort_order - b.sort_order)
      const oldIdx = group.findIndex(f => f.id === active.id)
      const newIdx = group.findIndex(f => f.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return prev
      const reordered = arrayMove(group, oldIdx, newIdx)
      const sortMap = new Map(reordered.map((f, i) => [f.id, i + 1]))
      return prev.map(f => sortMap.has(f.id) ? { ...f, sort_order: sortMap.get(f.id)! } : f)
    })
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
    const field = fields.find(f => f.id === id)
    if (field?.dbId) {
      setDeletedFieldIds([...deletedFieldIds, field.dbId])
    }
    setFields(fields.filter(f => f.id !== id))
    if (editingField === id) setEditingField(null)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getFieldIcon = (field: FieldConfig): string | null => {
    if (field.options && typeof field.options === 'object' && !Array.isArray(field.options)) {
      return (field.options as Record<string, unknown>).icon as string | null || null
    }
    return null
  }

  const setFieldIcon = (fieldId: string, iconName: string | null) => {
    setFields(fields.map(f => {
      if (f.id !== fieldId) return f
      if (Array.isArray(f.options)) {
        return { ...f, options: iconName ? { items: f.options, icon: iconName } : f.options }
      } else if (f.options && typeof f.options === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const opts = { ...(f.options as any), icon: iconName }
        if (!iconName) delete opts.icon
        return { ...f, options: Object.keys(opts).length === 0 ? null : opts }
      } else {
        return iconName ? { ...f, options: { icon: iconName } } : f
      }
    }))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getOptionsItems = (options: any): string[] => {
    if (Array.isArray(options)) return options
    if (options && typeof options === 'object' && 'items' in options) {
      return options.items as string[]
    }
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serializeOptions = (options: any): any => {
    if (Array.isArray(options)) return options.filter((o: string) => o.trim())
    if (options && typeof options === 'object' && 'items' in options) {
      return { ...options, items: (options.items as string[]).filter((o: string) => o.trim()) }
    }
    return options
  }

  const changeFieldType = (id: string, newType: FieldType) => {
    const currentIcon = getFieldIcon(fields.find(f => f.id === id)!)
    let defaultOptions: unknown = (newType === 'dropdown' || newType === 'checkbox_multiple') ? [] : newType === 'number' ? { numberSubtype: 'decimal' } : null
    if (currentIcon) {
      if (Array.isArray(defaultOptions)) {
        defaultOptions = { items: defaultOptions, icon: currentIcon }
      } else if (defaultOptions && typeof defaultOptions === 'object') {
        defaultOptions = { ...(defaultOptions as Record<string, unknown>), icon: currentIcon }
      } else {
        defaultOptions = { icon: currentIcon }
      }
    }
    setFields(fields.map(f => f.id === id ? { ...f, field_type: newType, options: defaultOptions } : f))
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
    setSaving(true)

    if (fields.length === 0) {
      setError('Adicione pelo menos um campo ao checklist')
      setSaving(false)
      return
    }

    if (fields.some(f => !f.name.trim())) {
      setError('Todos os campos precisam ter um nome')
      setSaving(false)
      return
    }

    if (visibility.length === 0) {
      setError('Selecione pelo menos um setor para visibilidade')
      setSaving(false)
      return
    }

    try {
      // 1. Update template
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: templateError } = await (supabase as any)
        .from('checklist_templates')
        .update({
          name,
          description: description || null,
          category,
          is_active: isActive,
        })
        .eq('id', templateId)

      if (templateError) throw templateError

      // 2. Handle sections: delete removed, update existing, insert new
      if (deletedSectionIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: delSecErr } = await (supabase as any)
          .from('template_sections')
          .delete()
          .in('id', deletedSectionIds)
        if (delSecErr) throw delSecErr
      }

      // Build local section id → db section id map
      const sectionIdMap: Record<string, number> = {}

      // Update existing sections
      for (const section of sections.filter(s => s.dbId)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updSecErr } = await (supabase as any)
          .from('template_sections')
          .update({ name: section.name, description: section.description || null, sort_order: section.sort_order })
          .eq('id', section.dbId)
        if (updSecErr) throw updSecErr
        sectionIdMap[section.id] = section.dbId!
      }

      // Insert new sections
      const newSections = sections.filter(s => !s.dbId)
      if (newSections.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: insertedSections, error: insSecErr } = await (supabase as any)
          .from('template_sections')
          .insert(newSections.map(s => ({
            template_id: Number(templateId),
            name: s.name,
            description: s.description || null,
            sort_order: s.sort_order,
          })))
          .select()
        if (insSecErr) throw insSecErr
        if (insertedSections) {
          newSections.forEach((s, i) => { sectionIdMap[s.id] = insertedSections[i].id })
        }
      }

      // 3. Delete removed fields
      if (deletedFieldIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: deleteFieldsError } = await (supabase as any)
          .from('template_fields')
          .delete()
          .in('id', deletedFieldIds)

        if (deleteFieldsError) throw deleteFieldsError
      }

      // 4. Update existing fields and insert new ones
      const existingFields = fields.filter(f => f.dbId)
      const newFields = fields.filter(f => !f.dbId)

      // Resolve section_id: local → db
      const resolveSection = (localId: string | null): number | null => {
        if (!localId) return null
        return sectionIdMap[localId] || null
      }

      // Update existing fields
      for (const field of existingFields) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from('template_fields')
          .update({
            name: field.name,
            field_type: field.field_type,
            is_required: field.is_required,
            sort_order: field.sort_order,
            section_id: resolveSection(field.section_id),
            options: serializeOptions(field.options),
            validation: field.validation,
            placeholder: field.placeholder || null,
            help_text: field.help_text || null,
          })
          .eq('id', field.dbId)

        if (updateError) throw updateError
      }

      // Insert new fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let insertedNewFields: any[] | null = null
      if (newFields.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: insertFieldsError } = await (supabase as any)
          .from('template_fields')
          .insert(
            newFields.map(f => ({
              template_id: Number(templateId),
              section_id: resolveSection(f.section_id),
              name: f.name,
              field_type: f.field_type,
              is_required: f.is_required,
              sort_order: f.sort_order,
              options: serializeOptions(f.options),
              validation: f.validation,
              placeholder: f.placeholder || null,
              help_text: f.help_text || null,
            }))
          )
          .select()

        if (insertFieldsError) throw insertFieldsError
        insertedNewFields = data
      }

      // 4. Handle visibility changes
      // Delete all existing visibility entries and re-create
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteVisError } = await (supabase as any)
        .from('template_visibility')
        .delete()
        .eq('template_id', templateId)

      if (deleteVisError) throw deleteVisError

      // Insert new visibility (with function_id if functions are selected)
      if (visibility.length > 0) {
        const visibilityEntries: { template_id: number; store_id: number; sector_id: number | null; function_id: number | null; roles: string[] }[] = []

        if (selectedFunctionIds.length === 0) {
          // No function restriction
          visibility.forEach(v => {
            visibilityEntries.push({
              template_id: Number(templateId),
              store_id: v.store_id,
              sector_id: v.sector_id,
              function_id: null,
              roles: [],
            })
          })
        } else {
          // One entry per (store, sector, function) combo
          visibility.forEach(v => {
            selectedFunctionIds.forEach(fnId => {
              visibilityEntries.push({
                template_id: Number(templateId),
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

      // Handle field conditions: delete all existing for this template's fields, re-insert
      const allDbFieldIds = [
        ...existingFields.map(f => f.dbId!).filter(Boolean),
        ...(insertedNewFields || []).map((f: { id: number }) => f.id),
      ]
      if (allDbFieldIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('field_conditions')
          .delete()
          .in('field_id', allDbFieldIds)

        // Build local→db field id map for new fields
        const newFieldIdMap: Record<string, number> = {}
        if (insertedNewFields) {
          newFields.forEach((f, i) => { newFieldIdMap[f.id] = insertedNewFields[i]?.id })
        }

        const conditionsToInsert: { field_id: number; condition_type: string; condition_value: Record<string, unknown>; severity: string; default_assignee_id: string | null; deadline_days: number; description_template: string | null; is_active: boolean }[] = []
        for (const field of fields) {
          const cond = fieldConditions[field.id]
          if (!cond) continue
          const dbFieldId = field.dbId || newFieldIdMap[field.id]
          if (!dbFieldId) continue
          conditionsToInsert.push({
            field_id: dbFieldId,
            condition_type: cond.conditionType,
            condition_value: cond.conditionValue,
            severity: cond.severity,
            default_assignee_id: cond.defaultAssigneeId,
            deadline_days: cond.deadlineDays,
            description_template: cond.descriptionTemplate || null,
            is_active: true,
          })
        }
        if (conditionsToInsert.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('field_conditions').insert(conditionsToInsert)
        }
      }

      router.push(APP_CONFIG.routes.adminTemplates)
    } catch (err) {
      console.error('Error updating template:', err)
      // Supabase errors are plain objects with message/details, not Error instances
      const supaErr = err as { message?: string; details?: string; code?: string }
      const msg = supaErr?.message || supaErr?.details || 'Erro ao atualizar checklist'
      setError(msg)
      setSaving(false)
    }
  }

  const getFieldTypeLabel = (type: FieldType) => {
    return fieldTypes.find(f => f.value === type)?.label || type
  }

  const getFieldTypeIcon = (type: FieldType) => {
    return fieldTypes.find(f => f.value === type)?.icon || '?'
  }

  if (loading) {
    return <LoadingPage />
  }

  if (error && !name) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center">
          <p className="text-error mb-4">{error}</p>
          <Link href={APP_CONFIG.routes.adminTemplates} className="text-primary hover:underline">
            Voltar para lista
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        title="Editar Checklist"
        icon={FiClipboard}
        backHref={APP_CONFIG.routes.adminTemplates}
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

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Status
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-5 h-5 rounded border-default bg-surface text-primary focus:ring-primary"
                  />
                  <span className={isActive ? 'text-success' : 'text-muted'}>
                    {isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </label>
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
                <button type="button" onClick={addSection} className="btn-secondary flex items-center gap-2 px-3 py-2 text-sm">
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
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
                <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {sections.map((section, idx) => {
                  const sectionFields = fields
                    .filter(f => f.section_id === section.id)
                    .sort((a, b) => a.sort_order - b.sort_order)
                  const isExpanded = expandedSection === section.id

                  return (
                    <SortableItem key={section.id} id={section.id} className="border border-subtle rounded-xl overflow-hidden">
                    {(dragListeners) => (<>
                      <div
                        className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 cursor-pointer transition-colors ${isExpanded ? 'bg-primary/10 border-b border-subtle' : 'bg-surface hover:bg-surface-hover'}`}
                        onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                      >
                        <div {...dragListeners} onClick={e => e.stopPropagation()} className="cursor-grab active:cursor-grabbing p-1 text-muted hover:text-primary touch-none">
                          <RiDraggable className="w-5 h-5" />
                        </div>
                        <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{idx + 1}</span>
                        <input type="text" value={section.name} onChange={(e) => updateSection(section.id, { name: e.target.value })} onClick={e => e.stopPropagation()} placeholder="Nome da etapa" className="flex-1 min-w-0 bg-transparent border-none text-main placeholder:text-muted focus:outline-none font-medium text-sm sm:text-base" />
                        <span className="text-xs text-muted whitespace-nowrap hidden sm:inline">{sectionFields.length} campos</span>
                        {isExpanded ? <FiChevronUp className="w-4 h-4 text-primary shrink-0" /> : <FiChevronDown className="w-4 h-4 text-muted shrink-0" />}
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeSection(section.id) }} className="p-1.5 sm:p-2 text-error hover:bg-error/20 rounded-lg transition-colors shrink-0"><FiTrash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                      </div>

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
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd(section.id)}>
                            <SortableContext items={sectionFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                            {sectionFields.map((field) => (
                              <SortableItem key={field.id} id={field.id} className={`border rounded-xl transition-colors ${editingField === field.id ? 'border-primary bg-surface-hover' : 'border-subtle bg-surface'}`}>
                              {(fieldListeners) => (<>
                                <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3">
                                  <div {...fieldListeners} className="cursor-grab active:cursor-grabbing p-1 text-muted hover:text-primary touch-none">
                                    <RiDraggable className="w-4 h-4" />
                                  </div>
                                  <IconPicker value={getFieldIcon(field)} onChange={(icon) => setFieldIcon(field.id, icon)} fallback={getFieldTypeIcon(field.field_type)} />
                                  <div className="flex-1 min-w-0">
                                    <input type="text" value={field.name} onChange={(e) => updateField(field.id, { name: e.target.value })} placeholder="Nome do campo" className="w-full bg-transparent border-none text-main placeholder:text-muted focus:outline-none font-medium text-xs sm:text-sm" />
                                    <p className="text-[10px] sm:text-xs text-muted">{getFieldTypeLabel(field.field_type)}</p>
                                  </div>
                                  <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                                    <label className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-secondary" title="Obrigatorio"><input type="checkbox" checked={field.is_required} onChange={(e) => updateField(field.id, { is_required: e.target.checked })} className="rounded border-default bg-surface text-primary focus:ring-primary w-3 h-3 sm:w-3.5 sm:h-3.5" /><span className="hidden sm:inline">Obrig.</span><span className="sm:hidden">*</span></label>
                                    <button type="button" onClick={() => setEditingField(editingField === field.id ? null : field.id)} className={`p-1 sm:p-1.5 rounded-lg transition-colors ${editingField === field.id ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface-hover'}`}><FiSettings className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                                    <button type="button" onClick={() => removeField(field.id)} className="p-1 sm:p-1.5 text-error hover:bg-error/20 rounded-lg transition-colors"><FiTrash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                                  </div>
                                </div>
                                {editingField === field.id && (
                                  <div className="px-2 pb-2 sm:px-3 sm:pb-3 pt-2 border-t border-subtle space-y-3">
                                    <div>
                                      <label className="block text-xs text-muted mb-1">Tipo do campo</label>
                                      <select value={field.field_type} onChange={(e) => changeFieldType(field.id, e.target.value as FieldType)} className="input text-sm">
                                        {fieldTypes.map(ft => (<option key={ft.value} value={ft.value}>{ft.icon} {ft.label}</option>))}
                                      </select>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div><label className="block text-xs text-muted mb-1">Placeholder</label><input type="text" value={field.placeholder} onChange={(e) => updateField(field.id, { placeholder: e.target.value })} className="input text-sm" placeholder="Texto de exemplo..." /></div>
                                      <div><label className="block text-xs text-muted mb-1">Texto de ajuda</label><input type="text" value={field.help_text} onChange={(e) => updateField(field.id, { help_text: e.target.value })} className="input text-sm" placeholder="Instrucoes para o usuario..." /></div>
                                    </div>
                                    {sections.length > 0 && (<div><label className="block text-xs text-muted mb-1">Mover para etapa</label><select value={field.section_id || ''} onChange={(e) => updateField(field.id, { section_id: e.target.value || null })} className="input text-sm"><option value="">Sem etapa (geral)</option>{sections.map(s => (<option key={s.id} value={s.id}>{s.name || '(sem nome)'}</option>))}</select></div>)}
                                    {field.field_type === 'number' && (<div><label className="block text-xs text-muted mb-1">Tipo de numero</label><div className="grid grid-cols-2 gap-2">{[{ value: 'monetario', label: 'Monetario (R$)' }, { value: 'quantidade', label: 'Quantidade (un)' }, { value: 'decimal', label: 'Decimal' }, { value: 'porcentagem', label: 'Porcentagem (%)' }].map(st => (<button key={st.value} type="button" onClick={() => updateField(field.id, { options: { numberSubtype: st.value, ...(getFieldIcon(field) ? { icon: getFieldIcon(field) } : {}) } })} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${(field.options as { numberSubtype?: string } | null)?.numberSubtype === st.value ? 'bg-primary/15 border-primary text-primary' : 'bg-surface border-subtle text-muted hover:border-primary/40'}`}>{st.label}</button>))}</div></div>)}
                                    {(field.field_type === 'dropdown' || field.field_type === 'checkbox_multiple') && (<div><label className="block text-xs text-muted mb-2">Opcoes</label><div className="space-y-2">{(getOptionsItems(field.options)).map((opt: string, optIdx: number) => (<div key={optIdx} className="flex items-center gap-2"><span className="text-muted cursor-grab text-sm select-none">☰</span><input type="text" value={opt} onChange={(e) => { const newOpts = [...(getOptionsItems(field.options))]; newOpts[optIdx] = e.target.value; updateField(field.id, { options: getFieldIcon(field) ? { items: newOpts, icon: getFieldIcon(field) } : newOpts }) }} placeholder={`Opcao ${optIdx + 1}`} className="input text-sm flex-1" /><button type="button" onClick={() => { const newOpts = (getOptionsItems(field.options)).filter((_: string, i: number) => i !== optIdx); updateField(field.id, { options: getFieldIcon(field) ? { items: newOpts, icon: getFieldIcon(field) } : newOpts }) }} className="p-1 text-error hover:bg-error/20 rounded transition-colors shrink-0"><FiTrash2 className="w-3 h-3" /></button></div>))}</div><button type="button" onClick={() => { const newItems = [...getOptionsItems(field.options), '']; updateField(field.id, { options: getFieldIcon(field) ? { items: newItems, icon: getFieldIcon(field) } : newItems }) }} className="mt-2 text-xs text-primary hover:text-primary/80 font-medium py-1.5 px-3 border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">+ Adicionar opcao</button></div>)}
                                    {field.field_type === 'yes_no' && (<div className="space-y-2"><label className="flex items-center gap-2 text-sm text-secondary cursor-pointer"><input type="checkbox" checked={(field.options as { allowPhoto?: boolean } | null)?.allowPhoto || false} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), allowPhoto: e.target.checked, photoRequired: false } })} className="rounded border-default bg-surface text-primary focus:ring-primary" />Permitir foto</label>{(field.options as { allowPhoto?: boolean } | null)?.allowPhoto && (<select value={(field.options as { photoRequired?: boolean } | null)?.photoRequired ? 'required' : 'optional'} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), photoRequired: e.target.value === 'required' } })} className="input text-sm"><option value="optional">Foto opcional</option><option value="required">Foto obrigatoria</option></select>)}</div>)}
                                    {!['dropdown', 'checkbox_multiple'].includes(field.field_type) && (<div><label className="block text-xs text-muted mb-1">Validacao cruzada</label><select value={(field.options as { validationRole?: string } | null)?.validationRole || ''} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), validationRole: e.target.value || null } })} className="input text-sm"><option value="">Nenhum</option><option value="nota">Numero da nota</option><option value="valor">Valor</option></select></div>)}
                                    <FieldConditionEditor
                                      fieldType={field.field_type}
                                      fieldName={field.name}
                                      dropdownOptions={field.field_type === 'dropdown' ? getOptionsItems(field.options) : undefined}
                                      checkboxOptions={field.field_type === 'checkbox_multiple' ? getOptionsItems(field.options) : undefined}
                                      condition={fieldConditions[field.id] || null}
                                      onChange={(cond) => setFieldConditions(prev => ({ ...prev, [field.id]: cond }))}
                                      users={conditionUsers}
                                    />
                                  </div>
                                )}
                              </>)}
                              </SortableItem>
                            ))}
                            </SortableContext>
                            </DndContext>
                          )}
                        </div>
                      )}
                    </>)}
                    </SortableItem>
                  )
                })}
                </SortableContext>
                </DndContext>

                {/* Campos Gerais */}
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
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd(null)}>
                      <SortableContext items={generalFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                      {generalFields.map((field) => (
                        <SortableItem key={field.id} id={field.id} className={`border rounded-xl transition-colors ${editingField === field.id ? 'border-primary bg-surface-hover' : 'border-subtle bg-surface'}`}>
                        {(fieldListeners) => (<>
                          <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3">
                            <div {...fieldListeners} className="cursor-grab active:cursor-grabbing p-1 text-muted hover:text-primary touch-none">
                              <RiDraggable className="w-4 h-4" />
                            </div>
                            <IconPicker value={getFieldIcon(field)} onChange={(icon) => setFieldIcon(field.id, icon)} fallback={getFieldTypeIcon(field.field_type)} />
                            <div className="flex-1 min-w-0">
                              <input type="text" value={field.name} onChange={(e) => updateField(field.id, { name: e.target.value })} placeholder="Nome do campo" className="w-full bg-transparent border-none text-main placeholder:text-muted focus:outline-none font-medium text-xs sm:text-sm" />
                              <p className="text-[10px] sm:text-xs text-muted">{getFieldTypeLabel(field.field_type)}</p>
                            </div>
                            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                              <label className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-secondary" title="Obrigatorio"><input type="checkbox" checked={field.is_required} onChange={(e) => updateField(field.id, { is_required: e.target.checked })} className="rounded border-default bg-surface text-primary focus:ring-primary w-3 h-3 sm:w-3.5 sm:h-3.5" /><span className="hidden sm:inline">Obrig.</span><span className="sm:hidden">*</span></label>
                              <button type="button" onClick={() => setEditingField(editingField === field.id ? null : field.id)} className={`p-1 sm:p-1.5 rounded-lg transition-colors ${editingField === field.id ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface-hover'}`}><FiSettings className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                              <button type="button" onClick={() => removeField(field.id)} className="p-1 sm:p-1.5 text-error hover:bg-error/20 rounded-lg transition-colors"><FiTrash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                            </div>
                          </div>
                          {editingField === field.id && (
                            <div className="px-2 pb-2 sm:px-3 sm:pb-3 pt-2 border-t border-subtle space-y-3">
                              <div>
                                <label className="block text-xs text-muted mb-1">Tipo do campo</label>
                                <select value={field.field_type} onChange={(e) => changeFieldType(field.id, e.target.value as FieldType)} className="input text-sm">
                                  {fieldTypes.map(ft => (<option key={ft.value} value={ft.value}>{ft.icon} {ft.label}</option>))}
                                </select>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div><label className="block text-xs text-muted mb-1">Placeholder</label><input type="text" value={field.placeholder} onChange={(e) => updateField(field.id, { placeholder: e.target.value })} className="input text-sm" placeholder="Texto de exemplo..." /></div>
                                <div><label className="block text-xs text-muted mb-1">Texto de ajuda</label><input type="text" value={field.help_text} onChange={(e) => updateField(field.id, { help_text: e.target.value })} className="input text-sm" placeholder="Instrucoes para o usuario..." /></div>
                              </div>
                              <div><label className="block text-xs text-muted mb-1">Mover para etapa</label><select value={field.section_id || ''} onChange={(e) => updateField(field.id, { section_id: e.target.value || null })} className="input text-sm"><option value="">Sem etapa (geral)</option>{sections.map(s => (<option key={s.id} value={s.id}>{s.name || '(sem nome)'}</option>))}</select></div>
                              {field.field_type === 'number' && (<div><label className="block text-xs text-muted mb-1">Tipo de numero</label><div className="grid grid-cols-2 gap-2">{[{ value: 'monetario', label: 'Monetario (R$)' }, { value: 'quantidade', label: 'Quantidade (un)' }, { value: 'decimal', label: 'Decimal' }, { value: 'porcentagem', label: 'Porcentagem (%)' }].map(st => (<button key={st.value} type="button" onClick={() => updateField(field.id, { options: { numberSubtype: st.value, ...(getFieldIcon(field) ? { icon: getFieldIcon(field) } : {}) } })} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${(field.options as { numberSubtype?: string } | null)?.numberSubtype === st.value ? 'bg-primary/15 border-primary text-primary' : 'bg-surface border-subtle text-muted hover:border-primary/40'}`}>{st.label}</button>))}</div></div>)}
                              {(field.field_type === 'dropdown' || field.field_type === 'checkbox_multiple') && (<div><label className="block text-xs text-muted mb-2">Opcoes</label><div className="space-y-2">{(getOptionsItems(field.options)).map((opt: string, optIdx: number) => (<div key={optIdx} className="flex items-center gap-2"><span className="text-muted cursor-grab text-sm select-none">☰</span><input type="text" value={opt} onChange={(e) => { const newOpts = [...(getOptionsItems(field.options))]; newOpts[optIdx] = e.target.value; updateField(field.id, { options: getFieldIcon(field) ? { items: newOpts, icon: getFieldIcon(field) } : newOpts }) }} placeholder={`Opcao ${optIdx + 1}`} className="input text-sm flex-1" /><button type="button" onClick={() => { const newOpts = (getOptionsItems(field.options)).filter((_: string, i: number) => i !== optIdx); updateField(field.id, { options: getFieldIcon(field) ? { items: newOpts, icon: getFieldIcon(field) } : newOpts }) }} className="p-1 text-error hover:bg-error/20 rounded transition-colors shrink-0"><FiTrash2 className="w-3 h-3" /></button></div>))}</div><button type="button" onClick={() => { const newItems = [...getOptionsItems(field.options), '']; updateField(field.id, { options: getFieldIcon(field) ? { items: newItems, icon: getFieldIcon(field) } : newItems }) }} className="mt-2 text-xs text-primary hover:text-primary/80 font-medium py-1.5 px-3 border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">+ Adicionar opcao</button></div>)}
                              {field.field_type === 'yes_no' && (<div className="space-y-2"><label className="flex items-center gap-2 text-sm text-secondary cursor-pointer"><input type="checkbox" checked={(field.options as { allowPhoto?: boolean } | null)?.allowPhoto || false} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), allowPhoto: e.target.checked, photoRequired: false } })} className="rounded border-default bg-surface text-primary focus:ring-primary" />Permitir foto</label>{(field.options as { allowPhoto?: boolean } | null)?.allowPhoto && (<select value={(field.options as { photoRequired?: boolean } | null)?.photoRequired ? 'required' : 'optional'} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), photoRequired: e.target.value === 'required' } })} className="input text-sm"><option value="optional">Foto opcional</option><option value="required">Foto obrigatoria</option></select>)}</div>)}
                              {!['dropdown', 'checkbox_multiple'].includes(field.field_type) && (<div><label className="block text-xs text-muted mb-1">Validacao cruzada</label><select value={(field.options as { validationRole?: string } | null)?.validationRole || ''} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), validationRole: e.target.value || null } })} className="input text-sm"><option value="">Nenhum</option><option value="nota">Numero da nota</option><option value="valor">Valor</option></select></div>)}
                                    <FieldConditionEditor
                                      fieldType={field.field_type}
                                      fieldName={field.name}
                                      dropdownOptions={field.field_type === 'dropdown' ? getOptionsItems(field.options) : undefined}
                                      checkboxOptions={field.field_type === 'checkbox_multiple' ? getOptionsItems(field.options) : undefined}
                                      condition={fieldConditions[field.id] || null}
                                      onChange={(cond) => setFieldConditions(prev => ({ ...prev, [field.id]: cond }))}
                                      users={conditionUsers}
                                    />
                            </div>
                          )}
                        </>)}
                        </SortableItem>
                      ))}
                      </SortableContext>
                      </DndContext>
                    )
                  })()}
                </div>
              </div>
            ) : (
              <>
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
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd(null)}>
                  <SortableContext items={[...fields].sort((a, b) => a.sort_order - b.sort_order).map(f => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {[...fields].sort((a, b) => a.sort_order - b.sort_order).map((field) => (
                      <SortableItem key={field.id} id={field.id} className={`border rounded-xl transition-colors ${editingField === field.id ? 'border-primary bg-surface-hover' : 'border-subtle bg-surface'}`}>
                      {(fieldListeners) => (<>
                        <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-4">
                          <div {...fieldListeners} className="cursor-grab active:cursor-grabbing p-1 text-muted hover:text-primary touch-none">
                            <RiDraggable className="w-4 h-4 sm:w-5 sm:h-5" />
                          </div>
                          <IconPicker value={getFieldIcon(field)} onChange={(icon) => setFieldIcon(field.id, icon)} fallback={getFieldTypeIcon(field.field_type)} />
                          <div className="flex-1 min-w-0">
                            <input type="text" value={field.name} onChange={(e) => updateField(field.id, { name: e.target.value })} placeholder="Nome do campo" className="w-full bg-transparent border-none text-main placeholder:text-muted focus:outline-none font-medium text-sm sm:text-base" />
                            <p className="text-[10px] sm:text-xs text-muted">{getFieldTypeLabel(field.field_type)}</p>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                            <label className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-sm text-secondary" title="Obrigatorio"><input type="checkbox" checked={field.is_required} onChange={(e) => updateField(field.id, { is_required: e.target.checked })} className="rounded border-default bg-surface text-primary focus:ring-primary w-3 h-3 sm:w-4 sm:h-4" /><span className="hidden sm:inline">Obrigatorio</span><span className="sm:hidden">*</span></label>
                            <button type="button" onClick={() => setEditingField(editingField === field.id ? null : field.id)} className={`p-1 sm:p-2 rounded-lg transition-colors ${editingField === field.id ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface-hover'}`}><FiSettings className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                            <button type="button" onClick={() => removeField(field.id)} className="p-1 sm:p-2 text-error hover:bg-error/20 rounded-lg transition-colors"><FiTrash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                          </div>
                        </div>
                        {editingField === field.id && (
                          <div className="px-2 pb-2 sm:px-4 sm:pb-4 pt-2 border-t border-subtle space-y-3 sm:space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                              <div><label className="block text-xs text-muted mb-1">Tipo do campo</label><select value={field.field_type} onChange={(e) => changeFieldType(field.id, e.target.value as FieldType)} className="input text-sm">{fieldTypes.map(ft => (<option key={ft.value} value={ft.value}>{ft.icon} {ft.label}</option>))}</select></div>
                              <div><label className="block text-xs text-muted mb-1">Placeholder</label><input type="text" value={field.placeholder} onChange={(e) => updateField(field.id, { placeholder: e.target.value })} className="input text-sm" placeholder="Texto de exemplo..." /></div>
                              <div><label className="block text-xs text-muted mb-1">Texto de ajuda</label><input type="text" value={field.help_text} onChange={(e) => updateField(field.id, { help_text: e.target.value })} className="input text-sm" placeholder="Instrucoes para o usuario..." /></div>
                            </div>
                            {field.field_type === 'number' && (<div><label className="block text-xs text-muted mb-1">Tipo de numero</label><div className="grid grid-cols-2 gap-2">{[{ value: 'monetario', label: 'Monetario (R$)' }, { value: 'quantidade', label: 'Quantidade (un)' }, { value: 'decimal', label: 'Decimal' }, { value: 'porcentagem', label: 'Porcentagem (%)' }].map(st => (<button key={st.value} type="button" onClick={() => updateField(field.id, { options: { numberSubtype: st.value, ...(getFieldIcon(field) ? { icon: getFieldIcon(field) } : {}) } })} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${(field.options as { numberSubtype?: string } | null)?.numberSubtype === st.value ? 'bg-primary/15 border-primary text-primary' : 'bg-surface border-subtle text-muted hover:border-primary/40'}`}>{st.label}</button>))}</div></div>)}
                            {(field.field_type === 'dropdown' || field.field_type === 'checkbox_multiple') && (<div><label className="block text-xs text-muted mb-2">Opcoes</label><div className="space-y-2">{(getOptionsItems(field.options)).map((opt: string, optIdx: number) => (<div key={optIdx} className="flex items-center gap-2"><span className="text-muted cursor-grab text-sm select-none">☰</span><input type="text" value={opt} onChange={(e) => { const newOpts = [...(getOptionsItems(field.options))]; newOpts[optIdx] = e.target.value; updateField(field.id, { options: getFieldIcon(field) ? { items: newOpts, icon: getFieldIcon(field) } : newOpts }) }} placeholder={`Opcao ${optIdx + 1}`} className="input text-sm flex-1" /><button type="button" onClick={() => { const newOpts = (getOptionsItems(field.options)).filter((_: string, i: number) => i !== optIdx); updateField(field.id, { options: getFieldIcon(field) ? { items: newOpts, icon: getFieldIcon(field) } : newOpts }) }} className="p-1 text-error hover:bg-error/20 rounded transition-colors shrink-0"><FiTrash2 className="w-3 h-3" /></button></div>))}</div><button type="button" onClick={() => { const newItems = [...getOptionsItems(field.options), '']; updateField(field.id, { options: getFieldIcon(field) ? { items: newItems, icon: getFieldIcon(field) } : newItems }) }} className="mt-2 text-xs text-primary hover:text-primary/80 font-medium py-1.5 px-3 border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">+ Adicionar opcao</button></div>)}
                            {field.field_type === 'yes_no' && (<div className="space-y-2"><label className="flex items-center gap-2 text-sm text-secondary cursor-pointer"><input type="checkbox" checked={(field.options as { allowPhoto?: boolean } | null)?.allowPhoto || false} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), allowPhoto: e.target.checked, photoRequired: false } })} className="rounded border-default bg-surface text-primary focus:ring-primary" />Permitir foto</label>{(field.options as { allowPhoto?: boolean } | null)?.allowPhoto && (<select value={(field.options as { photoRequired?: boolean } | null)?.photoRequired ? 'required' : 'optional'} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), photoRequired: e.target.value === 'required' } })} className="input text-sm"><option value="optional">Foto opcional</option><option value="required">Foto obrigatoria</option></select>)}</div>)}
                            {!['dropdown', 'checkbox_multiple'].includes(field.field_type) && (<div><label className="block text-xs text-muted mb-1">Validacao cruzada</label><select value={(field.options as { validationRole?: string } | null)?.validationRole || ''} onChange={(e) => updateField(field.id, { options: { ...((field.options as Record<string, unknown>) || {}), validationRole: e.target.value || null } })} className="input text-sm"><option value="">Nenhum</option><option value="nota">Numero da nota</option><option value="valor">Valor</option></select></div>)}
                                    <FieldConditionEditor
                                      fieldType={field.field_type}
                                      fieldName={field.name}
                                      dropdownOptions={field.field_type === 'dropdown' ? getOptionsItems(field.options) : undefined}
                                      checkboxOptions={field.field_type === 'checkbox_multiple' ? getOptionsItems(field.options) : undefined}
                                      condition={fieldConditions[field.id] || null}
                                      onChange={(cond) => setFieldConditions(prev => ({ ...prev, [field.id]: cond }))}
                                      users={conditionUsers}
                                    />
                          </div>
                        )}
                      </>)}
                      </SortableItem>
                    ))}
                  </div>
                  </SortableContext>
                  </DndContext>
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
              disabled={saving}
              className="btn-primary flex items-center gap-2 px-6 py-3"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <FiSave className="w-4 h-4" />
                  Salvar Alteracoes
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
