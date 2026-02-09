'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import Link from 'next/link'
import {
  FiShield,
  FiSearch,
  FiMapPin,
  FiWifiOff,
  FiBriefcase,
  FiEdit2,
} from 'react-icons/fi'
import type { Store, FunctionRow } from '@/types/database'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import { getAuthCache, getUserCache, getStoresCache } from '@/lib/offlineCache'

type ManagerUser = {
  id: string
  email: string
  full_name: string
  is_active: boolean
  is_manager: boolean
  store_id: number | null
  store: Store | null
  function_ref: FunctionRow | null
}

export default function GerentesPage() {
  const [managers, setManagers] = useState<ManagerUser[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStore, setFilterStore] = useState<number | null>(null)
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

      // Fetch managers (users with is_manager = true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: managersData, error: managersError } = await (supabase as any)
        .from('users')
        .select(`
          id, email, full_name, is_active, is_manager, store_id,
          store:stores!users_store_id_fkey(*),
          function_ref:functions!users_function_id_fkey(*)
        `)
        .eq('is_manager', true)
        .order('full_name')

      if (managersError) throw managersError

      if (managersData) {
        setManagers(managersData)
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

  const filteredManagers = managers.filter(manager => {
    const matchesSearch =
      manager.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      manager.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (manager.store?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStore = filterStore === null || manager.store_id === filterStore

    return matchesSearch && matchesStore
  })

  // Group managers by store
  const managersByStore = useMemo(() => {
    const grouped: Record<number, ManagerUser[]> = {}
    filteredManagers.forEach(manager => {
      const storeId = manager.store_id || 0
      if (!grouped[storeId]) {
        grouped[storeId] = []
      }
      grouped[storeId].push(manager)
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
                mas <strong>nao podem preencher</strong> checklists. Para tornar um usuario gerente,
                edite o perfil dele na pagina de <Link href={APP_CONFIG.routes.adminUsers} className="text-primary underline">Usuarios</Link>.
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
        {filteredManagers.length === 0 ? (
          <div className="card p-12 text-center">
            <FiShield className="w-12 h-12 text-muted mx-auto mb-4" />
            <p className="text-muted">
              {searchTerm || filterStore
                ? 'Nenhum gerente encontrado com os filtros aplicados'
                : 'Nenhum gerente cadastrado ainda'}
            </p>
            <p className="text-sm text-muted mt-2">
              Para tornar um usuario gerente, edite o perfil dele na pagina de Usuarios.
            </p>
            <Link
              href={APP_CONFIG.routes.adminUsers}
              className="btn-primary mt-4 inline-block"
            >
              Ir para Usuarios
            </Link>
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
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-lg font-bold text-primary">
                              {manager.full_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-semibold text-main">{manager.full_name}</h4>
                            <p className="text-sm text-muted">{manager.email}</p>
                            {manager.function_ref && (
                              <div className="flex items-center gap-1 mt-1">
                                <FiBriefcase className="w-3 h-3 text-muted" />
                                <span className="text-xs text-muted">{manager.function_ref.name}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <Link
                          href={`${APP_CONFIG.routes.adminUsers}/${manager.id}`}
                          className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Editar usuario"
                        >
                          <FiEdit2 className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Managers without store */}
            {managersByStore[0]?.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FiMapPin className="w-4 h-4 text-muted" />
                  <h3 className="font-semibold text-main text-warning">Sem loja atribuida</h3>
                  <span className="badge-secondary text-xs">
                    {managersByStore[0].length}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {managersByStore[0].map(manager => (
                    <div key={manager.id} className="card p-4 border-warning/30">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                            <span className="text-lg font-bold text-warning">
                              {manager.full_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-semibold text-main">{manager.full_name}</h4>
                            <p className="text-sm text-muted">{manager.email}</p>
                          </div>
                        </div>
                        <Link
                          href={`${APP_CONFIG.routes.adminUsers}/${manager.id}`}
                          className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Editar usuario"
                        >
                          <FiEdit2 className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="mt-6 text-sm text-muted">
          Total: {managers.length} gerente{managers.length !== 1 ? 's' : ''} em {
            new Set(managers.filter(m => m.store_id).map(m => m.store_id)).size
          } loja{new Set(managers.filter(m => m.store_id).map(m => m.store_id)).size !== 1 ? 's' : ''}
        </div>
      </main>
    </div>
  )
}
