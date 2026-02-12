'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import {
  FiTrash2,
  FiSearch,
  FiFilter,
  FiCheckCircle,
  FiClock,
  FiAlertCircle,
  FiChevronLeft,
  FiChevronRight,
  FiX,
  FiWifiOff,
  FiEye,
} from 'react-icons/fi'
import Link from 'next/link'
import type { Store, ChecklistTemplate, User } from '@/types/database'
import { getAuthCache, getUserCache } from '@/lib/offlineCache'

type ChecklistWithDetails = {
  id: number
  status: string
  created_at: string
  completed_at: string | null
  created_by: string
  template: ChecklistTemplate
  store: Store
  user: User
}

export default function AdminChecklistsPage() {
  const [checklists, setChecklists] = useState<ChecklistWithDetails[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [deletingBulk, setDeletingBulk] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStore, setFilterStore] = useState<number | ''>('')
  const [filterTemplate, setFilterTemplate] = useState<number | ''>('')
  const [filterUser, setFilterUser] = useState<string | ''>('')
  const [filterStatus, setFilterStatus] = useState<string | ''>('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // Pagination
  const [page, setPage] = useState(1)
  const perPage = 20

  const [isOffline, setIsOffline] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
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
      console.log('[Checklists] Falha ao verificar online, tentando cache...')
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
        console.log('[Checklists] Falha ao buscar cache')
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

    // Tenta buscar dados online
    try {
      // Fetch stores
      const { data: storesData, error: storesError } = await supabase
        .from('stores')
        .select('*')
        .order('name')

      if (storesError) throw storesError
      if (storesData) setStores(storesData)

    // Fetch templates
    const { data: templatesData } = await supabase
      .from('checklist_templates')
      .select('*')
      .order('name')

    if (templatesData) setTemplates(templatesData)

    // Fetch users
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: usersData } = await (supabase as any)
      .from('users')
      .select('id, email, full_name')
      .order('full_name')

    if (usersData) setUsers(usersData)

    // Fetch checklists (sem join de users, faremos manualmente)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: checklistsData, error: checklistsError } = await (supabase as any)
      .from('checklists')
      .select(`
        id,
        status,
        created_at,
        completed_at,
        created_by,
        template:checklist_templates(*),
        store:stores(*)
      `)
      .order('created_at', { ascending: false })

    if (checklistsError) {
      console.error('Erro ao buscar checklists:', checklistsError)
    }

    if (checklistsData && usersData) {
      // Mapear usuários por ID para lookup rápido
      const usersMap = new Map(usersData.map((u: User) => [u.id, u]))

      // Adicionar informação do usuário a cada checklist
      const checklistsWithUsers = checklistsData.map((c: { created_by: string; template: ChecklistTemplate; store: Store; id: number; status: string; created_at: string; completed_at: string | null }) => ({
        ...c,
        user: usersMap.get(c.created_by) || { id: c.created_by, email: 'Desconhecido', full_name: 'Usuário Desconhecido' }
      }))

      setChecklists(checklistsWithUsers as ChecklistWithDetails[])
      setIsOffline(false)
    }
    } catch (err) {
      console.error('[Checklists] Erro ao buscar online:', err)
      setIsOffline(true)
    }

    setLoading(false)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este checklist? Esta ação não pode ser desfeita.')) {
      return
    }

    setDeleting(id)

    try {
      // Delete responses first
      await supabase.from('checklist_responses').delete().eq('checklist_id', id)
      // Delete checklist
      const { error } = await supabase.from('checklists').delete().eq('id', id)

      if (error) throw error

      setChecklists(prev => prev.filter(c => c.id !== id))
      setSelectedIds(prev => prev.filter(i => i !== id))
    } catch (err) {
      console.error('Error deleting checklist:', err)
      alert('Erro ao excluir checklist')
    } finally {
      setDeleting(null)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return

    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.length} checklist(s)? Esta ação não pode ser desfeita.`)) {
      return
    }

    setDeletingBulk(true)

    try {
      for (const id of selectedIds) {
        await supabase.from('checklist_responses').delete().eq('checklist_id', id)
        await supabase.from('checklists').delete().eq('id', id)
      }

      setChecklists(prev => prev.filter(c => !selectedIds.includes(c.id)))
      setSelectedIds([])
    } catch (err) {
      console.error('Error bulk deleting:', err)
      alert('Erro ao excluir checklists')
    } finally {
      setDeletingBulk(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredChecklists.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredChecklists.map(c => c.id))
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const clearFilters = () => {
    setSearchTerm('')
    setFilterStore('')
    setFilterTemplate('')
    setFilterUser('')
    setFilterStatus('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setPage(1)
  }

  // Filter checklists
  const filteredChecklists = useMemo(() => {
    return checklists.filter(checklist => {
      // Search term
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const matchesSearch =
          checklist.user?.full_name?.toLowerCase().includes(search) ||
          checklist.user?.email?.toLowerCase().includes(search) ||
          checklist.template?.name?.toLowerCase().includes(search) ||
          checklist.store?.name?.toLowerCase().includes(search)
        if (!matchesSearch) return false
      }

      // Store filter
      if (filterStore && checklist.store?.id !== filterStore) return false

      // Template filter
      if (filterTemplate && checklist.template?.id !== filterTemplate) return false

      // User filter
      if (filterUser && checklist.created_by !== filterUser) return false

      // Status filter
      if (filterStatus && checklist.status !== filterStatus) return false

      // Date range
      if (filterDateFrom) {
        const checklistDate = new Date(checklist.created_at)
        const fromDate = new Date(filterDateFrom)
        if (checklistDate < fromDate) return false
      }

      if (filterDateTo) {
        const checklistDate = new Date(checklist.created_at)
        const toDate = new Date(filterDateTo)
        toDate.setHours(23, 59, 59)
        if (checklistDate > toDate) return false
      }

      return true
    })
  }, [checklists, searchTerm, filterStore, filterTemplate, filterUser, filterStatus, filterDateFrom, filterDateTo])

  // Pagination
  const totalPages = Math.ceil(filteredChecklists.length / perPage)
  const paginatedChecklists = filteredChecklists.slice((page - 1) * perPage, page * perPage)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; class: string; icon: typeof FiCheckCircle }> = {
      rascunho: { label: 'Rascunho', class: 'bg-surface-hover text-muted', icon: FiClock },
      em_andamento: { label: 'Em Andamento', class: 'bg-warning/20 text-warning', icon: FiClock },
      concluido: { label: 'Concluído', class: 'bg-success/20 text-success', icon: FiCheckCircle },
      validado: { label: 'Validado', class: 'bg-info/20 text-info', icon: FiCheckCircle },
    }
    return badges[status] || badges.rascunho
  }

  const hasActiveFilters = searchTerm || filterStore || filterTemplate || filterUser || filterStatus || filterDateFrom || filterDateTo

  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        title="Gerenciar Checklists"
        backHref={APP_CONFIG.routes.admin}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Offline Warning */}
        {isOffline && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <FiWifiOff className="w-5 h-5 text-warning" />
            <p className="text-warning text-sm">
              Voce esta offline. Os dados de checklists nao estao disponiveis no cache local.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="card p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FiFilter className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-main">Filtros</h2>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto text-sm text-primary hover:underline flex items-center gap-1"
              >
                <FiX className="w-4 h-4" />
                Limpar filtros
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                placeholder="Buscar por nome, email..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
                className="input pl-10 w-full"
              />
            </div>

            {/* Store filter */}
            <select
              value={filterStore}
              onChange={(e) => { setFilterStore(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
              className="input"
            >
              <option value="">Todas as lojas</option>
              {stores.map(store => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>

            {/* Template filter */}
            <select
              value={filterTemplate}
              onChange={(e) => { setFilterTemplate(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
              className="input"
            >
              <option value="">Todos os checklists</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>

            {/* User filter */}
            <select
              value={filterUser}
              onChange={(e) => { setFilterUser(e.target.value); setPage(1) }}
              className="input"
            >
              <option value="">Todos os usuários</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
              className="input"
            >
              <option value="">Todos os status</option>
              <option value="rascunho">Rascunho</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="concluido">Concluído</option>
              <option value="validado">Validado</option>
            </select>

            {/* Date from */}
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1) }}
              className="input"
              placeholder="Data inicial"
            />

            {/* Date to */}
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setPage(1) }}
              className="input"
              placeholder="Data final"
            />
          </div>
        </div>

        {/* Bulk actions */}
        {selectedIds.length > 0 && (
          <div className="card p-4 mb-4 bg-warning/10 border-warning/30 flex items-center justify-between">
            <span className="text-main font-medium">
              {selectedIds.length} checklist(s) selecionado(s)
            </span>
            <button
              onClick={handleBulkDelete}
              disabled={deletingBulk}
              className="btn-primary bg-red-500 hover:bg-red-600 flex items-center gap-2"
            >
              <FiTrash2 className="w-4 h-4" />
              {deletingBulk ? 'Excluindo...' : 'Excluir selecionados'}
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted">
            {filteredChecklists.length} checklist(s) encontrado(s)
          </p>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredChecklists.length && filteredChecklists.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-default"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Usuário</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Checklist</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Loja</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted">Data</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {paginatedChecklists.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted">
                      <FiAlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      Nenhum checklist encontrado
                    </td>
                  </tr>
                ) : (
                  paginatedChecklists.map(checklist => {
                    const statusBadge = getStatusBadge(checklist.status)
                    const StatusIcon = statusBadge.icon
                    return (
                      <tr key={checklist.id} className="hover:bg-surface-hover/50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(checklist.id)}
                            onChange={() => toggleSelect(checklist.id)}
                            className="rounded border-default"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-main text-sm">
                              {checklist.user?.full_name || 'Usuário'}
                            </p>
                            <p className="text-xs text-muted">{checklist.user?.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-main">{checklist.template?.name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-secondary">{checklist.store?.name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${statusBadge.class}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-muted">{formatDate(checklist.created_at)}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/checklist/${checklist.id}`}
                              className="p-2 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                              title="Visualizar"
                            >
                              <FiEye className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => handleDelete(checklist.id)}
                              disabled={deleting === checklist.id}
                              className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Excluir"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
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
                Página {page} de {totalPages}
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
