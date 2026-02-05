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
} from 'react-icons/fi'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import { getAuthCache, getUserCache } from '@/lib/offlineCache'

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

    } catch (error) {
      console.error('[Relatorios] Erro ao buscar dados:', error)
      setIsOffline(true)
    }

    setLoading(false)
  }

  const maxDailyCount = Math.max(...dailyStats.map(d => d.count), 1)

  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        variant="page"
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
      </main>
    </div>
  )
}
