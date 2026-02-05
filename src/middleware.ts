import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options: CookieOptions }

// Duração do cookie: 7 dias em segundos
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Se o Supabase nao esta configurado, deixa passar
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
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
          // Garante que os cookies tenham longa duração
          const enhancedOptions: CookieOptions = {
            ...options,
            maxAge: options.maxAge || COOKIE_MAX_AGE,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
          }
          supabaseResponse.cookies.set(name, value, enhancedOptions)
        })
      },
    },
  })

  const { pathname } = request.nextUrl

  // Rotas publicas - sempre permite acesso
  const publicRoutes = ['/login', '/', '/offline']
  const isPublicRoute = publicRoutes.includes(pathname)

  // Rotas que funcionam offline ou precisam de auth
  const protectedRoutes = ['/dashboard', '/checklist', '/admin']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  // IMPORTANTE: Sempre chama getUser() para refresh da sessão
  // Isso renova os cookies automaticamente
  try {
    const { data: { user } } = await supabase.auth.getUser()

    // Se não está autenticado e tenta acessar rota protegida
    if (!user && isProtectedRoute) {
      // Verifica se tem cookie de sessão (pode estar offline)
      const hasSessionCookie = request.cookies.getAll().some(
        cookie => cookie.name.includes('supabase') && cookie.name.includes('auth')
      )

      // Se tem cookie, permite (funcionalidade offline)
      if (hasSessionCookie) {
        return supabaseResponse
      }

      // Sem sessão, redireciona para login
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // Se está autenticado e tenta acessar login, redireciona para dashboard
    if (user && pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    // Se é rota pública ou está autenticado, permite
    return supabaseResponse

  } catch (err) {
    console.error('[Middleware] Erro ao verificar sessão:', err)

    // Em caso de erro de rede (offline)
    const hasSessionCookie = request.cookies.getAll().some(
      cookie => cookie.name.includes('supabase') && cookie.name.includes('auth')
    )

    // Se tem cookie de sessão, permite acesso (modo offline)
    if (hasSessionCookie) {
      return supabaseResponse
    }

    // Rota pública, permite
    if (isPublicRoute) {
      return supabaseResponse
    }

    // Sem sessão e rota protegida, redireciona
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|json)$).*)',
  ],
}
