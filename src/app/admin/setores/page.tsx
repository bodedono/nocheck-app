'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import {
  FiGrid,
  FiEdit2,
  FiTrash2,
  FiCheckCircle,
  FiXCircle,
  FiSearch,
  FiPlus,
  FiUsers,
  FiClipboard,
  FiChevronDown,
  FiChevronRight,
  FiUserPlus,
  FiUserMinus,
  FiWifiOff,
} from 'react-icons/fi'
import type { Store, Sector, User, UserSector } from '@/types/database'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import { getAuthCache, getUserCache, getStoresCache, getSectorsCache } from '@/lib/offlineCache'

type SectorWithStats = Sector & {
  store: Store
  user_count: number
  template_count: number
  users?: (UserSector & { user: User })[]
}

type UserBasic = {
  id: string
  email: string
  full_name: string
  is_active: boolean
}

export default function SetoresPage() {
  const [sectors, setSectors] = useState<SectorWithStats[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [allUsers, setAllUsers] = useState<UserBasic[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStore, setFilterStore] = useState<number | null>(null)
  const [expandedStores, setExpandedStores] = useState<Set<number>>(new Set())

  // Modal states
  const [showSectorModal, setShowSectorModal] = useState(false)
  const [showUsersModal, setShowUsersModal] = useState(false)
  const [editingSector, setEditingSector] = useState<Sector | null>(null)
  const [managingSector, setManagingSector] = useState<SectorWithStats | null>(null)
  const [sectorFormData, setSectorFormData] = useState({
    store_id: 0,
    name: '',
    description: '',
    color: '#6366f1',
    is_active: true,
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
      console.log('[Setores] Falha ao verificar online, tentando cache...')
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
        console.log('[Setores] Falha ao buscar cache')
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
        .order('name')

      if (storesError) throw storesError

      if (storesData) {
        setStores(storesData)
        setExpandedStores(new Set(storesData.map((s: Store) => s.id)))
      }

      // Fetch sectors with store info
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sectorsData, error: sectorsError } = await (supabase as any)
        .from('sectors')
        .select(`
          *,
          store:stores(*)
        `)
        .order('name')

      if (sectorsError) throw sectorsError

      if (sectorsData) {
        const sectorsWithStats = await Promise.all(
          sectorsData.map(async (sector: Sector & { store: Store }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { count: userCount } = await (supabase as any)
              .from('user_sectors')
              .select('id', { count: 'exact', head: true })
              .eq('sector_id', sector.id)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { count: templateCount } = await (supabase as any)
              .from('template_visibility')
              .select('id', { count: 'exact', head: true })
              .eq('sector_id', sector.id)

            return {
              ...sector,
              user_count: userCount || 0,
              template_count: templateCount || 0,
            }
          })
        )
        setSectors(sectorsWithStats)
      }

      // Fetch all users for assignment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: usersData } = await (supabase as any)
        .from('users')
        .select('id, email, full_name, is_active')
        .eq('is_active', true)
        .order('full_name')

      if (usersData) {
        setAllUsers(usersData)
      }

      setIsOffline(false)
    } catch (err) {
      console.error('[Setores] Erro ao buscar online:', err)

      // Fallback para cache offline
      try {
        const [cachedStores, cachedSectors] = await Promise.all([
          getStoresCache(),
          getSectorsCache(),
        ])

        setStores(cachedStores)
        setExpandedStores(new Set(cachedStores.map((s: Store) => s.id)))

        const sectorsWithStats = cachedSectors.map(sector => ({
          ...sector,
          store: cachedStores.find(s => s.id === sector.store_id) || { id: sector.store_id, name: 'Loja', is_active: true, created_at: '' },
          user_count: 0,
          template_count: 0,
        })) as SectorWithStats[]

        setSectors(sectorsWithStats)
        setIsOffline(true)
        console.log('[Setores] Carregado do cache offline')
      } catch (cacheErr) {
        console.error('[Setores] Erro ao buscar cache:', cacheErr)
      }
    }

    setLoading(false)
  }

  const toggleStoreExpanded = (storeId: number) => {
    const newExpanded = new Set(expandedStores)
    if (newExpanded.has(storeId)) {
      newExpanded.delete(storeId)
    } else {
      newExpanded.add(storeId)
    }
    setExpandedStores(newExpanded)
  }

  const openSectorModal = (sector?: Sector, storeId?: number) => {
    if (sector) {
      setEditingSector(sector)
      setSectorFormData({
        store_id: sector.store_id,
        name: sector.name,
        description: sector.description || '',
        color: sector.color,
        is_active: sector.is_active,
      })
    } else {
      setEditingSector(null)
      setSectorFormData({
        store_id: storeId || stores[0]?.id || 0,
        name: '',
        description: '',
        color: '#6366f1',
        is_active: true,
      })
    }
    setShowSectorModal(true)
  }

  const closeSectorModal = () => {
    setShowSectorModal(false)
    setEditingSector(null)
  }

  const handleSectorSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sectorFormData.name.trim() || !sectorFormData.store_id) return

    setSaving(true)

    try {
      if (editingSector) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('sectors')
          .update({
            name: sectorFormData.name,
            description: sectorFormData.description || null,
            color: sectorFormData.color,
            is_active: sectorFormData.is_active,
          })
          .eq('id', editingSector.id)

        if (error) throw error
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('sectors')
          .insert({
            store_id: sectorFormData.store_id,
            name: sectorFormData.name,
            description: sectorFormData.description || null,
            color: sectorFormData.color,
            is_active: sectorFormData.is_active,
          })

        if (error) throw error
      }

      closeSectorModal()
      fetchData()
    } catch (error) {
      console.error('Error saving sector:', error)
      alert('Erro ao salvar setor')
    }

    setSaving(false)
  }

  const toggleSectorStatus = async (sector: Sector) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('sectors')
      .update({ is_active: !sector.is_active })
      .eq('id', sector.id)

    if (error) {
      console.error('Error updating sector:', error)
      return
    }

    fetchData()
  }

  const deleteSector = async (sector: Sector) => {
    if (!confirm(`Tem certeza que deseja excluir o setor "${sector.name}"?`)) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('sectors')
      .delete()
      .eq('id', sector.id)

    if (error) {
      console.error('Error deleting sector:', error)
      alert('Erro ao excluir setor. Verifique se nao existem usuarios ou templates vinculados.')
      return
    }

    fetchData()
  }

  // Users management
  const openUsersModal = async (sector: SectorWithStats) => {
    // Fetch users in this sector
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sectorUsers } = await (supabase as any)
      .from('user_sectors')
      .select(`
        *,
        user:users(id, email, full_name, is_active)
      `)
      .eq('sector_id', sector.id)

    setManagingSector({
      ...sector,
      users: sectorUsers || [],
    })
    setShowUsersModal(true)
  }

  const closeUsersModal = () => {
    setShowUsersModal(false)
    setManagingSector(null)
  }

  const addUserToSector = async (userId: string) => {
    if (!managingSector) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('user_sectors')
      .insert({
        user_id: userId,
        sector_id: managingSector.id,
        role: 'member',
      })

    if (error) {
      console.error('Error adding user to sector:', error)
      alert('Erro ao adicionar usuario ao setor')
      return
    }

    // Refresh modal data
    openUsersModal(managingSector)
    fetchData()
  }

  const removeUserFromSector = async (userSectorId: number) => {
    if (!confirm('Remover este usuario do setor?')) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('user_sectors')
      .delete()
      .eq('id', userSectorId)

    if (error) {
      console.error('Error removing user from sector:', error)
      return
    }

    if (managingSector) {
      openUsersModal(managingSector)
    }
    fetchData()
  }

  const toggleUserRole = async (userSector: UserSector) => {
    const newRole = userSector.role === 'member' ? 'viewer' : 'member'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('user_sectors')
      .update({ role: newRole })
      .eq('id', userSector.id)

    if (error) {
      console.error('Error updating user role:', error)
      return
    }

    if (managingSector) {
      openUsersModal(managingSector)
    }
  }

  // Group sectors by store
  const sectorsByStore = useMemo(() => {
    const filtered = sectors.filter(sector => {
      const matchesSearch = sector.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStore = filterStore === null || sector.store_id === filterStore
      return matchesSearch && matchesStore
    })

    const grouped: Record<number, SectorWithStats[]> = {}
    filtered.forEach(sector => {
      if (!grouped[sector.store_id]) {
        grouped[sector.store_id] = []
      }
      grouped[sector.store_id].push(sector)
    })

    return grouped
  }, [sectors, searchTerm, filterStore])

  const getUsersNotInSector = () => {
    if (!managingSector) return []
    const usersInSector = new Set(managingSector.users?.map(us => us.user_id) || [])
    return allUsers.filter(user => !usersInSector.has(user.id))
  }

  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        variant="page"
        title="Setores"
        icon={FiGrid}
        backHref={APP_CONFIG.routes.admin}
        actions={isOffline ? [] : [
          {
            label: 'Novo Setor',
            onClick: () => openSectorModal(),
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
              placeholder="Buscar setor..."
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

        {/* Sectors by Store */}
        <div className="space-y-4">
          {stores.filter(store => {
            if (filterStore !== null) return store.id === filterStore
            return sectorsByStore[store.id]?.length > 0
          }).map(store => (
            <div key={store.id} className="card overflow-hidden">
              {/* Store Header */}
              <button
                onClick={() => toggleStoreExpanded(store.id)}
                className="w-full flex items-center justify-between p-4 bg-surface-hover hover:bg-surface-hover/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedStores.has(store.id) ? (
                    <FiChevronDown className="w-5 h-5 text-muted" />
                  ) : (
                    <FiChevronRight className="w-5 h-5 text-muted" />
                  )}
                  <h3 className="font-semibold text-main">{store.name}</h3>
                  <span className="badge-secondary text-xs">
                    {sectorsByStore[store.id]?.length || 0} setores
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openSectorModal(undefined, store.id)
                  }}
                  className="btn-ghost p-2"
                  title="Adicionar setor"
                >
                  <FiPlus className="w-4 h-4" />
                </button>
              </button>

              {/* Sectors List */}
              {expandedStores.has(store.id) && (
                <div className="divide-y divide-subtle">
                  {(sectorsByStore[store.id] || []).length === 0 ? (
                    <div className="p-6 text-center text-muted">
                      Nenhum setor nesta loja
                    </div>
                  ) : (
                    (sectorsByStore[store.id] || []).map(sector => (
                      <div key={sector.id} className="p-4 hover:bg-surface-hover/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center"
                              style={{ backgroundColor: sector.color + '20' }}
                            >
                              <FiGrid className="w-5 h-5" style={{ color: sector.color }} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-main">{sector.name}</h4>
                                {!sector.is_active && (
                                  <span className="badge-secondary text-xs bg-error/20 text-error">
                                    Inativo
                                  </span>
                                )}
                              </div>
                              {sector.description && (
                                <p className="text-sm text-muted">{sector.description}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            {/* Stats */}
                            <div className="hidden sm:flex items-center gap-4 text-sm text-muted">
                              <div className="flex items-center gap-1">
                                <FiUsers className="w-4 h-4" />
                                <span>{sector.user_count}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <FiClipboard className="w-4 h-4" />
                                <span>{sector.template_count}</span>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openUsersModal(sector)}
                                className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                title="Gerenciar usuarios"
                              >
                                <FiUsers className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openSectorModal(sector)}
                                className="p-2 text-secondary hover:bg-surface-hover rounded-lg transition-colors"
                                title="Editar"
                              >
                                <FiEdit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => toggleSectorStatus(sector)}
                                className={`p-2 rounded-lg transition-colors ${
                                  sector.is_active
                                    ? 'text-warning hover:bg-warning/20'
                                    : 'text-success hover:bg-success/20'
                                }`}
                                title={sector.is_active ? 'Desativar' : 'Ativar'}
                              >
                                {sector.is_active ? <FiXCircle className="w-4 h-4" /> : <FiCheckCircle className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => deleteSector(sector)}
                                className="p-2 text-error hover:bg-error/20 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}

          {Object.keys(sectorsByStore).length === 0 && (
            <div className="card p-12 text-center text-muted">
              Nenhum setor encontrado
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="mt-6 flex items-center justify-between text-sm text-muted">
          <p>Total: {sectors.length} setores em {stores.length} lojas</p>
          <p>
            {sectors.filter(s => s.is_active).length} ativos, {sectors.filter(s => !s.is_active).length} inativos
          </p>
        </div>
      </main>

      {/* Sector Modal */}
      {showSectorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-md mx-4 p-6">
            <h2 className="text-xl font-bold text-main mb-6">
              {editingSector ? 'Editar Setor' : 'Novo Setor'}
            </h2>

            <form onSubmit={handleSectorSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Loja *
                </label>
                <select
                  value={sectorFormData.store_id}
                  onChange={(e) => setSectorFormData({ ...sectorFormData, store_id: Number(e.target.value) })}
                  className="input"
                  required
                  disabled={!!editingSector}
                >
                  <option value={0}>Selecione...</option>
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={sectorFormData.name}
                  onChange={(e) => setSectorFormData({ ...sectorFormData, name: e.target.value })}
                  className="input"
                  placeholder="Ex: Cozinha, Estoque, Salao"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Descricao
                </label>
                <input
                  type="text"
                  value={sectorFormData.description}
                  onChange={(e) => setSectorFormData({ ...sectorFormData, description: e.target.value })}
                  className="input"
                  placeholder="Descricao opcional..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Cor
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={sectorFormData.color}
                    onChange={(e) => setSectorFormData({ ...sectorFormData, color: e.target.value })}
                    className="w-12 h-10 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={sectorFormData.color}
                    onChange={(e) => setSectorFormData({ ...sectorFormData, color: e.target.value })}
                    className="input flex-1"
                    placeholder="#6366f1"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sectorFormData.is_active}
                    onChange={(e) => setSectorFormData({ ...sectorFormData, is_active: e.target.checked })}
                    className="w-5 h-5 rounded border-default bg-surface text-primary"
                  />
                  <span className="text-sm text-secondary">Setor ativo</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeSectorModal}
                  className="btn-secondary flex-1"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Modal */}
      {showUsersModal && managingSector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-main">
                  Usuarios do Setor
                </h2>
                <p className="text-sm text-muted">
                  {managingSector.name} - {managingSector.store.name}
                </p>
              </div>
              <button
                onClick={closeUsersModal}
                className="btn-ghost p-2"
              >
                <FiXCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Current Users */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-secondary mb-3">
                Usuarios no setor ({managingSector.users?.length || 0})
              </h3>

              {managingSector.users?.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">
                  Nenhum usuario neste setor
                </p>
              ) : (
                <div className="space-y-2">
                  {managingSector.users?.map(userSector => (
                    <div
                      key={userSector.id}
                      className="flex items-center justify-between p-3 bg-surface-hover rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-main text-sm">
                          {userSector.user.full_name}
                        </p>
                        <p className="text-xs text-muted">{userSector.user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleUserRole(userSector)}
                          className={`px-2 py-1 text-xs rounded-lg ${
                            userSector.role === 'member'
                              ? 'bg-primary/20 text-primary'
                              : 'bg-surface text-muted'
                          }`}
                          title={userSector.role === 'member' ? 'Pode preencher' : 'Apenas visualiza'}
                        >
                          {userSector.role === 'member' ? 'Preenche' : 'Visualiza'}
                        </button>
                        <button
                          onClick={() => removeUserFromSector(userSector.id)}
                          className="p-1 text-error hover:bg-error/20 rounded"
                          title="Remover do setor"
                        >
                          <FiUserMinus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Users */}
            <div>
              <h3 className="text-sm font-medium text-secondary mb-3">
                Adicionar usuario
              </h3>

              {getUsersNotInSector().length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">
                  Todos os usuarios ja estao neste setor
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {getUsersNotInSector().map(user => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 border border-subtle rounded-lg hover:bg-surface-hover transition-colors"
                    >
                      <div>
                        <p className="font-medium text-main text-sm">{user.full_name}</p>
                        <p className="text-xs text-muted">{user.email}</p>
                      </div>
                      <button
                        onClick={() => addUserToSector(user.id)}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg"
                        title="Adicionar ao setor"
                      >
                        <FiUserPlus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-subtle">
              <button
                onClick={closeUsersModal}
                className="btn-secondary w-full"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
