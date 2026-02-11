'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import type { User as DBUser, Store, Sector, FunctionRow } from '@/types/database'
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
  saveTemplateVisibilityCache,
  clearAllCache,
  getStoresCache,
  getFunctionsCache,
  getSectorsCache,
} from '@/lib/offlineCache'
import type { TemplateVisibility } from '@/types/database'

export type UserWithProfile = DBUser & {
  store: Store | null
  function_ref: FunctionRow | null
  sector: Sector | null
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserWithProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOffline, setIsOffline] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  // Monitora status de conexao
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [])

  const fetchUserProfile = useCallback(async (userId: string): Promise<UserWithProfile | null> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('users')
        .select(`
          *,
          store:stores!users_store_id_fkey(*),
          function_ref:functions!users_function_id_fkey(*),
          sector:sectors!users_sector_id_fkey(*)
        `)
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error fetching user profile:', error)
        return null
      }

      return data as UserWithProfile
    } catch (error) {
      console.error('Error fetching user profile:', error)
      return null
    }
  }, [supabase])

  // Carrega perfil do cache (modo offline)
  const loadFromCache = useCallback(async () => {
    try {
      const cachedAuth = await getAuthCache()
      if (!cachedAuth) return false

      const cachedUser = await getUserCache(cachedAuth.userId)
      if (!cachedUser) return false

      // Busca store do cache
      const cachedStores = await getStoresCache()
      const userStore = cachedUser.store_id
        ? cachedStores.find(s => s.id === cachedUser.store_id) || null
        : null

      // Busca function_ref e sector do cache
      const cachedFunctions = await getFunctionsCache()
      const cachedSectors = await getSectorsCache()

      const userFunction = cachedUser.function_id
        ? cachedFunctions.find(f => f.id === cachedUser.function_id) || null
        : null

      const userSector = cachedUser.sector_id
        ? cachedSectors.find(s => s.id === cachedUser.sector_id) || null
        : null

      const profile: UserWithProfile = {
        ...cachedUser,
        store: userStore,
        function_ref: userFunction,
        sector: userSector,
      }

      // Cria um user fake para manter compatibilidade
      const fakeUser = {
        id: cachedAuth.userId,
        email: cachedAuth.email,
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '',
      } as User

      setUser(fakeUser)
      setUserProfile(profile)
      setLoading(false)

      console.log('[useAuth] Loaded from cache (offline mode)')
      return true
    } catch (error) {
      console.error('[useAuth] Error loading from cache:', error)
      return false
    }
  }, [])

  // Cacheia dados do usuario para uso offline
  const cacheUserData = useCallback(async (session: Session, profile: UserWithProfile) => {
    try {
      // Salva auth
      await saveAuthCache({
        userId: session.user.id,
        email: session.user.email || '',
        accessToken: session.access_token,
        refreshToken: session.refresh_token || '',
        expiresAt: session.expires_at || 0,
      })

      // Salva user profile
      await saveUserCache(profile)

      // Salva store do usuario
      if (profile.store) {
        await saveStoresCache([profile.store])
      }

      // Busca e cacheia dados adicionais baseados na loja do usuario
      const storeId = profile.store_id

      if (storeId) {
        // Setores da loja
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sectors } = await (supabase as any)
          .from('sectors')
          .select('*')
          .eq('store_id', storeId)

        if (sectors) {
          await saveSectorsCache(sectors)
        }

        // Templates visiveis na loja
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: visibility } = await (supabase as any)
          .from('template_visibility')
          .select('*')
          .eq('store_id', storeId)

        if (visibility) {
          // Salva visibilidade completa para uso offline
          await saveTemplateVisibilityCache(visibility as TemplateVisibility[])

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

            // Campos dos templates
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

      console.log('[useAuth] User data cached for offline use')
    } catch (error) {
      console.error('[useAuth] Error caching user data:', error)
    }
  }, [supabase])

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Tenta buscar sessao online
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          setSession(session)
          setUser(session.user)

          const profile = await fetchUserProfile(session.user.id)
          if (profile) {
            setUserProfile(profile)
            // Cacheia para uso offline
            await cacheUserData(session, profile)
          }

          setLoading(false)
          return
        }

        // Se nao tem sessao online, tenta cache
        const loadedFromCache = await loadFromCache()
        if (!loadedFromCache) {
          setLoading(false)
        }
      } catch (error) {
        console.error('[useAuth] Init error, trying cache:', error)
        // Em caso de erro (ex: offline), tenta cache
        await loadFromCache()
        setLoading(false)
      }
    }

    initAuth()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id)
        if (profile) {
          setUserProfile(profile)
          await cacheUserData(session, profile)
        }
      } else {
        setUserProfile(null)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth, fetchUserProfile, cacheUserData, loadFromCache])

  const signIn = async (email: string, password: string) => {
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setLoading(false)
      return { error }
    }

    return { data }
  }

  const signOut = async () => {
    setLoading(true)

    // Limpa cache offline
    try {
      await clearAllCache()
      console.log('[useAuth] Offline cache cleared')
    } catch (error) {
      console.error('[useAuth] Error clearing cache:', error)
    }

    const { error } = await supabase.auth.signOut()
    if (error) {
      setLoading(false)
      return { error }
    }

    setUser(null)
    setUserProfile(null)
    setSession(null)
    setLoading(false)
    return { error: null }
  }

  const isAdmin = userProfile?.is_admin ?? false

  const getUserStores = () => {
    if (!userProfile) return []
    if (isAdmin) return [] // Admin has access to all stores
    if (userProfile.store) return [userProfile.store]
    return []
  }

  return {
    user,
    userProfile,
    session,
    loading,
    isAdmin,
    isOffline,
    signIn,
    signOut,
    getUserStores,
    refetchProfile: () => user && fetchUserProfile(user.id),
  }
}
