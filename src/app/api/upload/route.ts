import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Aumenta o limite de body para 10MB (base64 images são grandes)
export const maxDuration = 30
export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * POST /api/upload
 * Faz upload de imagem para o Supabase Storage
 */
export async function POST(request: NextRequest) {
  console.log('[Upload] Recebendo requisição de upload')

  try {
    const body = await request.json()
    const { image, fileName, folder } = body as {
      image: string // base64 image
      fileName: string
      folder?: string // pasta no bucket (default: 'uploads')
    }

    if (!image) {
      return NextResponse.json(
        { success: false, error: 'Imagem não fornecida' },
        { status: 400 }
      )
    }

    // Remove data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '')

    // Check file size (base64 is ~33% larger than binary)
    const estimatedSize = (base64Data.length * 3) / 4
    console.log('[Upload] Tamanho estimado:', Math.round(estimatedSize / 1024), 'KB')

    if (estimatedSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `Imagem muito grande (máx ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      )
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64')

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Generate unique filename
    const timestamp = Date.now()
    const uniqueFileName = fileName || `checklist_${timestamp}.jpg`
    const filePath = `${folder || 'uploads'}/${uniqueFileName}`

    // Upload to Supabase Storage
    console.log('[Upload] Tentando upload para bucket checklist-images, path:', filePath)
    const { data, error } = await supabase.storage
      .from('checklist-images')
      .upload(filePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true, // Permite sobrescrever se já existir
      })

    if (error) {
      console.error('[Upload] Erro Supabase Storage:', error.message, error)
      // Tenta verificar se o bucket existe
      const { data: buckets } = await supabase.storage.listBuckets()
      console.log('[Upload] Buckets disponíveis:', buckets?.map(b => b.name))
      throw new Error(error.message)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('checklist-images')
      .getPublicUrl(filePath)

    console.log('[Upload] Sucesso:', urlData.publicUrl)

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: data.path,
    })
  } catch (error) {
    console.error('[Upload] Erro:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 500 }
    )
  }
}
