export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      stores: {
        Row: {
          id: number
          name: string
          cnpj: string | null
          address: string | null
          latitude: number | null
          longitude: number | null
          require_gps: boolean
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: number
          name: string
          cnpj?: string | null
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          require_gps?: boolean
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          name?: string
          cnpj?: string | null
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          require_gps?: boolean
          is_active?: boolean
          created_at?: string
        }
      }
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          phone: string | null
          avatar_url: string | null
          is_active: boolean
          is_admin: boolean
          store_id: number | null
          function_id: number | null
          sector_id: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          phone?: string | null
          avatar_url?: string | null
          is_active?: boolean
          is_admin?: boolean
          store_id?: number | null
          function_id?: number | null
          sector_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          phone?: string | null
          avatar_url?: string | null
          is_active?: boolean
          is_admin?: boolean
          store_id?: number | null
          function_id?: number | null
          sector_id?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      user_store_roles: {
        Row: {
          id: number
          user_id: string
          store_id: number
          role: UserRole
          assigned_by: string | null
          assigned_at: string
        }
        Insert: {
          id?: number
          user_id: string
          store_id: number
          role: UserRole
          assigned_by?: string | null
          assigned_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          store_id?: number
          role?: UserRole
          assigned_by?: string | null
          assigned_at?: string
        }
      }
      checklist_templates: {
        Row: {
          id: number
          name: string
          description: string | null
          category: TemplateCategory | null
          version: number
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          name: string
          description?: string | null
          category?: TemplateCategory | null
          version?: number
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          name?: string
          description?: string | null
          category?: TemplateCategory | null
          version?: number
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      template_fields: {
        Row: {
          id: number
          template_id: number
          section_id: number | null
          name: string
          field_type: FieldType
          is_required: boolean
          sort_order: number | null
          options: Json | null
          validation: Json | null
          calculation: Json | null
          placeholder: string | null
          help_text: string | null
        }
        Insert: {
          id?: number
          template_id: number
          section_id?: number | null
          name: string
          field_type: FieldType
          is_required?: boolean
          sort_order?: number | null
          options?: Json | null
          validation?: Json | null
          calculation?: Json | null
          placeholder?: string | null
          help_text?: string | null
        }
        Update: {
          id?: number
          template_id?: number
          section_id?: number | null
          name?: string
          field_type?: FieldType
          is_required?: boolean
          sort_order?: number | null
          options?: Json | null
          validation?: Json | null
          calculation?: Json | null
          placeholder?: string | null
          help_text?: string | null
        }
      }
      template_visibility: {
        Row: {
          id: number
          template_id: number
          store_id: number
          sector_id: number | null
          function_id: number | null
          roles: UserRole[]
          assigned_by: string | null
          assigned_at: string
        }
        Insert: {
          id?: number
          template_id: number
          store_id: number
          sector_id?: number | null
          function_id?: number | null
          roles: UserRole[]
          assigned_by?: string | null
          assigned_at?: string
        }
        Update: {
          id?: number
          template_id?: number
          store_id?: number
          sector_id?: number | null
          function_id?: number | null
          roles?: UserRole[]
          assigned_by?: string | null
          assigned_at?: string
        }
      }
      checklists: {
        Row: {
          id: number
          template_id: number
          store_id: number
          sector_id: number | null
          status: ChecklistStatus
          created_by: string
          started_at: string | null
          completed_at: string | null
          validated_by: string | null
          validated_at: string | null
          latitude: number | null
          longitude: number | null
          accuracy: number | null
          sync_status: SyncStatus
          local_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          template_id: number
          store_id: number
          sector_id?: number | null
          status?: ChecklistStatus
          created_by: string
          started_at?: string | null
          completed_at?: string | null
          validated_by?: string | null
          validated_at?: string | null
          latitude?: number | null
          longitude?: number | null
          accuracy?: number | null
          sync_status?: SyncStatus
          local_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          template_id?: number
          store_id?: number
          sector_id?: number | null
          status?: ChecklistStatus
          created_by?: string
          started_at?: string | null
          completed_at?: string | null
          validated_by?: string | null
          validated_at?: string | null
          latitude?: number | null
          longitude?: number | null
          accuracy?: number | null
          sync_status?: SyncStatus
          local_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      checklist_responses: {
        Row: {
          id: number
          checklist_id: number
          field_id: number
          value_text: string | null
          value_number: number | null
          value_json: Json | null
          answered_by: string | null
          answered_at: string
        }
        Insert: {
          id?: number
          checklist_id: number
          field_id: number
          value_text?: string | null
          value_number?: number | null
          value_json?: Json | null
          answered_by?: string | null
          answered_at?: string
        }
        Update: {
          id?: number
          checklist_id?: number
          field_id?: number
          value_text?: string | null
          value_number?: number | null
          value_json?: Json | null
          answered_by?: string | null
          answered_at?: string
        }
      }
      attachments: {
        Row: {
          id: number
          response_id: number
          file_name: string
          file_type: string | null
          file_size: number | null
          storage_provider: StorageProvider
          storage_path: string
          storage_url: string | null
          uploaded_by: string | null
          uploaded_at: string
        }
        Insert: {
          id?: number
          response_id: number
          file_name: string
          file_type?: string | null
          file_size?: number | null
          storage_provider?: StorageProvider
          storage_path: string
          storage_url?: string | null
          uploaded_by?: string | null
          uploaded_at?: string
        }
        Update: {
          id?: number
          response_id?: number
          file_name?: string
          file_type?: string | null
          file_size?: number | null
          storage_provider?: StorageProvider
          storage_path?: string
          storage_url?: string | null
          uploaded_by?: string | null
          uploaded_at?: string
        }
      }
      activity_log: {
        Row: {
          id: number
          store_id: number | null
          user_id: string | null
          checklist_id: number | null
          action: string
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          store_id?: number | null
          user_id?: string | null
          checklist_id?: number | null
          action: string
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: number
          store_id?: number | null
          user_id?: string | null
          checklist_id?: number | null
          action?: string
          details?: Json | null
          created_at?: string
        }
      }
      app_settings: {
        Row: {
          key: string
          value: string
          description: string | null
          updated_at: string
        }
        Insert: {
          key: string
          value: string
          description?: string | null
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          description?: string | null
          updated_at?: string
        }
      }
      cross_validations: {
        Row: {
          id: number
          store_id: number
          numero_nota: string
          estoquista_checklist_id: number | null
          aprendiz_checklist_id: number | null
          valor_estoquista: number | null
          valor_aprendiz: number | null
          diferenca: number | null
          status: ValidationStatus | null
          validated_at: string | null
          created_at: string
          linked_validation_id: number | null
          match_reason: string | null
          is_primary: boolean
          sector_id: number | null
        }
        Insert: {
          id?: number
          store_id: number
          numero_nota: string
          estoquista_checklist_id?: number | null
          aprendiz_checklist_id?: number | null
          valor_estoquista?: number | null
          valor_aprendiz?: number | null
          diferenca?: number | null
          status?: ValidationStatus | null
          validated_at?: string | null
          created_at?: string
          linked_validation_id?: number | null
          match_reason?: string | null
          is_primary?: boolean
          sector_id?: number | null
        }
        Update: {
          id?: number
          store_id?: number
          numero_nota?: string
          estoquista_checklist_id?: number | null
          aprendiz_checklist_id?: number | null
          valor_estoquista?: number | null
          valor_aprendiz?: number | null
          diferenca?: number | null
          status?: ValidationStatus | null
          validated_at?: string | null
          created_at?: string
          linked_validation_id?: number | null
          match_reason?: string | null
          is_primary?: boolean
          sector_id?: number | null
        }
      }
      // ============================================
      // NOVAS TABELAS - FUNÇÕES
      // ============================================
      functions: {
        Row: {
          id: number
          name: string
          description: string | null
          color: string
          icon: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: number
          name: string
          description?: string | null
          color?: string
          icon?: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          name?: string
          description?: string | null
          color?: string
          icon?: string
          is_active?: boolean
          created_at?: string
        }
      }
      // ============================================
      // NOVAS TABELAS - SETORES
      // ============================================
      sectors: {
        Row: {
          id: number
          store_id: number
          name: string
          description: string | null
          color: string
          icon: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: number
          store_id: number
          name: string
          description?: string | null
          color?: string
          icon?: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          store_id?: number
          name?: string
          description?: string | null
          color?: string
          icon?: string
          is_active?: boolean
          created_at?: string
        }
      }
      user_sectors: {
        Row: {
          id: number
          user_id: string
          sector_id: number
          role: SectorRole
          assigned_by: string | null
          assigned_at: string
        }
        Insert: {
          id?: number
          user_id: string
          sector_id: number
          role?: SectorRole
          assigned_by?: string | null
          assigned_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          sector_id?: number
          role?: SectorRole
          assigned_by?: string | null
          assigned_at?: string
        }
      }
      // ============================================
      // TABELA DE JUNÇÃO - USUÁRIO ↔ LOJAS
      // ============================================
      user_stores: {
        Row: {
          id: number
          user_id: string
          store_id: number
          sector_id: number | null
          is_primary: boolean
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          store_id: number
          sector_id?: number | null
          is_primary?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          store_id?: number
          sector_id?: number | null
          is_primary?: boolean
          created_at?: string
        }
      }
      // ============================================
      // TABELAS DE SEÇÕES DE TEMPLATES
      // ============================================
      template_sections: {
        Row: {
          id: number
          template_id: number
          name: string
          description: string | null
          sort_order: number
        }
        Insert: {
          id?: number
          template_id: number
          name: string
          description?: string | null
          sort_order?: number
        }
        Update: {
          id?: number
          template_id?: number
          name?: string
          description?: string | null
          sort_order?: number
        }
      }
      checklist_sections: {
        Row: {
          id: number
          checklist_id: number
          section_id: number
          status: string
          completed_at: string | null
        }
        Insert: {
          id?: number
          checklist_id: number
          section_id: number
          status?: string
          completed_at?: string | null
        }
        Update: {
          id?: number
          checklist_id?: number
          section_id?: number
          status?: string
          completed_at?: string | null
        }
      }
      // ============================================
      // PLANOS DE ACAO - Condicoes de campo
      // ============================================
      field_conditions: {
        Row: {
          id: number
          field_id: number
          condition_type: ConditionType
          condition_value: Json
          severity: Severity
          default_assignee_id: string | null
          deadline_days: number
          description_template: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: number
          field_id: number
          condition_type: ConditionType
          condition_value: Json
          severity?: Severity
          default_assignee_id?: string | null
          deadline_days?: number
          description_template?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          field_id?: number
          condition_type?: ConditionType
          condition_value?: Json
          severity?: Severity
          default_assignee_id?: string | null
          deadline_days?: number
          description_template?: string | null
          is_active?: boolean
          created_at?: string
        }
      }
      // ============================================
      // PLANOS DE ACAO
      // ============================================
      action_plans: {
        Row: {
          id: number
          checklist_id: number | null
          field_id: number | null
          field_condition_id: number | null
          response_id: number | null
          template_id: number | null
          store_id: number
          sector_id: number | null
          title: string
          description: string | null
          severity: Severity
          status: ActionPlanStatus
          assigned_to: string
          assigned_by: string | null
          deadline: string
          started_at: string | null
          completed_at: string | null
          is_reincidencia: boolean
          reincidencia_count: number
          parent_action_plan_id: number | null
          non_conformity_value: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          checklist_id?: number | null
          field_id?: number | null
          field_condition_id?: number | null
          response_id?: number | null
          template_id?: number | null
          store_id: number
          sector_id?: number | null
          title: string
          description?: string | null
          severity?: Severity
          status?: ActionPlanStatus
          assigned_to: string
          assigned_by?: string | null
          deadline: string
          started_at?: string | null
          completed_at?: string | null
          is_reincidencia?: boolean
          reincidencia_count?: number
          parent_action_plan_id?: number | null
          non_conformity_value?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          checklist_id?: number | null
          field_id?: number | null
          field_condition_id?: number | null
          response_id?: number | null
          template_id?: number | null
          store_id?: number
          sector_id?: number | null
          title?: string
          description?: string | null
          severity?: Severity
          status?: ActionPlanStatus
          assigned_to?: string
          assigned_by?: string | null
          deadline?: string
          started_at?: string | null
          completed_at?: string | null
          is_reincidencia?: boolean
          reincidencia_count?: number
          parent_action_plan_id?: number | null
          non_conformity_value?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      // ============================================
      // ATUALIZACOES DE PLANOS DE ACAO
      // ============================================
      action_plan_updates: {
        Row: {
          id: number
          action_plan_id: number
          user_id: string
          update_type: 'comment' | 'status_change' | 'evidence' | 'reassign'
          content: string | null
          old_status: string | null
          new_status: string | null
          created_at: string
        }
        Insert: {
          id?: number
          action_plan_id: number
          user_id: string
          update_type: 'comment' | 'status_change' | 'evidence' | 'reassign'
          content?: string | null
          old_status?: string | null
          new_status?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          action_plan_id?: number
          user_id?: string
          update_type?: 'comment' | 'status_change' | 'evidence' | 'reassign'
          content?: string | null
          old_status?: string | null
          new_status?: string | null
          created_at?: string
        }
      }
      // ============================================
      // EVIDENCIAS DE PLANOS DE ACAO
      // ============================================
      action_plan_evidence: {
        Row: {
          id: number
          action_plan_id: number
          update_id: number | null
          file_name: string
          file_type: string | null
          file_size: number | null
          storage_path: string
          storage_url: string | null
          uploaded_by: string | null
          uploaded_at: string
        }
        Insert: {
          id?: number
          action_plan_id: number
          update_id?: number | null
          file_name: string
          file_type?: string | null
          file_size?: number | null
          storage_path: string
          storage_url?: string | null
          uploaded_by?: string | null
          uploaded_at?: string
        }
        Update: {
          id?: number
          action_plan_id?: number
          update_id?: number | null
          file_name?: string
          file_type?: string | null
          file_size?: number | null
          storage_path?: string
          storage_url?: string | null
          uploaded_by?: string | null
          uploaded_at?: string
        }
      }
      // ============================================
      // NOTIFICACOES IN-APP
      // ============================================
      notifications: {
        Row: {
          id: number
          user_id: string
          type: NotificationType
          title: string
          message: string | null
          link: string | null
          is_read: boolean
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          type: NotificationType
          title: string
          message?: string | null
          link?: string | null
          is_read?: boolean
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          type?: NotificationType
          title?: string
          message?: string | null
          link?: string | null
          is_read?: boolean
          metadata?: Json | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Enum types
export type UserRole = 'estoquista' | 'aprendiz' | 'supervisor'
export type SectorRole = 'member' | 'viewer' // member = pode preencher, viewer = só visualiza
export type TemplateCategory = 'recebimento' | 'limpeza' | 'abertura' | 'fechamento' | 'outros'
export type FieldType =
  | 'text'
  | 'number'
  | 'photo'
  | 'dropdown'
  | 'signature'
  | 'datetime'
  | 'checkbox_multiple'
  | 'gps'
  | 'barcode'
  | 'calculated'
  | 'yes_no'
  | 'rating'
export type ChecklistStatus = 'rascunho' | 'em_andamento' | 'concluido' | 'validado'
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict'
export type StorageProvider = 'google_drive' | 'supabase'
export type ValidationStatus = 'pendente' | 'sucesso' | 'falhou' | 'notas_diferentes' | 'expirado'

// Planos de Acao enums
export type ConditionType = 'equals' | 'not_equals' | 'less_than' | 'greater_than' | 'between' | 'in_list' | 'not_in_list' | 'empty'
export type Severity = 'baixa' | 'media' | 'alta' | 'critica'
export type ActionPlanStatus = 'aberto' | 'em_andamento' | 'concluido' | 'vencido' | 'cancelado'
export type NotificationType =
  | 'action_plan_created'
  | 'action_plan_assigned'
  | 'action_plan_deadline'
  | 'action_plan_overdue'
  | 'action_plan_completed'
  | 'action_plan_comment'
  | 'reincidencia_detected'
  | 'validation_divergence'

// Helper types for easier usage
export type Store = Database['public']['Tables']['stores']['Row']
export type StoreInsert = Database['public']['Tables']['stores']['Insert']
export type StoreUpdate = Database['public']['Tables']['stores']['Update']

export type User = Database['public']['Tables']['users']['Row']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type UserUpdate = Database['public']['Tables']['users']['Update']

export type UserStoreRole = Database['public']['Tables']['user_store_roles']['Row']
export type UserStoreRoleInsert = Database['public']['Tables']['user_store_roles']['Insert']
export type UserStoreRoleUpdate = Database['public']['Tables']['user_store_roles']['Update']

export type ChecklistTemplate = Database['public']['Tables']['checklist_templates']['Row']
export type ChecklistTemplateInsert = Database['public']['Tables']['checklist_templates']['Insert']
export type ChecklistTemplateUpdate = Database['public']['Tables']['checklist_templates']['Update']

export type TemplateField = Database['public']['Tables']['template_fields']['Row']
export type TemplateFieldInsert = Database['public']['Tables']['template_fields']['Insert']
export type TemplateFieldUpdate = Database['public']['Tables']['template_fields']['Update']

export type TemplateVisibility = Database['public']['Tables']['template_visibility']['Row']
export type TemplateVisibilityInsert = Database['public']['Tables']['template_visibility']['Insert']
export type TemplateVisibilityUpdate = Database['public']['Tables']['template_visibility']['Update']

export type Checklist = Database['public']['Tables']['checklists']['Row']
export type ChecklistInsert = Database['public']['Tables']['checklists']['Insert']
export type ChecklistUpdate = Database['public']['Tables']['checklists']['Update']

export type ChecklistResponse = Database['public']['Tables']['checklist_responses']['Row']
export type ChecklistResponseInsert = Database['public']['Tables']['checklist_responses']['Insert']
export type ChecklistResponseUpdate = Database['public']['Tables']['checklist_responses']['Update']

export type Attachment = Database['public']['Tables']['attachments']['Row']
export type AttachmentInsert = Database['public']['Tables']['attachments']['Insert']
export type AttachmentUpdate = Database['public']['Tables']['attachments']['Update']

export type ActivityLog = Database['public']['Tables']['activity_log']['Row']
export type ActivityLogInsert = Database['public']['Tables']['activity_log']['Insert']

export type CrossValidation = Database['public']['Tables']['cross_validations']['Row']
export type CrossValidationInsert = Database['public']['Tables']['cross_validations']['Insert']
export type CrossValidationUpdate = Database['public']['Tables']['cross_validations']['Update']

// Funções
export type FunctionRow = Database['public']['Tables']['functions']['Row']
export type FunctionInsert = Database['public']['Tables']['functions']['Insert']
export type FunctionUpdate = Database['public']['Tables']['functions']['Update']

// Setores
export type Sector = Database['public']['Tables']['sectors']['Row']
export type SectorInsert = Database['public']['Tables']['sectors']['Insert']
export type SectorUpdate = Database['public']['Tables']['sectors']['Update']

export type UserSector = Database['public']['Tables']['user_sectors']['Row']
export type UserSectorInsert = Database['public']['Tables']['user_sectors']['Insert']
export type UserSectorUpdate = Database['public']['Tables']['user_sectors']['Update']

// User Stores (junção usuário ↔ lojas)
export type UserStore = Database['public']['Tables']['user_stores']['Row']
export type UserStoreInsert = Database['public']['Tables']['user_stores']['Insert']
export type UserStoreUpdate = Database['public']['Tables']['user_stores']['Update']

export type UserStoreWithDetails = UserStore & {
  store: Store
  sector: Sector | null
}

// Extended types with relations
export type UserWithRoles = User & {
  roles: (UserStoreRole & { store: Store })[]
}

// Novo modelo: usuário com loja + função + setor diretos
export type UserWithAssignment = User & {
  store: Store | null
  function_ref: FunctionRow | null
  sector: Sector | null
  user_stores?: UserStoreWithDetails[]
}

// Setor com loja
export type SectorWithStore = Sector & {
  store: Store
}

// Setor com usuários
export type SectorWithUsers = Sector & {
  store: Store
  users: (UserSector & { user: User })[]
}

export type ChecklistTemplateWithFields = ChecklistTemplate & {
  fields: TemplateField[]
  visibility: (TemplateVisibility & { store: Store; sector?: Sector | null; function_ref?: FunctionRow | null })[]
}

export type ChecklistWithResponses = Checklist & {
  template: ChecklistTemplate
  store: Store
  sector?: Sector | null
  responses: (ChecklistResponse & {
    field: TemplateField
    attachments: Attachment[]
  })[]
  created_by_user: User
}

// Field validation types
export type TextValidation = {
  minLength?: number
  maxLength?: number
  pattern?: string
}

export type NumberValidation = {
  min?: number
  max?: number
  decimals?: number
}

export type PhotoValidation = {
  minPhotos?: number
  maxPhotos?: number
  maxSizeMB?: number
}

export type DropdownOption = {
  value: string
  label: string
}

export type GPSValidation = {
  allowedRadius?: number // em metros
  referencePoint?: {
    lat: number
    lng: number
  }
}

export type CalculationConfig = {
  formula: string // ex: "field_1 + field_2"
  dependsOn: number[] // IDs dos campos
}

// GPS value type
export type GPSValue = {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: string
}

// Signature value type
export type SignatureValue = {
  dataUrl: string // base64 image
  timestamp: string
}

// Template Sections
export type TemplateSection = Database['public']['Tables']['template_sections']['Row']
export type TemplateSectionInsert = Database['public']['Tables']['template_sections']['Insert']
export type TemplateSectionUpdate = Database['public']['Tables']['template_sections']['Update']

// Checklist Sections (progresso por secao)
export type ChecklistSectionRow = Database['public']['Tables']['checklist_sections']['Row']
export type ChecklistSectionInsert = Database['public']['Tables']['checklist_sections']['Insert']
export type ChecklistSectionUpdate = Database['public']['Tables']['checklist_sections']['Update']

// ============================================
// PLANOS DE ACAO - Helper types
// ============================================
export type FieldCondition = Database['public']['Tables']['field_conditions']['Row']
export type FieldConditionInsert = Database['public']['Tables']['field_conditions']['Insert']
export type FieldConditionUpdate = Database['public']['Tables']['field_conditions']['Update']

export type ActionPlan = Database['public']['Tables']['action_plans']['Row']
export type ActionPlanInsert = Database['public']['Tables']['action_plans']['Insert']
export type ActionPlanUpdate = Database['public']['Tables']['action_plans']['Update']

export type ActionPlanUpdateRow = Database['public']['Tables']['action_plan_updates']['Row']
export type ActionPlanUpdateInsert = Database['public']['Tables']['action_plan_updates']['Insert']

export type ActionPlanEvidence = Database['public']['Tables']['action_plan_evidence']['Row']
export type ActionPlanEvidenceInsert = Database['public']['Tables']['action_plan_evidence']['Insert']

export type Notification = Database['public']['Tables']['notifications']['Row']
export type NotificationInsert = Database['public']['Tables']['notifications']['Insert']
export type NotificationUpdate = Database['public']['Tables']['notifications']['Update']

// Tipos compostos com joins
export type ActionPlanWithDetails = ActionPlan & {
  store: Store
  sector: Sector | null
  assigned_user: User
  assigned_by_user: User | null
  template: ChecklistTemplate | null
  field: TemplateField | null
}

export type FieldConditionWithField = FieldCondition & {
  field: TemplateField
}
