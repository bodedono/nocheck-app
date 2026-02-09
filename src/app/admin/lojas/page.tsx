'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import {
  FiMapPin,
  FiEdit2,
  FiTrash2,
  FiCheckCircle,
  FiXCircle,
  FiSearch,
  FiPlus,
  FiUsers,
  FiWifiOff,
} from 'react-icons/fi'
import type { Store } from '@/types/database'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import { getAuthCache, getUserCache, getStoresCache } from '@/lib/offlineCache'

type StoreWithStats = Store & {
  user_count: number
  checklist_count: number
}

export default function LojasPage() {
  const [stores, setStores] = useState<StoreWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({ name: '', is_active: true })
  const [saving, setSaving] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    fetchStores()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchStores = async () => {
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
      console.log('[Lojas] Falha ao verificar online, tentando cache...')
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
        console.log('[Lojas] Falha ao buscar cache')
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

    // Tenta buscar lojas online
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('stores')
        .select('*')
        .order('name')

      if (error) throw error

      // Get stats for each store
      const storesWithStats = await Promise.all(
        (data || []).map(async (store: Store) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count: userCount } = await (supabase as any)
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', store.id)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count: checklistCount } = await (supabase as any)
            .from('checklists')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', store.id)

          return {
            ...store,
            user_count: userCount || 0,
            checklist_count: checklistCount || 0,
          }
        })
      )

      setStores(storesWithStats)
      setIsOffline(false)
    } catch (err) {
      console.error('[Lojas] Erro ao buscar online:', err)

      // Fallback para cache offline
      try {
        const cachedStores = await getStoresCache()
        const storesWithStats = cachedStores.map(store => ({
          ...store,
          user_count: 0,
          checklist_count: 0,
        }))
        setStores(storesWithStats)
        setIsOffline(true)
        console.log('[Lojas] Carregado do cache offline')
      } catch (cacheErr) {
        console.error('[Lojas] Erro ao buscar cache:', cacheErr)
      }
    }

    setLoading(false)
  }

  const openModal = (store?: Store) => {
    if (store) {
      setEditingStore(store)
      setFormData({ name: store.name, is_active: store.is_active })
    } else {
      setEditingStore(null)
      setFormData({ name: '', is_active: true })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingStore(null)
    setFormData({ name: '', is_active: true })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return

    setSaving(true)

    try {
      if (editingStore) {
        // Update existing store
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('stores')
          .update({
            name: formData.name,
            is_active: formData.is_active,
          })
          .eq('id', editingStore.id)

        if (error) throw error
      } else {
        // Create new store
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('stores')
          .insert({
            name: formData.name,
            is_active: formData.is_active,
          })

        if (error) throw error
      }

      closeModal()
      fetchStores()
    } catch (error) {
      console.error('Error saving store:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
      alert(`Erro ao salvar loja: ${errorMessage}\n\nVerifique se você tem permissão de administrador.`)
    }

    setSaving(false)
  }

  const toggleStoreStatus = async (store: Store) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('stores')
      .update({ is_active: !store.is_active })
      .eq('id', store.id)

    if (error) {
      console.error('Error updating store:', error)
      return
    }

    fetchStores()
  }

  const deleteStore = async (store: Store) => {
    if (!confirm(`Tem certeza que deseja excluir a loja "${store.name}"?`)) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('stores')
      .delete()
      .eq('id', store.id)

    if (error) {
      console.error('Error deleting store:', error)
      alert('Erro ao excluir loja. Verifique se nao existem usuarios ou checklists vinculados.')
      return
    }

    fetchStores()
  }

  const filteredStores = stores.filter(store => {
    const matchesSearch = store.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterActive === null || store.is_active === filterActive

    return matchesSearch && matchesFilter
  })

  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        variant="page"
        title="Lojas"
        icon={FiMapPin}
        backHref={APP_CONFIG.routes.admin}
        actions={isOffline ? [] : [
          {
            label: 'Nova Loja',
            onClick: () => openModal(),
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
              placeholder="Buscar por nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilterActive(null)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                filterActive === null ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilterActive(true)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                filterActive === true ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              Ativas
            </button>
            <button
              onClick={() => setFilterActive(false)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                filterActive === false ? 'bg-error text-error border border-error' : 'btn-secondary'
              }`}
            >
              Inativas
            </button>
          </div>
        </div>

        {/* Stores Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStores.length === 0 ? (
            <div className="col-span-full card p-12 text-center text-muted">
              Nenhuma loja encontrada
            </div>
          ) : (
            filteredStores.map((store) => (
              <div key={store.id} className="card p-6 hover:shadow-theme-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      store.is_active ? 'bg-primary' : 'bg-surface-hover'
                    }`}>
                      <FiMapPin className={`w-6 h-6 ${store.is_active ? 'text-primary-foreground' : 'text-muted'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-main">{store.name}</h3>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded-lg ${
                      store.is_active
                        ? 'bg-success text-success'
                        : 'bg-error text-error'
                    }`}
                  >
                    {store.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                <div className="flex items-center gap-4 mb-4 text-sm text-muted">
                  <div className="flex items-center gap-1">
                    <FiUsers className="w-4 h-4" />
                    <span>{store.user_count} usuarios</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FiCheckCircle className="w-4 h-4" />
                    <span>{store.checklist_count} checklists</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-subtle">
                  <button
                    onClick={() => openModal(store)}
                    className="btn-ghost p-2 flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Editar"
                    disabled={isOffline}
                  >
                    <FiEdit2 className="w-4 h-4" />
                    Editar
                  </button>
                  <button
                    onClick={() => toggleStoreStatus(store)}
                    className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      store.is_active
                        ? 'text-warning hover:bg-warning/20'
                        : 'text-success hover:bg-success/20'
                    }`}
                    title={store.is_active ? 'Desativar' : 'Ativar'}
                    disabled={isOffline}
                  >
                    {store.is_active ? <FiXCircle className="w-4 h-4" /> : <FiCheckCircle className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => deleteStore(store)}
                    className="p-2 text-error hover:bg-error/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Excluir"
                    disabled={isOffline}
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Stats */}
        <div className="mt-6 flex items-center justify-between text-sm text-muted">
          <p>
            Mostrando {filteredStores.length} de {stores.length} lojas
          </p>
          <p>
            {stores.filter(s => s.is_active).length} ativas, {stores.filter(s => !s.is_active).length} inativas
          </p>
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-md mx-4 p-6">
            <h2 className="text-xl font-bold text-main mb-6">
              {editingStore ? 'Editar Loja' : 'Nova Loja'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  placeholder="Ex: BDN Boa Viagem"
                  required
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-5 h-5 rounded border-default bg-surface text-primary"
                  />
                  <span className="text-sm text-secondary">Loja ativa</span>
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
                  disabled={saving}
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
