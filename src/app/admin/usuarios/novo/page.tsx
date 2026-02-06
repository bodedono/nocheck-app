'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { FiSave, FiPlus, FiX, FiUserPlus, FiCheckCircle, FiMail } from 'react-icons/fi'
import type { Store, UserRole } from '@/types/database'
import { APP_CONFIG } from '@/lib/config'
import { Header } from '@/components/ui'

type RoleAssignment = {
  store_id: number
  role: UserRole
}

export default function NovoUsuarioPage() {
  const [stores, setStores] = useState<Store[]>([])
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
  const [roles, setRoles] = useState<RoleAssignment[]>([])

  // Temp state for adding roles
  const [selectedStore, setSelectedStore] = useState<number>(0)
  const [selectedRole, setSelectedRole] = useState<UserRole>('estoquista')

  useEffect(() => {
    const fetchStores = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('stores')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (data) {
        setStores(data as Store[])
        if (data.length > 0) {
          setSelectedStore((data as Store[])[0].id)
        }
      }
    }

    fetchStores()
  }, [supabase])

  const addRole = () => {
    if (!selectedStore || !selectedRole) return

    // Check if already exists
    const exists = roles.some(
      r => r.store_id === selectedStore && r.role === selectedRole
    )
    if (exists) {
      setError('Este cargo já foi adicionado para esta loja')
      return
    }

    setRoles([...roles, { store_id: selectedStore, role: selectedRole }])
    setError(null)
  }

  const removeRole = (index: number) => {
    setRoles(roles.filter((_, i) => i !== index))
  }

  const getStoreName = (storeId: number) => {
    return stores.find(s => s.id === storeId)?.name || ''
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
          roles: isAdmin ? [] : roles,
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
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário')
      setLoading(false)
    }
  }

  const roleOptions: UserRole[] = ['estoquista', 'aprendiz', 'supervisor', 'gerente']

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      estoquista: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      aprendiz: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      supervisor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      gerente: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    }
    return colors[role] || 'bg-surface text-muted border-subtle'
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

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tela de sucesso */}
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
              <button
                onClick={() => {
                  setSuccess(false)
                  setEmail('')
                  setPassword('')
                  setFullName('')
                  setPhone('')
                  setIsAdmin(false)
                  setRoles([])
                }}
                className="btn-secondary"
              >
                Criar Outro
              </button>
              <Link href={APP_CONFIG.routes.adminUsers} className="btn-primary">
                Voltar para Lista
              </Link>
            </div>
          </div>
        )}

        {!success && <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-main mb-4">Informações Básicas</h2>

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
                  placeholder="João da Silva"
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
                  placeholder="Mínimo 6 caracteres"
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
                  Este usuário é <span className="text-amber-400 font-medium">Administrador</span>
                </label>
              </div>
            </div>
          </div>

          {/* Roles */}
          {!isAdmin && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-main mb-4">Cargos por Loja</h2>

              {/* Add Role */}
              <div className="flex flex-wrap gap-3 mb-4">
                <select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(Number(e.target.value))}
                  className="input flex-1 min-w-[200px]"
                >
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                  className="input capitalize"
                >
                  {roleOptions.map(role => (
                    <option key={role} value={role} className="capitalize">
                      {role}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={addRole}
                  className="btn-primary flex items-center gap-2"
                >
                  <FiPlus className="w-4 h-4" />
                  Adicionar
                </button>
              </div>

              {/* Role List */}
              {roles.length === 0 ? (
                <p className="text-muted text-sm py-4 text-center">
                  Nenhum cargo atribuído. Adicione pelo menos um cargo para o usuário.
                </p>
              ) : (
                <div className="space-y-2">
                  {roles.map((role, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border ${getRoleBadgeColor(role.role)}`}
                    >
                      <div>
                        <span className="font-medium capitalize">{role.role}</span>
                        <span className="text-muted mx-2">em</span>
                        <span>{getStoreName(role.store_id)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRole(index)}
                        className="p-1 hover:bg-surface rounded-lg transition-colors"
                      >
                        <FiX className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
              disabled={loading || (!isAdmin && roles.length === 0)}
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
                  Criar Usuário
                </>
              )}
            </button>
          </div>
        </form>}
      </main>
    </div>
  )
}
