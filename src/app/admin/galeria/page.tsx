'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase'
import { APP_CONFIG } from '@/lib/config'
import { LoadingPage, Header } from '@/components/ui'
import { getAuthCache, getUserCache } from '@/lib/offlineCache'
import {
  FiImage,
  FiSearch,
  FiTrash2,
  FiUpload,
  FiFolder,
  FiX,
} from 'react-icons/fi'

type StorageFile = {
  name: string
  created_at: string
  size: number
  publicUrl: string
  path: string
}

type Folder = 'uploads' | 'anexos'

const ITEMS_PER_PAGE = 24

export default function GaleriaPage() {
  const [loading, setLoading] = useState(true)
  const [files, setFiles] = useState<StorageFile[]>([])
  const [currentFolder, setCurrentFolder] = useState<Folder>('uploads')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<StorageFile | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setLoading(false)
        return
      }

      let isAdmin = false
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', user.id)
            .single()
          isAdmin = profile && 'is_admin' in profile ? (profile as { is_admin: boolean }).is_admin : false
        }
      } catch {
        try {
          const cachedAuth = await getAuthCache()
          if (cachedAuth) {
            const cachedUser = await getUserCache(cachedAuth.userId)
            isAdmin = cachedUser?.is_admin || false
          }
        } catch { /* ignore */ }
      }

      if (!isAdmin) {
        router.push(APP_CONFIG.routes.dashboard)
        return
      }

      setLoading(false)
    }
    checkAuth()
  }, [supabase, router])

  const fetchFiles = useCallback(async (folder: Folder) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/storage?folder=${folder}`)
      const data = await res.json()
      if (data.success) {
        setFiles(data.files)
      } else {
        setFiles([])
      }
    } catch {
      setFiles([])
    }
    setLoading(false)
  }, [])

  // Fetch files when folder changes
  useEffect(() => {
    fetchFiles(currentFolder)
    setSearch('')
    setVisibleCount(ITEMS_PER_PAGE)
  }, [currentFolder, fetchFiles])

  const switchFolder = (folder: Folder) => {
    if (folder !== currentFolder) {
      setCurrentFolder(folder)
    }
  }

  const filteredFiles = useMemo(() => {
    if (!search.trim()) return files
    const q = search.toLowerCase()
    return files.filter(f => f.name.toLowerCase().includes(q))
  }, [files, search])

  const visibleFiles = filteredFiles.slice(0, visibleCount)

  const handleDelete = async (file: StorageFile) => {
    if (!window.confirm(`Deletar "${file.name}"? Esta acao nao pode ser desfeita.`)) return

    setDeleting(file.path)
    try {
      const res = await fetch('/api/storage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [file.path] }),
      })
      const data = await res.json()
      if (data.success) {
        setFiles(prev => prev.filter(f => f.path !== file.path))
      }
    } catch {
      // ignore
    }
    setDeleting(null)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
      })

      const fileName = `galeria_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, fileName, folder: currentFolder }),
      })
      const data = await res.json()
      if (data.success) {
        // Refresh list
        await fetchFiles(currentFolder)
      }
    } catch {
      // ignore
    }
    setUploading(false)
    if (uploadRef.current) uploadRef.current.value = ''
  }

  const formatSize = (bytes: number) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading && files.length === 0) {
    return <LoadingPage />
  }

  return (
    <div className="min-h-screen bg-page">
      <Header
        variant="page"
        title="Galeria"
        subtitle="Fotos e anexos do storage"
        icon={FiImage}
        backHref={APP_CONFIG.routes.admin}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Folder tabs */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => switchFolder('uploads')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all border-2 ${
              currentFolder === 'uploads'
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-surface border-subtle text-secondary hover:border-primary/50'
            }`}
          >
            <FiFolder className="w-5 h-5" />
            <span>Uploads</span>
            <span className="text-xs opacity-60">(fotos)</span>
          </button>
          <button
            onClick={() => switchFolder('anexos')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all border-2 ${
              currentFolder === 'anexos'
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-surface border-subtle text-secondary hover:border-primary/50'
            }`}
          >
            <FiFolder className="w-5 h-5" />
            <span>Anexos</span>
            <span className="text-xs opacity-60">(yes/no)</span>
          </button>
        </div>

        {/* Search + Upload */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome..."
              className="input w-full pl-11 pr-4 py-3 rounded-xl"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-main">
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => uploadRef.current?.click()}
            disabled={uploading}
            className="btn-primary px-5 py-3 rounded-xl flex items-center gap-2 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <FiUpload className="w-4 h-4" />
                <span>Importar</span>
              </>
            )}
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredFiles.length === 0 && (
          <div className="card p-12 text-center">
            <FiImage className="w-16 h-16 text-muted mx-auto mb-4" />
            <p className="text-secondary text-lg font-medium">
              {search ? 'Nenhuma foto encontrada' : 'Pasta vazia'}
            </p>
            <p className="text-muted text-sm mt-1">
              {search ? `Nenhum resultado para "${search}"` : `Nenhuma foto na pasta ${currentFolder}`}
            </p>
          </div>
        )}

        {/* Photo grid */}
        {!loading && visibleFiles.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {visibleFiles.map((file) => (
              <div key={file.path} className="card overflow-hidden group">
                {/* Thumbnail */}
                <button
                  type="button"
                  onClick={() => setPreview(file)}
                  className="w-full aspect-square bg-surface relative overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.publicUrl}
                    alt={file.name}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                </button>

                {/* Info */}
                <div className="p-2.5">
                  <p className="text-xs text-main font-medium truncate" title={file.name}>
                    {file.name}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <div className="text-xs text-muted">
                      <span>{formatSize(file.size)}</span>
                      <span className="mx-1">·</span>
                      <span>{formatDate(file.created_at)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(file)}
                      disabled={deleting === file.path}
                      className="p-1 text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                      title="Deletar"
                    >
                      {deleting === file.path ? (
                        <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <FiTrash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load more + count */}
        {!loading && filteredFiles.length > 0 && (
          <div className="mt-6 flex items-center justify-between text-sm text-muted">
            <p>Mostrando {Math.min(visibleCount, filteredFiles.length)} de {filteredFiles.length} fotos</p>
            {visibleCount < filteredFiles.length && (
              <button
                onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
                className="btn-secondary px-4 py-2 rounded-lg"
              >
                Carregar mais
              </button>
            )}
          </div>
        )}
      </main>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreview(null)}
              className="absolute -top-3 -right-3 z-10 p-2 bg-surface rounded-full shadow-lg text-main hover:text-red-400 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.publicUrl}
              alt={preview.name}
              className="w-full h-auto max-h-[80vh] object-contain rounded-xl"
            />
            <div className="mt-3 flex items-center justify-between bg-surface rounded-xl p-3">
              <div>
                <p className="text-main font-medium">{preview.name}</p>
                <p className="text-muted text-sm">{formatSize(preview.size)} · {formatDate(preview.created_at)}</p>
              </div>
              <button
                onClick={() => { handleDelete(preview); setPreview(null) }}
                className="btn-secondary px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 flex items-center gap-2 text-sm"
              >
                <FiTrash2 className="w-4 h-4" />
                Deletar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
