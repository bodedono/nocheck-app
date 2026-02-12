'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import {
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiAlertTriangle,
  FiFilter,
  FiRefreshCw,
  FiLink,
  FiInfo,
  FiTrash2,
  FiMessageSquare,
  FiWifiOff,
} from 'react-icons/fi'
import type { Store } from '@/types/database'
import { getAuthCache, getUserCache, getStoresCache } from '@/lib/offlineCache'

type CrossValidation = {
  id: number
  store_id: number
  numero_nota: string
  estoquista_checklist_id: number | null
  aprendiz_checklist_id: number | null
  valor_estoquista: number | null
  valor_aprendiz: number | null
  diferenca: number | null
  status: 'pendente' | 'sucesso' | 'falhou' | 'notas_diferentes' | 'expirado'
  validated_at: string | null
  created_at: string
  store: Store
  sector_id: number | null
  sector?: { name: string } | null
  linked_validation_id: number | null
  match_reason: string | null
  is_primary: boolean
  estoquista_checklist?: {
    id: number
    created_by: string
    created_at: string
    user: { full_name: string }
  }
  aprendiz_checklist?: {
    id: number
    created_by: string
    created_at: string
    user: { full_name: string }
  }
}

type GroupedValidation = {
  primary: CrossValidation
  linked: CrossValidation | null
}

export default function ValidacoesPage() {
  const [validations, setValidations] = useState<CrossValidation[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterStore, setFilterStore] = useState<number | null>(null)
  const [filterSector, setFilterSector] = useState<number | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [sectors, setSectors] = useState<{ id: number; name: string; store_id: number }[]>([])
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [expirationMinutes, setExpirationMinutes] = useState<number>(60)
  const [savingExpiration, setSavingExpiration] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const handleExpirationChange = async (minutes: number) => {
    setExpirationMinutes(minutes)
    setSavingExpiration(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ key: 'validation_expiration_minutes', value: String(minutes) }),
      })
    } catch (err) {
      console.error('[Validacoes] Erro ao salvar configuracao:', err)
    }
    setSavingExpiration(false)
  }

  const formatExpirationLabel = (mins: number): string => {
    if (mins < 60) return `${mins} min`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h${m}min` : `${h}h`
  }

  const handleDelete = async (validationId: number, linkedId?: number | null) => {
    if (!confirm('Tem certeza que deseja excluir esta validação?')) return

    setDeleting(validationId)
    try {
      // Delete linked validation first if exists
      if (linkedId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('cross_validations')
          .delete()
          .eq('id', linkedId)
      }

      // Delete main validation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('cross_validations')
        .delete()
        .eq('id', validationId)

      if (error) throw error

      // Remove from local state
      setValidations(prev => prev.filter(v => v.id !== validationId && v.id !== linkedId))
    } catch (err) {
      console.error('Error deleting validation:', err)
      alert('Erro ao excluir validação')
    }
    setDeleting(null)
  }

  const sendTeamsSummary = async () => {
    setExporting(true)
    setExportMessage(null)
    try {
      const response = await fetch('/api/integrations/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheets: false, teams: true, days: 7 }),
      })
      const data = await response.json()
      if (data.success) {
        setExportMessage({ type: 'success', text: 'Resumo enviado para o Microsoft Teams!' })
      } else {
        throw new Error(data.error)
      }
    } catch (err) {
      setExportMessage({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao enviar' })
    }
    setExporting(false)
  }

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
        isAdmin = profile?.is_admin || false
      }
    } catch {
      console.log('[Validacoes] Falha ao verificar online, tentando cache...')
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
        console.log('[Validacoes] Falha ao buscar cache')
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

    // Tenta buscar dados online
    try {
      // Fetch stores
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: storesData, error: storesError } = await (supabase as any)
        .from('stores')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (storesError) throw storesError
      if (storesData) setStores(storesData)

      // Fetch sectors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sectorsData } = await (supabase as any)
        .from('sectors')
        .select('id, name, store_id')
        .eq('is_active', true)
        .order('name')

      if (sectorsData) setSectors(sectorsData)

      // Fetch expiration setting
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: settingData } = await (supabase as any)
        .from('app_settings')
        .select('value')
        .eq('key', 'validation_expiration_minutes')
        .single()

      if (settingData?.value) {
        const mins = parseInt(settingData.value, 10)
        if (!isNaN(mins) && mins > 0) setExpirationMinutes(mins)
      }

      // Fetch validations with related data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: validationsData, error } = await (supabase as any)
        .from('cross_validations')
        .select(`
          *,
          store:stores(*),
          sector:sectors(name)
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      if (validationsData) setValidations(validationsData)
      setIsOffline(false)
    } catch (err) {
      console.error('[Validacoes] Erro ao buscar online:', err)

      // Fallback para cache offline (apenas lojas)
      try {
        const cachedStores = await getStoresCache()
        setStores(cachedStores.filter(s => s.is_active))
        setValidations([])
        setIsOffline(true)
        console.log('[Validacoes] Carregado do cache offline')
      } catch (cacheErr) {
        console.error('[Validacoes] Erro ao buscar cache:', cacheErr)
      }
    }

    setLoading(false)
  }

  // Agrupar validações vinculadas
  const groupValidations = (validations: CrossValidation[]): GroupedValidation[] => {
    const grouped: GroupedValidation[] = []
    const processedIds = new Set<number>()

    for (const validation of validations) {
      if (processedIds.has(validation.id)) continue

      // Se é uma validação primária com link
      if (validation.is_primary && validation.linked_validation_id) {
        const linked = validations.find(v => v.id === validation.linked_validation_id)
        grouped.push({
          primary: validation,
          linked: linked || null,
        })
        processedIds.add(validation.id)
        if (linked) processedIds.add(linked.id)
      }
      // Se é uma validação secundária (não primária)
      else if (!validation.is_primary && validation.linked_validation_id) {
        // Procurar a primária
        const primary = validations.find(v => v.id === validation.linked_validation_id)
        if (primary && !processedIds.has(primary.id)) {
          grouped.push({
            primary: primary,
            linked: validation,
          })
          processedIds.add(primary.id)
          processedIds.add(validation.id)
        }
      }
      // Validação sem vínculo
      else {
        grouped.push({
          primary: validation,
          linked: null,
        })
        processedIds.add(validation.id)
      }
    }

    return grouped
  }

  const filteredValidations = validations.filter(v => {
    if (filterStatus && v.status !== filterStatus) return false
    if (filterStore && v.store_id !== filterStore) return false
    if (filterSector && v.sector_id !== filterSector) return false
    return true
  })

  const groupedValidations = groupValidations(filteredValidations)

  const stats = {
    total: validations.length,
    pendente: validations.filter(v => v.status === 'pendente').length,
    sucesso: validations.filter(v => v.status === 'sucesso').length,
    falhou: validations.filter(v => v.status === 'falhou').length,
    notas_diferentes: validations.filter(v => v.status === 'notas_diferentes' && v.is_primary).length,
    expirado: validations.filter(v => v.status === 'expirado').length,
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
      pendente: {
        label: 'Pendente',
        class: 'bg-warning/20 text-warning',
        icon: <FiClock className="w-4 h-4" />,
      },
      sucesso: {
        label: 'OK',
        class: 'bg-success/20 text-success',
        icon: <FiCheckCircle className="w-4 h-4" />,
      },
      falhou: {
        label: 'Divergência',
        class: 'bg-error/20 text-error',
        icon: <FiXCircle className="w-4 h-4" />,
      },
      notas_diferentes: {
        label: 'Notas Diferentes',
        class: 'bg-orange-500/20 text-orange-500',
        icon: <FiLink className="w-4 h-4" />,
      },
      expirado: {
        label: 'Expirado',
        class: 'bg-purple-500/20 text-purple-500',
        icon: <FiAlertTriangle className="w-4 h-4" />,
      },
    }
    return badges[status] || badges.pendente
  }

  const formatCurrency = (value: number | null) => {
    if (value === null) return '-'
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        title="Validacoes Cruzadas"
        icon={FiCheckCircle}
        backHref={APP_CONFIG.routes.admin}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Offline Warning */}
        {isOffline && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <FiWifiOff className="w-5 h-5 text-warning" />
            <p className="text-warning text-sm">
              Voce esta offline. Os dados de validacoes nao estao disponiveis no cache local.
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <FiFilter className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{stats.total}</p>
                <p className="text-xs text-muted">Total</p>
              </div>
            </div>
          </div>

          <div className="card p-4 cursor-pointer hover:bg-surface-hover" onClick={() => setFilterStatus(filterStatus === 'pendente' ? null : 'pendente')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <FiClock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{stats.pendente}</p>
                <p className="text-xs text-muted">Pendentes</p>
              </div>
            </div>
          </div>

          <div className="card p-4 cursor-pointer hover:bg-surface-hover" onClick={() => setFilterStatus(filterStatus === 'sucesso' ? null : 'sucesso')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                <FiCheckCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{stats.sucesso}</p>
                <p className="text-xs text-muted">OK</p>
              </div>
            </div>
          </div>

          <div className="card p-4 cursor-pointer hover:bg-surface-hover" onClick={() => setFilterStatus(filterStatus === 'falhou' ? null : 'falhou')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-error/20 flex items-center justify-center">
                <FiXCircle className="w-5 h-5 text-error" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{stats.falhou}</p>
                <p className="text-xs text-muted">Divergencias</p>
              </div>
            </div>
          </div>

          <div className="card p-4 cursor-pointer hover:bg-surface-hover" onClick={() => setFilterStatus(filterStatus === 'notas_diferentes' ? null : 'notas_diferentes')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <FiLink className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{stats.notas_diferentes}</p>
                <p className="text-xs text-muted">Notas Diferentes</p>
              </div>
            </div>
          </div>

          <div className="card p-4 cursor-pointer hover:bg-surface-hover" onClick={() => setFilterStatus(filterStatus === 'expirado' ? null : 'expirado')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <FiAlertTriangle className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-main">{stats.expirado}</p>
                <p className="text-xs text-muted">Expirados</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <select
            value={filterStore || ''}
            onChange={(e) => setFilterStore(e.target.value ? Number(e.target.value) : null)}
            className="input px-4 py-2"
          >
            <option value="">Todas as lojas</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>
                {store.name.split(' ').slice(1).join(' ') || store.name}
              </option>
            ))}
          </select>

          <select
            value={filterSector || ''}
            onChange={(e) => setFilterSector(e.target.value ? Number(e.target.value) : null)}
            className="input px-4 py-2"
          >
            <option value="">Todos os setores</option>
            {sectors
              .filter(s => !filterStore || s.store_id === filterStore)
              .map(sector => (
                <option key={sector.id} value={sector.id}>
                  {sector.name}
                </option>
              ))
            }
          </select>

          <button
            onClick={() => { setFilterStatus(null); setFilterStore(null); setFilterSector(null); }}
            className="btn-ghost flex items-center gap-2"
          >
            <FiRefreshCw className="w-4 h-4" />
            Limpar filtros
          </button>

          {/* Expiration config */}
          <div className="flex items-center gap-2">
            <FiClock className="w-4 h-4 text-muted" />
            <select
              value={expirationMinutes}
              onChange={(e) => handleExpirationChange(Number(e.target.value))}
              disabled={savingExpiration}
              className="input px-3 py-2 text-sm"
              title="Tempo para expirar validacoes pendentes"
            >
              <option value={5}>Expira em 5 min</option>
              <option value={15}>Expira em 15 min</option>
              <option value={30}>Expira em 30 min</option>
              <option value={60}>Expira em 1h</option>
              <option value={120}>Expira em 2h</option>
              <option value={240}>Expira em 4h</option>
              <option value={720}>Expira em 12h</option>
              <option value={1440}>Expira em 24h</option>
            </select>
            {savingExpiration && (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          <div className="flex-1" />

          <button
            onClick={sendTeamsSummary}
            disabled={exporting}
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Enviar resumo para Teams"
          >
            <FiMessageSquare className="w-4 h-4 text-blue-500" />
            Enviar Teams
          </button>
        </div>

        {/* Export Message */}
        {exportMessage && (
          <div className={`p-4 mb-6 rounded-xl ${
            exportMessage.type === 'success' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
          }`}>
            {exportMessage.text}
          </div>
        )}

        {/* Info Box */}
        <div className="card p-4 mb-6 bg-info/10 border-info/30">
          <div className="flex items-start gap-3">
            <FiAlertTriangle className="w-5 h-5 text-info mt-0.5" />
            <div>
              <p className="font-medium text-main">Como funciona a validacao cruzada</p>
              <p className="text-sm text-muted mt-1">
                O sistema compara automaticamente os checklists preenchidos pelo
                <strong className="text-main"> funcionario</strong> e pelo <strong className="text-main">aprendiz</strong> do mesmo setor.
                Quando os valores ou notas divergem, o sistema tenta vincular notas &quot;irmãs&quot; baseado em:
                mesma loja, mesmo setor, horário próximo (até 30 min) e prefixo similar.
                Notas sem par após <strong className="text-purple-500">{formatExpirationLabel(expirationMinutes)}</strong> são marcadas como <strong className="text-purple-500">expiradas</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Validations List */}
        {groupedValidations.length === 0 ? (
          <div className="card p-12 text-center">
            <FiCheckCircle className="w-12 h-12 text-muted mx-auto mb-4" />
            <p className="text-muted">
              {validations.length === 0
                ? 'Nenhuma validacao registrada ainda'
                : 'Nenhuma validacao encontrada com os filtros selecionados'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedValidations.map(({ primary, linked }) => {
              const statusBadge = getStatusBadge(primary.status)
              const isLinked = primary.status === 'notas_diferentes' && linked

              return (
                <div
                  key={primary.id}
                  className={`card overflow-hidden ${
                    primary.status === 'falhou' ? 'border-error/30' :
                    primary.status === 'notas_diferentes' ? 'border-orange-500/30' :
                    primary.status === 'expirado' ? 'border-purple-500/30' : ''
                  }`}
                >
                  {/* Header com status e loja */}
                  <div className="p-4 border-b border-subtle bg-surface-hover/50">
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm font-medium ${statusBadge.class}`}>
                        {statusBadge.icon}
                        {statusBadge.label}
                      </span>
                      <span className="text-sm text-muted">
                        {primary.store.name.split(' ').slice(1).join(' ') || primary.store.name}
                      </span>
                      {primary.sector?.name && (
                        <span className="text-xs px-2 py-0.5 rounded-lg bg-primary/10 text-primary">
                          {primary.sector.name}
                        </span>
                      )}
                      <span className="text-xs text-muted ml-auto">
                        {formatDate(primary.created_at)}
                      </span>
                      <button
                        onClick={() => handleDelete(primary.id, linked?.id)}
                        disabled={deleting === primary.id}
                        className="p-2 text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Excluir validação"
                      >
                        {deleting === primary.id ? (
                          <div className="w-4 h-4 border-2 border-error/30 border-t-error rounded-full animate-spin" />
                        ) : (
                          <FiTrash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    <div>
                      {/* Explicacao do vinculo (apenas para notas diferentes) */}
                      {isLinked && linked && primary.match_reason && (
                        <div className="mb-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                          <div className="flex items-start gap-2">
                            <FiInfo className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-orange-500">Notas vinculadas automaticamente</p>
                              <p className="text-xs text-muted mt-1">{primary.match_reason}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Layout unificado - mesma linha */}
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-lg font-semibold text-main mb-1">
                            Nota: {primary.numero_nota}
                            {isLinked && linked && linked.numero_nota !== primary.numero_nota && (
                              <span className="text-muted"> / {linked.numero_nota}</span>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <p className="text-xs text-muted mb-1">Funcionario</p>
                            <p className="text-lg font-bold text-main">
                              {formatCurrency(primary.valor_estoquista ?? (linked?.valor_estoquista ?? null))}
                            </p>
                          </div>

                          <div className="text-center">
                            <p className="text-xs text-muted mb-1">Aprendiz</p>
                            <p className="text-lg font-bold text-main">
                              {formatCurrency(primary.valor_aprendiz ?? (linked?.valor_aprendiz ?? null))}
                            </p>
                          </div>

                          {primary.diferenca !== null && (
                            <div className="text-center">
                              <p className="text-xs text-muted mb-1">Diferenca</p>
                              <p className={`text-lg font-bold ${
                                primary.diferenca === 0
                                  ? 'text-success'
                                  : 'text-error'
                              }`}>
                                {formatCurrency(primary.diferenca)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer Stats */}
        <div className="mt-6 text-sm text-muted text-center">
          Mostrando {groupedValidations.length} validacoes
        </div>
      </main>
    </div>
  )
}
