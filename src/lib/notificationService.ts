/**
 * Servico de notificacoes - cria notificacoes in-app e envia emails
 */

import type { NotificationType } from '@/types/database'

type NotificationData = {
  type: NotificationType
  title: string
  message?: string
  link?: string
  metadata?: Record<string, unknown>
}

/**
 * Cria uma notificacao in-app no banco de dados
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  data: NotificationData
): Promise<{ success: boolean; error?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('notifications')
      .insert({
        user_id: userId,
        type: data.type,
        title: data.title,
        message: data.message || null,
        link: data.link || null,
        metadata: data.metadata || null,
      })

    if (error) {
      console.error('[Notification] Erro ao criar notificacao:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('[Notification] Erro inesperado:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' }
  }
}

/**
 * Envia email de notificacao via API route
 */
export async function sendEmailNotification(
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/notifications/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, htmlBody }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[Email] Erro ao enviar:', text)
      return { success: false, error: text }
    }

    return { success: true }
  } catch (err) {
    console.error('[Email] Erro ao chamar API:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Erro' }
  }
}

/**
 * Envia alerta de plano de acao para Teams
 */
export async function sendActionPlanTeamsAlert(data: {
  title: string
  fieldName: string
  storeName: string
  severity: string
  deadline: string
  assigneeName: string
  nonConformityValue: string | null
  isReincidencia: boolean
  reincidenciaCount: number
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/integrations/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'action_plan',
        data,
      }),
    })

    if (!response.ok) {
      console.error('[Teams] Erro ao enviar alerta de plano de acao:', await response.text())
      return { success: false }
    }

    return { success: true }
  } catch (err) {
    console.error('[Teams] Erro ao chamar API:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Erro' }
  }
}

/**
 * Gera HTML do email de notificacao de plano de acao
 */
export function buildActionPlanEmailHtml(data: {
  planTitle: string
  fieldName: string
  storeName: string
  severity: string
  deadline: string
  nonConformityValue: string | null
  description: string | null
  isReincidencia: boolean
  reincidenciaCount: number
  appUrl: string
  planId: number
}): string {
  const severityColors: Record<string, string> = {
    baixa: '#22c55e',
    media: '#f59e0b',
    alta: '#f97316',
    critica: '#ef4444',
  }
  const severityColor = severityColors[data.severity] || '#f59e0b'
  const severityLabel = data.severity.charAt(0).toUpperCase() + data.severity.slice(1)

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: ${severityColor}; padding: 20px; color: white;">
      <h1 style="margin: 0; font-size: 20px;">Plano de Acao ${data.isReincidencia ? '(REINCIDENCIA #' + data.reincidenciaCount + ')' : ''}</h1>
      <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">Severidade: ${severityLabel}</p>
    </div>
    <div style="padding: 24px;">
      <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 18px;">${data.planTitle}</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Campo:</td><td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600;">${data.fieldName}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Loja:</td><td style="padding: 8px 0; color: #1e293b; font-size: 14px;">${data.storeName}</td></tr>
        ${data.nonConformityValue ? `<tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Valor:</td><td style="padding: 8px 0; color: #ef4444; font-size: 14px; font-weight: 600;">${data.nonConformityValue}</td></tr>` : ''}
        <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Prazo:</td><td style="padding: 8px 0; color: #1e293b; font-size: 14px;">${data.deadline}</td></tr>
      </table>
      ${data.description ? `<p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">${data.description}</p>` : ''}
      <a href="${data.appUrl}/admin/planos-de-acao/${data.planId}" style="display: inline-block; background: ${severityColor}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Ver Plano de Acao</a>
    </div>
    <div style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #94a3b8; font-size: 12px;">NoCheck - Sistema de Checklists</p>
    </div>
  </div>
</body>
</html>`
}
