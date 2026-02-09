'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { FiSave, FiUserPlus, FiCheckCircle, FiMail } from 'react-icons/fi'
import type { Store, Sector, FunctionRow } from '@/types/database'
import { APP_CONFIG } from '@/lib/config'
import { Header } from '@/components/ui'

export default function NovoUsuarioPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [functions, setFunctions] = useState<FunctionRow[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [createdEmail, setCreatedEmail] = useState('')
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  // Form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const [storeId, setStoreId] = useState<number | null>(null)
  const [functionId, setFunctionId] = useState<number | null>(null)
  const [sectorId, setSectorId] = useState<number | null>(null)

  useEffect(() => {
    const fetchData = async () => {
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
    }

    fetchData()
  }, [supabase])

  // Filter sectors by selected store
  const filteredSectors = useMemo(() => {
    if (!storeId) return []
    return sectors.filter(s => s.store_id === storeId)
  }, [sectors, storeId])

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
    setLoading(true)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          phone: phone || undefined,
          isAdmin,
          isManager: isAdmin ? false : isManager,
          storeId: isAdmin ? undefined : (storeId || undefined),
          functionId: isAdmin ? undefined : (functionId || undefined),
          sectorId: isAdmin ? undefined : (sectorId || undefined),
          redirectTo: `${window.location.origin}/auth/callback`,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar usuario')
      }

      setCreatedEmail(email)
      setNeedsConfirmation(data.needsConfirmation ?? true)
      setSuccess(true)
      setLoading(false)
    } catch (err) {
      console.error('Error creating user:', err)
      setError(err instanceof Error ? err.message : 'Erro ao criar usuario')
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSuccess(false)
    setEmail('')
    setPassword('')
    setFullName('')
    setPhone('')
    setIsAdmin(false)
    setIsManager(false)
    setStoreId(null)
    setFunctionId(null)
    setSectorId(null)
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        variant="page"
        title="Novo Usuario"
        icon={FiUserPlus}
        backHref={APP_CONFIG.routes.adminUsers}
        maxWidth="3xl"
      />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Success screen */}
        {success && (
          <div className="card p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
              <FiCheckCircle className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-xl font-bold text-main mb-2">Usuario criado com sucesso!</h2>
            <p className="text-muted mb-4">{createdEmail}</p>

            {needsConfirmation && (
              <div className="p-4 bg-warning/10 border border-warning/30 rounded-xl mb-6">
                <div className="flex items-center justify-center gap-2 text-warning mb-2">
                  <FiMail className="w-5 h-5" />
                  <span className="font-medium">Confirmacao de email necessaria</span>
                </div>
                <p className="text-sm text-muted">
                  Um email de confirmacao foi enviado para <strong className="text-main">{createdEmail}</strong>.
                  O usuario precisa clicar no link do email para ativar a conta antes de fazer login.
                </p>
              </div>
            )}

            <div className="flex items-center justify-center gap-4">
              <button onClick={resetForm} className="btn-secondary">
                Criar Outro
              </button>
              <Link href={APP_CONFIG.routes.adminUsers} className="btn-primary">
                Voltar para Lista
              </Link>
            </div>
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} className="space-y-6">
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
                    placeholder="Joao da Silva"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="input"
                    placeholder="joao@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    Senha *
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="input"
                    placeholder="Minimo 6 caracteres"
                  />
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
                    placeholder="(81) 99999-9999"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="isAdmin"
                    checked={isAdmin}
                    onChange={(e) => setIsAdmin(e.target.checked)}
                    className="w-5 h-5 rounded border-subtle bg-page text-primary focus:ring-primary"
                  />
                  <label htmlFor="isAdmin" className="text-secondary">
                    Este usuario e <span className="text-amber-400 font-medium">Administrador</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Assignment */}
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

            {/* Error */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-4">
              <Link
                href={APP_CONFIG.routes.adminUsers}
                className="btn-secondary"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <FiSave className="w-4 h-4" />
                    Criar Usuario
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
