'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import {
  FiBriefcase,
  FiEdit2,
  FiTrash2,
  FiCheckCircle,
  FiXCircle,
  FiSearch,
  FiPlus,
  FiUsers,
  FiWifiOff,
} from 'react-icons/fi'
import type { FunctionRow } from '@/types/database'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import { getAuthCache, getUserCache, getFunctionsCache } from '@/lib/offlineCache'

type FunctionWithStats = FunctionRow & {
  user_count: number
}

export default function FuncoesPage() {
  const [functions, setFunctions] = useState<FunctionWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [editingFunction, setEditingFunction] = useState<FunctionRow | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#6366f1',
    icon: 'briefcase',
    is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    let userId: string | null = null
    let isAdmin = false

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
      console.log('[Funcoes] Falha ao verificar online, tentando cache...')
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
        console.log('[Funcoes] Falha ao buscar cache')
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

    // Tenta buscar online
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: functionsData, error: functionsError } = await (supabase as any)
        .from('functions')
        .select('*')
        .order('name')

      if (functionsError) throw functionsError

      if (functionsData) {
        const functionsWithStats = await Promise.all(
          functionsData.map(async (fn: FunctionRow) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { count: userCount } = await (supabase as any)
              .from('users')
              .select('id', { count: 'exact', head: true })
              .eq('function_id', fn.id)

            return {
              ...fn,
              user_count: userCount || 0,
            }
          })
        )
        setFunctions(functionsWithStats)
      }

      setIsOffline(false)
    } catch (err) {
      console.error('[Funcoes] Erro ao buscar online:', err)

      // Fallback para cache offline
      try {
        const cachedFunctions = await getFunctionsCache()
        const functionsWithStats = cachedFunctions.map(fn => ({
          ...fn,
          user_count: 0,
        })) as FunctionWithStats[]
        setFunctions(functionsWithStats)
        setIsOffline(true)
      } catch (cacheErr) {
        console.error('[Funcoes] Erro ao buscar cache:', cacheErr)
      }
    }

    setLoading(false)
  }

  const openModal = (fn?: FunctionRow) => {
    if (fn) {
      setEditingFunction(fn)
      setFormData({
        name: fn.name,
        description: fn.description || '',
        color: fn.color,
        icon: fn.icon,
        is_active: fn.is_active,
      })
    } else {
      setEditingFunction(null)
      setFormData({
        name: '',
        description: '',
        color: '#6366f1',
        icon: 'briefcase',
        is_active: true,
      })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingFunction(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return

    setSaving(true)

    try {
      if (editingFunction) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('functions')
          .update({
            name: formData.name,
            description: formData.description || null,
            color: formData.color,
            icon: formData.icon,
            is_active: formData.is_active,
          })
          .eq('id', editingFunction.id)

        if (error) throw error
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('functions')
          .insert({
            name: formData.name,
            description: formData.description || null,
            color: formData.color,
            icon: formData.icon,
            is_active: formData.is_active,
          })

        if (error) throw error
      }

      closeModal()
      fetchData()
    } catch (error) {
      console.error('Error saving function:', error)
      alert('Erro ao salvar funcao')
    }

    setSaving(false)
  }

  const toggleFunctionStatus = async (fn: FunctionRow) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('functions')
      .update({ is_active: !fn.is_active })
      .eq('id', fn.id)

    if (error) {
      console.error('Error updating function:', error)
      return
    }

    fetchData()
  }

  const deleteFunction = async (fn: FunctionRow) => {
    if (!confirm(`Tem certeza que deseja excluir a funcao "${fn.name}"?`)) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('functions')
      .delete()
      .eq('id', fn.id)

    if (error) {
      console.error('Error deleting function:', error)
      alert('Erro ao excluir funcao. Verifique se nao existem usuarios vinculados.')
      return
    }

    fetchData()
  }

  const filteredFunctions = useMemo(() => {
    return functions.filter(fn =>
      fn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (fn.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [functions, searchTerm])

  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        variant="page"
        title="Funcoes"
        icon={FiBriefcase}
        backHref={APP_CONFIG.routes.admin}
        actions={isOffline ? [] : [
          {
            label: 'Nova Funcao',
            onClick: () => openModal(),
            icon: FiPlus,
            variant: 'primary',
          },
        ]}
      />

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

        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="Buscar funcao..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>
        </div>

        {/* Functions List */}
        <div className="card overflow-hidden">
          {filteredFunctions.length === 0 ? (
            <div className="p-12 text-center text-muted">
              {searchTerm ? 'Nenhuma funcao encontrada' : 'Nenhuma funcao cadastrada'}
            </div>
          ) : (
            <div className="divide-y divide-subtle">
              {filteredFunctions.map(fn => (
                <div key={fn.id} className="p-4 hover:bg-surface-hover/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: fn.color + '20' }}
                      >
                        <FiBriefcase className="w-5 h-5" style={{ color: fn.color }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-main">{fn.name}</h4>
                          {!fn.is_active && (
                            <span className="badge-secondary text-xs bg-error/20 text-error">
                              Inativo
                            </span>
                          )}
                        </div>
                        {fn.description && (
                          <p className="text-sm text-muted">{fn.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Stats */}
                      <div className="hidden sm:flex items-center gap-1 text-sm text-muted">
                        <FiUsers className="w-4 h-4" />
                        <span>{fn.user_count} usuarios</span>
                      </div>

                      {/* Actions */}
                      {!isOffline && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openModal(fn)}
                            className="p-2 text-secondary hover:bg-surface-hover rounded-lg transition-colors"
                            title="Editar"
                          >
                            <FiEdit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleFunctionStatus(fn)}
                            className={`p-2 rounded-lg transition-colors ${
                              fn.is_active
                                ? 'text-warning hover:bg-warning/20'
                                : 'text-success hover:bg-success/20'
                            }`}
                            title={fn.is_active ? 'Desativar' : 'Ativar'}
                          >
                            {fn.is_active ? <FiXCircle className="w-4 h-4" /> : <FiCheckCircle className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => deleteFunction(fn)}
                            className="p-2 text-error hover:bg-error/20 rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="mt-6 flex items-center justify-between text-sm text-muted">
          <p>Total: {functions.length} funcoes</p>
          <p>
            {functions.filter(f => f.is_active).length} ativas, {functions.filter(f => !f.is_active).length} inativas
          </p>
        </div>
      </main>

      {/* Function Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-md mx-4 p-6">
            <h2 className="text-xl font-bold text-main mb-6">
              {editingFunction ? 'Editar Funcao' : 'Nova Funcao'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  placeholder="Ex: Cozinheiro, Zelador, Garcom"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Descricao
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  placeholder="Descricao opcional..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Cor
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-12 h-10 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="input flex-1"
                    placeholder="#6366f1"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-5 h-5 rounded border-default bg-surface text-primary"
                  />
                  <span className="text-sm text-secondary">Funcao ativa</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn-secondary flex-1"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
