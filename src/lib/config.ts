// ============================================
// CONFIGURACAO CENTRALIZADA DO APP
// Altere aqui para mudar em todo o projeto
// ============================================

export const APP_CONFIG = {
  // Informacoes do App
  name: 'NoCheck',
  fullName: 'NoCheck - Sistema de Checklists',
  description: 'Sistema de checklists do Grupo Do No',
  version: '2.0.0',
  company: 'Grupo Do No',
  year: new Date().getFullYear(),

  // Rotas
  routes: {
    home: '/',
    login: '/login',
    dashboard: '/dashboard',
    admin: '/admin',
    adminUsers: '/admin/usuarios',
    adminUsersNew: '/admin/usuarios/novo',
    adminTemplates: '/admin/templates',
    adminTemplatesNew: '/admin/templates/novo',
    adminStores: '/admin/lojas',
    adminSectors: '/admin/setores',
    adminFunctions: '/admin/funcoes',
    adminReports: '/admin/relatorios',
    adminValidations: '/admin/validacoes',
    adminChecklists: '/admin/checklists',
    adminGallery: '/admin/galeria',
    checklistNew: '/checklist/novo',
  },

  // Mensagens padrao
  messages: {
    loading: 'Carregando...',
    error: 'Ocorreu um erro. Tente novamente.',
    noStores: 'Nenhuma loja atribuida',
    noStoresHint: 'Entre em contato com o administrador para ter acesso a uma loja.',
    noChecklists: 'Nenhum checklist disponivel para seu cargo nesta loja.',
    loginRequired: 'Voce precisa estar logado',
    checklistSent: 'Checklist Enviado!',
    redirecting: 'Redirecionando...',
    loginError: 'Email ou senha incorretos',
    loginErrorGeneric: 'Erro ao fazer login. Tente novamente.',
  },

  // Configuracoes de storage
  storage: {
    themeKey: 'nocheck-theme',
  },

  // Categorias de templates
  templateCategories: [
    { value: 'recebimento', label: 'Recebimento' },
    { value: 'limpeza', label: 'Limpeza' },
    { value: 'abertura', label: 'Abertura' },
    { value: 'fechamento', label: 'Fechamento' },
    { value: 'outros', label: 'Outros' },
  ],

  // Roles de usuarios
  userRoles: [
    { value: 'estoquista', label: 'Estoquista' },
    { value: 'aprendiz', label: 'Aprendiz' },
    { value: 'supervisor', label: 'Supervisor' },
  ],
} as const

// Tipos para autocomplete
export type AppConfig = typeof APP_CONFIG
