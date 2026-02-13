import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = 'checklist-images'

/**
 * GET /api/storage?folder=uploads
 * Lista arquivos de uma pasta no bucket
 */
export async function GET(request: NextRequest) {
  try {
    const folder = request.nextUrl.searchParams.get('folder') || 'uploads'

    if (!['uploads', 'anexos'].includes(folder)) {
      return NextResponse.json({ success: false, error: 'Pasta invalida' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: files, error } = await supabase.storage
      .from(BUCKET)
      .list(folder, {
        limit: 500,
        sortBy: { column: 'created_at', order: 'desc' },
      })

    if (error) throw new Error(error.message)

    const items = (files || [])
      .filter(f => f.name && !f.name.startsWith('.'))
      .map(f => {
        const { data: urlData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(`${folder}/${f.name}`)
        return {
          name: f.name,
          created_at: f.created_at,
          size: f.metadata?.size || 0,
          publicUrl: urlData.publicUrl,
          path: `${folder}/${f.name}`,
        }
      })

    return NextResponse.json({ success: true, files: items, folder })
  } catch (error) {
    console.error('[Storage] Erro ao listar:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/storage
 * Remove arquivos do bucket
 * Body: { paths: ['uploads/file1.jpg'] }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { paths } = body as { paths: string[] }

    if (!paths || paths.length === 0) {
      return NextResponse.json({ success: false, error: 'Nenhum arquivo especificado' }, { status: 400 })
    }

    // Validate paths are in allowed folders
    for (const p of paths) {
      if (!p.startsWith('uploads/') && !p.startsWith('anexos/')) {
        return NextResponse.json({ success: false, error: 'Caminho invalido' }, { status: 400 })
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error } = await supabase.storage
      .from(BUCKET)
      .remove(paths)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, deleted: paths.length })
  } catch (error) {
    console.error('[Storage] Erro ao deletar:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
