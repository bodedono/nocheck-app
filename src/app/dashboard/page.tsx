'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { APP_CONFIG } from '@/lib/config'
import type { User } from '@supabase/supabase-js'
import type { Store, ChecklistTemplate, Checklist, Sector, UserSector, StoreManager } from '@/types/database'
import { LoadingPage, Header, OfflineIndicator } from '@/components/ui'
import { FiClipboard, FiClock, FiCheckCircle, FiUser, FiCalendar, FiAlertCircle, FiEye, FiGrid, FiWifiOff, FiX } from 'react-icons/fi'
import Link from 'next/link'
// triggerPrecache is called in login page after successful auth
import {
  getAuthCache,
  getUserCache,
  getStoresCache,
  getTemplatesCache,
  getUserRolesCache,
} from '@/lib/offlineCache'

type TemplateWithVisibility = ChecklistTemplate & {
  template_visibility: Array<{
    store_id: number
    sector_id: number | null
    roles: string[]
    store: Store
    sector: Sector | null
  }>
}

type UserProfile = {
  id: string
  email: string
  full_name: string
  is_admin: boolean
}

type UserSectorWithDetails = UserSector & {
  sector: Sector & { store: Store }
}

type StoreManagerWithDetails = StoreManager & {
  store: Store
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
}

// Fallback para sistema antigo
type LegacyUserStoreRole = {
  id: number
  store_id: number
  role: string
  store: Store
}

export default function DashboardPage() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [userSectors, setUserSectors] = useState<UserSectorWithDetails[]>([])
  const [managedStores, setManagedStores] = useState<StoreManagerWithDetails[]>([])
  const [legacyRoles, setLegacyRoles] = useState<LegacyUserStoreRole[]>([])
  const [templates, setTemplates] = useState<TemplateWithVisibility[]>([])
  const [allStores, setAllStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<number | null>(null)
  const [recentChecklists, setRecentChecklists] = useState<ChecklistWithDetails[]>([])
  const [stats, setStats] = useState<UserStats>({
    completedToday: 0,
    completedThisWeek: 0,
    completedThisMonth: 0,
    inProgress: 0,
  })
  const [loading, setLoading] = useState(true)
  const [notLoggedIn, setNotLoggedIn] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Monitora status de conexao
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

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

    // Listener para mudanças de estado de autenticação
    // Isso garante que se o auth state mudar (ex: após login), os dados sejam recarregados
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        // Usuário acabou de logar, recarrega os dados
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

  // Redirecionar para login se não estiver logado
  useEffect(() => {
    if (notLoggedIn && !loading) {
      router.push(APP_CONFIG.routes.login)
    }
  }, [notLoggedIn, loading, router])

  const fetchData = async () => {
    // Se offline, carrega do cache
    if (!navigator.onLine) {
      console.log('[Dashboard] Modo offline - carregando do cache')
      await loadFromCache()
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // Tenta cache offline antes de redirecionar
      const hasCache = await loadFromCache()
      if (!hasCache) {
        setNotLoggedIn(true)
      }
      setLoading(false)
      return
    }
    setUser(user)

    // Fetch user profile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileData } = await (supabase as any)
      .from('users')
      .select('id, email, full_name, is_admin')
      .eq('id', user.id)
      .single()

    if (profileData) {
      setProfile(profileData as UserProfile)
    }

    // Fetch user's sectors (new structure)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sectorsData } = await (supabase as any)
      .from('user_sectors')
      .select(`
        *,
        sector:sectors(
          *,
          store:stores(*)
        )
      `)
      .eq('user_id', user.id)

    if (sectorsData) {
      setUserSectors(sectorsData as UserSectorWithDetails[])
    }

    // Fetch stores where user is manager
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: managedData } = await (supabase as any)
      .from('store_managers')
      .select(`
        *,
        store:stores(*)
      `)
      .eq('user_id', user.id)

    if (managedData) {
      setManagedStores(managedData as StoreManagerWithDetails[])
    }

    // Fallback: Fetch legacy roles (user_store_roles) if no sectors found
    let legacyRolesData: LegacyUserStoreRole[] = []
    if (!sectorsData || sectorsData.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rolesData } = await (supabase as any)
        .from('user_store_roles')
        .select(`
          *,
          store:stores(*)
        `)
        .eq('user_id', user.id)

      if (rolesData && rolesData.length > 0) {
        legacyRolesData = rolesData as LegacyUserStoreRole[]
        setLegacyRoles(legacyRolesData)
      }
    }

    // If admin, fetch all stores
    if (profileData?.is_admin) {
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
    } else {
      // Set initial selected store based on sectors, managed stores, or legacy roles
      const sectorStores = sectorsData?.map((s: UserSectorWithDetails) => s.sector?.store).filter(Boolean) || []
      const managerStores = managedData?.map((m: StoreManagerWithDetails) => m.store).filter(Boolean) || []
      const legacyStores = legacyRolesData?.map((r: LegacyUserStoreRole) => r.store).filter(Boolean) || []
      const allUserStores = [...sectorStores, ...managerStores, ...legacyStores] as Store[]

      // Remove duplicates
      const uniqueStores = allUserStores.filter((store, index, self) =>
        store && index === self.findIndex(s => s && s.id === store.id)
      )

      if (uniqueStores.length > 0) {
        setSelectedStore(uniqueStores[0].id)
      }
    }

    // Fetch templates with visibility info including sector
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: templatesData } = await (supabase as any)
      .from('checklist_templates')
      .select(`
        *,
        template_visibility(
          store_id,
          sector_id,
          roles,
          store:stores(*),
          sector:sectors(*)
        )
      `)
      .eq('is_active', true)

    if (templatesData) {
      setTemplates(templatesData as TemplateWithVisibility[])
    }

    // Fetch user's recent checklists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: checklistsData } = await (supabase as any)
      .from('checklists')
      .select(`
        *,
        template:checklist_templates(*),
        store:stores(*),
        sector:sectors(*)
      `)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (checklistsData) {
      setRecentChecklists(checklistsData as ChecklistWithDetails[])
    }

    // Calculate stats
    // Usar timezone local para calcular "hoje", "semana", "mês"
    const now = new Date()

    // Início de hoje no horário local (meia-noite)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    // Converter para ISO string mantendo o offset local
    const todayISO = new Date(todayStart.getTime() - todayStart.getTimezoneOffset() * 60000).toISOString()

    // 7 dias atrás
    const weekAgo = new Date(todayStart)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoISO = new Date(weekAgo.getTime() - weekAgo.getTimezoneOffset() * 60000).toISOString()

    // 30 dias atrás (mais preciso que "mês")
    const monthAgo = new Date(todayStart)
    monthAgo.setDate(monthAgo.getDate() - 30)
    const monthAgoISO = new Date(monthAgo.getTime() - monthAgo.getTimezoneOffset() * 60000).toISOString()

    console.log('[Dashboard] Buscando stats - Hoje desde:', todayISO)

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

    console.log('[Dashboard] Stats results:', {
      today: todayRes.count,
      week: weekRes.count,
      month: monthRes.count,
      inProgress: inProgressRes.count,
    })

    setStats({
      completedToday: todayRes.count || 0,
      completedThisWeek: weekRes.count || 0,
      completedThisMonth: monthRes.count || 0,
      inProgress: inProgressRes.count || 0,
    })

    setLoading(false)
  }

  /**
   * Carrega dados do cache IndexedDB para modo offline
   */
  const loadFromCache = async (): Promise<boolean> => {
    try {
      console.log('[Dashboard] Carregando dados do cache...')

      // Verifica auth cacheado
      const cachedAuth = await getAuthCache()
      if (!cachedAuth) {
        console.log('[Dashboard] Sem auth no cache')
        return false
      }

      // Carrega usuario do cache
      const cachedUser = await getUserCache(cachedAuth.userId)
      if (!cachedUser) {
        console.log('[Dashboard] Sem usuario no cache')
        return false
      }

      // Define profile a partir do cache
      setProfile({
        id: cachedUser.id,
        email: cachedUser.email,
        full_name: cachedUser.full_name,
        is_admin: cachedUser.is_admin || false,
      })

      // Carrega lojas do cache
      const cachedStores = await getStoresCache()
      if (cachedStores.length > 0) {
        setAllStores(cachedStores)
        setSelectedStore(cachedStores[0].id)
      }

      // Carrega roles do usuario (estrutura legada)
      const cachedRoles = await getUserRolesCache(cachedAuth.userId)
      if (cachedRoles.length > 0) {
        // Associa lojas aos roles
        const rolesWithStores = cachedRoles.map(role => ({
          ...role,
          store: cachedStores.find(s => s.id === role.store_id) || { id: role.store_id, name: 'Loja', is_active: true } as Store,
        }))
        setLegacyRoles(rolesWithStores as LegacyUserStoreRole[])

        // Se nao for admin, define loja selecionada baseado nos roles
        if (!cachedUser.is_admin && rolesWithStores.length > 0) {
          const firstStore = rolesWithStores[0].store
          if (firstStore) {
            setSelectedStore(firstStore.id)
          }
        }
      }

      // Nota: Setores nao tem estrutura completa no cache (user_sectors)
      // Por enquanto, modo offline funciona sem setores detalhados

      // Carrega templates do cache
      const cachedTemplates = await getTemplatesCache()
      if (cachedTemplates.length > 0) {
        // Cria estrutura simplificada de templates com visibilidade baseada nas lojas do usuario
        const templatesWithVisibility = cachedTemplates.map(template => ({
          ...template,
          template_visibility: cachedStores.map(store => ({
            store_id: store.id,
            sector_id: null,
            roles: [],
            store,
            sector: null,
          })),
        })) as TemplateWithVisibility[]

        setTemplates(templatesWithVisibility)
      }

      // Em modo offline, nao temos checklists recentes nem stats
      setRecentChecklists([])
      setStats({
        completedToday: 0,
        completedThisWeek: 0,
        completedThisMonth: 0,
        inProgress: 0,
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

  // Get unique stores user has access to
  const getUserStores = (): Store[] => {
    if (!profile) return []
    if (profile.is_admin) return allStores

    const sectorStores = userSectors.map(us => us.sector?.store).filter(Boolean) as Store[]
    const managerStores = managedStores.map(m => m.store).filter(Boolean) as Store[]
    const legacyStores = legacyRoles.map(r => r.store).filter(Boolean) as Store[]
    const allUserStores = [...sectorStores, ...managerStores, ...legacyStores]

    // Remove duplicates
    return allUserStores.filter((store, index, self) =>
      store && index === self.findIndex(s => s && s.id === store.id)
    )
  }

  // Check if user is a manager of the selected store
  const isManagerOfStore = (storeId: number): boolean => {
    return managedStores.some(m => m.store_id === storeId)
  }

  // Get user's sectors in a specific store
  const getUserSectorsInStore = (storeId: number): UserSectorWithDetails[] => {
    return userSectors.filter(us => us.sector.store_id === storeId)
  }

  // Check if user can fill checklists (member of sector, not just viewer/manager, or has legacy role)
  const canFillChecklists = (storeId: number): boolean => {
    if (profile?.is_admin) return true
    const sectorsInStore = getUserSectorsInStore(storeId)
    const hasLegacyRole = legacyRoles.some(r => r.store_id === storeId)
    return sectorsInStore.some(us => us.role === 'member') || hasLegacyRole
  }

  // Get user's legacy role in a store
  const getLegacyRoleInStore = (storeId: number): LegacyUserStoreRole | undefined => {
    return legacyRoles.find(r => r.store_id === storeId)
  }

  // Get available templates for the selected store
  const getAvailableTemplates = (): { template: TemplateWithVisibility; canFill: boolean; sectorName?: string }[] => {
    if (!selectedStore) return []

    const result: { template: TemplateWithVisibility; canFill: boolean; sectorName?: string }[] = []
    const legacyRole = getLegacyRoleInStore(selectedStore)

    templates.forEach(template => {
      // ADMIN: pode ver e preencher TODOS os templates, independente de visibilidade
      if (profile?.is_admin) {
        result.push({
          template,
          canFill: true,
          sectorName: undefined,
        })
        return
      }

      const visibilities = template.template_visibility?.filter(v => v.store_id === selectedStore) || []

      // If no specific visibility rules for this store, but user has legacy role, show all templates
      if (visibilities.length === 0 && legacyRole) {
        result.push({
          template,
          canFill: true,
          sectorName: undefined,
        })
        return
      }

      visibilities.forEach(visibility => {

        // Manager can see all but not fill
        if (isManagerOfStore(selectedStore)) {
          result.push({
            template,
            canFill: false,
            sectorName: visibility.sector?.name,
          })
          return
        }

        // User with legacy role can see and fill templates for their store
        if (legacyRole) {
          // Check if template role matches legacy role (or if no role restriction)
          const matchesRole = !visibility.roles || visibility.roles.length === 0 ||
            visibility.roles.includes(legacyRole.role)
          if (matchesRole) {
            result.push({
              template,
              canFill: true,
              sectorName: visibility.sector?.name,
            })
          }
          return
        }

        // Check if user is member of the sector this template is visible in
        if (visibility.sector_id) {
          const userSector = userSectors.find(
            us => us.sector_id === visibility.sector_id && us.role === 'member'
          )
          if (userSector) {
            result.push({
              template,
              canFill: true,
              sectorName: visibility.sector?.name,
            })
          }
        }
      })
    })

    // Remove duplicates (same template might appear multiple times)
    const unique = result.filter((item, index, self) =>
      index === self.findIndex(t => t.template.id === item.template.id)
    )

    return unique
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
  const isManager = selectedStore ? isManagerOfStore(selectedStore) : false
  const canFill = selectedStore ? canFillChecklists(selectedStore) : false

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

  // User has no access (no sectors, not a manager, not admin)
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
              Sua conta ainda nao foi configurada com acesso a nenhum setor ou loja.
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
              onClick={() => setOfflineBannerDismissed(true)}
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

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - New Checklist */}
          <div className="lg:col-span-2">
            {/* Store Selector */}
            {stores.length > 1 && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-muted mb-3">
                  Selecione a Loja
                </label>
                <div className="flex flex-wrap gap-2">
                  {stores.map(store => {
                    const isStoreManager = isManagerOfStore(store.id)
                    return (
                      <button
                        key={store.id}
                        onClick={() => setSelectedStore(store.id)}
                        className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 ${
                          selectedStore === store.id
                            ? 'bg-primary text-primary-foreground shadow-theme-md'
                            : 'bg-surface text-secondary border border-subtle hover:bg-surface-hover'
                        }`}
                      >
                        {store.name}
                        {isStoreManager && !profile?.is_admin && (
                          <FiEye className="w-4 h-4 opacity-70" title="Gerente" />
                        )}
                      </button>
                    )
                  })}
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

            {/* User's Sectors/Roles in this store */}
            {selectedStore && !profile?.is_admin && (
              <div className="mb-6">
                <p className="text-sm text-muted mb-2">Seu acesso nesta loja:</p>
                <div className="flex flex-wrap gap-2">
                  {getUserSectorsInStore(selectedStore).map(us => (
                    <span
                      key={us.id}
                      className="badge-secondary text-xs flex items-center gap-1"
                      style={{ backgroundColor: us.sector.color + '20', color: us.sector.color }}
                    >
                      <FiGrid className="w-3 h-3" />
                      {us.sector.name}
                      {us.role === 'viewer' && ' (visualizador)'}
                    </span>
                  ))}
                  {getLegacyRoleInStore(selectedStore) && (
                    <span className="badge-secondary text-xs flex items-center gap-1 bg-primary/20 text-primary capitalize">
                      <FiUser className="w-3 h-3" />
                      {getLegacyRoleInStore(selectedStore)?.role}
                    </span>
                  )}
                  {isManager && (
                    <span className="badge-secondary text-xs flex items-center gap-1 bg-info/20 text-info">
                      <FiEye className="w-3 h-3" />
                      Gerente (todos os setores)
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
                {availableTemplates.map(({ template, canFill: canFillTemplate, sectorName }) => (
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
                        <div className="flex flex-col items-end gap-1">
                          <span className="badge-secondary capitalize text-xs">
                            {template.category || 'Geral'}
                          </span>
                          {sectorName && (
                            <span className="text-xs text-muted">
                              {sectorName}
                            </span>
                          )}
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
                  ) : (
                    <div
                      key={template.id}
                      className="card p-5 opacity-75"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center">
                          <FiEye className="w-5 h-5 text-muted" />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="badge-secondary capitalize text-xs">
                            {template.category || 'Geral'}
                          </span>
                          {sectorName && (
                            <span className="text-xs text-muted">
                              {sectorName}
                            </span>
                          )}
                        </div>
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

            {recentChecklists.length === 0 ? (
              <div className="card p-6 text-center">
                <FiClipboard className="w-10 h-10 text-muted mx-auto mb-3" />
                <p className="text-muted text-sm">
                  Voce ainda nao preencheu nenhum checklist
                </p>
              </div>
            ) : (
              <div className="space-y-3">
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
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
