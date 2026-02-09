'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { FiSave, FiUserCheck } from 'react-icons/fi'
import type { User, Store, Sector, FunctionRow, UserStoreWithDetails } from '@/types/database'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'

type UserWithAssignment = User & {
  store: Store | null
  function_ref: FunctionRow | null
  sector: Sector | null
  user_stores?: UserStoreWithDetails[]
}

type StoreAssignment = {
  store_id: number
  sector_id: number | null
  is_primary: boolean
}

export default function EditarUsuarioPage() {
  const params = useParams()
  const userId = params.id as string

  const [user, setUser] = useState<UserWithAssignment | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [functions, setFunctions] = useState<FunctionRow[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Form state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [isManager, setIsManager] = useState(false)
  const [functionId, setFunctionId] = useState<number | null>(null)
  const [storeAssignments, setStoreAssignments] = useState<StoreAssignment[]>([])

  useEffect(() => {
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const fetchData = async () => {
    if (!userId) return

    // Fetch user with assignments + user_stores
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userData, error: userError } = await (supabase as any)
      .from('users')
      .select(`
        *,
        store:stores!users_store_id_fkey(*),
        function_ref:functions!users_function_id_fkey(*),
        sector:sectors!users_sector_id_fkey(*),
        user_stores(
          id,
          store_id,
          sector_id,
          is_primary,
          created_at,
          store:stores(*),
          sector:sectors(*)
        )
      `)
      .eq('id', userId)
      .single()

    if (userError || !userData) {
      console.error('Error fetching user:', userError)
      router.push(APP_CONFIG.routes.adminUsers)
      return
    }

    const typedUser = userData as UserWithAssignment
    setUser(typedUser)
    setFullName(typedUser.full_name)
    setEmail(typedUser.email)
    setPhone(typedUser.phone || '')
    setIsAdmin(typedUser.is_admin)
    setIsActive(typedUser.is_active)
    setIsManager(typedUser.is_manager || false)
    setFunctionId(typedUser.function_id || null)

    // Inicializar storeAssignments de user_stores ou fallback legado
    if (typedUser.user_stores && typedUser.user_stores.length > 0) {
      setStoreAssignments(typedUser.user_stores.map(us => ({
        store_id: us.store_id,
        sector_id: us.sector_id,
        is_primary: us.is_primary,
      })))
    } else if (typedUser.store_id) {
      setStoreAssignments([{
        store_id: typedUser.store_id,
        sector_id: typedUser.sector_id,
        is_primary: true,
      }])
    } else {
      setStoreAssignments([])
    }

    // Fetch stores, functions, sectors in parallel
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const [storesRes, functionsRes, sectorsRes] = await Promise.all([
      (supabase as any).from('stores').select('*').eq('is_active', true).order('name'),
      (supabase as any).from('functions').select('*').eq('is_active', true).order('name'),
      (supabase as any).from('sectors').select('*').eq('is_active', true).order('name'),
    ])
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (storesRes.data) setStores(storesRes.data as Store[])
    if (functionsRes.data) setFunctions(functionsRes.data as FunctionRow[])
    if (sectorsRes.data) setSectors(sectorsRes.data as Sector[])

    setLoading(false)
  }

  // Helpers para multi-loja
  const toggleStore = (storeId: number) => {
    setStoreAssignments(prev => {
      const exists = prev.find(a => a.store_id === storeId)
      if (exists) {
        const filtered = prev.filter(a => a.store_id !== storeId)
        if (exists.is_primary && filtered.length > 0) {
          filtered[0] = { ...filtered[0], is_primary: true }
        }
        return filtered
      } else {
        const newAssignment: StoreAssignment = { store_id: storeId, sector_id: null, is_primary: prev.length === 0 }
        return [...prev, newAssignment]
      }
    })
  }

  const toggleAllStores = () => {
    if (storeAssignments.length === stores.length) {
      setStoreAssignments([])
    } else {
      setStoreAssignments(stores.map((s, i) => ({
        store_id: s.id,
        sector_id: storeAssignments.find(a => a.store_id === s.id)?.sector_id || null,
        is_primary: i === 0,
      })))
    }
  }

  const setSectorForStore = (storeId: number, sectorId: number | null) => {
    setStoreAssignments(prev =>
      prev.map(a => a.store_id === storeId ? { ...a, sector_id: sectorId } : a)
    )
  }

  const setPrimaryStore = (storeId: number) => {
    setStoreAssignments(prev =>
      prev.map(a => ({ ...a, is_primary: a.store_id === storeId }))
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone: phone || null,
          isAdmin,
          isActive,
          isManager: isAdmin ? false : isManager,
          functionId: isAdmin ? null : (functionId || null),
          storeAssignments: isAdmin ? [] : storeAssignments,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao atualizar usuario')
      }

      setSuccess('Usuario atualizado com sucesso!')
      fetchData()
    } catch (err) {
      console.error('Error updating user:', err)
      setError(err instanceof Error ? err.message : 'Erro ao atualizar usuario')
    }

    setSaving(false)
  }

  if (loading) {
    return <LoadingPage />
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        variant="page"
        title="Editar Usuario"
        icon={FiUserCheck}
        backHref={APP_CONFIG.routes.adminUsers}
        maxWidth="3xl"
      />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Success Message */}
          {success && (
            <div className="p-4 bg-success rounded-xl border border-success">
              <p className="text-success text-sm">{success}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-error rounded-xl border border-error">
              <p className="text-error text-sm">{error}</p>
            </div>
          )}

          {/* Basic Info */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-main mb-4">Informacoes Basicas</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="input"
                  placeholder="Nome completo do usuario"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="input opacity-60 cursor-not-allowed"
                />
                <p className="text-xs text-muted mt-1">O email nao pode ser alterado</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Telefone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input"
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-5 h-5 rounded border-default bg-surface text-primary"
                  />
                  <span className="text-sm text-secondary">Usuario ativo</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAdmin}
                    onChange={(e) => setIsAdmin(e.target.checked)}
                    className="w-5 h-5 rounded border-default bg-surface text-primary"
                  />
                  <span className="text-sm text-secondary">Administrador</span>
                </label>
              </div>
            </div>
          </div>

          {/* Assignment - Lojas, Setor, Funcao */}
          {!isAdmin && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-main mb-4">Atribuicao</h2>
              <p className="text-sm text-muted mb-4">
                Selecione as lojas, setores e funcao do usuario.
              </p>

              <div className="space-y-4">
                {/* Is Manager */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isManager}
                      onChange={(e) => setIsManager(e.target.checked)}
                      className="w-5 h-5 rounded border-default bg-surface text-primary"
                    />
                    <span className="text-sm text-secondary">
                      Gerente <span className="text-muted">(ve todos os checklists da loja, nao preenche)</span>
                    </span>
                  </label>
                </div>

                {/* Lojas (multi-select) */}
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    Lojas
                  </label>
                  <div className="space-y-2 max-h-64 overflow-y-auto border border-subtle rounded-xl p-3">
                    <button
                      type="button"
                      onClick={toggleAllStores}
                      className="text-xs text-primary hover:underline mb-1"
                    >
                      {storeAssignments.length === stores.length ? 'Desmarcar todas' : 'Selecionar todas'}
                    </button>
                    {stores.map(store => {
                      const assignment = storeAssignments.find(a => a.store_id === store.id)
                      const isSelected = !!assignment
                      const storeSectors = sectors.filter(s => s.store_id === store.id)

                      return (
                        <div key={store.id} className={`rounded-lg p-2 transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-surface-hover'}`}>
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleStore(store.id)}
                              className="w-5 h-5 rounded border-default bg-surface text-primary flex-shrink-0"
                            />
                            <span className="text-sm text-main flex-1">{store.name}</span>
                            {isSelected && storeAssignments.length > 1 && (
                              <label className="flex items-center gap-1 cursor-pointer flex-shrink-0">
                                <input
                                  type="radio"
                                  name="primaryStore"
                                  checked={assignment.is_primary}
                                  onChange={() => setPrimaryStore(store.id)}
                                  className="w-4 h-4 text-primary"
                                />
                                <span className="text-xs text-muted">Principal</span>
                              </label>
                            )}
                          </div>
                          {isSelected && storeSectors.length > 0 && (
                            <div className="mt-2 ml-8">
                              <select
                                value={assignment.sector_id || ''}
                                onChange={(e) => setSectorForStore(store.id, e.target.value ? Number(e.target.value) : null)}
                                className="input text-sm py-1"
                              >
                                <option value="">Setor (opcional)</option>
                                {storeSectors.map(sector => (
                                  <option key={sector.id} value={sector.id}>
                                    {sector.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {storeAssignments.length > 0 && (
                    <p className="text-xs text-muted mt-1">
                      {storeAssignments.length} {storeAssignments.length === 1 ? 'loja selecionada' : 'lojas selecionadas'}
                    </p>
                  )}
                </div>

                {/* Function */}
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    Funcao
                  </label>
                  <select
                    value={functionId || ''}
                    onChange={(e) => setFunctionId(e.target.value ? Number(e.target.value) : null)}
                    className="input"
                  >
                    <option value="">Selecione a funcao</option>
                    {functions.map(fn => (
                      <option key={fn.id} value={fn.id}>
                        {fn.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Link
              href={APP_CONFIG.routes.adminUsers}
              className="btn-secondary flex-1 py-3 text-center"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 py-3 flex items-center justify-center gap-2"
            >
              {saving ? (
                'Salvando...'
              ) : (
                <>
                  <FiSave className="w-4 h-4" />
                  Salvar Alteracoes
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
