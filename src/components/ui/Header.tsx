'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { FiArrowLeft, FiLogOut, FiUser, FiSearch, FiBell, FiSettings, FiCheck, FiAlertTriangle, FiCheckCircle, FiClock } from 'react-icons/fi'
import { APP_CONFIG } from '@/lib/config'
import { ThemeToggle } from './ThemeToggle'
import { createClient } from '@/lib/supabase'
import { getAuthCache, getUserCache } from '@/lib/offlineCache'
import { useNotifications, type AppNotification } from '@/hooks/useNotifications'
import type { IconType } from 'react-icons'
import { BsFillHouseFill } from 'react-icons/bs'

type HeaderAction = {
  label: string
  href?: string
  onClick?: () => void
  icon?: IconType
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

type HeaderProps = {
  // Navigation: back arrow (if provided) or hamburger menu
  backHref?: string
  onBack?: () => void

  // Title area (if neither title nor icon, shows logo)
  title?: string
  subtitle?: string
  icon?: IconType

  // Features
  showSearch?: boolean
  searchPlaceholder?: string
  showNotifications?: boolean
  notificationCount?: number
  showAdminLink?: boolean

  // User info (auto-fetched from Supabase/cache if not provided)
  userName?: string
  userRole?: string
  isAdmin?: boolean

  // Actions (buttons on the right side)
  actions?: HeaderAction[]
  rightSlot?: React.ReactNode
  onSignOut?: () => void

  // Progress bar or extra content below the header bar
  children?: React.ReactNode
}

export function Header({
  backHref,
  onBack,
  title,
  subtitle,
  icon: Icon,
  showSearch = false,
  searchPlaceholder = 'Buscar modulos, relatorios, usuarios...',
  showNotifications = false,
  notificationCount = 0,
  showAdminLink = false,
  userName: userNameProp,
  userRole: userRoleProp,
  isAdmin: isAdminProp,
  actions = [],
  rightSlot,
  onSignOut,
  children,
}: HeaderProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Internal user state (only used when props not provided)
  const [fetchedName, setFetchedName] = useState<string | null>(null)
  const [fetchedIsAdmin, setFetchedIsAdmin] = useState(false)

  // Use props if provided, otherwise use fetched data
  const userName = userNameProp ?? fetchedName ?? ''
  const isAdmin = isAdminProp ?? fetchedIsAdmin
  const userRole = userRoleProp ?? (isAdmin ? 'Super Admin' : 'Colaborador')

  // Auto-fetch user data if not provided via props
  useEffect(() => {
    if (userNameProp !== undefined) return

    const fetchUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('users')
            .select('full_name, is_admin')
            .eq('id', user.id)
            .single()
          if (profile) {
            setFetchedName((profile as { full_name: string }).full_name || '')
            setFetchedIsAdmin((profile as { is_admin: boolean }).is_admin || false)
          }
          return
        }
      } catch {
        // Offline - try cache
      }

      try {
        const cachedAuth = await getAuthCache()
        if (cachedAuth) {
          const cachedUser = await getUserCache(cachedAuth.userId)
          if (cachedUser) {
            setFetchedName(cachedUser.full_name || '')
            setFetchedIsAdmin(cachedUser.is_admin || false)
          }
        }
      } catch {
        // Ignore
      }
    }

    fetchUser()
  }, [supabase, userNameProp])

  const handleSignOut = async () => {
    if (onSignOut) {
      onSignOut()
    } else {
      await supabase.auth.signOut()
      router.push(APP_CONFIG.routes.login)
    }
  }

  const handleBack = () => {
    if (onBack) {
      onBack()
    } else if (backHref) {
      router.push(backHref)
    }
  }

  const getButtonClasses = (variant: HeaderAction['variant'] = 'primary') => {
    switch (variant) {
      case 'primary': return 'btn-primary'
      case 'secondary': return 'btn-secondary'
      case 'ghost': return 'btn-ghost'
      case 'danger': return 'p-2 text-muted hover:text-error hover:bg-surface-hover rounded-xl transition-colors'
      default: return 'btn-primary'
    }
  }

  // Notifications
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
      setNotifOpen(false)
    }
  }, [])

  useEffect(() => {
    if (notifOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [notifOpen, handleClickOutside])

  const getNotifIcon = (type: string) => {
    if (type.includes('overdue') || type.includes('reincidencia')) return FiAlertTriangle
    if (type.includes('completed')) return FiCheckCircle
    if (type.includes('deadline')) return FiClock
    return FiBell
  }

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  }

  const effectiveUnread = showNotifications ? (notificationCount || unreadCount) : 0

  // Show logo when no title or icon is specified
  const showLogo = !title && !Icon

  return (
    <>
      <header className="fixed top-4 left-4 right-4 z-50 rounded-2xl border border-subtle shadow-theme-lg backdrop-blur-xl bg-[rgba(var(--bg-surface-rgb),0.8)]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Left: Navigation + Title */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Back arrow or Hamburger menu */}
              {backHref || onBack ? (
                <button
                  onClick={handleBack}
                  className="p-2 text-muted hover:text-main hover:bg-surface-hover rounded-xl transition-colors"
                  title="Voltar"
                >
                  <FiArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => router.push(APP_CONFIG.routes.dashboard)}
                  className="p-2 text-muted hover:text-main hover:bg-surface-hover rounded-xl transition-colors"
                  title="Dashboard"
                >
                  <BsFillHouseFill className="w-5 h-5" />
                </button>
              )}

              {/* Logo or Icon + Title */}
              {showLogo ? (
                <Link href={APP_CONFIG.routes.dashboard} className="flex items-center">
                  <Image src="/Logo-dark.png" alt={APP_CONFIG.name} width={120} height={32} className="logo-for-light" />
                  <Image src="/Logo.png" alt={APP_CONFIG.name} width={120} height={32} className="logo-for-dark" />
                </Link>
              ) : (
                <>
                  {Icon && (
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary-foreground" />
                    </div>
                  )}
                  <div className="hidden sm:block">
                    <h1 className="text-sm font-bold text-main leading-tight">{title}</h1>
                    {subtitle && <p className="text-xs text-muted leading-tight">{subtitle}</p>}
                  </div>
                </>
              )}
            </div>

            {/* Center: Search bar (desktop only) */}
            {showSearch && (
              <div className="flex-1 max-w-xl hidden md:block">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface-hover border border-subtle text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    readOnly
                  />
                </div>
              </div>
            )}

            {/* Right: Actions + User */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Notifications bell */}
              {showNotifications && (
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={() => setNotifOpen(!notifOpen)}
                    className="p-2 text-muted hover:text-main hover:bg-surface-hover rounded-xl transition-colors relative"
                  >
                    <FiBell className="w-5 h-5" />
                    {effectiveUnread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-warning text-[10px] text-white font-bold rounded-full flex items-center justify-center">
                        {effectiveUnread > 9 ? '9+' : effectiveUnread}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-subtle shadow-theme-lg bg-surface z-50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
                        <h3 className="text-sm font-semibold text-main">Notificacoes</h3>
                        {unreadCount > 0 && (
                          <button
                            onClick={() => markAllAsRead()}
                            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                          >
                            <FiCheck className="w-3 h-3" />
                            Marcar todas como lidas
                          </button>
                        )}
                      </div>

                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="px-4 py-8 text-center">
                            <FiBell className="w-8 h-8 text-muted mx-auto mb-2" />
                            <p className="text-sm text-muted">Nenhuma notificacao</p>
                          </div>
                        ) : (
                          notifications.map((notif: AppNotification) => {
                            const NotifIcon = getNotifIcon(notif.type)
                            return (
                              <Link
                                key={notif.id}
                                href={notif.link || '#'}
                                onClick={() => {
                                  if (!notif.is_read) markAsRead(notif.id)
                                  setNotifOpen(false)
                                }}
                                className={`flex items-start gap-3 px-4 py-3 hover:bg-surface-hover transition-colors border-b border-subtle last:border-b-0 ${
                                  !notif.is_read ? 'bg-primary/5' : ''
                                }`}
                              >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                  notif.type.includes('overdue') || notif.type.includes('reincidencia')
                                    ? 'bg-error/20'
                                    : notif.type.includes('completed')
                                    ? 'bg-success/20'
                                    : 'bg-primary/10'
                                }`}>
                                  <NotifIcon className={`w-4 h-4 ${
                                    notif.type.includes('overdue') || notif.type.includes('reincidencia')
                                      ? 'text-error'
                                      : notif.type.includes('completed')
                                      ? 'text-success'
                                      : 'text-primary'
                                  }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm leading-tight ${!notif.is_read ? 'font-semibold text-main' : 'text-secondary'}`}>
                                    {notif.title}
                                  </p>
                                  {notif.message && (
                                    <p className="text-xs text-muted mt-0.5 line-clamp-2">{notif.message}</p>
                                  )}
                                  <p className="text-xs text-muted mt-1">{formatTimeAgo(notif.created_at)}</p>
                                </div>
                                {!notif.is_read && (
                                  <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                                )}
                              </Link>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Admin Link (settings gear) */}
              {showAdminLink && isAdmin && (
                <Link
                  href={APP_CONFIG.routes.admin}
                  className="p-2 text-muted hover:text-main hover:bg-surface-hover rounded-xl transition-colors"
                  title="Painel Admin"
                >
                  <FiSettings className="w-5 h-5" />
                </Link>
              )}

              {/* Custom action buttons */}
              {actions.map((action, index) => {
                const ActionIcon = action.icon
                if (action.href) {
                  return (
                    <Link
                      key={index}
                      href={action.href}
                      className={`${getButtonClasses(action.variant)} flex items-center gap-2`}
                    >
                      {ActionIcon && <ActionIcon className="w-4 h-4" />}
                      <span className="hidden sm:inline">{action.label}</span>
                    </Link>
                  )
                }
                return (
                  <button
                    key={index}
                    onClick={action.onClick}
                    className={`${getButtonClasses(action.variant)} flex items-center gap-2`}
                  >
                    {ActionIcon && <ActionIcon className="w-4 h-4" />}
                    <span className="hidden sm:inline">{action.label}</span>
                  </button>
                )
              })}

              {/* Custom right-side content */}
              {rightSlot}

              {/* User Info */}
              {userName && (
                <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-subtle">
                  <div className="text-right">
                    <p className="text-xs font-medium text-main leading-tight">{userName}</p>
                    <p className="text-[10px] text-muted leading-tight">{userRole}</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <FiUser className="w-4 h-4 text-primary" />
                  </div>
                </div>
              )}

              {/* Sign Out */}
              <button
                onClick={handleSignOut}
                className="p-2 text-muted hover:text-error hover:bg-surface-hover rounded-xl transition-colors"
                title="Sair"
              >
                <FiLogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Extra content below header (progress bar, etc.) */}
        {children}
      </header>
      {/* Spacer for fixed header */}
      <div className="h-24" />
    </>
  )
}
