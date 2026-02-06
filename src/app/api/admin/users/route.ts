import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    // 4. Retorna lista completa de public.users com roles
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select(`
        *,
        roles:user_store_roles(
          *,
          store:stores(*)
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
    const { email, password, fullName, phone, isAdmin, roles, redirectTo } = body as {
      email: string
      password: string
      fullName: string
      phone?: string
      isAdmin: boolean
      roles: { store_id: number; role: string }[]
      redirectTo?: string
    }

    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: 'Email, senha e nome sao obrigatorios' },
        { status: 400 }
      )
    }

    // 1. signUp com anon key (envia email "Confirm your signup")
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

    const userId = signUpData.user.id

    // 2. Service role para atualizar perfil e roles
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Atualiza perfil em public.users (trigger ja criou o registro)
    const { error: profileError } = await supabase
      .from('users')
      .update({
        full_name: fullName,
        phone: phone || null,
        is_admin: isAdmin,
      })
      .eq('id', userId)

    if (profileError) {
      console.error('[API Users] Erro ao atualizar perfil:', profileError)
    }

    // Insere roles
    if (roles && roles.length > 0) {
      const { error: rolesError } = await supabase
        .from('user_store_roles')
        .insert(
          roles.map(r => ({
            user_id: userId,
            store_id: r.store_id,
            role: r.role,
          }))
        )

      if (rolesError) {
        console.error('[API Users] Erro ao inserir roles:', rolesError)
      }
    }

    return NextResponse.json({
      success: true,
      needsConfirmation: true,
      user: {
        id: userId,
        email: signUpData.user.email,
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
