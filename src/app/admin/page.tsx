'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import Link from 'next/link'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import {
  getAuthCache,
  getUserCache,
  getAllUsersCache,
  getTemplatesCache,
  getStoresCache,
  getSectorsCache,
  getFunctionsCache,
} from '@/lib/offlineCache'
import {
  FiUsers,
  FiClipboard,
  FiMapPin,
  FiBarChart2,
  FiSettings,
  FiPlus,
  FiCheckCircle,
  FiAlertTriangle,
  FiGrid,
  FiShield,
  FiBriefcase,
  FiGitMerge,
  FiTrash2,
} from 'react-icons/fi'

type Stats = {
  totalUsers: number
  totalTemplates: number
  totalStores: number
  totalSectors: number
  totalFunctions: number
  totalManagers: number
  totalChecklists: number
  checklistsToday: number
  pendingValidations: number
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalTemplates: 0,
    totalStores: 0,
    totalSectors: 0,
    totalFunctions: 0,
    totalManagers: 0,
    totalChecklists: 0,
    checklistsToday: 0,
    pendingValidations: 0,
  })
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const fetchStats = async () => {
      // Se Supabase não está configurado, apenas mostra a página
      if (!isSupabaseConfigured || !supabase) {
        setLoading(false)
        return
      }

      let userId: string | null = null
      let isAdmin = false

      // Tenta online primeiro
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
        console.log('[Admin] Falha ao buscar online, tentando cache...')
      }

      // Se não conseguiu online, tenta cache
      if (!userId) {
        try {
          const cachedAuth = await getAuthCache()
          if (cachedAuth) {
            userId = cachedAuth.userId
            const cachedUser = await getUserCache(cachedAuth.userId)
            isAdmin = cachedUser?.is_admin || false
          }
        } catch {
          console.log('[Admin] Falha ao buscar cache')
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

      // Tenta buscar stats online
      try {
        const [usersRes, templatesRes, storesRes, sectorsRes, functionsRes, managersRes, checklistsRes, validationsRes] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }),
          supabase.from('checklist_templates').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('stores').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('sectors').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('functions').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_manager', true),
          supabase.from('checklists').select('id', { count: 'exact', head: true }),
          supabase.from('cross_validations').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
        ])

        // Checklists today
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const { count: checklistsTodayCount } = await supabase
          .from('checklists')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', today.toISOString())

        setStats({
          totalUsers: usersRes.count || 0,
          totalTemplates: templatesRes.count || 0,
          totalStores: storesRes.count || 0,
          totalSectors: sectorsRes.count || 0,
          totalFunctions: functionsRes.count || 0,
          totalManagers: managersRes.count || 0,
          totalChecklists: checklistsRes.count || 0,
          checklistsToday: checklistsTodayCount || 0,
          pendingValidations: validationsRes.count || 0,
        })
      } catch (err) {
        console.error('[Admin] Erro ao buscar estatísticas online:', err)

        // Fallback para cache offline
        try {
          const [cachedUsers, cachedTemplates, cachedStores, cachedSectors, cachedFunctions] = await Promise.all([
            getAllUsersCache(),
            getTemplatesCache(),
            getStoresCache(),
            getSectorsCache(),
            getFunctionsCache(),
          ])

          setStats({
            totalUsers: cachedUsers.length,
            totalTemplates: cachedTemplates.filter(t => t.is_active).length,
            totalStores: cachedStores.filter(s => s.is_active).length,
            totalSectors: cachedSectors.filter(s => s.is_active).length,
            totalFunctions: cachedFunctions.filter(f => f.is_active).length,
            totalManagers: 0,
            totalChecklists: 0,
            checklistsToday: 0,
            pendingValidations: 0,
          })
          console.log('[Admin] Stats carregados do cache offline')
        } catch (cacheErr) {
          console.error('[Admin] Erro ao buscar cache:', cacheErr)
        }
      }

      setLoading(false)
    }

    fetchStats()
  }, [supabase, router])

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    router.push(APP_CONFIG.routes.login)
  }

  if (loading) {
    return <LoadingPage />
  }

  const menuItems = [
    {
      title: 'Usuarios',
      description: 'Gerenciar usuarios e permissoes',
      icon: FiUsers,
      href: APP_CONFIG.routes.adminUsers,
      stat: stats.totalUsers,
    },
    {
      title: 'Checklists',
      description: 'Criar e editar modelos',
      icon: FiClipboard,
      href: APP_CONFIG.routes.adminTemplates,
      stat: stats.totalTemplates,
    },
    {
      title: 'Lojas',
      description: 'Gerenciar unidades',
      icon: FiMapPin,
      href: APP_CONFIG.routes.adminStores,
      stat: stats.totalStores,
    },
    {
      title: 'Setores',
      description: 'Cozinha, Estoque, Salao, etc.',
      icon: FiGrid,
      href: APP_CONFIG.routes.adminSectors,
      stat: stats.totalSectors,
    },
    {
      title: 'Funcoes',
      description: 'Cozinheiro, Zelador, Garcom, etc.',
      icon: FiBriefcase,
      href: APP_CONFIG.routes.adminFunctions,
      stat: stats.totalFunctions,
    },
    {
      title: 'Gerentes',
      description: 'Subadmins de cada loja',
      icon: FiShield,
      href: APP_CONFIG.routes.adminManagers,
      stat: stats.totalManagers,
    },
    {
      title: 'Validacoes',
      description: 'Estoquista vs Aprendiz',
      icon: FiGitMerge,
      href: APP_CONFIG.routes.adminValidations,
      stat: stats.pendingValidations,
    },
    {
      title: 'Respostas',
      description: 'Gerenciar e excluir',
      icon: FiTrash2,
      href: APP_CONFIG.routes.adminChecklists,
      stat: stats.totalChecklists,
    },
    {
      title: 'Relatorios',
      description: 'Estatisticas e analises',
      icon: FiBarChart2,
      href: APP_CONFIG.routes.adminReports,
      stat: stats.totalChecklists,
    },
  ]

  return (
    <div className="min-h-screen bg-page">
      <Header
      
        variant="page"
        title="Painel Admin"
        subtitle={`${APP_CONFIG.name} v${APP_CONFIG.version}`}
        icon={FiSettings}
        backHref={APP_CONFIG.routes.dashboard}
        showSignOut
        onSignOut={handleSignOut}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted text-sm">Checklists Hoje</p>
                <p className="text-3xl font-bold text-main mt-1">{stats.checklistsToday}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <FiCheckCircle className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted text-sm">Validações Pendentes</p>
                <p className="text-3xl font-bold text-main mt-1">{stats.pendingValidations}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                <FiAlertTriangle className="w-6 h-6 text-warning" />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted text-sm">Total Checklists</p>
                <p className="text-3xl font-bold text-main mt-1">{stats.totalChecklists}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center">
                <FiClipboard className="w-6 h-6 text-info" />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted text-sm">Usuários Ativos</p>
                <p className="text-3xl font-bold text-main mt-1">{stats.totalUsers}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <FiUsers className="w-6 h-6 text-accent" />
              </div>
            </div>
          </div>
        </div>

        {/* Menu Grid */}
        <h2 className="text-lg font-semibold text-main mb-4">Gerenciamento</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {menuItems.map((item) => {
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className="group card card-hover p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-theme-md">
                    <Icon className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-main group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <span className="badge-accent">
                        {item.stat}
                      </span>
                    </div>
                    <p className="text-muted text-sm mt-1">{item.description}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Quick Actions */}
        <h2 className="text-lg font-semibold text-main mt-8 mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Link
            href={APP_CONFIG.routes.checklistNew}
            className="flex items-center gap-3 card card-hover p-4 border-2 border-primary/30 bg-primary/5"
          >
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <FiCheckCircle className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-primary font-medium">Testar Checklist</span>
          </Link>

          <Link
            href={APP_CONFIG.routes.adminUsersNew}
            className="flex items-center gap-3 card card-hover p-4"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FiPlus className="w-5 h-5 text-primary" />
            </div>
            <span className="text-secondary font-medium">Novo Usuário</span>
          </Link>

          <Link
            href={APP_CONFIG.routes.adminTemplatesNew}
            className="flex items-center gap-3 card card-hover p-4"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FiPlus className="w-5 h-5 text-primary" />
            </div>
            <span className="text-secondary font-medium">Novo Template</span>
          </Link>

          <Link
            href={APP_CONFIG.routes.adminReports}
            className="flex items-center gap-3 card card-hover p-4"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FiBarChart2 className="w-5 h-5 text-primary" />
            </div>
            <span className="text-secondary font-medium">Ver Relatórios</span>
          </Link>
        </div>
      </main>
    </div>
  )
}
