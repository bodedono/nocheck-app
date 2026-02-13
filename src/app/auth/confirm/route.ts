import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'edge'

/**
 * GET /auth/confirm
 * Rota que recebe o link de confirmação de email do Supabase
 * e redireciona para /auth/callback com o token
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (token_hash && type) {
    // Redireciona para o Supabase verificar o token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const verifyUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${type}&redirect_to=${origin}/auth/callback`
    return NextResponse.redirect(verifyUrl)
  }

  // Sem token, redireciona para login
  const redirectUrl = new URL('/login', origin)
  redirectUrl.searchParams.set('error', 'Link de confirmação inválido')
  return NextResponse.redirect(redirectUrl)
}
