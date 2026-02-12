'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import {
  FiAlertTriangle,
  FiAlertCircle,
  FiCheckCircle,
  FiFilter,
  FiPlus,
  FiChevronLeft,
  FiChevronRight,
  FiWifiOff,
  FiEye,
  FiAlertOctagon,
  FiActivity,
} from 'react-icons/fi'
import Link from 'next/link'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import { getAuthCache, getUserCache, getActionPlansCache, getStoresCache, getAllUsersCache } from '@/lib/offlineCache'

type ActionPlan = {
  id: number
  title: string
  description: string | null
  status: string
  severity: string
  due_date: string | null
  recurrence_count: number
  created_at: string
  store: { name: string } | null
  assigned_user: { full_name: string } | null
  field: { name: string } | null
  template: { name: string } | null
}

type FilterStore = { id: number; name: string }
type FilterUser = { id: string; full_name: string }

export default function PlanoDeAcaoPage() {
  const [loading, setLoading] = useState(true)
  const [actionPlans, setActionPlans] = useState<ActionPlan[]>([])
  const [isOffline, setIsOffline] = useState(false)

  // Filters
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterStore, setFilterStore] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')

  // Filter options
  const [stores, setStores] = useState<FilterStore[]>([])
  const [users, setUsers] = useState<FilterUser[]>([])

  // Pagination
  const [page, setPage] = useState(1)
  const perPage = 20

  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
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
      console.log('[PlanosDeAcao] Falha ao verificar online, tentando cache...')
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
        console.log('[PlanosDeAcao] Falha ao buscar cache')
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

      // Fetch all data in parallel
      const [plansRes, storesRes, usersRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('action_plans')
          .select(`*, store:stores(name), assigned_user:users!action_plans_assigned_to_fkey(full_name), field:template_fields(name), template:checklist_templates(name)`)
          .order('created_at', { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('stores')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('users')
          .select('id, full_name')
          .eq('is_active', true)
          .order('full_name'),
      ])

      if (plansRes.data) {
        setActionPlans(plansRes.data)
      }
      if (storesRes.data) {
        setStores(storesRes.data)
      }
      if (usersRes.data) {
        setUsers(usersRes.data)
      }
    } catch (error) {
      console.error('[PlanosDeAcao] Erro ao buscar dados online:', error)
      // Fallback: carregar do cache offline
      try {
        const cachedPlans = await getActionPlansCache()
        if (cachedPlans.length > 0) {
          setActionPlans(cachedPlans.map(p => ({
            id: p.id,
            title: p.title,
            description: p.description,
            status: p.status,
            severity: p.severity,
            due_date: p.deadline,
            recurrence_count: p.reincidencia_count,
            created_at: p.created_at,
            store: p.store_name ? { name: p.store_name } : null,
            assigned_user: p.assignee_name ? { full_name: p.assignee_name } : null,
            field: p.field_name ? { name: p.field_name } : null,
            template: p.template_name ? { name: p.template_name } : null,
          })))
        }
        const cachedStores = await getStoresCache()
        if (cachedStores.length > 0) {
          setStores(cachedStores.map(s => ({ id: s.id, name: s.name })))
        }
        const cachedUsers = await getAllUsersCache()
        if (cachedUsers.length > 0) {
          setUsers(cachedUsers.map(u => ({ id: u.id, full_name: u.full_name })))
        }
      } catch (cacheErr) {
        console.error('[PlanosDeAcao] Erro ao carregar cache:', cacheErr)
      }
      setIsOffline(true)
    }

    setLoading(false)
  }

  // Summary counts
  const summary = useMemo(() => {
    const abertos = actionPlans.filter(p => p.status === 'aberto').length
    const emAndamento = actionPlans.filter(p => p.status === 'em_andamento').length
    const concluidos = actionPlans.filter(p => p.status === 'concluido').length
    const vencidos = actionPlans.filter(p => {
      if (p.status === 'concluido' || p.status === 'cancelado') return false
      if (!p.due_date) return false
      return new Date(p.due_date) < new Date()
    }).length
    return { abertos, emAndamento, concluidos, vencidos }
  }, [actionPlans])

  // Filtered plans
  const filteredPlans = useMemo(() => {
    return actionPlans.filter(p => {
      if (filterStatus && p.status !== filterStatus) return false
      if (filterSeverity && p.severity !== filterSeverity) return false
      if (filterStore && p.store?.name !== filterStore) return false
      if (filterAssignee && p.assigned_user?.full_name !== filterAssignee) return false
      return true
    })
  }, [actionPlans, filterStatus, filterSeverity, filterStore, filterAssignee])

  // Pagination
  const totalPages = Math.ceil(filteredPlans.length / perPage)
  const paginatedPlans = filteredPlans.slice((page - 1) * perPage, page * perPage)

  // Helpers
  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; cls: string }> = {
      aberto: { label: 'Aberto', cls: 'bg-warning/20 text-warning' },
      em_andamento: { label: 'Em Andamento', cls: 'bg-info/20 text-info' },
      concluido: { label: 'Concluido', cls: 'bg-success/20 text-success' },
      vencido: { label: 'Vencido', cls: 'bg-error/20 text-error' },
      cancelado: { label: 'Cancelado', cls: 'bg-surface-hover text-muted' },
    }
    return badges[status] || { label: status, cls: 'bg-surface-hover text-muted' }
  }

  const getSeverityBadge = (severity: string) => {
    const badges: Record<string, { label: string; cls: string }> = {
      baixa: { label: 'Baixa', cls: 'bg-success/20 text-success' },
      media: { label: 'Media', cls: 'bg-warning/20 text-warning' },
      alta: { label: 'Alta', cls: 'bg-orange-500/20 text-orange-500' },
      critica: { label: 'Critica', cls: 'bg-error/20 text-error' },
    }
    return badges[severity] || { label: severity, cls: 'bg-surface-hover text-muted' }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  }

  const isOverdue = (plan: ActionPlan) => {
    if (plan.status === 'concluido' || plan.status === 'cancelado') return false
    if (!plan.due_date) return false
    return new Date(plan.due_date) < new Date()
  }

  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        title="Planos de Acao"
        icon={FiAlertTriangle}
        backHref={APP_CONFIG.routes.admin}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Offline Warning */}
        {isOffline && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <FiWifiOff className="w-5 h-5 text-warning" />
            <p className="text-warning text-sm">
              Voce esta offline. Exibindo dados salvos localmente (somente leitura).
            </p>
          </div>
        )}

        {/* Header with New Plan button */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-main">Planos de Acao</h2>
          <Link
            href={APP_CONFIG.routes.adminActionPlanNew}
            className="btn-primary flex items-center gap-2"
          >
            <FiPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Plano</span>
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <FiAlertCircle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{summary.abertos}</p>
                <p className="text-xs text-muted">Abertos</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-info/20 flex items-center justify-center">
                <FiActivity className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{summary.emAndamento}</p>
                <p className="text-xs text-muted">Em Andamento</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-error/20 flex items-center justify-center">
                <FiAlertOctagon className="w-5 h-5 text-error" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{summary.vencidos}</p>
                <p className="text-xs text-muted">Vencidos</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                <FiCheckCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{summary.concluidos}</p>
                <p className="text-xs text-muted">Concluidos</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FiFilter className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-main">Filtros</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
              className="input"
            >
              <option value="">Todos os status</option>
              <option value="aberto">Aberto</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="concluido">Concluido</option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
            </select>

            <select
              value={filterSeverity}
              onChange={(e) => { setFilterSeverity(e.target.value); setPage(1) }}
              className="input"
            >
              <option value="">Todas as severidades</option>
              <option value="baixa">Baixa</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="critica">Critica</option>
            </select>

            <select
              value={filterStore}
              onChange={(e) => { setFilterStore(e.target.value); setPage(1) }}
              className="input"
            >
              <option value="">Todas as lojas</option>
              {stores.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>

            <select
              value={filterAssignee}
              onChange={(e) => { setFilterAssignee(e.target.value); setPage(1) }}
              className="input"
            >
              <option value="">Todos os responsaveis</option>
              {users.map(u => (
                <option key={u.id} value={u.full_name}>{u.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted">
            {filteredPlans.length} plano(s) de acao encontrado(s)
          </p>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Titulo</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Loja</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Severidade</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Responsavel</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Prazo</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Reincidencia</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {paginatedPlans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted">
                      Nenhum plano de acao encontrado
                    </td>
                  </tr>
                ) : (
                  paginatedPlans.map(plan => {
                    const statusBadge = getStatusBadge(plan.status)
                    const severityBadge = getSeverityBadge(plan.severity)
                    const overdue = isOverdue(plan)

                    return (
                      <tr key={plan.id} className="hover:bg-surface-hover/50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-main text-sm">{plan.title}</p>
                            {plan.template && (
                              <p className="text-xs text-muted">{plan.template.name}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-secondary">{plan.store?.name || '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-1 rounded-lg text-xs font-medium ${severityBadge.cls}`}>
                            {severityBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-1 rounded-lg text-xs font-medium ${statusBadge.cls}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-main">{plan.assigned_user?.full_name || '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className={`text-sm ${overdue ? 'text-error font-medium' : 'text-muted'}`}>
                            {formatDate(plan.due_date)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {plan.recurrence_count > 0 ? (
                            <span className="inline-block px-2 py-1 rounded-lg text-xs font-medium bg-error/20 text-error">
                              {plan.recurrence_count}x
                            </span>
                          ) : (
                            <span className="text-sm text-muted">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/planos-de-acao/${plan.id}`}
                            className="p-2 text-primary hover:bg-primary/20 rounded-lg transition-colors inline-flex"
                            title="Ver detalhes"
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-subtle">
              <p className="text-sm text-muted">
                Pagina {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-ghost p-2 disabled:opacity-50"
                >
                  <FiChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-ghost p-2 disabled:opacity-50"
                >
                  <FiChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
