'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { FiSave, FiUserCheck } from 'react-icons/fi'
import type { User, Store, Sector, FunctionRow } from '@/types/database'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'

type UserWithAssignment = User & {
  store: Store | null
  function_ref: FunctionRow | null
  sector: Sector | null
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
  const [storeId, setStoreId] = useState<number | null>(null)
  const [functionId, setFunctionId] = useState<number | null>(null)
  const [sectorId, setSectorId] = useState<number | null>(null)

  useEffect(() => {
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const fetchData = async () => {
    if (!userId) return

    // Fetch user with assignments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userData, error: userError } = await (supabase as any)
      .from('users')
      .select(`
        *,
        store:stores!users_store_id_fkey(*),
        function_ref:functions!users_function_id_fkey(*),
        sector:sectors!users_sector_id_fkey(*)
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
    setStoreId(typedUser.store_id || null)
    setFunctionId(typedUser.function_id || null)
    setSectorId(typedUser.sector_id || null)

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

  // Filter sectors by selected store
  const filteredSectors = useMemo(() => {
    if (!storeId) return []
    return sectors.filter(s => s.store_id === storeId)
  }, [sectors, storeId])

  // When store changes, reset sector if it doesn't belong to new store
  const handleStoreChange = (newStoreId: number | null) => {
    setStoreId(newStoreId)
    if (newStoreId && sectorId) {
      const sectorBelongsToStore = sectors.some(s => s.id === sectorId && s.store_id === newStoreId)
      if (!sectorBelongsToStore) {
        setSectorId(null)
      }
    }
    if (!newStoreId) {
      setSectorId(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: profileError } = await (supabase as any)
        .from('users')
        .update({
          full_name: fullName,
          phone: phone || null,
          is_admin: isAdmin,
          is_active: isActive,
          is_manager: isAdmin ? false : isManager,
          store_id: isAdmin ? null : (storeId || null),
          function_id: isAdmin ? null : (functionId || null),
          sector_id: isAdmin ? null : (sectorId || null),
        })
        .eq('id', userId)

      if (profileError) throw profileError

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

          {/* Assignment - Loja, Setor, Funcao */}
          {!isAdmin && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-main mb-4">Atribuicao</h2>
              <p className="text-sm text-muted mb-4">
                Defina a loja, setor e funcao do usuario.
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

                {/* Store */}
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    Loja
                  </label>
                  <select
                    value={storeId || ''}
                    onChange={(e) => handleStoreChange(e.target.value ? Number(e.target.value) : null)}
                    className="input"
                  >
                    <option value="">Selecione a loja</option>
                    {stores.map(store => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sector (filtered by store) */}
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    Setor
                  </label>
                  <select
                    value={sectorId || ''}
                    onChange={(e) => setSectorId(e.target.value ? Number(e.target.value) : null)}
                    className="input"
                    disabled={!storeId}
                  >
                    <option value="">{storeId ? 'Selecione o setor' : 'Selecione uma loja primeiro'}</option>
                    {filteredSectors.map(sector => (
                      <option key={sector.id} value={sector.id}>
                        {sector.name}
                      </option>
                    ))}
                  </select>
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
