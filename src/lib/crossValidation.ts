type ChecklistResponse = {
  field_id: number
  value_text: string | null
  value_number: number | null
  value_json: unknown
}

type TemplateField = {
  id: number
  name: string
  field_type: string
}

/**
 * Envia notificação para Teams quando há divergência
 */
async function notificarIntegracoes(data: {
  id: number
  numeroNota: string
  numeroNotaVinculada?: string
  loja: string
  valorEstoquista: number | null
  valorAprendiz: number | null
  diferenca: number | null
  status: 'pendente' | 'sucesso' | 'falhou' | 'notas_diferentes'
  dataHora: string
  matchReason?: string
}): Promise<void> {
  try {
    const response = await fetch('/api/integrations/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'teams',
        data,
      }),
    })

    if (!response.ok) {
      console.error('[CrossValidation] Erro ao notificar integrações:', await response.text())
    } else {
      const result = await response.json()
      console.log('[CrossValidation] Notificações enviadas:', result)
    }
  } catch (err) {
    console.error('[CrossValidation] Erro ao chamar API de integrações:', err)
  }
}

/**
 * Verifica se duas notas são potencialmente "irmãs"
 * Critérios:
 * 1. Mesma loja
 * 2. Diferença de tempo <= 30 minutos
 * 3. Primeiros 3 dígitos do número da nota são iguais
 */
function verificarNotasIrmas(
  nota1: string,
  nota2: string,
  data1: Date,
  data2: Date
): { match: boolean; reason: string } {
  // Extrair apenas dígitos das notas
  const digitos1 = nota1.replace(/\D/g, '')
  const digitos2 = nota2.replace(/\D/g, '')

  // Verificar se primeiros 3 dígitos são iguais
  const prefixo1 = digitos1.substring(0, 3)
  const prefixo2 = digitos2.substring(0, 3)
  const prefixoIgual = prefixo1.length >= 3 && prefixo1 === prefixo2

  // Verificar diferença de tempo (30 minutos = 1800000 ms)
  const diffMs = Math.abs(data1.getTime() - data2.getTime())
  const diffMinutos = diffMs / (1000 * 60)
  const tempoProximo = diffMinutos <= 30

  if (prefixoIgual && tempoProximo) {
    return {
      match: true,
      reason: `Notas com prefixo "${prefixo1}" e preenchidas com ${Math.round(diffMinutos)} minutos de diferença`,
    }
  }

  if (tempoProximo && !prefixoIgual) {
    // Mesmo assim pode ser um match fraco se o tempo for muito próximo (< 10 min)
    if (diffMinutos <= 10) {
      return {
        match: true,
        reason: `Notas preenchidas com apenas ${Math.round(diffMinutos)} minutos de diferença (possível erro de digitação)`,
      }
    }
  }

  return { match: false, reason: '' }
}

/**
 * Processa validacao cruzada apos um checklist de recebimento ser concluido
 * Compara valores entre estoquista e aprendiz para a mesma nota fiscal
 * Também detecta notas "irmãs" quando os números são diferentes
 */
export async function processarValidacaoCruzada(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  checklistId: number,
  templateId: number,
  storeId: number,
  userId: string,
  responses: ChecklistResponse[],
  fields: TemplateField[]
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Verificar se o template é de recebimento
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template } = await (supabase as any)
      .from('checklist_templates')
      .select('category')
      .eq('id', templateId)
      .single()

    if (!template || template.category !== 'recebimento') {
      // Nao é recebimento, nao precisa validar
      return { success: true }
    }

    // 2. Encontrar campos de "numero da nota" e "valor"
    const campoNota = fields.find(f =>
      f.name.toLowerCase().includes('nota') ||
      f.name.toLowerCase().includes('nf') ||
      f.name.toLowerCase().includes('numero')
    )

    const campoValor = fields.find(f =>
      f.name.toLowerCase().includes('valor') ||
      f.name.toLowerCase().includes('total') ||
      f.name.toLowerCase().includes('quantia')
    )

    if (!campoNota) {
      return { success: true }
    }

    // 3. Obter valores das respostas
    const respostaNota = responses.find(r => r.field_id === campoNota.id)
    const respostaValor = campoValor ? responses.find(r => r.field_id === campoValor.id) : null

    const numeroNota = respostaNota?.value_text || respostaNota?.value_number?.toString()
    const valor = respostaValor?.value_number || parseFloat(respostaValor?.value_text || '0') || null

    if (!numeroNota) {
      return { success: true }
    }

    // 4. Verificar o cargo do usuario via function_id no perfil
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userProfile } = await (supabase as any)
      .from('users')
      .select(`
        function_id,
        function_ref:functions!users_function_id_fkey(name)
      `)
      .eq('id', userId)
      .single()

    let isEstoquista = false
    let isAprendiz = false

    if (userProfile?.function_ref?.name) {
      const functionName = userProfile.function_ref.name.toLowerCase()
      isEstoquista = functionName.includes('estoque') || functionName.includes('estoquista')
      isAprendiz = functionName.includes('aprendiz')
    }

    if (!isEstoquista && !isAprendiz) {
      // Usuario nao é nem estoquista nem aprendiz
      return { success: true }
    }

    // 5. Verificar se ja existe validacao para esta nota (match exato)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingValidation } = await (supabase as any)
      .from('cross_validations')
      .select('*')
      .eq('store_id', storeId)
      .eq('numero_nota', numeroNota)
      .single()

    // Buscar nome da loja para notificações
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: store } = await (supabase as any)
      .from('stores')
      .select('name')
      .eq('id', storeId)
      .single()

    const lojaNome = store?.name || `Loja ${storeId}`
    const dataHora = new Date().toLocaleString('pt-BR')

    if (existingValidation) {
      // Atualizar validacao existente (match exato de número de nota)
      const updateData: Record<string, unknown> = {}

      if (isEstoquista && !existingValidation.estoquista_checklist_id) {
        updateData.estoquista_checklist_id = checklistId
        updateData.valor_estoquista = valor
      } else if (isAprendiz && !existingValidation.aprendiz_checklist_id) {
        updateData.aprendiz_checklist_id = checklistId
        updateData.valor_aprendiz = valor
      } else {
        // Ja tem os dois preenchidos ou é duplicado
        return { success: true }
      }

      // Verificar se agora temos os dois valores para calcular diferenca
      const valorEstoquista = updateData.valor_estoquista ?? existingValidation.valor_estoquista
      const valorAprendiz = updateData.valor_aprendiz ?? existingValidation.valor_aprendiz

      let validationComplete = false
      let hasDivergence = false

      if (valorEstoquista !== null && valorAprendiz !== null) {
        const diferenca = Math.abs((valorEstoquista as number) - (valorAprendiz as number))
        updateData.diferenca = diferenca
        updateData.status = diferenca <= 0.01 ? 'sucesso' : 'falhou'
        updateData.validated_at = new Date().toISOString()
        validationComplete = true
        hasDivergence = diferenca > 0.01
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('cross_validations')
        .update(updateData)
        .eq('id', existingValidation.id)

      if (error) throw error

      // Se validacao completa, enviar notificacoes
      if (validationComplete && hasDivergence) {
        await notificarIntegracoes({
          id: existingValidation.id,
          numeroNota,
          loja: lojaNome,
          valorEstoquista: valorEstoquista as number | null,
          valorAprendiz: valorAprendiz as number | null,
          diferenca: updateData.diferenca as number | null,
          status: updateData.status as 'pendente' | 'sucesso' | 'falhou',
          dataHora,
        })

        console.log(`[CrossValidation] Divergência detectada na nota ${numeroNota}: R$ ${updateData.diferenca}`)
      }

    } else {
      // Não encontrou match exato - procurar por notas "irmãs"
      // Buscar validações pendentes na mesma loja nos últimos 30 minutos
      const trintaMinutosAtras = new Date(Date.now() - 30 * 60 * 1000).toISOString()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pendingValidations } = await (supabase as any)
        .from('cross_validations')
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'pendente')
        .gte('created_at', trintaMinutosAtras)
        .is(isEstoquista ? 'estoquista_checklist_id' : 'aprendiz_checklist_id', null)

      let foundSisterValidation = null
      let matchReason = ''

      if (pendingValidations && pendingValidations.length > 0) {
        for (const pendingVal of pendingValidations) {
          // Verificar se são notas "irmãs"
          const { match, reason } = verificarNotasIrmas(
            numeroNota,
            pendingVal.numero_nota,
            new Date(),
            new Date(pendingVal.created_at)
          )

          if (match) {
            foundSisterValidation = pendingVal
            matchReason = reason
            break
          }
        }
      }

      if (foundSisterValidation) {
        // Encontrou uma nota "irmã" - vincular as duas
        const updateData: Record<string, unknown> = {
          match_reason: matchReason,
        }

        if (isEstoquista) {
          updateData.estoquista_checklist_id = checklistId
          updateData.valor_estoquista = valor
        } else {
          updateData.aprendiz_checklist_id = checklistId
          updateData.valor_aprendiz = valor
        }

        // Calcular diferença se temos os dois valores
        const valorEstoquista = isEstoquista ? valor : foundSisterValidation.valor_estoquista
        const valorAprendiz = isAprendiz ? valor : foundSisterValidation.valor_aprendiz

        if (valorEstoquista !== null && valorAprendiz !== null) {
          const diferenca = Math.abs((valorEstoquista as number) - (valorAprendiz as number))
          updateData.diferenca = diferenca
          // Status especial para notas diferentes vinculadas
          updateData.status = 'notas_diferentes'
          updateData.validated_at = new Date().toISOString()

          // Atualizar a validação existente com os novos dados
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from('cross_validations')
            .update(updateData)
            .eq('id', foundSisterValidation.id)

          if (error) throw error

          // Criar uma validação secundária para a nova nota
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: newValidation, error: insertError } = await (supabase as any)
            .from('cross_validations')
            .insert({
              store_id: storeId,
              numero_nota: numeroNota,
              estoquista_checklist_id: isEstoquista ? checklistId : null,
              aprendiz_checklist_id: isAprendiz ? checklistId : null,
              valor_estoquista: isEstoquista ? valor : null,
              valor_aprendiz: isAprendiz ? valor : null,
              status: 'notas_diferentes',
              linked_validation_id: foundSisterValidation.id,
              match_reason: matchReason,
              is_primary: false,
            })
            .select()
            .single()

          if (insertError) throw insertError

          // Atualizar a validação original para apontar para a nova
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('cross_validations')
            .update({ linked_validation_id: newValidation.id })
            .eq('id', foundSisterValidation.id)

          // Notificar sobre notas diferentes vinculadas
          await notificarIntegracoes({
            id: foundSisterValidation.id,
            numeroNota: foundSisterValidation.numero_nota,
            numeroNotaVinculada: numeroNota,
            loja: lojaNome,
            valorEstoquista: valorEstoquista as number | null,
            valorAprendiz: valorAprendiz as number | null,
            diferenca: updateData.diferenca as number | null,
            status: 'notas_diferentes',
            dataHora,
            matchReason,
          })

          console.log(`[CrossValidation] Notas diferentes vinculadas: ${foundSisterValidation.numero_nota} <-> ${numeroNota}`)
        }
      } else {
        // Criar nova validacao (sem match)
        const insertData: Record<string, unknown> = {
          store_id: storeId,
          numero_nota: numeroNota,
          status: 'pendente',
          is_primary: true,
        }

        if (isEstoquista) {
          insertData.estoquista_checklist_id = checklistId
          insertData.valor_estoquista = valor
        } else {
          insertData.aprendiz_checklist_id = checklistId
          insertData.valor_aprendiz = valor
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('cross_validations')
          .insert(insertData)

        if (error) throw error
      }
    }

    return { success: true }
  } catch (err) {
    console.error('Erro ao processar validacao cruzada:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido'
    }
  }
}
