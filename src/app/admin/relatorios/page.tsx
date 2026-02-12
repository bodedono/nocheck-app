'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import {
  FiBarChart2,
  FiTrendingUp,
  FiUsers,
  FiMapPin,
  FiClipboard,
  FiCheckCircle,
  FiWifiOff,
  FiEye,
  FiFilter,
  FiChevronLeft,
  FiChevronRight,
  FiAlertTriangle,
  FiRepeat,
} from 'react-icons/fi'
import Link from 'next/link'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import { getAuthCache, getUserCache } from '@/lib/offlineCache'
import { fetchComplianceData, fetchReincidenciaData, fetchStoreHeatmap, type ComplianceSummary, type FieldComplianceRow, type StoreComplianceRow, type ReincidenciaSummary, type ReincidenciaRow, type AssigneeStats, type HeatmapCell } from '@/lib/analyticsQueries'

type StoreStats = {
  store_id: number
  store_name: string
  total_checklists: number
  completed_today: number
  completion_rate: number
}

type TemplateStats = {
  template_id: number
  template_name: string
  total_uses: number
  avg_completion_time: number
}

type DailyStats = {
  date: string
  count: number
}

type UserChecklist = {
  id: number
  status: string
  created_at: string
  completed_at: string | null
  created_by: string
  user_name: string
  user_email: string
  store_name: string
  template_name: string
}

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')
  const [storeStats, setStoreStats] = useState<StoreStats[]>([])
  const [templateStats, setTemplateStats] = useState<TemplateStats[]>([])
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [summary, setSummary] = useState({
    totalChecklists: 0,
    completedToday: 0,
    avgPerDay: 0,
    activeUsers: 0,
    activeStores: 0,
    activeTemplates: 0,
  })
  const [isOffline, setIsOffline] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'responses' | 'conformidade' | 'reincidencias'>('overview')
  const [userChecklists, setUserChecklists] = useState<UserChecklist[]>([])
  const [responseFilterUser, setResponseFilterUser] = useState('')
  const [responseFilterStore, setResponseFilterStore] = useState('')
  const [responseFilterTemplate, setResponseFilterTemplate] = useState('')
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string }[]>([])
  const [allStoresSimple, setAllStoresSimple] = useState<{ id: number; name: string }[]>([])
  const [allTemplatesSimple, setAllTemplatesSimple] = useState<{ id: number; name: string }[]>([])
  // Conformidade tab state
  const [complianceSummary, setComplianceSummary] = useState<ComplianceSummary>({ totalNonConformities: 0, complianceRate: 100, plansCreated: 0, plansResolved: 0, plansOverdue: 0 })
  const [complianceByField, setComplianceByField] = useState<FieldComplianceRow[]>([])
  const [complianceByStore, setComplianceByStore] = useState<StoreComplianceRow[]>([])
  const [heatmapData, setHeatmapData] = useState<{ cells: HeatmapCell[]; stores: string[]; fields: string[] }>({ cells: [], stores: [], fields: [] })
  // Reincidencia tab state
  const [reincSummary, setReincSummary] = useState<ReincidenciaSummary>({ totalReincidencias: 0, avgReincidenciaRate: 0, worstField: null, worstStore: null })
  const [reincRows, setReincRows] = useState<ReincidenciaRow[]>([])
  const [assigneeStats, setAssigneeStats] = useState<AssigneeStats[]>([])
  const [responsePage, setResponsePage] = useState(1)
  const responsePerPage = 20
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    fetchReportData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  const fetchReportData = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    let userId: string | null = null
    let isAdminUser = false

    // Tenta verificar acesso online
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        userId = user.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (supabase as any)
          .from('users')
          .select('is_admin')
          .eq('id', user.id)
          .single()
        isAdminUser = profile && 'is_admin' in profile ? (profile as { is_admin: boolean }).is_admin : false
      }
    } catch {
      console.log('[Relatorios] Falha ao verificar online, tentando cache...')
    }

    // Fallback para cache se offline
    if (!userId) {
      try {
        const cachedAuth = await getAuthCache()
        if (cachedAuth) {
          userId = cachedAuth.userId
          const cachedUser = await getUserCache(cachedAuth.userId)
          isAdminUser = cachedUser?.is_admin || false
        }
      } catch {
        console.log('[Relatorios] Falha ao buscar cache')
      }
    }

    if (!userId) {
      router.push(APP_CONFIG.routes.login)
      return
    }

    if (!isAdminUser) {
      router.push(APP_CONFIG.routes.dashboard)
      return
    }

    try {
      setIsOffline(false)
      // Calculate date range
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Fetch all data in parallel for better performance
      const [
        checklistsRes,
        usersRes,
        storesRes,
        templatesRes,
        todayCountRes,
        periodCountRes,
        storesData,
        templatesData,
        allChecklists,
      ] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('checklists').select('id', { count: 'exact', head: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('users').select('id', { count: 'exact', head: true }).eq('is_active', true),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('stores').select('id', { count: 'exact', head: true }).eq('is_active', true),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('checklist_templates').select('id', { count: 'exact', head: true }).eq('is_active', true),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('checklists').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('checklists').select('id', { count: 'exact', head: true }).gte('created_at', startDate.toISOString()),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('stores').select('id, name').eq('is_active', true),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('checklist_templates').select('id, name').eq('is_active', true),
        // Get all checklists in period for aggregation (more efficient than multiple queries)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('checklists').select('id, store_id, template_id, created_at').gte('created_at', startDate.toISOString()),
      ])

      setSummary({
        totalChecklists: checklistsRes.count || 0,
        completedToday: todayCountRes.count || 0,
        avgPerDay: Math.round((periodCountRes.count || 0) / days * 10) / 10,
        activeUsers: usersRes.count || 0,
        activeStores: storesRes.count || 0,
        activeTemplates: templatesRes.count || 0,
      })

      // Process store stats from the fetched checklists (no additional queries needed)
      const checklists = allChecklists.data || []

      if (storesData.data) {
        const storeStatsData = storesData.data.map((store: { id: number; name: string }) => {
          const storeChecklists = checklists.filter((c: { store_id: number }) => c.store_id === store.id)
          const todayChecklists = storeChecklists.filter((c: { created_at: string }) =>
            new Date(c.created_at) >= today
          )

          return {
            store_id: store.id,
            store_name: store.name,
            total_checklists: storeChecklists.length,
            completed_today: todayChecklists.length,
            completion_rate: storeChecklists.length ? Math.round((storeChecklists.length / days) * 100) / 100 : 0,
          }
        })
        setStoreStats(storeStatsData.sort((a: StoreStats, b: StoreStats) => b.total_checklists - a.total_checklists))
      }

      // Process template stats from the fetched checklists (no additional queries needed)
      if (templatesData.data) {
        const templateStatsData = templatesData.data.map((template: { id: number; name: string }) => {
          const templateChecklists = checklists.filter((c: { template_id: number }) => c.template_id === template.id)

          return {
            template_id: template.id,
            template_name: template.name,
            total_uses: templateChecklists.length,
            avg_completion_time: 0,
          }
        })
        setTemplateStats(templateStatsData.sort((a: TemplateStats, b: TemplateStats) => b.total_uses - a.total_uses))
      }

      // Generate daily stats from fetched checklists (no additional queries needed)
      const dailyData: DailyStats[] = []
      const chartDays = Math.min(days, 30) // Limit chart to 30 days for readability

      for (let i = chartDays - 1; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        date.setHours(0, 0, 0, 0)

        const nextDate = new Date(date)
        nextDate.setDate(nextDate.getDate() + 1)

        const dayCount = checklists.filter((c: { created_at: string }) => {
          const checklistDate = new Date(c.created_at)
          return checklistDate >= date && checklistDate < nextDate
        }).length

        dailyData.push({
          date: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          count: dayCount,
        })
      }
      setDailyStats(dailyData)

      // Fetch user checklists for responses tab
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: userChecklistsData } = await (supabase as any)
        .from('checklists')
        .select(`
          id, status, created_at, completed_at, created_by,
          user:users!checklists_created_by_fkey(full_name, email),
          store:stores(name),
          template:checklist_templates(name)
        `)
        .order('created_at', { ascending: false })
        .limit(500)

      if (userChecklistsData) {
        const mapped = userChecklistsData.map((c: {
          id: number; status: string; created_at: string; completed_at: string | null; created_by: string;
          user: { full_name: string; email: string } | null;
          store: { name: string } | null;
          template: { name: string } | null;
        }) => ({
          id: c.id,
          status: c.status,
          created_at: c.created_at,
          completed_at: c.completed_at,
          created_by: c.created_by,
          user_name: c.user?.full_name || 'Desconhecido',
          user_email: c.user?.email || '',
          store_name: c.store?.name || '',
          template_name: c.template?.name || '',
        }))
        setUserChecklists(mapped)

        // Extract unique users, stores, templates for filters
        const usersMap = new Map<string, { id: string; name: string; email: string }>()
        const storesMap = new Map<string, { id: number; name: string }>()
        const templatesMap = new Map<string, { id: number; name: string }>()

        for (const c of userChecklistsData) {
          if (c.created_by && c.user) {
            usersMap.set(c.created_by, { id: c.created_by, name: c.user.full_name || c.user.email, email: c.user.email })
          }
          if (c.store) {
            storesMap.set(c.store.name, { id: 0, name: c.store.name })
          }
          if (c.template) {
            templatesMap.set(c.template.name, { id: 0, name: c.template.name })
          }
        }
        setAllUsers(Array.from(usersMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
        setAllStoresSimple(Array.from(storesMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
        setAllTemplatesSimple(Array.from(templatesMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
      }

      // Fetch conformidade and reincidencia data
      try {
        const [compData, reincData, heatmap] = await Promise.all([
          fetchComplianceData(supabase, days),
          fetchReincidenciaData(supabase, days),
          fetchStoreHeatmap(supabase, days),
        ])
        setComplianceSummary(compData.summary)
        setComplianceByField(compData.byField)
        setComplianceByStore(compData.byStore)
        setHeatmapData(heatmap)
        setReincSummary(reincData.summary)
        setReincRows(reincData.rows)
        setAssigneeStats(reincData.byAssignee)
      } catch (analyticsErr) {
        console.warn('[Relatorios] Erro ao buscar analytics (tabelas podem nao existir ainda):', analyticsErr)
      }

    } catch (error) {
      console.error('[Relatorios] Erro ao buscar dados:', error)
      setIsOffline(true)
    }

    setLoading(false)
  }

  const maxDailyCount = Math.max(...dailyStats.map(d => d.count), 1)

  // Filter user checklists
  const filteredUserChecklists = useMemo(() => {
    return userChecklists.filter(c => {
      if (responseFilterUser && c.created_by !== responseFilterUser) return false
      if (responseFilterStore && c.store_name !== responseFilterStore) return false
      if (responseFilterTemplate && c.template_name !== responseFilterTemplate) return false
      return true
    })
  }, [userChecklists, responseFilterUser, responseFilterStore, responseFilterTemplate])

  const responseTotalPages = Math.ceil(filteredUserChecklists.length / responsePerPage)
  const paginatedUserChecklists = filteredUserChecklists.slice((responsePage - 1) * responsePerPage, responsePage * responsePerPage)

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; cls: string }> = {
      concluido: { label: 'Concluido', cls: 'bg-success/20 text-success' },
      em_andamento: { label: 'Em Andamento', cls: 'bg-warning/20 text-warning' },
      rascunho: { label: 'Rascunho', cls: 'bg-surface-hover text-muted' },
    }
    return badges[status] || { label: status, cls: 'bg-surface-hover text-muted' }
  }

  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        title="Relatorios"
        icon={FiBarChart2}
        backHref={APP_CONFIG.routes.admin}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Offline Warning */}
        {isOffline && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <FiWifiOff className="w-5 h-5 text-warning" />
            <p className="text-warning text-sm">
              Voce esta offline. Os dados de relatorios nao estao disponiveis no cache local.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            <span className="flex items-center gap-2">
              <FiBarChart2 className="w-4 h-4" />
              Visao Geral
            </span>
          </button>
          <button
            onClick={() => setActiveTab('responses')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === 'responses' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            <span className="flex items-center gap-2">
              <FiUsers className="w-4 h-4" />
              Respostas por Usuario
            </span>
          </button>
          <button
            onClick={() => setActiveTab('conformidade')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === 'conformidade' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            <span className="flex items-center gap-2">
              <FiAlertTriangle className="w-4 h-4" />
              Conformidade
            </span>
          </button>
          <button
            onClick={() => setActiveTab('reincidencias')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === 'reincidencias' ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            <span className="flex items-center gap-2">
              <FiRepeat className="w-4 h-4" />
              Reincidencias
            </span>
          </button>
        </div>

        {activeTab === 'responses' && (
          <div>
            {/* Filters */}
            <div className="card p-4 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <FiFilter className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-main">Filtros</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select
                  value={responseFilterUser}
                  onChange={(e) => { setResponseFilterUser(e.target.value); setResponsePage(1) }}
                  className="input"
                >
                  <option value="">Todos os usuarios</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <select
                  value={responseFilterStore}
                  onChange={(e) => { setResponseFilterStore(e.target.value); setResponsePage(1) }}
                  className="input"
                >
                  <option value="">Todas as lojas</option>
                  {allStoresSimple.map(s => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
                <select
                  value={responseFilterTemplate}
                  onChange={(e) => { setResponseFilterTemplate(e.target.value); setResponsePage(1) }}
                  className="input"
                >
                  <option value="">Todos os checklists</option>
                  {allTemplatesSimple.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted">
                {filteredUserChecklists.length} checklist(s)
                {responseFilterUser && ` de ${allUsers.find(u => u.id === responseFilterUser)?.name || 'usuario'}`}
              </p>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-hover">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted">Usuario</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted">Checklist</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted">Loja</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted">Data</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {paginatedUserChecklists.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted">
                          Nenhum checklist encontrado
                        </td>
                      </tr>
                    ) : (
                      paginatedUserChecklists.map(c => {
                        const badge = getStatusBadge(c.status)
                        return (
                          <tr key={c.id} className="hover:bg-surface-hover/50">
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-main text-sm">{c.user_name}</p>
                                <p className="text-xs text-muted">{c.user_email}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-main">{c.template_name}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-secondary">{c.store_name}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-block px-2 py-1 rounded-lg text-xs font-medium ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-muted">{formatDateShort(c.created_at)}</p>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={`/checklist/${c.id}`}
                                className="p-2 text-primary hover:bg-primary/20 rounded-lg transition-colors inline-flex"
                                title="Ver respostas"
                              >
                                <FiEye className="w-4 h-4" />
                              </Link>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {responseTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-subtle">
                  <p className="text-sm text-muted">
                    Pagina {responsePage} de {responseTotalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setResponsePage(p => Math.max(1, p - 1))}
                      disabled={responsePage === 1}
                      className="btn-ghost p-2 disabled:opacity-50"
                    >
                      <FiChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setResponsePage(p => Math.min(responseTotalPages, p + 1))}
                      disabled={responsePage === responseTotalPages}
                      className="btn-ghost p-2 disabled:opacity-50"
                    >
                      <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'overview' && <>
        {/* Period Filter */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-main">Visao Geral</h2>
          <div className="flex gap-2">
            {(['7d', '30d', '90d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                  period === p ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FiClipboard className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{summary.totalChecklists}</p>
                <p className="text-xs text-muted">Total</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                <FiCheckCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{summary.completedToday}</p>
                <p className="text-xs text-muted">Hoje</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-info/20 flex items-center justify-center">
                <FiTrendingUp className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{summary.avgPerDay}</p>
                <p className="text-xs text-muted">Media/dia</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                <FiUsers className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{summary.activeUsers}</p>
                <p className="text-xs text-muted">Usuarios</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <FiMapPin className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{summary.activeStores}</p>
                <p className="text-xs text-muted">Lojas</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                <FiClipboard className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{summary.activeTemplates}</p>
                <p className="text-xs text-muted">Checklists</p>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="card p-6 mb-8">
          <h3 className="text-lg font-semibold text-main mb-4">Checklists por Dia (ultimos 30 dias)</h3>
          <div className="h-48 flex items-end gap-1">
            {dailyStats.map((day, index) => (
              <div
                key={index}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <div
                  className="w-full bg-primary rounded-t transition-all hover:bg-primary-hover"
                  style={{ height: `${(day.count / maxDailyCount) * 100}%`, minHeight: day.count > 0 ? '4px' : '0' }}
                  title={`${day.date}: ${day.count} checklists`}
                />
                {index % 5 === 0 && (
                  <span className="text-[10px] text-muted">{day.date}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tables */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Store Stats */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-subtle">
              <h3 className="font-semibold text-main flex items-center gap-2">
                <FiMapPin className="w-4 h-4" />
                Desempenho por Loja
              </h3>
            </div>
            <div className="divide-y divide-subtle">
              {storeStats.length === 0 ? (
                <div className="px-6 py-8 text-center text-muted">
                  Nenhum dado disponivel
                </div>
              ) : (
                storeStats.map((store) => (
                  <div key={store.store_id} className="px-6 py-4 flex items-center justify-between hover:bg-surface-hover transition-colors">
                    <div>
                      <p className="font-medium text-main">{store.store_name}</p>
                      <p className="text-sm text-muted">
                        {store.completion_rate} checklists/dia em media
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">{store.total_checklists}</p>
                      <p className="text-xs text-muted">
                        {store.completed_today} hoje
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Template Stats */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-subtle">
              <h3 className="font-semibold text-main flex items-center gap-2">
                <FiClipboard className="w-4 h-4" />
                Uso de Checklists
              </h3>
            </div>
            <div className="divide-y divide-subtle">
              {templateStats.length === 0 ? (
                <div className="px-6 py-8 text-center text-muted">
                  Nenhum dado disponivel
                </div>
              ) : (
                templateStats.map((template) => (
                  <div key={template.template_id} className="px-6 py-4 flex items-center justify-between hover:bg-surface-hover transition-colors">
                    <div>
                      <p className="font-medium text-main">{template.template_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">{template.total_uses}</p>
                      <p className="text-xs text-muted">utilizacoes</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        </>}

        {activeTab === 'conformidade' && (
          <div>
            {/* Period filter */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-main">Conformidade</h2>
              <div className="flex gap-2">
                {(['7d', '30d', '90d'] as const).map((p) => (
                  <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-xl font-medium transition-colors ${period === p ? 'btn-primary' : 'btn-secondary'}`}>
                    {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <div className="card p-4">
                <p className="text-2xl font-bold text-main">{complianceSummary.totalNonConformities}</p>
                <p className="text-xs text-muted">Nao Conformidades</p>
              </div>
              <div className="card p-4">
                <p className="text-2xl font-bold text-success">{complianceSummary.complianceRate}%</p>
                <p className="text-xs text-muted">Taxa Conformidade</p>
              </div>
              <div className="card p-4">
                <p className="text-2xl font-bold text-main">{complianceSummary.plansCreated}</p>
                <p className="text-xs text-muted">Planos Criados</p>
              </div>
              <div className="card p-4">
                <p className="text-2xl font-bold text-success">{complianceSummary.plansResolved}</p>
                <p className="text-xs text-muted">Resolvidos</p>
              </div>
              <div className="card p-4">
                <p className="text-2xl font-bold text-error">{complianceSummary.plansOverdue}</p>
                <p className="text-xs text-muted">Vencidos</p>
              </div>
            </div>

            {/* By field table */}
            <div className="card overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-subtle">
                <h3 className="font-semibold text-main">Nao Conformidades por Campo</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-hover">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted">Campo</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted">Template</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted">Total</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted">Resolvidos</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted">Taxa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {complianceByField.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhum dado disponivel</td></tr>
                    ) : complianceByField.map((row) => (
                      <tr key={row.fieldId} className="hover:bg-surface-hover/50">
                        <td className="px-4 py-3 font-medium text-main text-sm">{row.fieldName}</td>
                        <td className="px-4 py-3 text-sm text-secondary">{row.templateName}</td>
                        <td className="px-4 py-3 text-right text-sm text-main">{row.totalPlans}</td>
                        <td className="px-4 py-3 text-right text-sm text-success">{row.resolvedPlans}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-block px-2 py-1 rounded-lg text-xs font-medium ${
                            row.complianceRate >= 80 ? 'bg-success/20 text-success' :
                            row.complianceRate >= 50 ? 'bg-warning/20 text-warning' :
                            'bg-error/20 text-error'
                          }`}>{row.complianceRate}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* By store + heatmap side by side */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* By store */}
              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-subtle">
                  <h3 className="font-semibold text-main">Ranking por Loja</h3>
                </div>
                <div className="divide-y divide-subtle">
                  {complianceByStore.length === 0 ? (
                    <div className="px-6 py-8 text-center text-muted">Nenhum dado</div>
                  ) : complianceByStore.map((store) => (
                    <div key={store.storeId} className="px-6 py-4 flex items-center justify-between hover:bg-surface-hover transition-colors">
                      <div>
                        <p className="font-medium text-main">{store.storeName}</p>
                        <p className="text-xs text-muted">{store.totalPlans} nao conformidades, {store.overduePlans} vencidos</p>
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                        store.rate >= 80 ? 'bg-success/20 text-success' :
                        store.rate >= 50 ? 'bg-warning/20 text-warning' :
                        'bg-error/20 text-error'
                      }`}>{store.rate}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Heatmap */}
              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-subtle">
                  <h3 className="font-semibold text-main">Heatmap Loja x Campo</h3>
                </div>
                <div className="p-4 overflow-x-auto">
                  {heatmapData.stores.length === 0 ? (
                    <div className="text-center text-muted py-8">Nenhum dado</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="px-2 py-1 text-left text-muted font-medium">Loja</th>
                          {heatmapData.fields.map(f => (
                            <th key={f} className="px-2 py-1 text-center text-muted font-medium max-w-[80px] truncate" title={f}>{f}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {heatmapData.stores.map(store => {
                          const maxCount = Math.max(...heatmapData.cells.map(c => c.count), 1)
                          return (
                            <tr key={store}>
                              <td className="px-2 py-1 font-medium text-main whitespace-nowrap">{store}</td>
                              {heatmapData.fields.map(field => {
                                const cell = heatmapData.cells.find(c => c.storeName === store && c.fieldName === field)
                                const count = cell?.count || 0
                                const intensity = count / maxCount
                                const bg = count === 0 ? 'bg-success/10' :
                                  intensity > 0.66 ? 'bg-error/40' :
                                  intensity > 0.33 ? 'bg-warning/40' :
                                  'bg-warning/20'
                                return (
                                  <td key={field} className={`px-2 py-1 text-center ${bg} rounded`} title={`${store} - ${field}: ${count}`}>
                                    {count > 0 ? count : '-'}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reincidencias' && (
          <div>
            {/* Period filter */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-main">Reincidencias</h2>
              <div className="flex gap-2">
                {(['7d', '30d', '90d'] as const).map((p) => (
                  <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-xl font-medium transition-colors ${period === p ? 'btn-primary' : 'btn-secondary'}`}>
                    {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="card p-4">
                <p className="text-2xl font-bold text-error">{reincSummary.totalReincidencias}</p>
                <p className="text-xs text-muted">Total Reincidencias</p>
              </div>
              <div className="card p-4">
                <p className="text-2xl font-bold text-warning">{reincSummary.avgReincidenciaRate}</p>
                <p className="text-xs text-muted">Media por Campo</p>
              </div>
              <div className="card p-4">
                <p className="text-sm font-bold text-main truncate">{reincSummary.worstField || '-'}</p>
                <p className="text-xs text-muted">Pior Campo</p>
              </div>
              <div className="card p-4">
                <p className="text-sm font-bold text-main truncate">{reincSummary.worstStore || '-'}</p>
                <p className="text-xs text-muted">Pior Loja</p>
              </div>
            </div>

            {/* Reincidencia table */}
            <div className="card overflow-hidden mb-6">
              <div className="px-6 py-4 border-b border-subtle">
                <h3 className="font-semibold text-main">Campos com Reincidencia</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-hover">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted">Campo</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted">Loja</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted">Template</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted">Ocorrencias</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted">Ultima</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {reincRows.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhuma reincidencia no periodo</td></tr>
                    ) : reincRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-surface-hover/50">
                        <td className="px-4 py-3 font-medium text-main text-sm">{row.fieldName}</td>
                        <td className="px-4 py-3 text-sm text-secondary">{row.storeName}</td>
                        <td className="px-4 py-3 text-sm text-muted">{row.templateName}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-block px-2 py-1 rounded-lg text-xs font-bold bg-error/20 text-error">{row.occurrences}x</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-muted">{new Date(row.lastOccurrence).toLocaleDateString('pt-BR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Assignee stats */}
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-subtle">
                <h3 className="font-semibold text-main">Desempenho por Responsavel</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-hover">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted">Responsavel</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted">Planos</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted">Concluidos</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted">Vencidos</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted">Tempo Medio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {assigneeStats.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhum dado</td></tr>
                    ) : assigneeStats.map((a) => (
                      <tr key={a.userId} className="hover:bg-surface-hover/50">
                        <td className="px-4 py-3 font-medium text-main text-sm">{a.userName}</td>
                        <td className="px-4 py-3 text-right text-sm text-main">{a.totalPlans}</td>
                        <td className="px-4 py-3 text-right text-sm text-success">{a.completedPlans}</td>
                        <td className="px-4 py-3 text-right text-sm text-error">{a.overduePlans}</td>
                        <td className="px-4 py-3 text-right text-sm text-muted">{a.avgResolutionDays !== null ? `${a.avgResolutionDays}d` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
