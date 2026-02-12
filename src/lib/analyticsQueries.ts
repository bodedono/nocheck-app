/**
 * Queries de analytics para conformidade e reincidencias.
 * Alimentam as tabs de relatorios (Fase 3).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

export type ComplianceSummary = {
  totalNonConformities: number
  complianceRate: number
  plansCreated: number
  plansResolved: number
  plansOverdue: number
}

export type FieldComplianceRow = {
  fieldId: number
  fieldName: string
  templateName: string
  totalPlans: number
  resolvedPlans: number
  complianceRate: number
}

export type StoreComplianceRow = {
  storeId: number
  storeName: string
  totalPlans: number
  resolvedPlans: number
  overduePlans: number
  rate: number
}

export type ReincidenciaSummary = {
  totalReincidencias: number
  avgReincidenciaRate: number
  worstField: string | null
  worstStore: string | null
}

export type ReincidenciaRow = {
  fieldId: number
  fieldName: string
  storeName: string
  templateName: string
  occurrences: number
  lastOccurrence: string
}

export type HeatmapCell = {
  storeId: number
  storeName: string
  fieldName: string
  count: number
}

export type AssigneeStats = {
  userId: string
  userName: string
  totalPlans: number
  completedPlans: number
  overduePlans: number
  avgResolutionDays: number | null
}

/**
 * Busca dados de conformidade para o periodo especificado
 */
export async function fetchComplianceData(
  supabase: SupabaseClient,
  days: number
): Promise<{
  summary: ComplianceSummary
  byField: FieldComplianceRow[]
  byStore: StoreComplianceRow[]
}> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffISO = cutoff.toISOString()

  // Buscar todos action_plans no periodo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: plans } = await (supabase as any)
    .from('action_plans')
    .select(`
      id, field_id, store_id, template_id, status, severity,
      is_reincidencia, reincidencia_count, deadline, created_at, completed_at,
      field:template_fields(name),
      store:stores(name),
      template:checklist_templates(name)
    `)
    .gte('created_at', cutoffISO)
    .order('created_at', { ascending: false })

  if (!plans || plans.length === 0) {
    return {
      summary: { totalNonConformities: 0, complianceRate: 100, plansCreated: 0, plansResolved: 0, plansOverdue: 0 },
      byField: [],
      byStore: [],
    }
  }

  // Summary
  const resolved = plans.filter((p: { status: string }) => p.status === 'concluido')
  const overdue = plans.filter((p: { status: string }) => p.status === 'vencido')

  // Buscar total de checklists no periodo para calcular taxa
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: totalChecklists } = await (supabase as any)
    .from('checklists')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', cutoffISO)

  const total = totalChecklists || 1
  const complianceRate = Math.round(((total - plans.length) / total) * 100 * 10) / 10

  const summary: ComplianceSummary = {
    totalNonConformities: plans.length,
    complianceRate: Math.max(0, complianceRate),
    plansCreated: plans.length,
    plansResolved: resolved.length,
    plansOverdue: overdue.length,
  }

  // By field
  const fieldMap = new Map<number, { fieldName: string; templateName: string; total: number; resolved: number }>()
  for (const p of plans) {
    const key = p.field_id || 0
    const existing = fieldMap.get(key)
    if (existing) {
      existing.total++
      if (p.status === 'concluido') existing.resolved++
    } else {
      fieldMap.set(key, {
        fieldName: p.field?.name || `Campo #${key}`,
        templateName: p.template?.name || '',
        total: 1,
        resolved: p.status === 'concluido' ? 1 : 0,
      })
    }
  }

  const byField: FieldComplianceRow[] = Array.from(fieldMap.entries())
    .map(([fieldId, data]) => ({
      fieldId,
      fieldName: data.fieldName,
      templateName: data.templateName,
      totalPlans: data.total,
      resolvedPlans: data.resolved,
      complianceRate: data.total > 0 ? Math.round((data.resolved / data.total) * 100) : 0,
    }))
    .sort((a, b) => b.totalPlans - a.totalPlans)

  // By store
  const storeMap = new Map<number, { storeName: string; total: number; resolved: number; overdue: number }>()
  for (const p of plans) {
    const key = p.store_id
    const existing = storeMap.get(key)
    if (existing) {
      existing.total++
      if (p.status === 'concluido') existing.resolved++
      if (p.status === 'vencido') existing.overdue++
    } else {
      storeMap.set(key, {
        storeName: p.store?.name || `Loja #${key}`,
        total: 1,
        resolved: p.status === 'concluido' ? 1 : 0,
        overdue: p.status === 'vencido' ? 1 : 0,
      })
    }
  }

  const byStore: StoreComplianceRow[] = Array.from(storeMap.entries())
    .map(([storeId, data]) => ({
      storeId,
      storeName: data.storeName,
      totalPlans: data.total,
      resolvedPlans: data.resolved,
      overduePlans: data.overdue,
      rate: data.total > 0 ? Math.round((data.resolved / data.total) * 100) : 0,
    }))
    .sort((a, b) => b.totalPlans - a.totalPlans)

  return { summary, byField, byStore }
}

/**
 * Busca dados de reincidencia
 */
export async function fetchReincidenciaData(
  supabase: SupabaseClient,
  days: number
): Promise<{
  summary: ReincidenciaSummary
  rows: ReincidenciaRow[]
  byAssignee: AssigneeStats[]
}> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffISO = cutoff.toISOString()

  // Buscar planos com reincidencia
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reincPlans } = await (supabase as any)
    .from('action_plans')
    .select(`
      id, field_id, store_id, template_id, reincidencia_count,
      created_at, status, assigned_to, completed_at, deadline,
      field:template_fields(name),
      store:stores(name),
      template:checklist_templates(name),
      assignee:users!action_plans_assigned_to_fkey(full_name)
    `)
    .eq('is_reincidencia', true)
    .gte('created_at', cutoffISO)
    .order('reincidencia_count', { ascending: false })

  // Buscar todos planos para stats de assignee
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allPlans } = await (supabase as any)
    .from('action_plans')
    .select(`
      id, assigned_to, status, created_at, completed_at, deadline,
      assignee:users!action_plans_assigned_to_fkey(full_name)
    `)
    .gte('created_at', cutoffISO)

  if (!reincPlans || reincPlans.length === 0) {
    // Build assignee stats even without reincidencias
    const byAssignee = buildAssigneeStats(allPlans || [])
    return {
      summary: { totalReincidencias: 0, avgReincidenciaRate: 0, worstField: null, worstStore: null },
      rows: [],
      byAssignee,
    }
  }

  // Group reincidencias by field+store
  const groupKey = (p: { field_id: number; store_id: number }) => `${p.field_id}-${p.store_id}`
  const groupMap = new Map<string, ReincidenciaRow>()

  for (const p of reincPlans) {
    const key = groupKey(p)
    const existing = groupMap.get(key)
    if (existing) {
      existing.occurrences++
      if (new Date(p.created_at) > new Date(existing.lastOccurrence)) {
        existing.lastOccurrence = p.created_at
      }
    } else {
      groupMap.set(key, {
        fieldId: p.field_id,
        fieldName: p.field?.name || `Campo #${p.field_id}`,
        storeName: p.store?.name || `Loja #${p.store_id}`,
        templateName: p.template?.name || '',
        occurrences: 1,
        lastOccurrence: p.created_at,
      })
    }
  }

  const rows = Array.from(groupMap.values()).sort((a, b) => b.occurrences - a.occurrences)

  // Find worst field and store
  const fieldCounts = new Map<string, number>()
  const storeCounts = new Map<string, number>()
  for (const p of reincPlans) {
    const fn = p.field?.name || ''
    const sn = p.store?.name || ''
    fieldCounts.set(fn, (fieldCounts.get(fn) || 0) + 1)
    storeCounts.set(sn, (storeCounts.get(sn) || 0) + 1)
  }

  let worstField: string | null = null
  let worstFieldCount = 0
  for (const [name, count] of fieldCounts) {
    if (count > worstFieldCount) { worstField = name; worstFieldCount = count }
  }

  let worstStore: string | null = null
  let worstStoreCount = 0
  for (const [name, count] of storeCounts) {
    if (count > worstStoreCount) { worstStore = name; worstStoreCount = count }
  }

  const summary: ReincidenciaSummary = {
    totalReincidencias: reincPlans.length,
    avgReincidenciaRate: rows.length > 0
      ? Math.round(rows.reduce((sum, r) => sum + r.occurrences, 0) / rows.length * 10) / 10
      : 0,
    worstField,
    worstStore,
  }

  const byAssignee = buildAssigneeStats(allPlans || [])

  return { summary, rows, byAssignee }
}

function buildAssigneeStats(plans: Array<{
  id: number
  assigned_to: string
  status: string
  created_at: string
  completed_at: string | null
  deadline: string
  assignee: { full_name: string } | null
}>): AssigneeStats[] {
  const map = new Map<string, {
    userName: string
    total: number
    completed: number
    overdue: number
    resolutionDays: number[]
  }>()

  for (const p of plans) {
    const key = p.assigned_to
    const existing = map.get(key)
    const isCompleted = p.status === 'concluido'
    const isOverdue = p.status === 'vencido'
    const resDays = isCompleted && p.completed_at && p.created_at
      ? Math.round((new Date(p.completed_at).getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null

    if (existing) {
      existing.total++
      if (isCompleted) existing.completed++
      if (isOverdue) existing.overdue++
      if (resDays !== null) existing.resolutionDays.push(resDays)
    } else {
      map.set(key, {
        userName: p.assignee?.full_name || 'Desconhecido',
        total: 1,
        completed: isCompleted ? 1 : 0,
        overdue: isOverdue ? 1 : 0,
        resolutionDays: resDays !== null ? [resDays] : [],
      })
    }
  }

  return Array.from(map.entries())
    .map(([userId, data]) => ({
      userId,
      userName: data.userName,
      totalPlans: data.total,
      completedPlans: data.completed,
      overduePlans: data.overdue,
      avgResolutionDays: data.resolutionDays.length > 0
        ? Math.round(data.resolutionDays.reduce((a, b) => a + b, 0) / data.resolutionDays.length)
        : null,
    }))
    .sort((a, b) => b.totalPlans - a.totalPlans)
}

/**
 * Busca dados para heatmap loja x campo
 */
export async function fetchStoreHeatmap(
  supabase: SupabaseClient,
  days: number
): Promise<{ cells: HeatmapCell[]; stores: string[]; fields: string[] }> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: plans } = await (supabase as any)
    .from('action_plans')
    .select(`
      store_id, field_id,
      store:stores(name),
      field:template_fields(name)
    `)
    .gte('created_at', cutoff.toISOString())

  if (!plans || plans.length === 0) {
    return { cells: [], stores: [], fields: [] }
  }

  const cellMap = new Map<string, HeatmapCell>()
  const storeSet = new Set<string>()
  const fieldSet = new Set<string>()

  for (const p of plans) {
    const storeName = p.store?.name || `Loja #${p.store_id}`
    const fieldName = p.field?.name || `Campo #${p.field_id}`
    storeSet.add(storeName)
    fieldSet.add(fieldName)

    const key = `${storeName}|${fieldName}`
    const existing = cellMap.get(key)
    if (existing) {
      existing.count++
    } else {
      cellMap.set(key, { storeId: p.store_id, storeName, fieldName, count: 1 })
    }
  }

  return {
    cells: Array.from(cellMap.values()),
    stores: Array.from(storeSet).sort(),
    fields: Array.from(fieldSet).sort(),
  }
}
