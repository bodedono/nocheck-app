'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { APP_CONFIG } from '@/lib/config'
import type { User } from '@supabase/supabase-js'
import type { Store, ChecklistTemplate, Checklist, Sector, FunctionRow } from '@/types/database'
import { LoadingPage, Header, OfflineIndicator } from '@/components/ui'
import { FiClipboard, FiClock, FiCheckCircle, FiUser, FiCalendar, FiAlertCircle, FiWifiOff, FiX, FiRefreshCw, FiAlertTriangle, FiUploadCloud, FiLayers, FiPlay } from 'react-icons/fi'
import Link from 'next/link'
import {
  getAuthCache,
  getUserCache,
  getStoresCache,
  getTemplatesCache,
  getFunctionsCache,
  getSectorsCache,
  getTemplateVisibilityCache,
  getChecklistsCache,
  getChecklistSectionsCache,
  getUserStoresCache,
  cacheAllDataForOffline,
} from '@/lib/offlineCache'
import { getPendingChecklists, type PendingChecklist } from '@/lib/offlineStorage'
import { syncAll, subscribeSyncStatus } from '@/lib/syncService'

type TemplateSection = {
  id: number
  template_id: number
  name: string
  description: string | null
  sort_order: number
}

type TemplateWithVisibility = ChecklistTemplate & {
  template_visibility: Array<{
    store_id: number
    sector_id: number | null
    function_id: number | null
    store: Store
    sector: Sector | null
    function_ref: FunctionRow | null
  }>
  template_sections?: TemplateSection[]
}

type UserStoreEntry = {
  id: number
  store_id: number
  sector_id: number | null
  is_primary: boolean
  store: Store
  sector: Sector | null
}

type UserProfile = {
  id: string
  email: string
  full_name: string
  is_admin: boolean
  store_id: number | null
  function_id: number | null
  sector_id: number | null
  store: Store | null
  function_ref: FunctionRow | null
  sector: Sector | null
  user_stores?: UserStoreEntry[]
}

type ChecklistWithDetails = Checklist & {
  template: ChecklistTemplate
  store: Store
  sector: Sector | null
}

type InProgressChecklist = {
  id: number
  template_id: number
  store_id: number
  created_at: string
  template: { id: number; name: string; category: string | null }
  store: { id: number; name: string }
  totalSections: number
  completedSections: number
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
  const [inProgressChecklists, setInProgressChecklists] = useState<InProgressChecklist[]>([])
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

    // Fetch user profile with store, function, sector joins + multi-lojas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileData } = await (supabase as any)
      .from('users')
      .select(`
        *,
        store:stores!users_store_id_fkey(*),
        function_ref:functions!users_function_id_fkey(*),
        sector:sectors!users_sector_id_fkey(*),
        user_stores(
          id,
          store_id,
          sector_id,
          is_primary,
          store:stores(*),
          sector:sectors(*)
        )
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
    } else if (profileData?.user_stores && profileData.user_stores.length > 0) {
      // Employee/Manager: multiple stores via user_stores
      const userStores = (profileData.user_stores as UserStoreEntry[])
        .map(us => us.store)
        .filter(Boolean) as Store[]
      setAllStores(userStores)
      const primary = (profileData.user_stores as UserStoreEntry[]).find(us => us.is_primary)
      setSelectedStore(primary ? primary.store_id : userStores[0]?.id || null)
    } else if (profileData?.store) {
      // Fallback legado: single store
      setAllStores([profileData.store as Store])
      setSelectedStore((profileData.store as Store).id)
    }

    // Fetch templates with visibility info + sections
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
        ),
        template_sections(id, template_id, name, description, sort_order)
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

    if (!profileData?.is_admin) {
      // Usuario normal: apenas seus proprios checklists
      checklistQuery = checklistQuery.eq('created_by', user.id)
    }

    const { data: checklistsData } = await checklistQuery

    if (checklistsData) {
      setRecentChecklists(checklistsData as ChecklistWithDetails[])
    }

    // Fetch in-progress sectioned checklists for "Continuar Preenchimento"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let inProgressQuery = (supabase as any)
      .from('checklists')
      .select(`
        id, template_id, store_id, created_at,
        template:checklist_templates(id, name, category),
        store:stores(id, name),
        checklist_sections(id, section_id, status)
      `)
      .eq('status', 'em_andamento')
      .order('created_at', { ascending: false })

    if (!profileData?.is_admin) {
      inProgressQuery = inProgressQuery.eq('created_by', user.id)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inProgressData } = await inProgressQuery

    if (inProgressData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withProgress = (inProgressData as any[])
        .filter(c => c.checklist_sections && c.checklist_sections.length > 0)
        .map(c => ({
          id: c.id,
          template_id: c.template_id,
          store_id: c.store_id,
          created_at: c.created_at,
          template: c.template,
          store: c.store,
          totalSections: c.checklist_sections.length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          completedSections: c.checklist_sections.filter((s: any) => s.status === 'concluido').length,
        }))
      setInProgressChecklists(withProgress)
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

    // Stats queries: admin ve tudo, usuario ve so dele
    const isAdminUser = profileData?.is_admin === true

    // Helper to apply the right filter based on role
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyStatsFilter = (query: any) => {
      if (isAdminUser) return query // Admin: sem filtro
      return query.eq('created_by', user.id) // Usuario normal
    }

    const [todayRes, weekRes, monthRes, inProgressRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyStatsFilter((supabase as any)
        .from('checklists')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'concluido')
        .gte('created_at', todayISO)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyStatsFilter((supabase as any)
        .from('checklists')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'concluido')
        .gte('created_at', weekAgoISO)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyStatsFilter((supabase as any)
        .from('checklists')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'concluido')
        .gte('created_at', monthAgoISO)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyStatsFilter((supabase as any)
        .from('checklists')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'em_andamento')),
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

      // Busca dados auxiliares do cache
      const cachedStores = await getStoresCache()
      const cachedFunctions = await getFunctionsCache()
      const cachedSectors = await getSectorsCache()
      const cachedUserStores = await getUserStoresCache(cachedAuth.userId)

      // Reconstroi function_ref e sector a partir do cache
      const userFunction = cachedUser.function_id
        ? cachedFunctions.find(f => f.id === cachedUser.function_id) || null
        : null
      const userSector = cachedUser.sector_id
        ? cachedSectors.find(s => s.id === cachedUser.sector_id) || null
        : null
      const userStore = cachedUser.store_id
        ? cachedStores.find(s => s.id === cachedUser.store_id) || null
        : null

      // Reconstroi user_stores com objetos completos
      const userStoresWithDetails: UserStoreEntry[] = cachedUserStores.map(us => ({
        id: us.id,
        store_id: us.store_id,
        sector_id: us.sector_id,
        is_primary: us.is_primary,
        store: cachedStores.find(s => s.id === us.store_id) || { id: us.store_id, name: '' } as Store,
        sector: us.sector_id ? cachedSectors.find(s => s.id === us.sector_id) || null : null,
      }))

      setProfile({
        id: cachedUser.id,
        email: cachedUser.email,
        full_name: cachedUser.full_name,
        is_admin: cachedUser.is_admin || false,
        store_id: cachedUser.store_id || null,
        function_id: cachedUser.function_id || null,
        sector_id: cachedUser.sector_id || null,
        store: userStore,
        function_ref: userFunction,
        sector: userSector,
        user_stores: userStoresWithDetails.length > 0 ? userStoresWithDetails : undefined,
      })

      // Configura lojas acessiveis
      if (cachedStores.length > 0) {
        if (cachedUser.is_admin) {
          setAllStores(cachedStores)
          setSelectedStore(cachedStores[0].id)
        } else if (userStoresWithDetails.length > 0) {
          // Multi-loja
          const stores = userStoresWithDetails.map(us => us.store).filter(Boolean)
          setAllStores(stores)
          const primary = userStoresWithDetails.find(us => us.is_primary)
          setSelectedStore(primary ? primary.store_id : stores[0]?.id || null)
        } else if (cachedUser.store_id) {
          const store = cachedStores.find(s => s.id === cachedUser.store_id)
          if (store) {
            setAllStores([store])
            setSelectedStore(store.id)
          }
        }
      }

      // Templates com visibilidade REAL do cache
      const cachedTemplates = await getTemplatesCache()
      const cachedVisibility = await getTemplateVisibilityCache()

      if (cachedTemplates.length > 0) {
        const templatesWithVisibility = cachedTemplates.map(template => {
          const visibilityRows = cachedVisibility.filter(v => v.template_id === template.id)
          return {
            ...template,
            template_visibility: visibilityRows.map(v => ({
              store_id: v.store_id,
              sector_id: v.sector_id,
              function_id: v.function_id,
              store: cachedStores.find(s => s.id === v.store_id) || { id: v.store_id, name: '' } as Store,
              sector: v.sector_id ? cachedSectors.find(s => s.id === v.sector_id) || null : null,
              function_ref: v.function_id ? cachedFunctions.find(f => f.id === v.function_id) || null : null,
            })),
          }
        }) as TemplateWithVisibility[]

        setTemplates(templatesWithVisibility)
      }

      // Historico recente do cache
      const cachedChecklists = await getChecklistsCache()
      if (cachedChecklists.length > 0) {
        const userId = cachedAuth.userId

        // Filtra por usuario (admin ve todos)
        const filteredChecklists = cachedUser.is_admin
          ? cachedChecklists
          : cachedChecklists.filter(c => c.created_by === userId)

        // Ordena por created_at desc e pega os 10 mais recentes
        const sorted = [...filteredChecklists].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        const recent = sorted.slice(0, 10)

        // Mapeia para o formato esperado pelo componente
        const recentWithDetails: ChecklistWithDetails[] = recent.map(c => ({
          ...c,
          template: { id: c.template_id, name: c.template_name || 'Checklist', category: c.template_category || null } as ChecklistTemplate,
          store: { id: c.store_id, name: c.store_name || 'Loja' } as Store,
          sector: c.sector_name ? { id: c.sector_id || 0, name: c.sector_name } as Sector : null,
        }))

        setRecentChecklists(recentWithDetails)

        // In-progress checklists (Continuar Preenchimento)
        const inProgress = filteredChecklists.filter(c => c.status === 'em_andamento')
        if (inProgress.length > 0) {
          const cachedClSections = await getChecklistSectionsCache()

          const inProgressWithSections: InProgressChecklist[] = inProgress.map(c => {
            const clSections = cachedClSections.filter(s => s.checklist_id === c.id)
            return {
              id: c.id,
              template_id: c.template_id,
              store_id: c.store_id,
              created_at: c.created_at,
              template: { id: c.template_id, name: c.template_name || 'Checklist', category: c.template_category || null },
              store: { id: c.store_id, name: c.store_name || 'Loja' },
              totalSections: clSections.length,
              completedSections: clSections.filter(s => s.status === 'concluido').length,
            }
          }).filter(c => c.totalSections > 0)

          setInProgressChecklists(inProgressWithSections)
        }

        // Stats calculados do cache
        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const weekAgo = new Date(todayStart)
        weekAgo.setDate(weekAgo.getDate() - 7)
        const monthAgo = new Date(todayStart)
        monthAgo.setDate(monthAgo.getDate() - 30)

        const completed = filteredChecklists.filter(c => c.status === 'concluido')
        const completedToday = completed.filter(c => new Date(c.created_at) >= todayStart).length
        const completedThisWeek = completed.filter(c => new Date(c.created_at) >= weekAgo).length
        const completedThisMonth = completed.filter(c => new Date(c.created_at) >= monthAgo).length
        const inProgressCount = filteredChecklists.filter(c => c.status === 'em_andamento').length

        let pendingSyncCount = 0
        try {
          const pending = await getPendingChecklists()
          setPendingChecklists(pending)
          pendingSyncCount = pending.filter(p => p.syncStatus === 'pending' || p.syncStatus === 'failed').length
        } catch {
          // Ignore errors
        }

        setStats({
          completedToday,
          completedThisWeek,
          completedThisMonth,
          inProgress: inProgressCount,
          pendingSync: pendingSyncCount,
        })
      } else {
        // Sem checklists no cache - so pending sync
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
      }

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
    // Multi-loja: user_stores
    if (profile.user_stores && profile.user_stores.length > 0) {
      return profile.user_stores.map(us => us.store).filter(Boolean)
    }
    // Fallback legado: single store
    if (profile.store) return [profile.store]
    if (profile.store_id) {
      const store = allStores.find(s => s.id === profile.store_id)
      if (store) return [store]
    }
    return []
  }

  // Get available templates for the selected store
  const getAvailableTemplates = (): { template: TemplateWithVisibility; canFill: boolean }[] => {
    if (!selectedStore || !profile) return []

    // Setor do usuario na loja selecionada (multi-loja)
    const userSectorForStore = profile.user_stores?.find(
      us => us.store_id === selectedStore
    )?.sector_id || profile.sector_id

    return templates
      .filter(template => {
        // Filter by selected store visibility
        const visibilities = template.template_visibility?.filter(v => v.store_id === selectedStore) || []
        if (visibilities.length === 0) return false

        // Admin: see all templates that have visibility for this store
        if (profile.is_admin) return true

        // Employee: check sector + function match (usando setor da loja selecionada)
        return visibilities.some(v => {
          const sectorMatch = !v.sector_id || v.sector_id === userSectorForStore
          const functionMatch = !v.function_id || v.function_id === profile.function_id
          return sectorMatch && functionMatch
        })
      })
      .map(template => ({
        template,
        canFill: true,
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
        {/* Stats */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted">
            {profile?.is_admin ? 'Dados do sistema' : 'Seus dados'}
          </p>
        </div>
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
                </div>
              </div>
            )}

            {/* In-Progress Sectioned Checklists */}
            {inProgressChecklists.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-main mb-4 flex items-center gap-2">
                  <FiPlay className="w-5 h-5 text-warning" />
                  Continuar Preenchimento
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {inProgressChecklists.map(item => {
                    const pct = item.totalSections > 0
                      ? Math.round((item.completedSections / item.totalSections) * 100)
                      : 0
                    return (
                      <Link
                        key={item.id}
                        href={`${APP_CONFIG.routes.checklistNew}?template=${item.template_id}&store=${item.store_id}&resume=${item.id}`}
                        className="group card-hover p-5 border-l-4 border-warning"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
                            <FiLayers className="w-5 h-5 text-warning" />
                          </div>
                          <span className="badge-secondary text-xs bg-warning/20 text-warning">
                            {item.completedSections}/{item.totalSections} etapas
                          </span>
                        </div>
                        <h3 className="font-semibold text-main mb-1 group-hover:text-primary transition-colors">
                          {item.template?.name}
                        </h3>
                        <p className="text-xs text-muted mb-2">
                          {item.store?.name} - {formatDate(item.created_at)}
                        </p>
                        <div className="w-full bg-surface-hover rounded-full h-2">
                          <div
                            className="bg-warning h-2 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted mt-1">{pct}% concluido</p>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Available Checklists */}
            <h2 className="text-lg font-semibold text-main mb-4 flex items-center gap-2">
              <FiClipboard className="w-5 h-5 text-primary" />
              Iniciar Novo Checklist
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
                {availableTemplates.map(({ template }) => {
                  const sectionCount = template.template_sections?.length || 0
                  return (
                    <Link
                      key={template.id}
                      href={`${APP_CONFIG.routes.checklistNew}?template=${template.id}&store=${selectedStore}`}
                      className="group card-hover p-5"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <FiClipboard className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex items-center gap-2">
                          {sectionCount > 0 && (
                            <span className="badge-secondary text-xs flex items-center gap-1 bg-info/20 text-info">
                              <FiLayers className="w-3 h-3" />
                              {sectionCount} etapas
                            </span>
                          )}
                          <span className="badge-secondary capitalize text-xs">
                            {template.category || 'Geral'}
                          </span>
                        </div>
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
                  )
                })}
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
                    <Link
                      key={checklist.id}
                      href={`/checklist/${checklist.id}`}
                      className="card p-4 hover:shadow-theme-md transition-shadow block"
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
                    </Link>
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
