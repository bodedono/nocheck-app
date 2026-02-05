// NoCheck Service Worker v7.0.0
// Estrategia: Precache COMPLETO de todos os assets para funcionamento 100% offline

const CACHE_VERSION = 'v7'
const APP_CACHE = `nocheck-app-${CACHE_VERSION}`
const STATIC_CACHE = `nocheck-static-${CACHE_VERSION}`

// URLs que NUNCA devem ser cacheadas
const NEVER_CACHE = [
  /\/api\//,
  /supabase\.co/,
  /\.hot-update\./,
  /sockjs/,
  /_next\/webpack-hmr/,
  /\?_rsc=/,
]

// ============================================
// INSTALL - Precache imediato dos assets essenciais
// ============================================
self.addEventListener('install', (event) => {
  console.log('[SW v7] Installing...')

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        // Cache assets estaticos essenciais
        return cache.addAll([
          '/manifest.json',
          '/Logo.png',
          '/Logo-dark.png',
        ]).catch(err => {
          console.log('[SW v7] Some static assets failed to cache:', err)
        })
      })
      .then(() => {
        console.log('[SW v7] Install complete')
        return self.skipWaiting()
      })
  )
})

// ============================================
// ACTIVATE - Limpa caches antigos e assume controle
// ============================================
self.addEventListener('activate', (event) => {
  console.log('[SW v7] Activating...')

  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key.startsWith('nocheck-') && key !== APP_CACHE && key !== STATIC_CACHE)
            .map((key) => {
              console.log('[SW v7] Deleting old cache:', key)
              return caches.delete(key)
            })
        )
      })
      .then(() => {
        console.log('[SW v7] Taking control of all clients')
        return self.clients.claim()
      })
  )
})

// ============================================
// FETCH - Cache First para assets, Network First para paginas
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignora metodos que nao sao GET
  if (request.method !== 'GET') return

  // Ignora requests que nunca devem ser cacheados
  if (NEVER_CACHE.some(pattern => pattern.test(url.href))) {
    return
  }

  // Ignora requests para outros dominios (exceto CDNs conhecidos)
  if (url.origin !== self.location.origin) {
    if (!url.href.includes('fonts.googleapis.com') &&
        !url.href.includes('fonts.gstatic.com')) {
      return
    }
  }

  // Assets estaticos do Next.js - Cache First SEMPRE
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Arquivos estaticos (imagens, fonts, etc) - Cache First
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Navegacao (paginas HTML) - Network First com fallback para cache
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstForNavigation(request))
    return
  }

  // Outros requests - Cache First
  event.respondWith(cacheFirst(request))
})

// ============================================
// ESTRATEGIAS DE CACHE
// ============================================

// Cache First - Usa cache se disponivel, senao busca na rede
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request)

  if (cachedResponse) {
    return cachedResponse
  }

  try {
    const networkResponse = await fetch(request)

    if (networkResponse.ok) {
      const cache = await caches.open(APP_CACHE)
      cache.put(request, networkResponse.clone())
    }

    return networkResponse
  } catch (error) {
    console.log('[SW v7] Fetch failed:', request.url)

    // Retorna uma resposta de erro generica
    return new Response('Offline - recurso nao disponivel', {
      status: 503,
      statusText: 'Service Unavailable'
    })
  }
}

// Network First para navegacao - Tenta rede, se falhar usa cache
async function networkFirstForNavigation(request) {
  const url = new URL(request.url)

  try {
    const networkResponse = await fetch(request)

    if (networkResponse.ok) {
      // Cacheia a resposta
      const cache = await caches.open(APP_CACHE)
      cache.put(request, networkResponse.clone())

      // Extrai e cacheia os assets referenciados no HTML
      cacheAssetsFromHtml(networkResponse.clone(), url.origin)
    }

    return networkResponse
  } catch (error) {
    console.log('[SW v7] Network failed for navigation:', url.pathname)

    // Tenta o cache
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      console.log('[SW v7] Serving from cache:', url.pathname)
      return cachedResponse
    }

    // Tenta caches alternativos
    const alternatives = ['/dashboard', '/', '/offline']
    for (const alt of alternatives) {
      const cached = await caches.match(alt)
      if (cached) {
        console.log('[SW v7] Serving alternative:', alt)
        return cached
      }
    }

    // Ultimo recurso
    return new Response(getOfflineHTML(), {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    })
  }
}

// Extrai URLs de assets do HTML e cacheia
async function cacheAssetsFromHtml(response, origin) {
  try {
    const html = await response.text()
    const cache = await caches.open(APP_CACHE)

    // Encontra todos os scripts e styles
    const scriptMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)
    const linkMatches = html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi)
    const linkMatches2 = html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)

    const urls = new Set()

    for (const match of scriptMatches) {
      if (match[1].startsWith('/')) urls.add(match[1])
      else if (match[1].startsWith(origin)) urls.add(match[1])
    }

    for (const match of linkMatches) {
      if (match[1].startsWith('/')) urls.add(match[1])
      else if (match[1].startsWith(origin)) urls.add(match[1])
    }

    for (const match of linkMatches2) {
      if (match[1].startsWith('/')) urls.add(match[1])
      else if (match[1].startsWith(origin)) urls.add(match[1])
    }

    // Cacheia cada asset encontrado
    for (const url of urls) {
      try {
        const existing = await cache.match(url)
        if (!existing) {
          const assetResponse = await fetch(url)
          if (assetResponse.ok) {
            await cache.put(url, assetResponse)
            console.log('[SW v7] Cached asset:', url)
          }
        }
      } catch {
        // Ignora erros de assets individuais
      }
    }
  } catch (error) {
    console.log('[SW v7] Error caching assets from HTML:', error)
  }
}

// HTML de fallback quando totalmente offline
function getOfflineHTML() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NoCheck - Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .icon {
      width: 80px;
      height: 80px;
      background: rgba(255,255,255,0.1);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
    }
    .icon svg {
      width: 40px;
      height: 40px;
      stroke: #f59e0b;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: rgba(255,255,255,0.7); margin-bottom: 1.5rem; }
    button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-size: 1rem;
      cursor: pointer;
    }
    button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
        <line x1="12" y1="20" x2="12.01" y2="20"></line>
      </svg>
    </div>
    <h1>Voce esta offline</h1>
    <p>Verifique sua conexao com a internet e tente novamente.</p>
    <button onclick="window.location.reload()">Tentar novamente</button>
  </div>
</body>
</html>`
}

// ============================================
// MENSAGENS - Comunicacao com o app
// ============================================
self.addEventListener('message', async (event) => {
  const { type, payload } = event.data || {}

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting()
      break

    case 'CLEAR_CACHE':
      const keys = await caches.keys()
      await Promise.all(keys.map(key => caches.delete(key)))
      console.log('[SW v7] All caches cleared')
      break

    case 'PRECACHE_APP':
      await precacheApp()
      event.source?.postMessage({ type: 'PRECACHE_COMPLETE' })
      break

    case 'GET_CACHE_STATUS':
      const allKeys = await caches.keys()
      const appCache = await caches.open(APP_CACHE)
      const cachedRequests = await appCache.keys()
      event.source?.postMessage({
        type: 'CACHE_STATUS',
        payload: {
          caches: allKeys,
          itemCount: cachedRequests.length
        }
      })
      break
  }
})

// ============================================
// PRECACHE COMPLETO - Cacheia toda a aplicacao
// ============================================
async function precacheApp() {
  console.log('[SW v7] Starting FULL app precache...')

  const cache = await caches.open(APP_CACHE)

  // Paginas essenciais - TODAS as rotas do app
  const pages = [
    '/',
    '/login',
    '/dashboard',
    '/offline',
    '/checklist/novo',
    '/admin',
    '/admin/lojas',
    '/admin/usuarios',
    '/admin/usuarios/novo',
    '/admin/templates',
    '/admin/templates/novo',
    '/admin/setores',
    '/admin/gerentes',
    '/admin/checklists',
    '/admin/validacoes',
    '/admin/relatorios',
  ]

  // Assets estaticos
  const staticAssets = [
    '/manifest.json',
    '/Logo.png',
    '/Logo-dark.png',
  ]

  let totalCached = 0

  // Cacheia assets estaticos primeiro
  for (const asset of staticAssets) {
    try {
      const response = await fetch(asset)
      if (response.ok) {
        await cache.put(asset, response)
        totalCached++
        console.log('[SW v7] Cached static:', asset)
      }
    } catch {
      console.log('[SW v7] Failed static:', asset)
    }
  }

  // Cacheia cada pagina E seus assets
  for (const pageUrl of pages) {
    try {
      const response = await fetch(pageUrl)
      if (response.ok) {
        // Clona para salvar e para processar
        const responseToCache = response.clone()
        const responseToProcess = response.clone()

        await cache.put(pageUrl, responseToCache)
        totalCached++
        console.log('[SW v7] Cached page:', pageUrl)

        // Extrai e cacheia todos os assets desta pagina
        const html = await responseToProcess.text()

        // Encontra TODOS os assets (scripts, styles, preloads)
        const assetUrls = new Set()

        // Scripts
        const scripts = html.matchAll(/src=["'](\/_next\/static\/[^"']+)["']/gi)
        for (const match of scripts) assetUrls.add(match[1])

        // Styles
        const styles = html.matchAll(/href=["'](\/_next\/static\/[^"']+)["']/gi)
        for (const match of styles) assetUrls.add(match[1])

        // Preloads e outros
        const preloads = html.matchAll(/["'](\/_next\/static\/[^"']+)["']/gi)
        for (const match of preloads) {
          if (!match[1].includes('buildManifest')) {
            assetUrls.add(match[1])
          }
        }

        console.log('[SW v7] Found', assetUrls.size, 'assets in', pageUrl)

        // Cacheia cada asset
        for (const assetUrl of assetUrls) {
          try {
            const existing = await cache.match(assetUrl)
            if (!existing) {
              const assetResponse = await fetch(assetUrl)
              if (assetResponse.ok) {
                await cache.put(assetUrl, assetResponse)
                totalCached++
              }
            }
          } catch {
            // Ignora erros individuais
          }
        }
      }
    } catch (err) {
      console.log('[SW v7] Failed page:', pageUrl, err)
    }
  }

  console.log('[SW v7] Precache COMPLETE! Total items:', totalCached)

  // Lista todos os items no cache
  const cachedItems = await cache.keys()
  console.log('[SW v7] Cache now contains', cachedItems.length, 'items')
}

// ============================================
// BACKGROUND SYNC
// ============================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-checklists') {
    console.log('[SW v7] Background sync triggered')
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_REQUESTED' })
        })
      })
    )
  }
})

console.log('[SW v7] Service Worker loaded')
