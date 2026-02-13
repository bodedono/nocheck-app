'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import {
  FiPlay,
  FiCheckCircle,
  FiXCircle,
  FiMessageSquare,
  FiPaperclip,
  FiSend,
  FiCalendar,
  FiUser,
  FiMapPin,
  FiAlertTriangle,
  FiAlertCircle,
  FiExternalLink,
  FiClock,
  FiArrowRight,
  FiRefreshCw,
  FiFileText,
  FiUpload,
  FiLink,
  FiInfo,
} from 'react-icons/fi'
import type { ActionPlanStatus, Severity } from '@/types/database'

// ============================================
// TYPES
// ============================================

type PlanDetail = {
  id: number
  checklist_id: number | null
  field_id: number | null
  template_id: number | null
  store_id: number
  sector_id: number | null
  title: string
  description: string | null
  severity: Severity
  status: ActionPlanStatus
  assigned_to: string
  assigned_by: string | null
  deadline: string
  started_at: string | null
  completed_at: string | null
  is_reincidencia: boolean
  reincidencia_count: number
  parent_action_plan_id: number | null
  non_conformity_value: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  store: { name: string } | null
  sector: { name: string } | null
  assigned_user: { full_name: string; email: string } | null
  assigned_by_user: { full_name: string } | null
  template: { name: string } | null
  field: { name: string } | null
}

type PlanUpdate = {
  id: number
  action_plan_id: number
  user_id: string
  update_type: 'comment' | 'status_change' | 'evidence' | 'reassign'
  content: string | null
  old_status: string | null
  new_status: string | null
  created_at: string
  user: { full_name: string } | null
}

// ============================================
// HELPERS
// ============================================

const STATUS_CONFIG: Record<ActionPlanStatus, { label: string; color: string; bgColor: string }> = {
  aberto: { label: 'Aberto', color: 'text-blue-400', bgColor: 'bg-blue-500/20 text-blue-400' },
  em_andamento: { label: 'Em Andamento', color: 'text-warning', bgColor: 'bg-warning/20 text-warning' },
  concluido: { label: 'Concluido', color: 'text-success', bgColor: 'bg-success/20 text-success' },
  vencido: { label: 'Vencido', color: 'text-error', bgColor: 'bg-error/20 text-error' },
  cancelado: { label: 'Cancelado', color: 'text-muted', bgColor: 'bg-surface-hover text-muted' },
}

const SEVERITY_CONFIG: Record<Severity, { label: string; bgColor: string }> = {
  baixa: { label: 'Baixa', bgColor: 'bg-blue-500/20 text-blue-400' },
  media: { label: 'Media', bgColor: 'bg-warning/20 text-warning' },
  alta: { label: 'Alta', bgColor: 'bg-orange-500/20 text-orange-400' },
  critica: { label: 'Critica', bgColor: 'bg-error/20 text-error' },
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(dateString: string) {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function isOverdue(deadline: string): boolean {
  return new Date(deadline) < new Date()
}

function getUpdateIcon(type: string) {
  switch (type) {
    case 'comment':
      return FiMessageSquare
    case 'status_change':
      return FiRefreshCw
    case 'evidence':
      return FiPaperclip
    case 'reassign':
      return FiUser
    default:
      return FiInfo
  }
}

function getStatusLabel(status: string): string {
  return STATUS_CONFIG[status as ActionPlanStatus]?.label || status
}

// ============================================
// COMPONENT
// ============================================

export const runtime = 'edge'

export default function ActionPlanDetailPage() {
  const [plan, setPlan] = useState<PlanDetail | null>(null)
  const [updates, setUpdates] = useState<PlanUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [statusChanging, setStatusChanging] = useState(false)
  const [comment, setComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [uploadingEvidence, setUploadingEvidence] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const params = useParams()
  const planId = params.id as string
  const supabase = useMemo(() => createClient(), [])

  // ============================================
  // FETCH DATA
  // ============================================

  const fetchPlan = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: fetchError } = await (supabase as any)
      .from('action_plans')
      .select(`
        *,
        store:stores(name),
        sector:sectors(name),
        assigned_user:users!action_plans_assigned_to_fkey(full_name, email),
        assigned_by_user:users!action_plans_assigned_by_fkey(full_name),
        template:checklist_templates(name),
        field:template_fields(name)
      `)
      .eq('id', planId)
      .single()

    if (fetchError) {
      console.error('[ActionPlan] Erro ao buscar plano:', fetchError)
      setError('Plano de acao nao encontrado.')
      return null
    }

    return data as PlanDetail
  }, [supabase, planId])

  const fetchUpdates = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: fetchError } = await (supabase as any)
      .from('action_plan_updates')
      .select(`*, user:users(full_name)`)
      .eq('action_plan_id', planId)
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error('[ActionPlan] Erro ao buscar atualizacoes:', fetchError)
      return []
    }

    return (data || []) as PlanUpdate[]
  }, [supabase, planId])

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase nao configurado.')
      setLoading(false)
      return
    }

    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push(APP_CONFIG.routes.login)
      return
    }
    setCurrentUserId(user.id)

    // Verify admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      router.push(APP_CONFIG.routes.dashboard)
      return
    }

    const [planData, updatesData] = await Promise.all([fetchPlan(), fetchUpdates()])

    if (planData) setPlan(planData)
    if (updatesData) setUpdates(updatesData)
    setLoading(false)
  }, [supabase, router, fetchPlan, fetchUpdates])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  // ============================================
  // STATUS CHANGE
  // ============================================

  const handleStatusChange = async (newStatus: ActionPlanStatus) => {
    if (!plan || !currentUserId) return

    const confirmMsg = newStatus === 'cancelado'
      ? 'Tem certeza que deseja cancelar este plano de acao?'
      : newStatus === 'em_andamento'
        ? 'Deseja iniciar este plano de acao?'
        : 'Deseja marcar este plano de acao como concluido?'

    if (!confirm(confirmMsg)) return

    setStatusChanging(true)
    setError(null)

    try {
      const oldStatus = plan.status

      // Update action_plans status
      const updatePayload: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() }
      if (newStatus === 'em_andamento') {
        updatePayload.started_at = new Date().toISOString()
      } else if (newStatus === 'concluido') {
        updatePayload.completed_at = new Date().toISOString()
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('action_plans')
        .update(updatePayload)
        .eq('id', plan.id)

      if (updateError) throw updateError

      // Create status_change update
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any)
        .from('action_plan_updates')
        .insert({
          action_plan_id: plan.id,
          user_id: currentUserId,
          update_type: 'status_change',
          content: `Status alterado de ${getStatusLabel(oldStatus)} para ${getStatusLabel(newStatus)}`,
          old_status: oldStatus,
          new_status: newStatus,
        })

      if (insertError) throw insertError

      // Refresh data
      const [planData, updatesData] = await Promise.all([fetchPlan(), fetchUpdates()])
      if (planData) setPlan(planData)
      if (updatesData) setUpdates(updatesData)
    } catch (err) {
      console.error('[ActionPlan] Erro ao alterar status:', err)
      setError('Erro ao alterar status do plano.')
    } finally {
      setStatusChanging(false)
    }
  }

  // ============================================
  // ADD COMMENT
  // ============================================

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim() || !plan || !currentUserId) return

    setSubmittingComment(true)
    setError(null)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any)
        .from('action_plan_updates')
        .insert({
          action_plan_id: plan.id,
          user_id: currentUserId,
          update_type: 'comment',
          content: comment.trim(),
        })

      if (insertError) throw insertError

      setComment('')
      const updatesData = await fetchUpdates()
      if (updatesData) setUpdates(updatesData)
    } catch (err) {
      console.error('[ActionPlan] Erro ao adicionar comentario:', err)
      setError('Erro ao adicionar comentario.')
    } finally {
      setSubmittingComment(false)
    }
  }

  // ============================================
  // UPLOAD EVIDENCE
  // ============================================

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !plan || !currentUserId) return

    setUploadingEvidence(true)
    setError(null)

    try {
      // Read file as base64
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // Upload via API
      const timestamp = Date.now()
      const ext = file.name.split('.').pop() || 'jpg'
      const fileName = `evidence_${plan.id}_${timestamp}.${ext}`

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          fileName,
          folder: 'action-plans',
        }),
      })

      const uploadData = await uploadRes.json()

      if (!uploadData.success) {
        throw new Error(uploadData.error || 'Erro no upload')
      }

      // Create update record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updateRecord, error: updateInsertError } = await (supabase as any)
        .from('action_plan_updates')
        .insert({
          action_plan_id: plan.id,
          user_id: currentUserId,
          update_type: 'evidence',
          content: `Evidencia anexada: ${file.name}`,
        })
        .select('id')
        .single()

      if (updateInsertError) throw updateInsertError

      // Create evidence record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: evidenceError } = await (supabase as any)
        .from('action_plan_evidence')
        .insert({
          action_plan_id: plan.id,
          update_id: updateRecord?.id || null,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          storage_path: uploadData.path,
          storage_url: uploadData.url,
          uploaded_by: currentUserId,
        })

      if (evidenceError) throw evidenceError

      // Refresh updates
      const updatesData = await fetchUpdates()
      if (updatesData) setUpdates(updatesData)
    } catch (err) {
      console.error('[ActionPlan] Erro ao enviar evidencia:', err)
      setError('Erro ao enviar evidencia.')
    } finally {
      setUploadingEvidence(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return <LoadingPage />
  }

  if (error && !plan) {
    return (
      <div className="min-h-screen bg-page">
        <Header title="Plano de Acao" backHref="/admin/planos-de-acao" />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="card p-8 text-center">
            <FiAlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
            <p className="text-error text-lg font-medium">{error}</p>
            <Link
              href="/admin/planos-de-acao"
              className="btn-primary mt-4 inline-block"
            >
              Voltar para Planos de Acao
            </Link>
          </div>
        </main>
      </div>
    )
  }

  if (!plan) return null

  const deadlineOverdue = isOverdue(plan.deadline) && plan.status !== 'concluido' && plan.status !== 'cancelado'
  const statusConfig = STATUS_CONFIG[plan.status] || STATUS_CONFIG.aberto
  const severityConfig = SEVERITY_CONFIG[plan.severity] || SEVERITY_CONFIG.baixa

  return (
    <div className="min-h-screen bg-page">
      <Header title="Plano de Acao" backHref="/admin/planos-de-acao" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Error alert */}
        {error && (
          <div className="p-4 bg-error/10 rounded-xl border border-error/30 flex items-center gap-3">
            <FiAlertCircle className="w-5 h-5 text-error flex-shrink-0" />
            <p className="text-error text-sm">{error}</p>
          </div>
        )}

        {/* ============================================ */}
        {/* 1. INFO CARD */}
        {/* ============================================ */}
        <div className="card p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold text-main">{plan.title}</h2>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold ${statusConfig.bgColor}`}>
                {statusConfig.label}
              </span>
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold ${severityConfig.bgColor}`}>
                {severityConfig.label}
              </span>
            </div>
          </div>

          {plan.description && (
            <p className="text-secondary text-sm mb-4">{plan.description}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <FiCalendar className={`w-4 h-4 flex-shrink-0 ${deadlineOverdue ? 'text-error' : 'text-muted'}`} />
              <span className="text-muted">Prazo:</span>
              <span className={`font-medium ${deadlineOverdue ? 'text-error' : 'text-main'}`}>
                {formatDateShort(plan.deadline)}
                {deadlineOverdue && ' (Vencido!)'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FiClock className="w-4 h-4 text-muted flex-shrink-0" />
              <span className="text-muted">Criado em:</span>
              <span className="text-main font-medium">{formatDate(plan.created_at)}</span>
            </div>
          </div>
        </div>

        {/* ============================================ */}
        {/* 2. ORIGIN SECTION (auto-generated) */}
        {/* ============================================ */}
        {plan.checklist_id && (
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
              <FiLink className="w-4 h-4" />
              Origem (Nao Conformidade)
            </h3>
            <div className="space-y-3 text-sm">
              {plan.template?.name && (
                <div className="flex items-start gap-2">
                  <span className="text-muted min-w-[100px]">Template:</span>
                  <span className="text-main font-medium">{plan.template.name}</span>
                </div>
              )}
              {plan.field?.name && (
                <div className="flex items-start gap-2">
                  <span className="text-muted min-w-[100px]">Campo:</span>
                  <span className="text-main font-medium">{plan.field.name}</span>
                </div>
              )}
              {plan.non_conformity_value && (
                <div className="flex items-start gap-2">
                  <span className="text-muted min-w-[100px]">Valor NC:</span>
                  <span className="text-error font-semibold">{plan.non_conformity_value}</span>
                </div>
              )}
              <div className="pt-2">
                <Link
                  href={`/checklist/${plan.checklist_id}`}
                  className="inline-flex items-center gap-2 text-primary hover:underline text-sm font-medium"
                >
                  <FiExternalLink className="w-4 h-4" />
                  Ver Checklist de Origem
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 3. REINCIDENCE SECTION */}
        {/* ============================================ */}
        {plan.is_reincidencia && (
          <div className="card p-6 border-orange-500/30">
            <div className="flex items-center gap-3 mb-3">
              <FiAlertTriangle className="w-5 h-5 text-orange-400" />
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-orange-500/20 text-orange-400">
                Reincidencia #{plan.reincidencia_count}
              </span>
            </div>
            {plan.parent_action_plan_id && (
              <Link
                href={`/admin/planos-de-acao/${plan.parent_action_plan_id}`}
                className="inline-flex items-center gap-2 text-orange-400 hover:underline text-sm font-medium"
              >
                <FiExternalLink className="w-4 h-4" />
                Ver Plano de Acao Anterior
              </Link>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* 4. ASSIGNMENT CARD */}
        {/* ============================================ */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <FiUser className="w-4 h-4" />
            Atribuicao
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted block mb-1">Responsavel</span>
              <p className="text-main font-medium">
                {plan.assigned_user?.full_name || plan.assigned_user?.email || 'Nao atribuido'}
              </p>
            </div>
            {plan.assigned_by_user && (
              <div>
                <span className="text-muted block mb-1">Atribuido por</span>
                <p className="text-main font-medium">{plan.assigned_by_user.full_name}</p>
              </div>
            )}
            <div>
              <span className="text-muted block mb-1">Loja</span>
              <div className="flex items-center gap-2">
                <FiMapPin className="w-4 h-4 text-primary" />
                <p className="text-main font-medium">{plan.store?.name || 'N/A'}</p>
              </div>
            </div>
            {plan.sector?.name && (
              <div>
                <span className="text-muted block mb-1">Setor</span>
                <p className="text-main font-medium">{plan.sector.name}</p>
              </div>
            )}
          </div>
        </div>

        {/* ============================================ */}
        {/* 5. STATUS ACTION BUTTONS */}
        {/* ============================================ */}
        {(plan.status === 'aberto' || plan.status === 'em_andamento') && (
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
              <FiRefreshCw className="w-4 h-4" />
              Acoes
            </h3>
            <div className="flex flex-wrap gap-3">
              {plan.status === 'aberto' && (
                <button
                  onClick={() => handleStatusChange('em_andamento')}
                  disabled={statusChanging}
                  className="btn-primary flex items-center gap-2 px-5 py-2.5"
                >
                  <FiPlay className="w-4 h-4" />
                  {statusChanging ? 'Processando...' : 'Iniciar'}
                </button>
              )}
              {plan.status === 'em_andamento' && (
                <button
                  onClick={() => handleStatusChange('concluido')}
                  disabled={statusChanging}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm bg-success/20 text-success hover:bg-success/30 transition-colors disabled:opacity-50"
                >
                  <FiCheckCircle className="w-4 h-4" />
                  {statusChanging ? 'Processando...' : 'Concluir'}
                </button>
              )}
              <button
                onClick={() => handleStatusChange('cancelado')}
                disabled={statusChanging}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm bg-error/20 text-error hover:bg-error/30 transition-colors disabled:opacity-50"
              >
                <FiXCircle className="w-4 h-4" />
                {statusChanging ? 'Processando...' : 'Cancelar'}
              </button>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* 7. ADD COMMENT FORM */}
        {/* ============================================ */}
        {plan.status !== 'cancelado' && (
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
              <FiMessageSquare className="w-4 h-4" />
              Adicionar Comentario
            </h3>
            <form onSubmit={handleAddComment} className="space-y-3">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Escreva um comentario..."
                rows={3}
                className="input w-full resize-none"
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submittingComment || !comment.trim()}
                  className="btn-primary flex items-center gap-2 px-5 py-2.5 disabled:opacity-50"
                >
                  <FiSend className="w-4 h-4" />
                  {submittingComment ? 'Enviando...' : 'Enviar'}
                </button>

                {/* 8. UPLOAD EVIDENCE */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={handleEvidenceUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingEvidence}
                  className="btn-secondary flex items-center gap-2 px-5 py-2.5 disabled:opacity-50"
                >
                  <FiUpload className="w-4 h-4" />
                  {uploadingEvidence ? 'Enviando...' : 'Anexar Evidencia'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ============================================ */}
        {/* 6. TIMELINE (action_plan_updates) */}
        {/* ============================================ */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <FiFileText className="w-4 h-4" />
            Historico de Atualizacoes
          </h3>

          {updates.length === 0 ? (
            <div className="text-center py-8">
              <FiClock className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
              <p className="text-muted text-sm">Nenhuma atualizacao ainda.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {updates.map((update) => {
                const UpdateIcon = getUpdateIcon(update.update_type)
                return (
                  <div key={update.id} className="flex gap-3">
                    {/* Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        update.update_type === 'status_change'
                          ? 'bg-primary/20 text-primary'
                          : update.update_type === 'evidence'
                            ? 'bg-success/20 text-success'
                            : update.update_type === 'comment'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-surface-hover text-muted'
                      }`}>
                        <UpdateIcon className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-main">
                          {update.user?.full_name || 'Usuario'}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDate(update.created_at)}
                        </span>
                      </div>

                      {/* Status change display */}
                      {update.update_type === 'status_change' && update.old_status && update.new_status ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span className={STATUS_CONFIG[update.old_status as ActionPlanStatus]?.bgColor || 'bg-surface-hover text-muted'} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                            {getStatusLabel(update.old_status)}
                          </span>
                          <FiArrowRight className="w-3 h-3 text-muted" />
                          <span className={STATUS_CONFIG[update.new_status as ActionPlanStatus]?.bgColor || 'bg-surface-hover text-muted'} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                            {getStatusLabel(update.new_status)}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-secondary">{update.content}</p>
                      )}

                      {/* Evidence link hint */}
                      {update.update_type === 'evidence' && update.content && (
                        <p className="text-sm text-secondary mt-1 flex items-center gap-1">
                          <FiPaperclip className="w-3 h-3" />
                          {update.content}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
