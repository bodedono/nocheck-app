import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options: CookieOptions }

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Se houve erro (link expirado, etc)
  if (error) {
    const redirectUrl = new URL('/login', origin)
    redirectUrl.searchParams.set('error', errorDescription || error)
    return NextResponse.redirect(redirectUrl)
  }

  if (code) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: CookieToSet[]) {
            cookiesToSet.forEach(({ name, value }: CookieToSet) =>
              request.cookies.set(name, value)
            )
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }: CookieToSet) => {
              supabaseResponse.cookies.set(name, value, {
                ...options,
                maxAge: options.maxAge || 60 * 60 * 24 * 7,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
              })
            })
          },
        },
      }
    )

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('[Auth Callback] Erro na troca de código:', exchangeError)
      const redirectUrl = new URL('/login', origin)
      redirectUrl.searchParams.set('error', 'Erro ao confirmar email. Tente novamente.')
      return NextResponse.redirect(redirectUrl)
    }

    // Sucesso - redireciona para dashboard
    const redirectUrl = new URL('/dashboard', origin)
    return NextResponse.redirect(redirectUrl)
  }

  // Sem código, redireciona para login
  return NextResponse.redirect(new URL('/login', origin))
}
