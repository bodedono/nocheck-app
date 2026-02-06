'use client'

import { useState, useRef } from 'react'
import type { TemplateField, GPSValue, SignatureValue } from '@/types/database'
import {
  FiCamera,
  FiMapPin,
  FiX,
} from 'react-icons/fi'

interface FieldRendererProps {
  field: TemplateField
  value: unknown
  onChange: (value: unknown) => void
  error?: string
}

export function FieldRenderer({ field, value, onChange, error }: FieldRendererProps) {
  const renderField = () => {
    switch (field.field_type) {
      case 'text':
        return <TextField field={field} value={value as string} onChange={onChange} />
      case 'number':
        return <NumberField field={field} value={value as number} onChange={onChange} />
      case 'photo':
        return <PhotoField field={field} value={value as string[]} onChange={onChange} />
      case 'dropdown':
        return <DropdownField field={field} value={value as string} onChange={onChange} />
      case 'signature':
        return <SignatureField field={field} value={value as SignatureValue} onChange={onChange} />
      case 'datetime':
        return <DateTimeField field={field} value={value as string} onChange={onChange} />
      case 'checkbox_multiple':
        return <CheckboxMultipleField field={field} value={value as string[]} onChange={onChange} />
      case 'gps':
        return <GPSField field={field} value={value as GPSValue} onChange={onChange} />
      case 'barcode':
        return <BarcodeField field={field} value={value as string} onChange={onChange} />
      case 'calculated':
        return <CalculatedField field={field} value={value as number} />
      default:
        return <p className="text-red-400">Campo não suportado: {field.field_type}</p>
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2">
        <span className="font-medium text-main">{field.name}</span>
        {field.is_required && <span className="text-red-400">*</span>}
      </label>
      {field.help_text && (
        <p className="text-sm text-muted">{field.help_text}</p>
      )}
      {renderField()}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

// Text Field
function TextField({ field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || ''}
      className="input w-full px-4 py-3 rounded-xl"
    />
  )
}

// Number Field
function NumberField({ field, value, onChange }: { field: TemplateField; value: number; onChange: (v: number) => void }) {
  const [displayValue, setDisplayValue] = useState(value ? value.toString() : '')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d.,]/g, '')
    setDisplayValue(raw)
    const numValue = parseFloat(raw.replace(',', '.')) || 0
    onChange(numValue)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      placeholder={field.placeholder || '0,00'}
      className="input w-full px-4 py-3 rounded-xl"
    />
  )
}

// Photo Field
function PhotoField({ field, value, onChange }: { field: TemplateField; value: string[]; onChange: (v: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const photos = value || []

  const [compressing, setCompressing] = useState(false)

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    setCompressing(true)
    const newPhotos: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        // Compress image to max 1200px width and 70% quality
        const compressed = await compressImage(file, 1200, 0.7)
        newPhotos.push(compressed)
      } catch (err) {
        console.error('Error compressing image:', err)
      }
    }

    onChange([...photos, ...newPhotos])
    setCompressing(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const removePhoto = (index: number) => {
    onChange(photos.filter((_, i) => i !== index))
  }

  const compressImage = (file: File, maxWidth = 1200, quality = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (e) => {
        const img = new Image()
        img.src = e.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          // Resize if too large
          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Could not get canvas context'))
            return
          }

          ctx.drawImage(img, 0, 0, width, height)
          const compressed = canvas.toDataURL('image/jpeg', quality)
          resolve(compressed)
        }
        img.onerror = reject
      }
      reader.onerror = reject
    })
  }

  const maxPhotos = (field.options as { maxPhotos?: number } | null)?.maxPhotos || 3

  return (
    <div className="space-y-3">
      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Capture Button */}
      {photos.length < maxPhotos && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={compressing}
          className="w-full py-4 border-2 border-dashed border-default hover:border-primary rounded-xl text-secondary hover:text-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {compressing ? (
            <>
              <div className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
              <span>Processando...</span>
            </>
          ) : (
            <>
              <FiCamera className="w-5 h-5" />
              <span>Tirar Foto ({photos.length}/{maxPhotos})</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />
    </div>
  )
}

// Dropdown Field
function DropdownField({ field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  const options = (field.options as string[] | null) || []

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="input w-full px-4 py-3 rounded-xl"
    >
      <option value="">Selecione...</option>
      {options.map((opt, i) => (
        <option key={i} value={opt}>{opt}</option>
      ))}
    </select>
  )
}

// Signature Field
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SignatureField({ field: _field, value, onChange }: { field: TemplateField; value: SignatureValue; onChange: (v: SignatureValue | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(!!value?.dataUrl)

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top

    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top

    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'var(--color-primary)'
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSignature(true)
  }

  const endDrawing = () => {
    setIsDrawing(false)
    if (hasSignature && canvasRef.current) {
      onChange({
        dataUrl: canvasRef.current.toDataURL(),
        timestamp: new Date().toISOString(),
      })
    }
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="relative border border-default rounded-xl overflow-hidden bg-surface">
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
          className="w-full touch-none"
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-muted">Assine aqui</span>
          </div>
        )}
      </div>
      {hasSignature && (
        <button
          type="button"
          onClick={clearSignature}
          className="text-sm text-red-400 hover:text-red-300"
        >
          Limpar assinatura
        </button>
      )}
    </div>
  )
}

// DateTime Field
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DateTimeField({ field: _field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="datetime-local"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="input w-full px-4 py-3 rounded-xl"
    />
  )
}

// Checkbox Multiple Field
function CheckboxMultipleField({ field, value, onChange }: { field: TemplateField; value: string[]; onChange: (v: string[]) => void }) {
  const options = (field.options as string[] | null) || []
  const selected = value || []

  const toggleOption = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter(s => s !== opt))
    } else {
      onChange([...selected, opt])
    }
  }

  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <label
          key={i}
          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
            selected.includes(opt)
              ? 'border-primary bg-primary/10'
              : 'border-subtle bg-surface hover:bg-surface/80'
          }`}
        >
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggleOption(opt)}
            className="w-5 h-5 rounded border-default bg-surface text-primary focus:ring-primary"
          />
          <span className={selected.includes(opt) ? 'text-main' : 'text-secondary'}>{opt}</span>
        </label>
      ))}
    </div>
  )
}

// GPS Field
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GPSField({ field: _field, value, onChange }: { field: TemplateField; value: GPSValue; onChange: (v: GPSValue) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const captureLocation = async () => {
    if (!navigator.geolocation) {
      setError('GPS não suportado neste dispositivo')
      return
    }

    setLoading(true)
    setError(null)

    // Solicita permissão explicitamente se a API estiver disponível
    if (navigator.permissions) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' })
        if (permission.state === 'denied') {
          setError('Permissão de localização negada. Vá nas configurações do navegador e permita o acesso à localização para este site.')
          setLoading(false)
          return
        }
      } catch {
        // Algumas versões não suportam permissions.query para geolocation
      }
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date().toISOString(),
        })
        setLoading(false)
      },
      (err) => {
        if (err.code === 1) {
          setError('Permissão de localização negada. Toque no ícone de cadeado na barra de endereço e permita "Localização".')
        } else if (err.code === 2) {
          setError('Não foi possível obter a localização. Verifique se o GPS está ativado.')
        } else if (err.code === 3) {
          setError('Tempo esgotado ao obter localização. Tente novamente.')
        } else {
          setError(`Erro ao obter localização: ${err.message}`)
        }
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  return (
    <div className="space-y-3">
      {value ? (
        <div className="p-4 bg-primary/10 border border-primary/30 rounded-xl">
          <div className="flex items-center gap-2 text-primary mb-2">
            <FiMapPin className="w-4 h-4" />
            <span className="font-medium">Localização capturada</span>
          </div>
          <p className="text-sm text-secondary">
            Lat: {value.latitude.toFixed(6)}, Lng: {value.longitude.toFixed(6)}
          </p>
          <p className="text-xs text-muted mt-1">
            Precisão: {value.accuracy.toFixed(0)}m
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={captureLocation}
          disabled={loading}
          className="w-full py-4 border-2 border-dashed border-default hover:border-primary rounded-xl text-secondary hover:text-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
              <span>Obtendo localização...</span>
            </>
          ) : (
            <>
              <FiMapPin className="w-5 h-5" />
              <span>Capturar Localização</span>
            </>
          )}
        </button>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

// Barcode Field
function BarcodeField({ field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  // Simplified version - in real app would use @zxing/browser
  return (
    <div className="space-y-3">
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || 'Digite ou escaneie o código'}
        className="input w-full px-4 py-3 rounded-xl"
      />
      <p className="text-xs text-muted">
        Escaneamento de código de barras disponível apenas no app mobile
      </p>
    </div>
  )
}

// Calculated Field (read-only)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CalculatedField({ field: _field, value }: { field: TemplateField; value: number }) {
  return (
    <div className="px-4 py-3 bg-surface border border-default rounded-xl text-main">
      {value !== undefined && value !== null ? value.toFixed(2) : '-'}
      <span className="text-xs text-muted ml-2">(calculado automaticamente)</span>
    </div>
  )
}
