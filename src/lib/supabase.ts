'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// Verificar se o Supabase está configurado
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

// Singleton para evitar múltiplas instâncias
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null

// Client-side Supabase client (usado em componentes 'use client')
// Configurado para persistir sessão em cookies com longa duração
export function createClient() {
  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase não configurado. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env')
  }

  // Retorna o cliente existente se já foi criado (singleton)
  if (browserClient) {
    return browserClient
  }

  browserClient = createBrowserClient<Database>(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder-key',
    {
      cookieOptions: {
        // Cookie persiste por 7 dias (em segundos)
        maxAge: 60 * 60 * 24 * 7,
        // Permite envio em requisições same-site
        sameSite: 'lax',
        // Secure em produção
        secure: process.env.NODE_ENV === 'production',
        // Acessível em todo o site
        path: '/',
      },
      auth: {
        // Persiste sessão automaticamente
        persistSession: true,
        // Detecta sessão em outras abas
        detectSessionInUrl: true,
        // Auto refresh do token
        autoRefreshToken: true,
        // Armazena em localStorage como backup
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: 'nocheck-auth',
        // Modo de fluxo PKCE (mais seguro)
        flowType: 'pkce',
      },
    }
  )

  return browserClient
}

// Limpa o cliente (útil para logout)
export function clearSupabaseClient() {
  browserClient = null
}
