'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import {
  saveAuthCache,
  getAuthCache,
  saveUserCache,
  getUserCache,
  saveStoresCache,
  saveTemplatesCache,
  saveTemplateFieldsCache,
  saveSectorsCache,
  saveFunctionsCache,
  saveSyncMetadata,
  clearAllCache,
  type CachedAuth,
} from '@/lib/offlineCache'
import type { User } from '@/types/database'

export type OfflineAuthState = {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  isOnline: boolean
  isOfflineMode: boolean
  error: string | null
}

export type OfflineAuthActions = {
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  refreshAuth: () => Promise<void>
  syncUserData: () => Promise<void>
}

/**
 * Hook para autenticacao com suporte offline
 * - Quando online: usa Supabase normalmente e cacheia dados
 * - Quando offline: usa dados cacheados do IndexedDB
 */
export function useOfflineAuth(): OfflineAuthState & OfflineAuthActions {
  const [state, setState] = useState<OfflineAuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isOfflineMode: false,
    error: null,
  })

  const supabase = createClient()

  // Monitora status de conexao
  useEffect(() => {
    const handleOnline = () => {
      console.log('[OfflineAuth] Back online')
      setState(prev => ({ ...prev, isOnline: true }))
    }

    const handleOffline = () => {
      console.log('[OfflineAuth] Gone offline')
      setState(prev => ({ ...prev, isOnline: false, isOfflineMode: true }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Inicializa autenticacao
  useEffect(() => {
    initAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Inicializa autenticacao - tenta online primeiro, depois offline
   */
  const initAuth = async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      if (navigator.onLine) {
        // Tenta autenticacao online
        const { data: { user: supaUser } } = await supabase.auth.getUser()

        if (supaUser) {
          // Busca perfil do usuario
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: profile } = await (supabase as any)
            .from('users')
            .select('*')
            .eq('id', supaUser.id)
            .single()

          if (profile) {
            // Salva no cache para uso offline
            await cacheUserData(supaUser.id, supaUser.email || '')

            setState(prev => ({
              ...prev,
              user: profile,
              isAuthenticated: true,
              isLoading: false,
              isOfflineMode: false,
            }))
            return
          }
        }
      }

      // Se offline ou sem sessao online, tenta cache
      const cachedAuth = await getAuthCache()

      if (cachedAuth) {
        const cachedUser = await getUserCache(cachedAuth.userId)

        if (cachedUser) {
          console.log('[OfflineAuth] Using cached auth')
          setState(prev => ({
            ...prev,
            user: cachedUser,
            isAuthenticated: true,
            isLoading: false,
            isOfflineMode: !navigator.onLine,
          }))
          return
        }
      }

      // Sem autenticacao
      setState(prev => ({
        ...prev,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      }))
    } catch (error) {
      console.error('[OfflineAuth] Init error:', error)

      // Em caso de erro, tenta cache
      try {
        const cachedAuth = await getAuthCache()
        if (cachedAuth) {
          const cachedUser = await getUserCache(cachedAuth.userId)
          if (cachedUser) {
            setState(prev => ({
              ...prev,
              user: cachedUser,
              isAuthenticated: true,
              isLoading: false,
              isOfflineMode: true,
            }))
            return
          }
        }
      } catch {
        // Ignora erro de cache
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Erro ao verificar autenticacao',
      }))
    }
  }

  /**
   * Cacheia todos os dados do usuario para uso offline
   */
  const cacheUserData = async (userId: string, email: string) => {
    try {
      // Pega a sessao atual
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        // Salva auth
        await saveAuthCache({
          userId,
          email,
          accessToken: session.access_token,
          refreshToken: session.refresh_token || '',
          expiresAt: session.expires_at || 0,
        })
      }

      // Busca e cacheia dados do usuario
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase as any)
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (profile) {
        await saveUserCache(profile)
      }

      // Cacheia loja do usuario
      const storeId = profile?.store_id
      if (storeId) {
        // Busca e cacheia a loja
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: store } = await (supabase as any)
          .from('stores')
          .select('*')
          .eq('id', storeId)
          .single()

        if (store) {
          await saveStoresCache([store])
        }

        // Busca e cacheia setores da loja
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sectors } = await (supabase as any)
          .from('sectors')
          .select('*')
          .eq('store_id', storeId)

        if (sectors) {
          await saveSectorsCache(sectors)
        }

        // Busca e cacheia templates visiveis para a loja do usuario
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: visibility } = await (supabase as any)
          .from('template_visibility')
          .select('template_id')
          .eq('store_id', storeId)

        if (visibility) {
          const templateIds = [...new Set(visibility.map((v: { template_id: number }) => v.template_id))]

          if (templateIds.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: templates } = await (supabase as any)
              .from('checklist_templates')
              .select('*')
              .in('id', templateIds)

            if (templates) {
              await saveTemplatesCache(templates)
            }

            // Busca e cacheia campos dos templates
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: fields } = await (supabase as any)
              .from('template_fields')
              .select('*')
              .in('template_id', templateIds)
              .order('sort_order')

            if (fields) {
              await saveTemplateFieldsCache(fields)
            }
          }
        }
      }

      // Cacheia funcoes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: functions } = await (supabase as any)
        .from('functions')
        .select('*')
        .eq('is_active', true)

      if (functions) {
        await saveFunctionsCache(functions)
      }

      await saveSyncMetadata('user_data', 'success')
      console.log('[OfflineAuth] User data cached successfully')
    } catch (error) {
      console.error('[OfflineAuth] Error caching user data:', error)
      await saveSyncMetadata('user_data', 'failed')
    }
  }

  /**
   * Login com email e senha
   */
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error.message,
        }))
        return false
      }

      if (data.user) {
        // Cacheia dados para offline
        await cacheUserData(data.user.id, data.user.email || '')

        // Busca perfil
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (supabase as any)
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single()

        setState(prev => ({
          ...prev,
          user: profile,
          isAuthenticated: true,
          isLoading: false,
          isOfflineMode: false,
        }))

        return true
      }

      return false
    } catch (error) {
      console.error('[OfflineAuth] Login error:', error)
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Erro ao fazer login',
      }))
      return false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Logout - limpa sessao e cache
   */
  const logout = useCallback(async () => {
    try {
      // Limpa sessao do Supabase
      await supabase.auth.signOut()

      // Limpa todo o cache offline
      await clearAllCache()

      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isOnline: navigator.onLine,
        isOfflineMode: false,
        error: null,
      })

      console.log('[OfflineAuth] Logged out and cache cleared')
    } catch (error) {
      console.error('[OfflineAuth] Logout error:', error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Atualiza autenticacao
   */
  const refreshAuth = useCallback(async () => {
    await initAuth()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Sincroniza dados do usuario (quando volta online)
   */
  const syncUserData = useCallback(async () => {
    if (!state.isAuthenticated || !state.user) return

    if (navigator.onLine) {
      console.log('[OfflineAuth] Syncing user data...')
      await cacheUserData(state.user.id, state.user.email)
      setState(prev => ({ ...prev, isOfflineMode: false }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isAuthenticated, state.user])

  return {
    ...state,
    login,
    logout,
    refreshAuth,
    syncUserData,
  }
}

/**
 * Verifica se tem autenticacao cacheada (para uso no middleware)
 */
export async function hasOfflineAuth(): Promise<CachedAuth | null> {
  try {
    return await getAuthCache()
  } catch {
    return null
  }
}
