'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { APP_CONFIG } from '@/lib/config'
import type { User } from '@supabase/supabase-js'
import type { Store, ChecklistTemplate, Checklist, Sector, FunctionRow } from '@/types/database'
import { LoadingPage, Header, OfflineIndicator } from '@/components/ui'
import { FiClipboard, FiClock, FiCheckCircle, FiUser, FiCalendar, FiAlertCircle, FiEye, FiWifiOff, FiX, FiRefreshCw, FiAlertTriangle, FiUploadCloud } from 'react-icons/fi'
import Link from 'next/link'
import {
  getAuthCache,
  getUserCache,
  getStoresCache,
  getTemplatesCache,
  cacheAllDataForOffline,
} from '@/lib/offlineCache'
import { getPendingChecklists, type PendingChecklist } from '@/lib/offlineStorage'
import { syncAll, subscribeSyncStatus } from '@/lib/syncService'

type TemplateWithVisibility = ChecklistTemplate & {
  template_visibility: Array<{
    store_id: number
    sector_id: number | null
    function_id: number | null
    store: Store
    sector: Sector | null
    function_ref: FunctionRow | null
  }>
}

type UserProfile = {
  id: string
  email: string
  full_name: string
  is_admin: boolean
  is_manager: boolean
  store_id: number | null
  function_id: number | null
  sector_id: number | null
  store: Store | null
  function_ref: FunctionRow | null
  sector: Sector | null
}

type ChecklistWithDetails = Checklist & {
  template: ChecklistTemplate
  store: Store
  sector: Sector | null
}

type UserStats = {
  completedToday: number
  completedThisWeek: number
  completedThisMonth: number
  inProgress: number
  pendingSync: number
}

export default function DashboardPage() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [templates, setTemplates] = useState<TemplateWithVisibility[]>([])
  const [allStores, setAllStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<number | null>(null)
  const [recentChecklists, setRecentChecklists] = useState<ChecklistWithDetails[]>([])
  const [pendingChecklists, setPendingChecklists] = useState<PendingChecklist[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [stats, setStats] = useState<UserStats>({
    completedToday: 0,
    completedThisWeek: 0,
    completedThisMonth: 0,
    inProgress: 0,
    pendingSync: 0,
  })
  const [loading, setLoading] = useState(true)
  const [notLoggedIn, setNotLoggedIn] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('dashboard-offline-dismissed') === 'true'
    }
    return false
  })
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Monitora status de conexao
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false)
      sessionStorage.removeItem('dashboard-offline-dismissed')
      setOfflineBannerDismissed(false)
    }
    const handleOffline = () => {
      setIsOffline(true)
      const wasDismissed = sessionStorage.getItem('dashboard-offline-dismissed') === 'true'
      setOfflineBannerDismissed(wasDismissed)
    }

    setIsOffline(!navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    fetchData()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        fetchData()
      } else if (event === 'SIGNED_OUT') {
        setNotLoggedIn(true)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (notLoggedIn && !loading) {
      router.push(APP_CONFIG.routes.login)
    }
  }, [notLoggedIn, loading, router])

  // Subscreve ao status de sincronizacao
  useEffect(() => {
    const unsubscribe = subscribeSyncStatus(async (status) => {
      console.log('[Dashboard] Sync status changed:', status)

      if (!status.isSyncing && status.lastSyncAt) {
        const pending = await getPendingChecklists()
        setPendingChecklists(pending)
        setStats(prev => ({
          ...prev,
          pendingSync: pending.filter(p => p.syncStatus === 'pending' || p.syncStatus === 'failed').length,
        }))

        if (navigator.onLine) {
          fetchData()
        }
      }
    })

    return () => unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
    // Se offline, carrega do cache
    if (!navigator.onLine) {
      console.log('[Dashboard] Modo offline - carregando do cache')
      await loadFromCache()
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      const hasCache = await loadFromCache()
      if (!hasCache) {
        setNotLoggedIn(true)
      }
      setLoading(false)
      return
    }
    setUser(user)

    // Fetch user profile with store, function, sector joins
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileData } = await (supabase as any)
      .from('users')
      .select(`
        *,
        store:stores!users_store_id_fkey(*),
        function_ref:functions!users_function_id_fkey(*),
        sector:sectors!users_sector_id_fkey(*)
      `)
      .eq('id', user.id)
      .single()

    if (profileData) {
      setProfile(profileData as UserProfile)
    }

    // Fetch stores based on role
    if (profileData?.is_admin) {
      // Admin: all stores
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: storesData } = await (supabase as any)
        .from('stores')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (storesData && storesData.length > 0) {
        setAllStores(storesData as Store[])
        setSelectedStore((storesData[0] as Store).id)
      }
    } else if (profileData?.store) {
      // Employee/Manager: single store
      setAllStores([profileData.store as Store])
      setSelectedStore((profileData.store as Store).id)
    }

    // Fetch templates with visibility info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: templatesData } = await (supabase as any)
      .from('checklist_templates')
      .select(`
        *,
        template_visibility(
          store_id,
          sector_id,
          function_id,
          store:stores(*),
          sector:sectors(*),
          function_ref:functions(*)
        )
      `)
      .eq('is_active', true)

    if (templatesData) {
      setTemplates(templatesData as TemplateWithVisibility[])
    }

    // Fetch recent checklists based on role
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let checklistQuery = (supabase as any)
      .from('checklists')
      .select(`
        *,
        template:checklist_templates(*),
        store:stores(*),
        sector:sectors(*)
      `)
      .order('created_at', { ascending: false })
      .limit(10)

    if (profileData?.is_manager && profileData?.store_id && !profileData?.is_admin) {
      // Manager: all checklists from their store
      checklistQuery = checklistQuery.eq('store_id', profileData.store_id)
    } else if (!profileData?.is_admin) {
      // Employee: only their own checklists
      checklistQuery = checklistQuery.eq('created_by', user.id)
    }

    const { data: checklistsData } = await checklistQuery

    if (checklistsData) {
      setRecentChecklists(checklistsData as ChecklistWithDetails[])
    }

    // Fetch pending offline checklists
    try {
      const pending = await getPendingChecklists()
      setPendingChecklists(pending)
      console.log('[Dashboard] Checklists pendentes:', pending.length)
    } catch (err) {
      console.error('[Dashboard] Erro ao buscar checklists pendentes:', err)
    }

    // Calculate stats
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayISO = new Date(todayStart.getTime() - todayStart.getTimezoneOffset() * 60000).toISOString()

    const weekAgo = new Date(todayStart)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoISO = new Date(weekAgo.getTime() - weekAgo.getTimezoneOffset() * 60000).toISOString()

    const monthAgo = new Date(todayStart)
    monthAgo.setDate(monthAgo.getDate() - 30)
    const monthAgoISO = new Date(monthAgo.getTime() - monthAgo.getTimezoneOffset() * 60000).toISOString()

    const [todayRes, weekRes, monthRes, inProgressRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('checklists')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .eq('status', 'concluido')
        .gte('created_at', todayISO),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('checklists')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .eq('status', 'concluido')
        .gte('created_at', weekAgoISO),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('checklists')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .eq('status', 'concluido')
        .gte('created_at', monthAgoISO),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('checklists')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .eq('status', 'em_andamento'),
    ])

    let pendingSyncCount = 0
    try {
      const pending = await getPendingChecklists()
      pendingSyncCount = pending.filter(p => p.syncStatus === 'pending' || p.syncStatus === 'failed').length
    } catch {
      // Ignore errors
    }

    setStats({
      completedToday: todayRes.count || 0,
      completedThisWeek: weekRes.count || 0,
      completedThisMonth: monthRes.count || 0,
      inProgress: inProgressRes.count || 0,
      pendingSync: pendingSyncCount,
    })

    setLoading(false)

    // Atualiza cache offline em background
    cacheAllDataForOffline(user.id).catch(err => {
      console.warn('[Dashboard] Erro ao atualizar cache offline em background:', err)
    })
  }

  /**
   * Carrega dados do cache IndexedDB para modo offline
   */
  const loadFromCache = async (): Promise<boolean> => {
    try {
      console.log('[Dashboard] Carregando dados do cache...')

      const cachedAuth = await getAuthCache()
      if (!cachedAuth) {
        console.log('[Dashboard] Sem auth no cache')
        return false
      }

      const cachedUser = await getUserCache(cachedAuth.userId)
      if (!cachedUser) {
        console.log('[Dashboard] Sem usuario no cache')
        return false
      }

      setProfile({
        id: cachedUser.id,
        email: cachedUser.email,
        full_name: cachedUser.full_name,
        is_admin: cachedUser.is_admin || false,
        is_manager: cachedUser.is_manager || false,
        store_id: cachedUser.store_id || null,
        function_id: cachedUser.function_id || null,
        sector_id: cachedUser.sector_id || null,
        store: null,
        function_ref: null,
        sector: null,
      })

      const cachedStores = await getStoresCache()
      if (cachedStores.length > 0) {
        if (cachedUser.is_admin) {
          setAllStores(cachedStores)
          setSelectedStore(cachedStores[0].id)
        } else if (cachedUser.store_id) {
          const userStore = cachedStores.find(s => s.id === cachedUser.store_id)
          if (userStore) {
            setAllStores([userStore])
            setSelectedStore(userStore.id)
          }
        }
      }

      const cachedTemplates = await getTemplatesCache()
      if (cachedTemplates.length > 0) {
        const templatesWithVisibility = cachedTemplates.map(template => ({
          ...template,
          template_visibility: cachedStores.map(store => ({
            store_id: store.id,
            sector_id: null,
            function_id: null,
            store,
            sector: null,
            function_ref: null,
          })),
        })) as TemplateWithVisibility[]

        setTemplates(templatesWithVisibility)
      }

      let pendingSyncCount = 0
      try {
        const pending = await getPendingChecklists()
        setPendingChecklists(pending)
        pendingSyncCount = pending.filter(p => p.syncStatus === 'pending' || p.syncStatus === 'failed').length
      } catch {
        // Ignore errors
      }

      setRecentChecklists([])
      setStats({
        completedToday: 0,
        completedThisWeek: 0,
        completedThisMonth: 0,
        inProgress: 0,
        pendingSync: pendingSyncCount,
      })

      setIsOffline(true)
      setLoading(false)
      console.log('[Dashboard] Dados carregados do cache com sucesso')
      return true
    } catch (error) {
      console.error('[Dashboard] Erro ao carregar cache:', error)
      return false
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push(APP_CONFIG.routes.login)
  }

  const handleSyncNow = async () => {
    if (isSyncing || !navigator.onLine) return

    setIsSyncing(true)
    try {
      const result = await syncAll()
      console.log('[Dashboard] Sync result:', result)

      const pending = await getPendingChecklists()
      setPendingChecklists(pending)
      setStats(prev => ({
        ...prev,
        pendingSync: pending.filter(p => p.syncStatus === 'pending' || p.syncStatus === 'failed').length,
      }))

      if (result.synced > 0) {
        fetchData()
      }
    } catch (err) {
      console.error('[Dashboard] Erro ao sincronizar:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  // Get stores user has access to
  const getUserStores = (): Store[] => {
    if (!profile) return []
    if (profile.is_admin) return allStores
    if (profile.store) return [profile.store]
    // Fallback for offline mode when store object isn't available
    if (profile.store_id) {
      const store = allStores.find(s => s.id === profile.store_id)
      if (store) return [store]
    }
    return []
  }

  // Get available templates for the selected store
  const getAvailableTemplates = (): { template: TemplateWithVisibility; canFill: boolean }[] => {
    if (!selectedStore || !profile) return []

    return templates
      .filter(template => {
        // Admin: see all templates
        if (profile.is_admin) return true

        const visibilities = template.template_visibility?.filter(v => v.store_id === selectedStore) || []
        if (visibilities.length === 0) return false

        // Manager: see all templates for their store
        if (profile.is_manager) return true

        // Employee: check sector + function match
        return visibilities.some(v => {
          const sectorMatch = !v.sector_id || v.sector_id === profile.sector_id
          const functionMatch = !v.function_id || v.function_id === profile.function_id
          return sectorMatch && functionMatch
        })
      })
      .map(template => ({
        template,
        canFill: profile.is_admin ? true : !profile.is_manager,
      }))
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; class: string }> = {
      rascunho: { label: 'Rascunho', class: 'bg-surface-hover text-muted' },
      em_andamento: { label: 'Em Andamento', class: 'bg-warning/20 text-warning' },
      concluido: { label: 'Concluido', class: 'bg-success/20 text-success' },
      validado: { label: 'Validado', class: 'bg-info/20 text-info' },
    }
    return badges[status] || badges.rascunho
  }

  const stores = getUserStores()
  const availableTemplates = getAvailableTemplates()
  const isManager = profile?.is_manager || false
  const canFill = profile?.is_admin ? true : !isManager

  if (loading) {
    return <LoadingPage />
  }

  if (notLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-center">
          <FiUser className="w-16 h-16 text-muted mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-main mb-2">{APP_CONFIG.messages.loginRequired}</h2>
          <p className="text-muted mb-4">Redirecionando...</p>
          <Link href="/login" className="text-primary hover:underline">
            Ir para login
          </Link>
        </div>
      </div>
    )
  }

  // User has no access (no store assigned, not admin)
  if (!profile?.is_admin && stores.length === 0) {
    return (
      <div className="min-h-screen bg-page">
        <Header
          variant="dashboard"
          userName={profile?.full_name}
          isAdmin={profile?.is_admin}
          showAdminLink
          showSignOut
          onSignOut={handleSignOut}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-warning/20 flex items-center justify-center mx-auto mb-6">
              <FiAlertCircle className="w-10 h-10 text-warning" />
            </div>
            <h2 className="text-2xl font-bold text-main mb-2">
              Acesso Pendente
            </h2>
            <p className="text-muted max-w-md mx-auto mb-6">
              Sua conta ainda nao foi configurada com acesso a nenhuma loja.
              Entre em contato com o administrador para liberar seu acesso.
            </p>
            <div className="card p-6 max-w-sm mx-auto">
              <p className="text-sm text-secondary mb-2">Seus dados:</p>
              <p className="font-medium text-main">{profile?.full_name}</p>
              <p className="text-sm text-muted">{profile?.email}</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        variant="dashboard"
        userName={profile?.full_name}
        isAdmin={profile?.is_admin}
        showAdminLink
        showSignOut
        onSignOut={handleSignOut}
      />

      {/* Offline Banner */}
      {isOffline && !offlineBannerDismissed && (
        <div className="bg-warning text-warning-foreground py-2 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm font-medium relative">
            <FiWifiOff className="w-4 h-4" />
            <span>Voce esta offline - usando dados salvos localmente</span>
            <button
              onClick={() => {
                sessionStorage.setItem('dashboard-offline-dismissed', 'true')
                setOfflineBannerDismissed(true)
              }}
              className="absolute right-0 p-1 hover:bg-black/10 rounded transition-colors"
              aria-label="Fechar"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Offline Indicator (floating badge) */}
      <OfflineIndicator />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Manager Banner */}
        {isManager && !profile?.is_admin && (
          <div className="card p-4 mb-6 bg-info/10 border-info/20">
            <div className="flex items-center gap-3">
              <FiEye className="w-5 h-5 text-info" />
              <div>
                <p className="font-medium text-main">Modo Gerente</p>
                <p className="text-sm text-muted">
                  Voce esta visualizando como gerente. Pode ver todos os checklists mas nao pode preencher.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center">
                <FiCheckCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{stats.completedToday}</p>
                <p className="text-xs text-muted">Hoje</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
                <FiClock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{stats.inProgress}</p>
                <p className="text-xs text-muted">Em Andamento</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-info/20 flex items-center justify-center">
                <FiCalendar className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{stats.completedThisWeek}</p>
                <p className="text-xs text-muted">Esta Semana</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <FiClipboard className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{stats.completedThisMonth}</p>
                <p className="text-xs text-muted">Este Mes</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Sync Alert */}
        {stats.pendingSync > 0 && (
          <div className="card p-4 mb-8 bg-warning/10 border border-warning/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
                  <FiUploadCloud className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="font-medium text-main">
                    {stats.pendingSync} checklist{stats.pendingSync > 1 ? 's' : ''} aguardando sincronizacao
                  </p>
                  <p className="text-xs text-muted">
                    {navigator.onLine ? 'Conectado - pronto para sincronizar' : 'Offline - sincronizara automaticamente quando conectar'}
                  </p>
                </div>
              </div>
              {navigator.onLine && (
                <button
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  <FiRefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - New Checklist */}
          <div className="lg:col-span-2">
            {/* Store Selector (admin with multiple stores) */}
            {stores.length > 1 && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-muted mb-3">
                  Selecione a Loja
                </label>
                <div className="flex flex-wrap gap-2">
                  {stores.map(store => (
                    <button
                      key={store.id}
                      onClick={() => setSelectedStore(store.id)}
                      className={`px-4 py-2 rounded-xl font-medium transition-all ${
                        selectedStore === store.id
                          ? 'bg-primary text-primary-foreground shadow-theme-md'
                          : 'bg-surface text-secondary border border-subtle hover:bg-surface-hover'
                      }`}
                    >
                      {store.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Single store indicator */}
            {stores.length === 1 && (
              <div className="mb-6 flex items-center gap-2">
                <p className="text-sm text-muted">
                  Loja: <span className="font-medium text-main">{stores[0].name}</span>
                </p>
                {isManager && !profile?.is_admin && (
                  <span className="badge-secondary text-xs flex items-center gap-1">
                    <FiEye className="w-3 h-3" />
                    Gerente
                  </span>
                )}
              </div>
            )}

            {/* User info badges */}
            {selectedStore && !profile?.is_admin && (
              <div className="mb-6">
                <p className="text-sm text-muted mb-2">Seu perfil:</p>
                <div className="flex flex-wrap gap-2">
                  {profile?.function_ref && (
                    <span
                      className="badge-secondary text-xs flex items-center gap-1"
                      style={{ backgroundColor: profile.function_ref.color + '20', color: profile.function_ref.color }}
                    >
                      {profile.function_ref.name}
                    </span>
                  )}
                  {profile?.sector && (
                    <span
                      className="badge-secondary text-xs flex items-center gap-1"
                      style={{ backgroundColor: profile.sector.color + '20', color: profile.sector.color }}
                    >
                      {profile.sector.name}
                    </span>
                  )}
                  {isManager && (
                    <span className="badge-secondary text-xs flex items-center gap-1 bg-info/20 text-info">
                      <FiEye className="w-3 h-3" />
                      Gerente
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Available Checklists */}
            <h2 className="text-lg font-semibold text-main mb-4 flex items-center gap-2">
              <FiClipboard className="w-5 h-5 text-primary" />
              {canFill ? 'Iniciar Novo Checklist' : 'Checklists Disponiveis'}
            </h2>

            {availableTemplates.length === 0 ? (
              <div className="text-center py-12 card">
                <FiClipboard className="w-12 h-12 text-muted mx-auto mb-4" />
                <p className="text-muted">
                  {APP_CONFIG.messages.noChecklists}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {availableTemplates.map(({ template, canFill: canFillTemplate }) => (
                  canFillTemplate ? (
                    <Link
                      key={template.id}
                      href={`${APP_CONFIG.routes.checklistNew}?template=${template.id}&store=${selectedStore}`}
                      className="group card-hover p-5"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <FiClipboard className="w-5 h-5 text-primary" />
                        </div>
                        <span className="badge-secondary capitalize text-xs">
                          {template.category || 'Geral'}
                        </span>
                      </div>

                      <h3 className="font-semibold text-main mb-1 group-hover:text-primary transition-colors">
                        {template.name}
                      </h3>

                      {template.description && (
                        <p className="text-sm text-muted line-clamp-2">
                          {template.description}
                        </p>
                      )}
                    </Link>
                  ) : (
                    <div
                      key={template.id}
                      className="card p-5 opacity-75"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center">
                          <FiEye className="w-5 h-5 text-muted" />
                        </div>
                        <span className="badge-secondary capitalize text-xs">
                          {template.category || 'Geral'}
                        </span>
                      </div>

                      <h3 className="font-semibold text-main mb-1">
                        {template.name}
                      </h3>

                      {template.description && (
                        <p className="text-sm text-muted line-clamp-2">
                          {template.description}
                        </p>
                      )}

                      <p className="text-xs text-warning mt-3 flex items-center gap-1">
                        <FiEye className="w-3 h-3" />
                        Apenas visualizacao (gerente)
                      </p>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>

          {/* Right Column - Recent Checklists */}
          <div>
            <h2 className="text-lg font-semibold text-main mb-4 flex items-center gap-2">
              <FiClock className="w-5 h-5 text-primary" />
              Historico Recente
            </h2>

            {/* Pending Checklists */}
            {pendingChecklists.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-warning mb-2 flex items-center gap-1">
                  <FiUploadCloud className="w-3 h-3" />
                  Aguardando Sincronizacao
                </p>
                <div className="space-y-2">
                  {pendingChecklists.map(pending => {
                    const template = templates.find(t => t.id === pending.templateId)
                    const store = allStores.find(s => s.id === pending.storeId) ||
                      stores.find(s => s.id === pending.storeId)
                    const statusColor = pending.syncStatus === 'failed'
                      ? 'bg-error/20 text-error border-error/30'
                      : pending.syncStatus === 'syncing'
                      ? 'bg-info/20 text-info border-info/30'
                      : 'bg-warning/20 text-warning border-warning/30'
                    const statusLabel = pending.syncStatus === 'failed'
                      ? 'Falhou'
                      : pending.syncStatus === 'syncing'
                      ? 'Sincronizando'
                      : 'Pendente'
                    const StatusIcon = pending.syncStatus === 'failed'
                      ? FiAlertTriangle
                      : pending.syncStatus === 'syncing'
                      ? FiRefreshCw
                      : FiUploadCloud

                    return (
                      <div
                        key={pending.id}
                        className={`card p-3 border ${statusColor.includes('error') ? 'border-error/30' : 'border-warning/30'}`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <h4 className="font-medium text-main text-sm">
                            {template?.name || 'Checklist'}
                          </h4>
                          <span className={`badge-secondary text-xs flex items-center gap-1 ${statusColor}`}>
                            <StatusIcon className={`w-3 h-3 ${pending.syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                            {statusLabel}
                          </span>
                        </div>
                        <p className="text-xs text-muted mb-1">
                          {store?.name || 'Loja'}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDate(pending.createdAt)}
                        </p>
                        {pending.errorMessage && (
                          <p className="text-xs text-error mt-1">
                            {pending.errorMessage}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Synced Checklists */}
            {recentChecklists.length === 0 && pendingChecklists.length === 0 ? (
              <div className="card p-6 text-center">
                <FiClipboard className="w-10 h-10 text-muted mx-auto mb-3" />
                <p className="text-muted text-sm">
                  Voce ainda nao preencheu nenhum checklist
                </p>
              </div>
            ) : recentChecklists.length > 0 ? (
              <div className="space-y-3">
                {pendingChecklists.length > 0 && (
                  <p className="text-xs font-medium text-success flex items-center gap-1">
                    <FiCheckCircle className="w-3 h-3" />
                    Sincronizados
                  </p>
                )}
                {recentChecklists.map(checklist => {
                  const statusBadge = getStatusBadge(checklist.status)
                  return (
                    <div
                      key={checklist.id}
                      className="card p-4 hover:shadow-theme-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-main text-sm">
                          {checklist.template?.name}
                        </h4>
                        <span className={`badge-secondary text-xs ${statusBadge.class}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted mb-1">
                        {checklist.store?.name}
                        {checklist.sector && ` - ${checklist.sector.name}`}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDate(checklist.created_at)}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  )
}
