'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useAuth, type UserWithProfile } from '@/hooks/useAuth'
import type { User, Session } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  userProfile: UserWithProfile | null
  session: Session | null
  loading: boolean
  isAdmin: boolean
  isManager: boolean
  signIn: (email: string, password: string) => Promise<{ error?: unknown; data?: unknown }>
  signOut: () => Promise<{ error: unknown }>
  getUserStores: () => Array<{ id: number; name: string }>
  refetchProfile: () => Promise<UserWithProfile | null> | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider')
  }
  return context
}
