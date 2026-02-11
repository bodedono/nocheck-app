'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { FiArrowLeft, FiLogOut, FiSettings, FiUser } from 'react-icons/fi'
import { APP_CONFIG } from '@/lib/config'
import { ThemeToggle } from './ThemeToggle'
import type { IconType } from 'react-icons'

type HeaderAction = {
  label: string
  href?: string
  onClick?: () => void
  icon?: IconType
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

type HeaderProps = {
  // For dashboard-style header (with logo)
  variant?: 'dashboard' | 'page'

  // User info (for dashboard)
  userName?: string
  isAdmin?: boolean

  // Page header props
  title?: string
  subtitle?: string
  icon?: IconType
  backHref?: string

  // Actions
  actions?: HeaderAction[]
  showSignOut?: boolean
  onSignOut?: () => void

  // Admin link (for dashboard)
  showAdminLink?: boolean

  // Max width for the header container
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl'
}

export function Header({
  variant = 'page',
  userName,
  isAdmin,
  title,
  subtitle,
  icon: Icon,
  backHref,
  actions = [],
  showSignOut = false,
  onSignOut,
  showAdminLink = false,
  maxWidth = '7xl',
}: HeaderProps) {
  const router = useRouter()

  const maxWidthClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
  }

  const handleSignOut = () => {
    if (onSignOut) {
      onSignOut()
    } else {
      router.push(APP_CONFIG.routes.login)
    }
  }

  const getButtonClasses = (variant: HeaderAction['variant'] = 'primary') => {
    switch (variant) {
      case 'primary':
        return 'btn-primary'
      case 'secondary':
        return 'btn-secondary'
      case 'ghost':
        return 'btn-ghost'
      case 'danger':
        return 'p-2 text-muted hover:text-error hover:bg-surface-hover rounded-xl transition-colors'
      default:
        return 'btn-primary'
    }
  }

  const floatingHeaderClass = "fixed top-4 left-4 right-4 z-50 rounded-2xl border border-subtle shadow-theme-lg backdrop-blur-xl"
  const floatingHeaderBg = "bg-[rgba(var(--bg-surface-rgb),0.8)]"

  // Dashboard-style header with logo
  if (variant === 'dashboard') {
    return (
      <>
        <header className={`${floatingHeaderClass} ${floatingHeaderBg}`}>
          <div className={`${maxWidthClasses[maxWidth]} mx-auto px-4 sm:px-6 lg:px-8`}>
            <div className="flex items-center justify-between h-16">
              <Link href={APP_CONFIG.routes.dashboard} className="flex items-center">
                {/* Logo-dark.png = texto escuro, para tema claro */}
                <Image
                  src="/Logo-dark.png"
                  alt={APP_CONFIG.name}
                  width={150}
                  height={40}
                  className="logo-for-light"
                />
                {/* Logo.png = texto claro, para tema escuro */}
                <Image
                  src="/Logo.png"
                  alt={APP_CONFIG.name}
                  width={150}
                  height={40}
                  className="logo-for-dark"
                />
              </Link>

              <div className="flex items-center gap-4">
                {/* User Info */}
                {userName && (
                  <div className="hidden sm:flex items-center gap-2 text-secondary">
                    <FiUser className="w-4 h-4" />
                    <span className="text-sm">{userName}</span>
                    {isAdmin && (
                      <span className="badge-accent">Admin</span>
                    )}
                  </div>
                )}

                {/* Theme Toggle */}
                <ThemeToggle />

                {/* Admin Link */}
                {showAdminLink && isAdmin && (
                  <Link
                    href={APP_CONFIG.routes.admin}
                    className="p-2 text-muted hover:text-main hover:bg-surface-hover rounded-xl transition-colors"
                    title="Painel Admin"
                  >
                    <FiSettings className="w-5 h-5" />
                  </Link>
                )}

                {/* Custom Actions */}
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
                        {action.label}
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
                      {action.label}
                    </button>
                  )
                })}

                {/* Sign Out */}
                {showSignOut && (
                  <button
                    onClick={handleSignOut}
                    className="p-2 text-muted hover:text-error hover:bg-surface-hover rounded-xl transition-colors"
                    title="Sair"
                  >
                    <FiLogOut className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>
        {/* Spacer for fixed header */}
        <div className="h-24" />
      </>
    )
  }

  // Page-style header with back button and title
  return (
    <>
      <header className={`${floatingHeaderClass} ${floatingHeaderBg}`}>
        <div className={`${maxWidthClasses[maxWidth]} mx-auto px-4 sm:px-6 lg:px-8`}>
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              {/* Back Button */}
              {backHref && (
                <Link
                  href={backHref}
                  className="btn-ghost p-2"
                >
                  <FiArrowLeft className="w-5 h-5" />
                </Link>
              )}

              {/* Title with optional icon */}
              <div className="flex items-center gap-3">
                {Icon && (
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary-foreground" />
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold text-main">{title}</h1>
                  {subtitle && (
                    <p className="text-xs text-muted">{subtitle}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Custom Actions */}
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

              {/* Sign Out */}
              {showSignOut && (
                <button
                  onClick={handleSignOut}
                  className="p-2 text-secondary hover:text-error hover:bg-surface-hover rounded-lg transition-colors"
                  title="Sair"
                >
                  <FiLogOut className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
      {/* Spacer for fixed header */}
      <div className="h-24" />
    </>
  )
}
