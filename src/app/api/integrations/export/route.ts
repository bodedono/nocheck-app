import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enviarResumoDiarioTeams } from '@/lib/integrations/teams'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * POST /api/integrations/export
 * Envia resumo de validações para Teams
 *
 * Body:
 * - teams: boolean (enviar resumo para Teams)
 * - days: number (quantos dias de dados, default 7)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { teams = true, days = 7 } = body

    // Criar cliente Supabase com service role (bypass RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Calcular data de inicio
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Buscar validações
    const { data: validations, error } = await supabase
      .from('cross_validations')
      .select(`
        *,
        store:stores(name)
      `)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Erro ao buscar validações: ${error.message}`)
    }

    const results: Record<string, unknown> = {
      validationsCount: validations?.length || 0,
    }

    // Enviar resumo para Teams
    if (teams && validations) {
      const stats = {
        total: validations.length,
        sucesso: validations.filter(v => v.status === 'sucesso').length,
        divergencias: validations.filter(v => v.status === 'falhou').length,
        pendentes: validations.filter(v => v.status === 'pendente').length,
        data: new Date().toLocaleDateString('pt-BR'),
      }

      const teamsResult = await enviarResumoDiarioTeams(stats)
      results.teams = teamsResult
    }

    return NextResponse.json({
      success: true,
      ...results,
    })
  } catch (err) {
    console.error('[API Export] Error:', err)
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/integrations/export
 * Retorna status das integrações
 */
export async function GET() {
  const teamsConfigured = !!process.env.TEAMS_WEBHOOK_URL
  const driveConfigured = !!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY

  return NextResponse.json({
    integrations: {
      drive: {
        configured: driveConfigured,
      },
      teams: {
        configured: teamsConfigured,
      },
    },
  })
}
