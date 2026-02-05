'use client'

import { useEffect, useState } from 'react'
import { FiWifiOff, FiX } from 'react-icons/fi'

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true)
  const [showIndicator, setShowIndicator] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine)
    setShowIndicator(!navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      setDismissed(false)
      // Show "back online" briefly
      setTimeout(() => setShowIndicator(false), 2000)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setShowIndicator(true)
      setDismissed(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
  }

  if (!showIndicator || dismissed) return null

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[100] py-2 px-4 text-sm font-medium transition-all ${
        isOnline
          ? 'bg-success text-success-foreground'
          : 'bg-warning text-warning-foreground'
      }`}
    >
      <div className="flex items-center justify-center gap-2 relative">
        {!isOnline && <FiWifiOff className="w-4 h-4" />}
        <span>
          {isOnline ? 'Conexao restaurada!' : 'Voce esta offline - dados serao sincronizados quando voltar'}
        </span>
        <button
          onClick={handleDismiss}
          className="absolute right-0 p-1 hover:bg-black/10 rounded transition-colors"
          aria-label="Fechar"
        >
          <FiX className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
