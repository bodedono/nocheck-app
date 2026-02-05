'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import {
  FiShield,
  FiTrash2,
  FiSearch,
  FiPlus,
  FiEye,
  FiBarChart2,
  FiUsers,
  FiMapPin,
  FiWifiOff,
} from 'react-icons/fi'
import type { Store, User, StoreManager } from '@/types/database'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import { getAuthCache, getUserCache, getStoresCache } from '@/lib/offlineCache'

type StoreManagerWithDetails = StoreManager & {
  user: User
  store: Store
}

type UserBasic = {
  id: string
  email: string
  full_name: string
  is_active: boolean
  is_admin: boolean
}

export default function GerentesPage() {
  const [managers, setManagers] = useState<StoreManagerWithDetails[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [allUsers, setAllUsers] = useState<UserBasic[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStore, setFilterStore] = useState<number | null>(null)

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    user_id: '',
    store_id: 0,
    can_view_all_checklists: true,
    can_view_reports: true,
    can_manage_users: false,
  })
  const [saving, setSaving] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

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
    let isAdmin = false

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
        isAdmin = profile && 'is_admin' in profile ? (profile as { is_admin: boolean }).is_admin : false
      }
    } catch {
      console.log('[Gerentes] Falha ao verificar online, tentando cache...')
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
        console.log('[Gerentes] Falha ao buscar cache')
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
      // Fetch stores
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: storesData, error: storesError } = await (supabase as any)
        .from('stores')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (storesError) throw storesError

      if (storesData) {
        setStores(storesData)
      }

      // Fetch managers with details
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: managersData, error: managersError } = await (supabase as any)
        .from('store_managers')
        .select(`
          *,
          user:users(*),
          store:stores(*)
        `)
        .order('assigned_at', { ascending: false })

      if (managersError) throw managersError

      if (managersData) {
        setManagers(managersData)
      }

      // Fetch all users for assignment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: usersData } = await (supabase as any)
        .from('users')
        .select('id, email, full_name, is_active, is_admin')
        .eq('is_active', true)
        .order('full_name')

      if (usersData) {
        setAllUsers(usersData)
      }

      setIsOffline(false)
    } catch (err) {
      console.error('[Gerentes] Erro ao buscar online:', err)

      // Fallback para cache offline (apenas lojas)
      try {
        const cachedStores = await getStoresCache()
        setStores(cachedStores.filter(s => s.is_active))
        setManagers([])
        setIsOffline(true)
        console.log('[Gerentes] Carregado do cache offline')
      } catch (cacheErr) {
        console.error('[Gerentes] Erro ao buscar cache:', cacheErr)
      }
    }

    setLoading(false)
  }

  const openModal = () => {
    setFormData({
      user_id: '',
      store_id: stores[0]?.id || 0,
      can_view_all_checklists: true,
      can_view_reports: true,
      can_manage_users: false,
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.user_id || !formData.store_id) return

    setSaving(true)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('store_managers')
        .insert({
          user_id: formData.user_id,
          store_id: formData.store_id,
          can_view_all_checklists: formData.can_view_all_checklists,
          can_view_reports: formData.can_view_reports,
          can_manage_users: formData.can_manage_users,
        })

      if (error) {
        if (error.code === '23505') {
          alert('Este usuario ja e gerente desta loja')
        } else {
          throw error
        }
      } else {
        closeModal()
        fetchData()
      }
    } catch (error) {
      console.error('Error saving manager:', error)
      alert('Erro ao salvar gerente')
    }

    setSaving(false)
  }

  const deleteManager = async (manager: StoreManagerWithDetails) => {
    if (!confirm(`Remover ${manager.user.full_name} como gerente de ${manager.store.name}?`)) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('store_managers')
      .delete()
      .eq('id', manager.id)

    if (error) {
      console.error('Error deleting manager:', error)
      return
    }

    fetchData()
  }

  const togglePermission = async (manager: StoreManagerWithDetails, permission: 'can_view_all_checklists' | 'can_view_reports' | 'can_manage_users') => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('store_managers')
      .update({ [permission]: !manager[permission] })
      .eq('id', manager.id)

    if (error) {
      console.error('Error updating permission:', error)
      return
    }

    fetchData()
  }

  const filteredManagers = managers.filter(manager => {
    const matchesSearch =
      manager.user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      manager.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      manager.store.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStore = filterStore === null || manager.store_id === filterStore

    return matchesSearch && matchesStore
  })

  // Get users that are not admins (admins don't need to be managers)
  const availableUsers = allUsers.filter(user => {
    if (user.is_admin) return false
    // Check if already a manager of the selected store
    const existingManager = managers.find(
      m => m.user_id === user.id && m.store_id === formData.store_id
    )
    return !existingManager
  })

  // Group managers by store
  const managersByStore = useMemo(() => {
    const grouped: Record<number, StoreManagerWithDetails[]> = {}
    filteredManagers.forEach(manager => {
      if (!grouped[manager.store_id]) {
        grouped[manager.store_id] = []
      }
      grouped[manager.store_id].push(manager)
    })
    return grouped
  }, [filteredManagers])

  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        variant="page"
        title="Gerentes de Loja"
        icon={FiShield}
        backHref={APP_CONFIG.routes.admin}
        actions={isOffline ? [] : [
          {
            label: 'Novo Gerente',
            onClick: openModal,
            icon: FiPlus,
            variant: 'primary',
          },
        ]}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Offline Warning */}
        {isOffline && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <FiWifiOff className="w-5 h-5 text-warning" />
            <p className="text-warning text-sm">
              Voce esta offline. Os dados de gerentes nao estao disponiveis no cache local.
            </p>
          </div>
        )}

        {/* Info Box */}
        <div className="card p-4 mb-6 bg-info/10 border-info/20">
          <div className="flex items-start gap-3">
            <FiShield className="w-5 h-5 text-info mt-0.5" />
            <div>
              <h3 className="font-medium text-main">O que sao Gerentes de Loja?</h3>
              <p className="text-sm text-muted mt-1">
                Gerentes tem acesso de <strong>visualizacao</strong> a todos os setores e checklists de sua loja,
                mas <strong>nao podem preencher</strong> checklists. Ideal para supervisores que precisam
                acompanhar metricas sem participar da operacao.
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="Buscar por nome, email ou loja..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>

          <select
            value={filterStore ?? ''}
            onChange={(e) => setFilterStore(e.target.value ? Number(e.target.value) : null)}
            className="input w-full sm:w-48"
          >
            <option value="">Todas as lojas</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </div>

        {/* Managers by Store */}
        {Object.keys(managersByStore).length === 0 ? (
          <div className="card p-12 text-center">
            <FiShield className="w-12 h-12 text-muted mx-auto mb-4" />
            <p className="text-muted">
              {searchTerm || filterStore
                ? 'Nenhum gerente encontrado com os filtros aplicados'
                : 'Nenhum gerente cadastrado ainda'}
            </p>
            <button
              onClick={openModal}
              className="btn-primary mt-4"
            >
              Adicionar Gerente
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {stores.filter(store => managersByStore[store.id]?.length > 0).map(store => (
              <div key={store.id}>
                <div className="flex items-center gap-2 mb-3">
                  <FiMapPin className="w-4 h-4 text-muted" />
                  <h3 className="font-semibold text-main">{store.name}</h3>
                  <span className="badge-secondary text-xs">
                    {managersByStore[store.id].length} gerente{managersByStore[store.id].length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {managersByStore[store.id].map(manager => (
                    <div key={manager.id} className="card p-4">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-lg font-bold text-primary">
                              {manager.user.full_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-semibold text-main">{manager.user.full_name}</h4>
                            <p className="text-sm text-muted">{manager.user.email}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => deleteManager(manager)}
                          className="p-2 text-error hover:bg-error/20 rounded-lg transition-colors"
                          title="Remover gerente"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Permissions */}
                      <div className="space-y-2">
                        <button
                          onClick={() => togglePermission(manager, 'can_view_all_checklists')}
                          className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                            manager.can_view_all_checklists
                              ? 'bg-success/10 text-success'
                              : 'bg-surface-hover text-muted'
                          }`}
                        >
                          <FiEye className="w-4 h-4" />
                          <span className="text-sm">Ver todos os checklists</span>
                        </button>

                        <button
                          onClick={() => togglePermission(manager, 'can_view_reports')}
                          className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                            manager.can_view_reports
                              ? 'bg-success/10 text-success'
                              : 'bg-surface-hover text-muted'
                          }`}
                        >
                          <FiBarChart2 className="w-4 h-4" />
                          <span className="text-sm">Ver relatorios</span>
                        </button>

                        <button
                          onClick={() => togglePermission(manager, 'can_manage_users')}
                          className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                            manager.can_manage_users
                              ? 'bg-success/10 text-success'
                              : 'bg-surface-hover text-muted'
                          }`}
                        >
                          <FiUsers className="w-4 h-4" />
                          <span className="text-sm">Gerenciar usuarios (futuro)</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        <div className="mt-6 text-sm text-muted">
          Total: {managers.length} gerente{managers.length !== 1 ? 's' : ''} em {
            new Set(managers.map(m => m.store_id)).size
          } loja{new Set(managers.map(m => m.store_id)).size !== 1 ? 's' : ''}
        </div>
      </main>

      {/* Add Manager Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-md mx-4 p-6">
            <h2 className="text-xl font-bold text-main mb-6">
              Novo Gerente de Loja
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Loja *
                </label>
                <select
                  value={formData.store_id}
                  onChange={(e) => setFormData({ ...formData, store_id: Number(e.target.value) })}
                  className="input"
                  required
                >
                  <option value={0}>Selecione a loja...</option>
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Usuario *
                </label>
                <select
                  value={formData.user_id}
                  onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                  className="input"
                  required
                >
                  <option value="">Selecione o usuario...</option>
                  {availableUsers.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} ({user.email})
                    </option>
                  ))}
                </select>
                {availableUsers.length === 0 && formData.store_id > 0 && (
                  <p className="text-xs text-warning mt-1">
                    Todos os usuarios ja sao gerentes desta loja ou sao admins
                  </p>
                )}
              </div>

              <div className="space-y-2 pt-2">
                <p className="text-sm font-medium text-secondary">Permissoes</p>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.can_view_all_checklists}
                    onChange={(e) => setFormData({ ...formData, can_view_all_checklists: e.target.checked })}
                    className="w-5 h-5 rounded border-default bg-surface text-primary"
                  />
                  <span className="text-sm text-secondary">Ver todos os checklists</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.can_view_reports}
                    onChange={(e) => setFormData({ ...formData, can_view_reports: e.target.checked })}
                    className="w-5 h-5 rounded border-default bg-surface text-primary"
                  />
                  <span className="text-sm text-secondary">Ver relatorios</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.can_manage_users}
                    onChange={(e) => setFormData({ ...formData, can_manage_users: e.target.checked })}
                    className="w-5 h-5 rounded border-default bg-surface text-primary"
                  />
                  <span className="text-sm text-secondary">Gerenciar usuarios (futuro)</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn-secondary flex-1"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={saving || !formData.user_id || !formData.store_id}
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
