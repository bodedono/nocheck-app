'use client'

import Link from 'next/link'
import { FiCheckCircle, FiLogIn } from 'react-icons/fi'

export default function EmailConfirmedPage() {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4">
      <div className="card p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
          <FiCheckCircle className="w-10 h-10 text-success" />
        </div>

        <h1 className="text-2xl font-bold text-main mb-2">
          Email confirmado!
        </h1>

        <p className="text-muted mb-8">
          Seu email foi verificado com sucesso. Agora voce pode fazer login com sua senha.
        </p>

        <Link
          href="/login"
          className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-base"
        >
          <FiLogIn className="w-5 h-5" />
          Ir para Login
        </Link>
      </div>
    </div>
  )
}
