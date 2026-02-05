# NoCheck

Sistema de checklists para validação de recebimento de mercadorias - **Grupo Do Nô**.

PWA completo com suporte offline, validação cruzada entre estoquista e aprendiz, e integração com Google Drive e Microsoft Teams.

---

## Funcionalidades

- **PWA Offline-First** - Funciona 100% offline após primeiro acesso
- **Checklists Dinâmicos** - Templates configuráveis com diversos tipos de campos
- **Validação Cruzada** - Compara valores do estoquista vs aprendiz automaticamente
- **Matching Inteligente** - Vincula notas fiscais diferentes por proximidade temporal
- **Alertas Teams** - Notificações de divergências via Microsoft Teams
- **Multi-loja** - Suporte a 8 unidades do grupo

---

## Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Supabase** (Auth + PostgreSQL)
- **Tailwind CSS**
- **IndexedDB** (cache offline)
- **Service Worker** (PWA)
- **Microsoft Teams Webhooks**

---

## Estrutura

```
src/
├── app/
│   ├── admin/           # Painel administrativo
│   ├── api/             # API Routes
│   ├── checklist/       # Preenchimento de checklists
│   ├── dashboard/       # Dashboard principal
│   ├── login/           # Autenticação
│   └── offline/         # Página offline
├── components/          # Componentes React
├── hooks/               # Custom hooks
├── lib/                 # Utilitários e serviços
│   ├── crossValidation.ts
│   ├── google.ts
│   ├── offlineCache.ts
│   ├── offlineStorage.ts
│   ├── supabase.ts
│   └── syncService.ts
└── types/               # TypeScript definitions
```

---

## Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Microsoft Teams (opcional)
TEAMS_WEBHOOK_URL=https://xxx.webhook.office.com/...
```

### 3. Executar migrations no Supabase

Execute os arquivos em `supabase/migrations/` no SQL Editor do Supabase.

### 4. Rodar

```bash
npm run dev
```

---

## Lojas

| ID | Nome |
|----|------|
| 1 | BDN Boa Viagem |
| 2 | BDN Guararapes |
| 3 | BDN Afogados |
| 4 | BDN Tacaruna |
| 5 | BDN Olinda |
| 6 | BRDN Boa Viagem |
| 7 | BRG Riomar |
| 8 | BRG Guararapes |

---

## Deploy

### Vercel

```bash
vercel --prod
```

Configure as variáveis de ambiente no painel da Vercel.

---

## Licença

Uso interno - Grupo Do Nô
