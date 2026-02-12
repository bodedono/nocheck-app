'use client'

import { useState } from 'react'
import { FiAlertTriangle, FiChevronDown, FiChevronUp, FiTrash2 } from 'react-icons/fi'
import type { ConditionType, Severity } from '@/types/database'

export type ConditionConfig = {
  enabled: boolean
  conditionType: ConditionType
  conditionValue: Record<string, unknown>
  severity: Severity
  defaultAssigneeId: string | null
  deadlineDays: number
  descriptionTemplate: string
}

type UserOption = {
  id: string
  name: string
}

type Props = {
  fieldType: string
  fieldName: string
  dropdownOptions?: string[] // opcoes do dropdown, se aplicavel
  checkboxOptions?: string[] // opcoes do checkbox_multiple, se aplicavel
  condition: ConditionConfig | null
  onChange: (condition: ConditionConfig | null) => void
  users: UserOption[]
}

const SEVERITY_OPTIONS: { value: Severity; label: string; color: string }[] = [
  { value: 'baixa', label: 'Baixa', color: 'text-success' },
  { value: 'media', label: 'Media', color: 'text-warning' },
  { value: 'alta', label: 'Alta', color: 'text-orange-500' },
  { value: 'critica', label: 'Critica', color: 'text-error' },
]

const DEFAULT_CONDITION: ConditionConfig = {
  enabled: true,
  conditionType: 'equals',
  conditionValue: {},
  severity: 'media',
  defaultAssigneeId: null,
  deadlineDays: 7,
  descriptionTemplate: '',
}

export function FieldConditionEditor({
  fieldType,
  fieldName,
  dropdownOptions = [],
  checkboxOptions = [],
  condition,
  onChange,
  users,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  const handleToggle = () => {
    if (!condition) {
      // Ativar com defaults baseados no tipo
      const defaults = { ...DEFAULT_CONDITION }
      switch (fieldType) {
        case 'yes_no':
          defaults.conditionType = 'equals'
          defaults.conditionValue = { value: 'Nao' }
          break
        case 'number':
          defaults.conditionType = 'less_than'
          defaults.conditionValue = { min: 0 }
          break
        case 'rating':
          defaults.conditionType = 'less_than'
          defaults.conditionValue = { threshold: 3 }
          break
        case 'dropdown':
          defaults.conditionType = 'in_list'
          defaults.conditionValue = { values: [] }
          break
        case 'checkbox_multiple':
          defaults.conditionType = 'in_list'
          defaults.conditionValue = { required: [], forbidden: [] }
          break
        case 'text':
          defaults.conditionType = 'empty'
          defaults.conditionValue = {}
          break
      }
      defaults.descriptionTemplate = `Nao conformidade: ${fieldName} - {store_name}`
      onChange(defaults)
      setExpanded(true)
    } else {
      setExpanded(!expanded)
    }
  }

  const handleRemove = () => {
    onChange(null)
    setExpanded(false)
  }

  const update = (partial: Partial<ConditionConfig>) => {
    if (!condition) return
    onChange({ ...condition, ...partial })
  }

  // Tipos de campo suportados para condicoes
  const supportedTypes = ['yes_no', 'number', 'rating', 'dropdown', 'checkbox_multiple', 'text']
  if (!supportedTypes.includes(fieldType)) return null

  return (
    <div className="border-t border-subtle pt-3 mt-3">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-2 text-sm font-medium w-full"
      >
        <FiAlertTriangle className={`w-4 h-4 ${condition ? 'text-warning' : 'text-muted'}`} />
        <span className={condition ? 'text-warning' : 'text-muted'}>
          Condicao de Nao Conformidade
        </span>
        {condition && (
          <span className="text-xs text-success bg-success/10 px-2 py-0.5 rounded-full">
            Ativa
          </span>
        )}
        <span className="ml-auto">
          {expanded ? <FiChevronUp className="w-4 h-4 text-muted" /> : <FiChevronDown className="w-4 h-4 text-muted" />}
        </span>
      </button>

      {expanded && condition && (
        <div className="mt-3 space-y-4 p-4 bg-warning/5 rounded-xl border border-warning/20">
          {/* Condicao especifica por tipo */}
          {fieldType === 'yes_no' && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                Valor que indica nao conformidade
              </label>
              <select
                value={(condition.conditionValue.value as string) || 'Nao'}
                onChange={(e) => update({
                  conditionType: 'equals',
                  conditionValue: { value: e.target.value },
                })}
                className="input"
              >
                <option value="Nao">Quando resposta for &quot;Nao&quot;</option>
                <option value="Sim">Quando resposta for &quot;Sim&quot;</option>
              </select>
            </div>
          )}

          {fieldType === 'number' && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                Tipo de condicao
              </label>
              <select
                value={condition.conditionType}
                onChange={(e) => {
                  const ct = e.target.value as ConditionType
                  update({
                    conditionType: ct,
                    conditionValue: ct === 'between' ? { min: 0, max: 100 } : ct === 'less_than' ? { min: 0 } : { max: 100 },
                  })
                }}
                className="input mb-2"
              >
                <option value="less_than">Menor que (valor minimo)</option>
                <option value="greater_than">Maior que (valor maximo)</option>
                <option value="between">Fora da faixa (min-max)</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                {(condition.conditionType === 'less_than' || condition.conditionType === 'between') && (
                  <div>
                    <label className="block text-xs text-muted mb-1">Minimo</label>
                    <input
                      type="number"
                      value={(condition.conditionValue.min as number) ?? 0}
                      onChange={(e) => update({
                        conditionValue: { ...condition.conditionValue, min: Number(e.target.value) },
                      })}
                      className="input"
                    />
                  </div>
                )}
                {(condition.conditionType === 'greater_than' || condition.conditionType === 'between') && (
                  <div>
                    <label className="block text-xs text-muted mb-1">Maximo</label>
                    <input
                      type="number"
                      value={(condition.conditionValue.max as number) ?? 100}
                      onChange={(e) => update({
                        conditionValue: { ...condition.conditionValue, max: Number(e.target.value) },
                      })}
                      className="input"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {fieldType === 'rating' && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                Nao conforme quando menor que (estrelas)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={(condition.conditionValue.threshold as number) ?? 3}
                onChange={(e) => update({
                  conditionType: 'less_than',
                  conditionValue: { threshold: Number(e.target.value) },
                })}
                className="input w-24"
              />
              <p className="text-xs text-muted mt-1">
                Se a nota for menor que {(condition.conditionValue.threshold as number) ?? 3} estrelas, sera considerado nao conforme.
              </p>
            </div>
          )}

          {fieldType === 'dropdown' && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                Valores que indicam nao conformidade
              </label>
              {dropdownOptions.length === 0 ? (
                <p className="text-xs text-muted italic">Adicione opcoes ao dropdown primeiro.</p>
              ) : (
                <div className="space-y-1.5">
                  {dropdownOptions.map((opt) => {
                    const selected = ((condition.conditionValue.values as string[]) || []).includes(opt)
                    return (
                      <label key={opt} className="flex items-center gap-2 text-sm text-main cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const current = (condition.conditionValue.values as string[]) || []
                            const newValues = e.target.checked
                              ? [...current, opt]
                              : current.filter(v => v !== opt)
                            update({
                              conditionType: 'in_list',
                              conditionValue: { values: newValues },
                            })
                          }}
                          className="rounded border-subtle"
                        />
                        {opt}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {fieldType === 'checkbox_multiple' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Itens obrigatorios (nao conforme se NAO marcado)
                </label>
                {checkboxOptions.length === 0 ? (
                  <p className="text-xs text-muted italic">Adicione opcoes ao checkbox primeiro.</p>
                ) : (
                  <div className="space-y-1.5">
                    {checkboxOptions.map((opt) => {
                      const selected = ((condition.conditionValue.required as string[]) || []).includes(opt)
                      return (
                        <label key={`req-${opt}`} className="flex items-center gap-2 text-sm text-main cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              const current = (condition.conditionValue.required as string[]) || []
                              const newReq = e.target.checked
                                ? [...current, opt]
                                : current.filter(v => v !== opt)
                              update({
                                conditionValue: { ...condition.conditionValue, required: newReq },
                              })
                            }}
                            className="rounded border-subtle"
                          />
                          {opt}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Itens proibidos (nao conforme se marcado)
                </label>
                {checkboxOptions.map((opt) => {
                  const selected = ((condition.conditionValue.forbidden as string[]) || []).includes(opt)
                  return (
                    <label key={`forb-${opt}`} className="flex items-center gap-2 text-sm text-main cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          const current = (condition.conditionValue.forbidden as string[]) || []
                          const newForb = e.target.checked
                            ? [...current, opt]
                            : current.filter(v => v !== opt)
                          update({
                            conditionValue: { ...condition.conditionValue, forbidden: newForb },
                          })
                        }}
                        className="rounded border-subtle"
                      />
                      {opt}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {fieldType === 'text' && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                Tipo de condicao
              </label>
              <select
                value={condition.conditionType}
                onChange={(e) => {
                  const ct = e.target.value as ConditionType
                  update({ conditionType: ct, conditionValue: ct === 'empty' ? {} : { value: '' } })
                }}
                className="input"
              >
                <option value="empty">Campo vazio</option>
                <option value="equals">Igual a valor especifico</option>
                <option value="not_equals">Diferente de valor especifico</option>
              </select>
              {(condition.conditionType === 'equals' || condition.conditionType === 'not_equals') && (
                <input
                  type="text"
                  value={(condition.conditionValue.value as string) || ''}
                  onChange={(e) => update({ conditionValue: { value: e.target.value } })}
                  className="input mt-2"
                  placeholder="Valor para comparacao"
                />
              )}
            </div>
          )}

          {/* Campos comuns */}
          <div className="border-t border-subtle pt-3 mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Severidade</label>
                <select
                  value={condition.severity}
                  onChange={(e) => update({ severity: e.target.value as Severity })}
                  className="input"
                >
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Prazo (dias)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={condition.deadlineDays}
                  onChange={(e) => update({ deadlineDays: Number(e.target.value) || 7 })}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Responsavel padrao</label>
              <select
                value={condition.defaultAssigneeId || ''}
                onChange={(e) => update({ defaultAssigneeId: e.target.value || null })}
                className="input"
              >
                <option value="">Quem preencheu o checklist</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted mt-1">
                Se nao selecionado, o plano sera atribuido ao usuario que preencheu o checklist.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Descricao do plano</label>
              <textarea
                value={condition.descriptionTemplate}
                onChange={(e) => update({ descriptionTemplate: e.target.value })}
                className="input min-h-[60px]"
                placeholder="Ex: Nao conformidade: {field_name} com valor {value} na {store_name}"
                rows={2}
              />
              <p className="text-xs text-muted mt-1">
                Variaveis: {'{field_name}'}, {'{value}'}, {'{store_name}'}
              </p>
            </div>
          </div>

          {/* Remover condicao */}
          <button
            type="button"
            onClick={handleRemove}
            className="flex items-center gap-2 text-sm text-error hover:text-error/80 transition-colors"
          >
            <FiTrash2 className="w-3.5 h-3.5" />
            Remover condicao
          </button>
        </div>
      )}
    </div>
  )
}
