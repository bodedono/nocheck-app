'use client'

import { useEffect, useState } from 'react'
import { FiWifiOff, FiX } from 'react-icons/fi'

const STORAGE_KEY = 'offline-indicator-dismissed'

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true)
  const [showIndicator, setShowIndicator] = useState(false)

  useEffect(() => {
    // Verifica se foi dismissado nesta sessão offline
    const wasDismissed = sessionStorage.getItem(STORAGE_KEY) === 'true'

    // Set initial state
    const online = navigator.onLine
    setIsOnline(online)
    setShowIndicator(!online && !wasDismissed)

    const handleOnline = () => {
      setIsOnline(true)
      // Limpa o estado de dismissed quando volta online
      sessionStorage.removeItem(STORAGE_KEY)
      // Show "back online" briefly
      setShowIndicator(true)
      setTimeout(() => setShowIndicator(false), 2000)
    }

    const handleOffline = () => {
      setIsOnline(false)
      // Só mostra se não foi dismissado
      const wasDismissedNow = sessionStorage.getItem(STORAGE_KEY) === 'true'
      if (!wasDismissedNow) {
        setShowIndicator(true)
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleDismiss = () => {
    // Salva no sessionStorage para não mostrar novamente nesta sessão offline
    sessionStorage.setItem(STORAGE_KEY, 'true')
    setShowIndicator(false)
  }

  if (!showIndicator) return null

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[100] py-2 px-4 text-sm font-medium transition-all ${
        isOnline
          ? 'bg-success text-success-foreground'
          : 'bg-warning text-warning-foreground'
      }`}
    >
      <div className="flex items-center justify-center gap-2 relative max-w-7xl mx-auto">
        {!isOnline && <FiWifiOff className="w-4 h-4" />}
        <span>
          {isOnline ? 'Conexao restaurada!' : 'Voce esta offline - dados serao sincronizados quando voltar'}
        </span>
        {!isOnline && (
          <button
            onClick={handleDismiss}
            className="absolute right-0 p-1 hover:bg-black/10 rounded transition-colors"
            aria-label="Fechar"
          >
            <FiX className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
