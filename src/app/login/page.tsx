'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { APP_CONFIG } from '@/lib/config'
import { ThemeToggle, LoadingInline } from '@/components/ui'
import { triggerPrecache } from '@/hooks/usePrecache'
import { cacheAllDataForOffline } from '@/lib/offlineCache'

function LoginForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string>('')

  // Mostra erro ou sucesso vindo da URL (ex: confirmação de email)
  useEffect(() => {
    const errorParam = searchParams.get('error')
    const messageParam = searchParams.get('message')
    if (errorParam) {
      setError(decodeURIComponent(errorParam))
    }
    if (messageParam) {
      setSuccessMsg(decodeURIComponent(messageParam))
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setStatus('Autenticando...')

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        if (error.message.includes('Invalid login')) {
          setError(APP_CONFIG.messages.loginError)
        } else {
          setError(error.message)
        }
        setLoading(false)
        setStatus('')
        return
      }

      // Aguardar a sessao estar completamente estabelecida
      setStatus('Verificando sessao...')
      const { data: session } = await supabase.auth.getSession()

      if (session?.session) {
        // Faz cache dos DADOS para funcionamento offline
        setStatus('Salvando dados para modo offline...')

        try {
          // Salva todos os dados no IndexedDB
          await cacheAllDataForOffline(session.session.user.id)
          console.log('[Login] Dados cacheados com sucesso')
        } catch (err) {
          console.error('[Login] Erro ao cachear dados:', err)
        }

        // Faz precache das PÁGINAS para funcionamento offline
        setStatus('Preparando aplicação offline...')

        try {
          // Aguarda o precache completar (com timeout de 30s)
          await triggerPrecache()
          console.log('[Login] Precache completado com sucesso')
        } catch (err) {
          // Continua mesmo com erro - melhor ter login sem cache do que travar
          console.error('[Login] Erro no precache:', err)
        }

        setStatus('Redirecionando...')
        // Usar window.location para garantir reload completo da página
        // router.push() não funciona bem após login no Next.js App Router
        window.location.href = APP_CONFIG.routes.dashboard
      } else {
        // Fallback - redireciona direto
        window.location.href = APP_CONFIG.routes.dashboard
      }
    } catch {
      setError(APP_CONFIG.messages.loginErrorGeneric)
      setLoading(false)
      setStatus('')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center ml-8 mb-8">
          <div className="flex justify-center mb-4">
            {/* Logo-dark.png = texto escuro, para tema claro */}
            <Image
              src="/Logo-dark.png"
              alt={APP_CONFIG.name}
              width={320}
              height={120}
              className="logo-for-light"
              priority
            />
            {/* Logo.png = texto claro, para tema escuro */}
            <Image
              src="/Logo.png"
              alt={APP_CONFIG.name}
              width={320}
              height={120}
              className="logo-for-dark"
              priority
            />
          </div>
          <p className="text-muted mt-2">Sistema de Checklists</p>
        </div>

        {/* Login Form */}
        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-secondary mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="input"
                placeholder="seu@email.com"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-secondary mb-2">
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="input"
                placeholder="********"
              />
            </div>

            {/* Success Message */}
            {successMsg && (
              <div className="p-4 bg-success/10 rounded-xl border border-success/30">
                <p className="text-success text-sm text-center">{successMsg}</p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-error rounded-xl border border-error">
                <p className="text-error text-sm text-center">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <LoadingInline />
                  {status || 'Entrando...'}
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-muted text-sm mt-8">
          {APP_CONFIG.company} - {APP_CONFIG.year}
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
