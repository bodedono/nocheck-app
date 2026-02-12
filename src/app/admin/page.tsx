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
  FiBarChart2,
  FiSettings,
  FiCheckCircle,
  FiAlertTriangle,
  FiGrid,
  FiImage,
  FiHome,
  FiSliders,
  FiBookmark,
  FiFileText,
  FiZap,
  FiUserPlus,
  FiPlusCircle,
  FiArrowRight,
} from 'react-icons/fi'
import type { IconType } from 'react-icons'

type Stats = {
  totalUsers: number
  totalTemplates: number
  totalStores: number
  totalSectors: number
  totalFunctions: number
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
    totalChecklists: 0,
    checklistsToday: 0,
    pendingValidations: 0,
  })
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('Admin User')
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
            .select('is_admin, full_name')
            .eq('id', user.id)
            .single()
          isAdmin = profile && 'is_admin' in profile ? (profile as { is_admin: boolean }).is_admin : false
          if (profile && 'full_name' in profile && (profile as { full_name: string }).full_name) {
            setUserName((profile as { full_name: string }).full_name)
          }
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
            if (cachedUser?.full_name) setUserName(cachedUser.full_name)
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
        const [usersRes, templatesRes, storesRes, sectorsRes, functionsRes, checklistsRes, validationsRes] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }),
          supabase.from('checklist_templates').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('stores').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('sectors').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('functions').select('id', { count: 'exact', head: true }).eq('is_active', true),
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

  type DecorationType = 'progress-label' | 'mini-chart' | 'circles' | 'progress' | 'none'

  const menuItems: {
    title: string
    description: string
    icon: IconType
    href: string
    stat: number | string
    badgeLabel: string
    decoration: DecorationType
    barColor?: string
    barWidth?: string
    labelLeft?: string
    labelRight?: string
  }[] = [
    {
      title: 'Usuarios',
      description: 'Gerenciar usuarios e permissoes',
      icon: FiUsers,
      href: APP_CONFIG.routes.adminUsers,
      stat: stats.totalUsers,
      badgeLabel: 'Users',
      decoration: 'progress-label',
      barColor: 'bg-primary',
      barWidth: 'w-1/3',
      labelLeft: 'Active',
      labelRight: '25% Growth',
    },
    {
      title: 'Checklists',
      description: 'Criar e editar modelos',
      icon: FiFileText,
      href: APP_CONFIG.routes.adminTemplates,
      stat: stats.totalTemplates,
      badgeLabel: 'Templates',
      decoration: 'mini-chart',
    },
    {
      title: 'Lojas',
      description: 'Gerenciar unidades',
      icon: FiHome,
      href: APP_CONFIG.routes.adminStores,
      stat: stats.totalStores,
      badgeLabel: 'Units',
      decoration: 'circles',
    },
    {
      title: 'Setores',
      description: 'Cozinha, Estoque, Salao, etc.',
      icon: FiGrid,
      href: APP_CONFIG.routes.adminSectors,
      stat: stats.totalSectors,
      badgeLabel: 'Items',
      decoration: 'progress',
      barColor: 'bg-blue-500',
      barWidth: 'w-3/5',
    },
    {
      title: 'Funcoes',
      description: 'Cozinheiro, Zelador, Garcom, etc.',
      icon: FiClipboard,
      href: APP_CONFIG.routes.adminFunctions,
      stat: stats.totalFunctions,
      badgeLabel: 'Roles',
      decoration: 'progress',
      barColor: 'bg-orange-500',
      barWidth: 'w-2/5',
    },
    {
      title: 'Validacoes',
      description: 'Estoquista vs Aprendiz',
      icon: FiSliders,
      href: APP_CONFIG.routes.adminValidations,
      stat: stats.pendingValidations,
      badgeLabel: 'Pending',
      decoration: 'progress',
      barColor: 'bg-slate-300',
      barWidth: 'w-1/5',
    },
    {
      title: 'Respostas',
      description: 'Gerenciar e excluir',
      icon: FiBookmark,
      href: APP_CONFIG.routes.adminChecklists,
      stat: stats.totalChecklists,
      badgeLabel: 'New',
      decoration: 'none',
    },
    {
      title: 'Galeria',
      description: 'Fotos e anexos',
      icon: FiImage,
      href: APP_CONFIG.routes.adminGallery,
      stat: 0,
      badgeLabel: 'Files',
      decoration: 'none',
    },
    {
      title: 'Planos de Acao',
      description: 'Nao conformidades e acoes',
      icon: FiAlertTriangle,
      href: APP_CONFIG.routes.adminActionPlans,
      stat: 0,
      badgeLabel: 'Planos',
      decoration: 'progress',
      barColor: 'bg-warning',
      barWidth: 'w-1/4',
    },
    {
      title: 'Relatorios',
      description: 'Estatisticas e analises',
      icon: FiBarChart2,
      href: APP_CONFIG.routes.adminReports,
      stat: stats.totalChecklists,
      badgeLabel: 'Analytics',
      decoration: 'none',
    },
  ]

  const quickActions = [
    {
      title: 'Novo Usuario',
      description: 'Invite team member',
      icon: FiUserPlus,
      href: APP_CONFIG.routes.adminUsersNew,
    },
    {
      title: 'Novo Template',
      description: 'Create structure',
      icon: FiPlusCircle,
      href: APP_CONFIG.routes.adminTemplatesNew,
    },
    {
      title: 'Ver Relatorios',
      description: 'Check analytics',
      icon: FiBarChart2,
      href: APP_CONFIG.routes.adminReports,
    },
  ]

  const statCards = [
    { label: 'CHECKLISTS HOJE', value: stats.checklistsToday, icon: FiCheckCircle, color: 'bg-primary/10 text-primary' },
    { label: 'PENDENTES', value: stats.pendingValidations, icon: FiAlertTriangle, color: 'bg-warning/10 text-warning' },
    { label: 'TOTAL', value: stats.totalChecklists, icon: FiFileText, color: 'bg-info/10 text-info' },
    { label: 'ATIVOS', value: stats.totalUsers, icon: FiUsers, color: 'bg-accent/10 text-accent' },
  ]

  return (
    <div className="min-h-screen bg-page">
      <Header
        title="Painel Admin"
        subtitle={`${APP_CONFIG.name} v${APP_CONFIG.version}`}
        icon={FiSettings}
        showSearch
        showNotifications
        notificationCount={stats.pendingValidations}
        userName={userName}
        userRole="Super Admin"
        isAdmin={true}
        onSignOut={handleSignOut}
      />

      {/* Main Content */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-6">
          {/* Left Column - Main Content */}
          <main className="flex-1 min-w-0">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {statCards.map((stat) => {
                const StatIcon = stat.icon
                return (
                  <div key={stat.label} className="card p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${stat.color.split(' ')[0]}`}>
                        <StatIcon className={`w-5 h-5 ${stat.color.split(' ')[1]}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] sm:text-xs font-semibold text-muted uppercase tracking-wider leading-tight truncate">{stat.label}</p>
                        <p className="text-2xl sm:text-3xl font-bold text-main leading-tight">{stat.value}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Gerenciamento Section */}
            <div className="flex items-end justify-between mb-5">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-main">Gerenciamento</h2>
                <p className="text-sm text-muted mt-0.5">Overview of system modules and configurations</p>
              </div>
              <Link href={APP_CONFIG.routes.dashboard} className="text-sm text-primary font-medium hover:text-primary/80 transition-colors flex items-center gap-1 shrink-0">
                View All <FiArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Management Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {menuItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group card card-hover p-5 flex flex-col justify-between min-h-[190px]"
                  >
                    {/* Top: Icon + Badge */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl bg-surface-hover border border-subtle flex items-center justify-center group-hover:border-primary/30 transition-colors">
                        <Icon className="w-6 h-6 text-main group-hover:text-primary transition-colors" />
                      </div>
                      <span className="text-xs font-medium text-accent bg-accent/10 px-2.5 py-1 rounded-full">
                        {typeof item.stat === 'number' ? `${item.stat} ${item.badgeLabel}` : item.badgeLabel}
                      </span>
                    </div>

                    {/* Middle: Title + Description */}
                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-main group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted mt-0.5">{item.description}</p>
                    </div>

                    {/* Bottom: Decoration */}
                    <div className="mt-auto">
                      {item.decoration === 'progress-label' && (
                        <div>
                          <div className="w-full h-1.5 bg-surface-hover rounded-full overflow-hidden mb-2">
                            <div className={`h-full rounded-full ${item.barColor} ${item.barWidth}`} />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted">{item.labelLeft}</span>
                            <span className="text-xs text-muted">{item.labelRight}</span>
                          </div>
                        </div>
                      )}
                      {item.decoration === 'mini-chart' && (
                        <div className="flex items-end gap-1 h-8">
                          <div className="w-3 bg-slate-200 rounded-sm" style={{ height: '40%' }} />
                          <div className="w-3 bg-slate-300 rounded-sm" style={{ height: '65%' }} />
                          <div className="w-3 bg-primary rounded-sm" style={{ height: '100%' }} />
                          <div className="w-3 bg-slate-200 rounded-sm" style={{ height: '50%' }} />
                          <div className="w-3 bg-slate-300 rounded-sm" style={{ height: '30%' }} />
                        </div>
                      )}
                      {item.decoration === 'circles' && (
                        <div className="flex items-center">
                          <div className="w-7 h-7 rounded-full bg-slate-400 border-2 border-surface" />
                          <div className="w-7 h-7 rounded-full bg-slate-500 border-2 border-surface -ml-2" />
                          <div className="w-7 h-7 rounded-full bg-slate-300 border-2 border-surface -ml-2" />
                          <span className="text-xs text-muted ml-2">+5 more</span>
                        </div>
                      )}
                     
                    </div>
                  </Link>
                )
              })}
            </div>
          </main>

          {/* Right Column - Sidebar */}
          <aside className="w-72 xl:w-80 hidden lg:flex flex-col gap-5 shrink-0">
            {/* Quick Actions */}
            <div className="card p-5">
              <h3 className="flex items-center gap-2 text-base font-bold text-main mb-4">
                <FiZap className="w-5 h-5 text-warning" />
                Acoes Rapidas
              </h3>
              <div className="space-y-1">
                {quickActions.map((action) => {
                  const ActionIcon = action.icon
                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-hover transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-surface-hover border border-subtle flex items-center justify-center group-hover:border-primary/30 transition-colors shrink-0">
                        <ActionIcon className="w-5 h-5 text-main group-hover:text-primary transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-main leading-tight">{action.title}</p>
                        <p className="text-xs text-muted leading-tight mt-0.5">{action.description}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* System Status */}
            <div className="rounded-2xl p-5 bg-[#1E293B] dark:bg-[#0F172A] text-white">
              <h4 className="text-xs font-bold uppercase tracking-widest text-white/70 mb-3">System Status</h4>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-medium text-white">All systems operational</span>
              </div>
              <p className="text-xs text-white/50">Last check: 2 mins ago</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
