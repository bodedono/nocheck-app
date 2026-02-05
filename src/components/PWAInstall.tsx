'use client'

import { useEffect, useState, useCallback } from 'react'
import { FiDownload, FiX } from 'react-icons/fi'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

// Tempo em dias para reexibir o banner após ser dispensado
const DAYS_TO_RESHOW = 7

// Chave versionada - mude a versão para resetar o estado de todos os usuários
const STORAGE_KEY = 'pwa-banner-v2-dismissed-time'

export function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  // Verifica se deve mostrar o banner (não dispensado recentemente)
  const shouldShowBanner = useCallback(() => {
    const dismissedTime = localStorage.getItem(STORAGE_KEY)

    if (dismissedTime) {
      const daysSinceDismissed = (Date.now() - new Date(dismissedTime).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceDismissed < DAYS_TO_RESHOW) {
        console.log('[PWA] Banner dispensado há', daysSinceDismissed.toFixed(1), 'dias')
        return false
      }
      // Passou o tempo, limpa o flag
      localStorage.removeItem(STORAGE_KEY)
    }

    return true
  }, [])

  useEffect(() => {
    // Registrar Service Worker primeiro
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.log('[PWA] SW register failed:', err)
      })
    }

    // Verificar se já está instalado
    const checkInstalled = window.matchMedia('(display-mode: standalone)').matches
    if (checkInstalled) {
      console.log('[PWA] App já instalado')
      setIsInstalled(true)
      return
    }

    // Detecta iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
    if (isIOSDevice) {
      console.log('[PWA] Dispositivo iOS detectado')
      setIsIOS(true)
      if (shouldShowBanner()) {
        // Delay para iOS
        setTimeout(() => setShowBanner(true), 2000)
      }
      return
    }

    // Handler para o evento beforeinstallprompt
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      console.log('[PWA] beforeinstallprompt capturado!')
      e.preventDefault()
      setDeferredPrompt(e)

      if (shouldShowBanner()) {
        console.log('[PWA] Mostrando banner')
        setShowBanner(true)
      }
    }

    // Adiciona o listener
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Handler para quando o app é instalado
    const handleAppInstalled = () => {
      console.log('[PWA] App instalado!')
      setShowBanner(false)
      setDeferredPrompt(null)
      setIsInstalled(true)
    }

    window.addEventListener('appinstalled', handleAppInstalled)

    // Cleanup
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [shouldShowBanner])

  const handleInstall = async () => {
    console.log('[PWA] Botão Instalar clicado')

    if (!deferredPrompt) {
      console.log('[PWA] Sem evento para prompt')
      return
    }

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      console.log('[PWA] Resultado:', outcome)

      if (outcome === 'accepted') {
        localStorage.setItem(STORAGE_KEY, new Date().toISOString())
      }
    } catch (err) {
      console.error('[PWA] Erro no prompt:', err)
    }

    setDeferredPrompt(null)
    setShowBanner(false)
  }

  const handleDismiss = () => {
    console.log('[PWA] Banner dispensado')
    localStorage.setItem(STORAGE_KEY, new Date().toISOString())
    setShowBanner(false)
  }

  // Não renderiza se não deve mostrar ou já está instalado
  if (!showBanner || isInstalled) {
    return null
  }

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm animate-slide-up"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="card p-4 shadow-theme-lg border border-primary/30 bg-surface">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
            <FiDownload className="w-5 h-5 text-primary" />
          </div>

          <div className="flex-1">
            <h3 className="font-semibold text-main text-sm">Instalar NoCheck</h3>

            {isIOS ? (
              <>
                <p className="text-xs text-muted mt-1">
                  Toque em <span className="font-medium">Compartilhar</span> e depois em <span className="font-medium">&quot;Adicionar à Tela de Início&quot;</span>
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    Entendi
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted mt-1">
                  Adicione o app na tela inicial para acesso rápido
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleInstall}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    Instalar
                  </button>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="btn-ghost text-xs px-3 py-1.5"
                  >
                    Depois
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-muted hover:text-main"
            aria-label="Fechar"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Hook para verificar status online
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
