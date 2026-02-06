'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiUserCheck,
  FiUserX,
  FiSearch,
  FiUsers,
  FiWifiOff,
} from 'react-icons/fi'
import type { User, UserStoreRole, Store } from '@/types/database'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import { getAuthCache, getUserCache, getAllUsersCache, getStoresCache, getUserRolesCache } from '@/lib/offlineCache'

type UserWithRoles = User & {
  roles: (UserStoreRole & { store: Store })[]
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    fetchUsers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUsers = async () => {
    let userId: string | null = null
    let isAdmin = false
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true

    // Tenta verificar acesso online
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        userId = user.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (supabase as any)
          .from('users')
          .select('is_admin')
          .eq('id', user.id)
          .single()
        isAdmin = profile && 'is_admin' in profile ? (profile as { is_admin: boolean }).is_admin : false
      }
    } catch {
      console.log('[Usuarios] Falha ao verificar online, tentando cache...')
    }

    // Fallback para cache se offline
    if (!userId) {
      try {
        const cachedAuth = await getAuthCache()
        if (cachedAuth) {
          userId = cachedAuth.userId
          const cachedUser = await getUserCache(cachedAuth.userId)
          isAdmin = cachedUser?.is_admin || false
        }
      } catch {
        console.log('[Usuarios] Falha ao buscar cache')
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

    // Tenta buscar usuarios online (API sincroniza auth.users com public.users)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) throw new Error('Falha ao buscar usuarios')
      const { users: data, synced } = await res.json()

      if (synced > 0) {
        console.log(`[Usuarios] ${synced} usuario(s) sincronizado(s) do auth`)
      }

      setUsers(data as UserWithRoles[])
      setIsOffline(false)
    } catch (err) {
      console.error('[Usuarios] Erro ao buscar online:', err)

      // Fallback para cache offline
      try {
        const [cachedUsers, cachedStores] = await Promise.all([
          getAllUsersCache(),
          getStoresCache(),
        ])

        // Monta os dados offline
        const usersWithRoles: UserWithRoles[] = []
        for (const user of cachedUsers) {
          const userRoles = await getUserRolesCache(user.id)
          const rolesWithStores = userRoles.map(role => ({
            ...role,
            store: cachedStores.find(s => s.id === role.store_id) || { id: role.store_id, name: 'Loja', is_active: true, created_at: '' },
          }))
          usersWithRoles.push({
            ...user,
            roles: rolesWithStores as (UserStoreRole & { store: Store })[],
          })
        }

        setUsers(usersWithRoles)
        // So mostra offline se realmente nao tem rede
        setIsOffline(!online)
        console.log('[Usuarios] Carregado do cache offline')
      } catch (cacheErr) {
        console.error('[Usuarios] Erro ao buscar cache:', cacheErr)
      }
    }

    setLoading(false)
  }

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('users')
      .update({ is_active: !currentStatus })
      .eq('id', userId)

    if (error) {
      console.error('Error updating user:', error)
      return
    }

    fetchUsers()
  }

  const deleteUser = async (userId: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return

    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir usuario')
      }

      fetchUsers()
    } catch (err) {
      console.error('Error deleting user:', err)
      alert(err instanceof Error ? err.message : 'Erro ao excluir usuário')
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesFilter = filterActive === null || user.is_active === filterActive

    return matchesSearch && matchesFilter
  })

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      estoquista: 'bg-info text-info',
      aprendiz: 'bg-accent/20 text-accent',
      supervisor: 'bg-warning text-warning',
      gerente: 'bg-success text-success',
    }
    return colors[role] || 'bg-surface-hover text-muted'
  }

  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        variant="page"
        title="Usuarios"
        icon={FiUsers}
        backHref={APP_CONFIG.routes.admin}
        actions={isOffline ? [] : [
          {
            label: 'Novo Usuario',
            href: APP_CONFIG.routes.adminUsersNew,
            icon: FiPlus,
            variant: 'primary',
          },
        ]}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Offline Warning */}
        {isOffline && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <FiWifiOff className="w-5 h-5 text-warning" />
            <p className="text-warning text-sm">
              Voce esta offline. Os dados mostrados sao do cache local. Edicoes nao estao disponiveis.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="Buscar por nome ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilterActive(null)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                filterActive === null
                  ? 'btn-primary'
                  : 'btn-secondary'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterActive(true)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                filterActive === true
                  ? 'btn-primary'
                  : 'btn-secondary'
              }`}
            >
              Ativos
            </button>
            <button
              onClick={() => setFilterActive(false)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                filterActive === false
                  ? 'bg-error text-error border border-error'
                  : 'btn-secondary'
              }`}
            >
              Inativos
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-subtle">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-secondary">Usuario</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-secondary">Cargos</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-secondary">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-secondary">Tipo</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-secondary">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted">
                      Nenhum usuario encontrado
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-surface-hover transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-main">{user.full_name}</p>
                          <p className="text-sm text-muted">{user.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.length === 0 ? (
                            <span className="text-sm text-muted">Sem cargos</span>
                          ) : (
                            user.roles.map((role, idx) => (
                              <span
                                key={idx}
                                className={`px-2 py-1 text-xs rounded-lg ${getRoleBadgeColor(role.role)}`}
                                title={role.store.name}
                              >
                                {role.role} ({role.store.name.split(' ').slice(1).join(' ') || role.store.name})
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg ${
                            user.is_active
                              ? 'bg-success text-success'
                              : 'bg-error text-error'
                          }`}
                        >
                          {user.is_active ? (
                            <>
                              <FiUserCheck className="w-3 h-3" /> Ativo
                            </>
                          ) : (
                            <>
                              <FiUserX className="w-3 h-3" /> Inativo
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {user.is_admin ? (
                          <span className="px-2 py-1 text-xs bg-warning text-warning rounded-lg">
                            Admin
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs bg-surface-hover text-muted rounded-lg">
                            Funcionario
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {!isOffline && (
                            <Link
                              href={`${APP_CONFIG.routes.adminUsers}/${user.id}`}
                              className="btn-ghost p-2"
                              title="Editar"
                            >
                              <FiEdit2 className="w-4 h-4" />
                            </Link>
                          )}
                          <button
                            onClick={() => toggleUserStatus(user.id, user.is_active)}
                            className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              user.is_active
                                ? 'text-warning hover:bg-warning/20'
                                : 'text-success hover:bg-success/20'
                            }`}
                            title={user.is_active ? 'Desativar' : 'Ativar'}
                            disabled={isOffline}
                          >
                            {user.is_active ? (
                              <FiUserX className="w-4 h-4" />
                            ) : (
                              <FiUserCheck className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => deleteUser(user.id)}
                            className="p-2 text-error hover:bg-error/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Excluir"
                            disabled={isOffline}
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 flex items-center justify-between text-sm text-muted">
          <p>
            Mostrando {filteredUsers.length} de {users.length} usuarios
          </p>
          <p>
            {users.filter(u => u.is_active).length} ativos, {users.filter(u => !u.is_active).length} inativos
          </p>
        </div>
      </main>
    </div>
  )
}
