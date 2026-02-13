import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /api/admin/users
 * Sincroniza auth.users com public.users e retorna a lista completa
 * Usuarios que existem no auth mas nao no public sao inseridos automaticamente
 */
export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. Busca todos usuarios do auth.users
    const { data: authList, error: authError } = await supabase.auth.admin.listUsers()

    if (authError) {
      console.error('[API Users] Erro ao listar auth users:', authError)
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    // 2. Busca todos usuarios do public.users
    const { data: publicUsers } = await supabase
      .from('users')
      .select('id')

    const publicIds = new Set((publicUsers || []).map(u => u.id))

    // 3. Insere usuarios que existem no auth mas nao no public
    const missing = authList.users.filter(u => !publicIds.has(u.id))

    for (const authUser of missing) {
      const name = authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Usuario'
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: authUser.id,
          email: authUser.email || '',
          full_name: name,
          is_active: true,
          is_admin: false,
        })

      if (insertError) {
        console.error('[API Users] Erro ao sincronizar usuario:', authUser.email, insertError)
      } else {
        console.log('[API Users] Usuario sincronizado:', authUser.email)
      }
    }

    // 4. Retorna lista completa de public.users com loja/funcao/setor + multi-lojas
    const { data: users, error: usersError } = await supabase
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
      .order('created_at', { ascending: false })

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    return NextResponse.json(
      { users, synced: missing.length },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('[API Users] Erro:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

/**
 * POST /api/admin/users
 * Cria usuario no auth.users (trigger cria em public.users automaticamente)
 * Depois atualiza o perfil e insere os roles
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, fullName, phone, isAdmin, autoConfirm, storeId, functionId, sectorId, storeAssignments, redirectTo } = body as {
      email: string
      password: string
      fullName: string
      phone?: string
      isAdmin: boolean
      autoConfirm?: boolean
      storeId?: number
      functionId?: number
      sectorId?: number
      storeAssignments?: { store_id: number; sector_id: number | null; is_primary: boolean }[]
      redirectTo?: string
    }

    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: 'Email, senha e nome sao obrigatorios' },
        { status: 400 }
      )
    }

    // 1. Criar usuario - auto-confirm usa admin API, senao usa signUp normal
    let userId: string

    if (autoConfirm) {
      // Auto-confirm: usa admin API para criar usuario ja confirmado
      const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })

      const { data: adminData, error: adminError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })

      if (adminError) {
        console.error('[API Users] Erro no admin.createUser:', adminError)
        return NextResponse.json(
          { error: adminError.message },
          { status: 400 }
        )
      }

      if (!adminData.user) {
        return NextResponse.json(
          { error: 'Erro ao criar usuario' },
          { status: 500 }
        )
      }

      userId = adminData.user.id
    } else {
      // Fluxo normal: signUp com anon key (envia email de confirmacao)
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })

      const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: redirectTo || undefined,
        },
      })

      if (signUpError) {
        console.error('[API Users] Erro no signUp:', signUpError)
        return NextResponse.json(
          { error: signUpError.message },
          { status: 400 }
        )
      }

      if (!signUpData.user) {
        return NextResponse.json(
          { error: 'Erro ao criar usuario' },
          { status: 500 }
        )
      }

      userId = signUpData.user.id
    }

    // 2. Service role para atualizar perfil e roles
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Monta lista de lojas: novo formato (storeAssignments) ou legado (storeId/sectorId)
    let assignments: { store_id: number; sector_id: number | null; is_primary: boolean }[] = []
    if (storeAssignments && storeAssignments.length > 0) {
      assignments = storeAssignments
    } else if (storeId) {
      assignments = [{ store_id: storeId, sector_id: sectorId || null, is_primary: true }]
    }

    // Loja primária para manter users.store_id sincronizado
    const primary = assignments.find(a => a.is_primary) || assignments[0] || null

    // Atualiza perfil em public.users (trigger ja criou o registro)
    const { error: profileError } = await supabase
      .from('users')
      .update({
        full_name: fullName,
        phone: phone || null,
        is_admin: isAdmin,
        store_id: isAdmin ? null : (primary?.store_id || null),
        function_id: isAdmin ? null : (functionId || null),
        sector_id: isAdmin ? null : (primary?.sector_id || null),
      })
      .eq('id', userId)

    if (profileError) {
      console.error('[API Users] Erro ao atualizar perfil:', profileError)
    }

    // Insere vínculos em user_stores
    if (assignments.length > 0 && !isAdmin) {
      const rows = assignments.map(a => ({
        user_id: userId,
        store_id: a.store_id,
        sector_id: a.sector_id,
        is_primary: a.is_primary,
      }))

      const { error: storesError } = await supabase
        .from('user_stores')
        .insert(rows)

      if (storesError) {
        console.error('[API Users] Erro ao inserir user_stores:', storesError)
      }
    }

    return NextResponse.json({
      success: true,
      needsConfirmation: !autoConfirm,
      user: {
        id: userId,
        email,
      },
    })
  } catch (error) {
    console.error('[API Users] Erro:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
