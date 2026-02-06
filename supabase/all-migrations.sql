-- ============================================
-- NoCheck - ALL MIGRATIONS CONSOLIDADO
-- ============================================
-- Execute este arquivo COMPLETO no Supabase SQL Editor
-- para criar/recriar TODA a estrutura do banco de dados.
--
-- IMPORTANTE: Execute na ordem! Se der erro em alguma parte,
-- pode ser que já exista. Continue executando o restante.
--
-- Baseado nas migrations 001 a 006
-- Data: 2026-02-06
-- ============================================


-- ############################################
-- MIGRATION 001: SCHEMA INICIAL
-- ############################################

-- 1. LOJAS
CREATE TABLE IF NOT EXISTS public.stores (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  cnpj TEXT,
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. USUARIOS
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 3. CARGOS POR LOJA
CREATE TABLE IF NOT EXISTS public.user_store_roles (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('estoquista', 'aprendiz', 'supervisor', 'gerente')),
  assigned_by UUID REFERENCES public.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, store_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_store_roles_user ON public.user_store_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_store_roles_store ON public.user_store_roles(store_id);

-- 4. TEMPLATES DE CHECKLIST
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('recebimento', 'limpeza', 'abertura', 'fechamento', 'outros')),
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS templates_updated_at ON public.checklist_templates;
CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 5. CAMPOS DO TEMPLATE
CREATE TABLE IF NOT EXISTS public.template_fields (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN (
    'text', 'number', 'photo', 'dropdown', 'signature',
    'datetime', 'checkbox_multiple', 'gps', 'barcode', 'calculated'
  )),
  is_required BOOLEAN DEFAULT true,
  sort_order INTEGER,
  options JSONB,
  validation JSONB,
  calculation JSONB,
  placeholder TEXT,
  help_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_template_fields_template ON public.template_fields(template_id);
CREATE INDEX IF NOT EXISTS idx_template_fields_order ON public.template_fields(template_id, sort_order);

-- 6. VISIBILIDADE DE TEMPLATES
CREATE TABLE IF NOT EXISTS public.template_visibility (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  roles TEXT[] NOT NULL,
  assigned_by UUID REFERENCES public.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(template_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_template_visibility_template ON public.template_visibility(template_id);
CREATE INDEX IF NOT EXISTS idx_template_visibility_store ON public.template_visibility(store_id);

-- 7. CHECKLISTS PREENCHIDOS
CREATE TABLE IF NOT EXISTS public.checklists (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES public.checklist_templates(id),
  store_id INTEGER NOT NULL REFERENCES public.stores(id),
  status TEXT DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'em_andamento', 'concluido', 'validado')),
  created_by UUID NOT NULL REFERENCES public.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'conflict')),
  local_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklists_template ON public.checklists(template_id);
CREATE INDEX IF NOT EXISTS idx_checklists_store ON public.checklists(store_id);
CREATE INDEX IF NOT EXISTS idx_checklists_created_by ON public.checklists(created_by);
CREATE INDEX IF NOT EXISTS idx_checklists_status ON public.checklists(status);
CREATE INDEX IF NOT EXISTS idx_checklists_created_at ON public.checklists(created_at DESC);

DROP TRIGGER IF EXISTS checklists_updated_at ON public.checklists;
CREATE TRIGGER checklists_updated_at
  BEFORE UPDATE ON public.checklists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 8. RESPOSTAS DOS CAMPOS
CREATE TABLE IF NOT EXISTS public.checklist_responses (
  id SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES public.template_fields(id),
  value_text TEXT,
  value_number NUMERIC,
  value_json JSONB,
  answered_by UUID REFERENCES public.users(id),
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_responses_checklist ON public.checklist_responses(checklist_id);
CREATE INDEX IF NOT EXISTS idx_responses_field ON public.checklist_responses(field_id);

-- 9. ANEXOS
CREATE TABLE IF NOT EXISTS public.attachments (
  id SERIAL PRIMARY KEY,
  response_id INTEGER NOT NULL REFERENCES public.checklist_responses(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  storage_provider TEXT DEFAULT 'google_drive' CHECK (storage_provider IN ('google_drive', 'supabase')),
  storage_path TEXT NOT NULL,
  storage_url TEXT,
  uploaded_by UUID REFERENCES public.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_response ON public.attachments(response_id);

-- 10. LOG DE ATIVIDADES
CREATE TABLE IF NOT EXISTS public.activity_log (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES public.stores(id),
  user_id UUID REFERENCES public.users(id),
  checklist_id INTEGER REFERENCES public.checklists(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_store ON public.activity_log(store_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON public.activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.activity_log(created_at DESC);

-- 11. VALIDACOES CRUZADAS
CREATE TABLE IF NOT EXISTS public.cross_validations (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES public.stores(id),
  numero_nota TEXT NOT NULL,
  estoquista_checklist_id INTEGER REFERENCES public.checklists(id) ON DELETE SET NULL,
  aprendiz_checklist_id INTEGER REFERENCES public.checklists(id) ON DELETE SET NULL,
  valor_estoquista NUMERIC,
  valor_aprendiz NUMERIC,
  diferenca NUMERIC,
  status TEXT CHECK (status IN ('pendente', 'sucesso', 'falhou', 'notas_diferentes')),
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Campos de vinculacao (migration 003)
  linked_validation_id INTEGER REFERENCES public.cross_validations(id) ON DELETE SET NULL,
  match_reason TEXT,
  is_primary BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_validations_store ON public.cross_validations(store_id);
CREATE INDEX IF NOT EXISTS idx_validations_nota ON public.cross_validations(numero_nota);
CREATE INDEX IF NOT EXISTS idx_validations_status ON public.cross_validations(status);
CREATE INDEX IF NOT EXISTS idx_validations_linked ON public.cross_validations(linked_validation_id);


-- ############################################
-- MIGRATION 002: SETORES
-- ############################################

-- 1. TABELA DE SETORES
CREATE TABLE IF NOT EXISTS public.sectors (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'clipboard',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sectors_store ON public.sectors(store_id);

-- 2. USUARIOS EM SETORES
CREATE TABLE IF NOT EXISTS public.user_sectors (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sector_id INTEGER NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  assigned_by UUID REFERENCES public.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, sector_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sectors_user ON public.user_sectors(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sectors_sector ON public.user_sectors(sector_id);

-- 3. GERENTES DE LOJA
CREATE TABLE IF NOT EXISTS public.store_managers (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  can_view_all_checklists BOOLEAN DEFAULT true,
  can_view_reports BOOLEAN DEFAULT true,
  can_manage_users BOOLEAN DEFAULT false,
  assigned_by UUID REFERENCES public.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_managers_user ON public.store_managers(user_id);
CREATE INDEX IF NOT EXISTS idx_store_managers_store ON public.store_managers(store_id);

-- 4. ADICIONAR sector_id NAS TABELAS EXISTENTES
ALTER TABLE public.template_visibility
ADD COLUMN IF NOT EXISTS sector_id INTEGER REFERENCES public.sectors(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_template_visibility_sector ON public.template_visibility(sector_id);

ALTER TABLE public.checklists
ADD COLUMN IF NOT EXISTS sector_id INTEGER REFERENCES public.sectors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_checklists_sector ON public.checklists(sector_id);


-- ############################################
-- RLS (ROW LEVEL SECURITY)
-- ############################################

-- Habilitar RLS em TODAS as tabelas
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_store_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cross_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_managers ENABLE ROW LEVEL SECURITY;


-- ############################################
-- FUNCOES AUXILIARES
-- ############################################

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_store_ids()
RETURNS SETOF INTEGER AS $$
BEGIN
  RETURN QUERY
  SELECT store_id FROM public.user_store_roles
  WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_store_manager(check_store_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.store_managers
    WHERE user_id = auth.uid()
    AND store_id = check_store_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_sector_ids()
RETURNS SETOF INTEGER AS $$
BEGIN
  RETURN QUERY
  SELECT sector_id FROM public.user_sectors
  WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_managed_store_ids()
RETURNS SETOF INTEGER AS $$
BEGIN
  RETURN QUERY
  SELECT store_id FROM public.store_managers
  WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ############################################
-- POLITICAS RLS (com correções da migration 005)
-- ############################################

-- ======= STORES =======
DROP POLICY IF EXISTS "stores_select" ON public.stores;
CREATE POLICY "stores_select" ON public.stores
  FOR SELECT USING (is_active = true OR is_admin());

DROP POLICY IF EXISTS "stores_admin" ON public.stores;
CREATE POLICY "stores_admin" ON public.stores
  FOR ALL USING (is_admin());

-- ======= USERS =======
DROP POLICY IF EXISTS "users_select_self" ON public.users;
CREATE POLICY "users_select_self" ON public.users
  FOR SELECT USING (id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "users_update_self" ON public.users;
CREATE POLICY "users_update_self" ON public.users
  FOR UPDATE USING (id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "users_admin_insert" ON public.users;
CREATE POLICY "users_admin_insert" ON public.users
  FOR INSERT WITH CHECK (true); -- Trigger handle_new_user precisa inserir

DROP POLICY IF EXISTS "users_admin_delete" ON public.users;
CREATE POLICY "users_admin_delete" ON public.users
  FOR DELETE USING (is_admin());

-- ======= USER_STORE_ROLES =======
DROP POLICY IF EXISTS "roles_select" ON public.user_store_roles;
CREATE POLICY "roles_select" ON public.user_store_roles
  FOR SELECT USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "roles_admin" ON public.user_store_roles;
CREATE POLICY "roles_admin" ON public.user_store_roles
  FOR ALL USING (is_admin());

-- ======= TEMPLATES =======
DROP POLICY IF EXISTS "templates_select" ON public.checklist_templates;
CREATE POLICY "templates_select" ON public.checklist_templates
  FOR SELECT USING (
    is_admin() OR
    id IN (
      SELECT tv.template_id FROM public.template_visibility tv
      WHERE tv.store_id IN (SELECT user_store_ids())
    )
  );

DROP POLICY IF EXISTS "templates_admin" ON public.checklist_templates;
CREATE POLICY "templates_admin" ON public.checklist_templates
  FOR ALL USING (is_admin());

-- ======= TEMPLATE FIELDS =======
DROP POLICY IF EXISTS "fields_select" ON public.template_fields;
CREATE POLICY "fields_select" ON public.template_fields
  FOR SELECT USING (
    is_admin() OR
    template_id IN (
      SELECT tv.template_id FROM public.template_visibility tv
      WHERE tv.store_id IN (SELECT user_store_ids())
    )
  );

DROP POLICY IF EXISTS "fields_admin" ON public.template_fields;
CREATE POLICY "fields_admin" ON public.template_fields
  FOR ALL USING (is_admin());

-- ======= TEMPLATE VISIBILITY =======
DROP POLICY IF EXISTS "visibility_select" ON public.template_visibility;
CREATE POLICY "visibility_select" ON public.template_visibility
  FOR SELECT USING (store_id IN (SELECT user_store_ids()) OR is_admin());

DROP POLICY IF EXISTS "visibility_admin" ON public.template_visibility;
CREATE POLICY "visibility_admin" ON public.template_visibility
  FOR ALL USING (is_admin());

-- ======= CHECKLISTS =======
DROP POLICY IF EXISTS "checklists_select" ON public.checklists;
CREATE POLICY "checklists_select" ON public.checklists
  FOR SELECT USING (
    is_admin() OR
    store_id IN (SELECT user_store_ids()) OR
    store_id IN (SELECT user_managed_store_ids()) OR
    sector_id IN (SELECT user_sector_ids())
  );

DROP POLICY IF EXISTS "checklists_insert" ON public.checklists;
CREATE POLICY "checklists_insert" ON public.checklists
  FOR INSERT WITH CHECK (
    is_admin() OR
    (
      created_by = auth.uid() AND
      (
        store_id IN (SELECT user_store_ids()) OR
        sector_id IN (
          SELECT us.sector_id FROM public.user_sectors us
          WHERE us.user_id = auth.uid() AND us.role = 'member'
        )
      )
    )
  );

DROP POLICY IF EXISTS "checklists_update" ON public.checklists;
CREATE POLICY "checklists_update" ON public.checklists
  FOR UPDATE USING (
    is_admin() OR
    (
      created_by = auth.uid() AND
      (
        store_id IN (SELECT user_store_ids()) OR
        sector_id IN (SELECT user_sector_ids())
      )
    )
  );

DROP POLICY IF EXISTS "checklists_delete" ON public.checklists;
CREATE POLICY "checklists_delete" ON public.checklists
  FOR DELETE USING (is_admin());

-- ======= CHECKLIST RESPONSES =======
DROP POLICY IF EXISTS "responses_select" ON public.checklist_responses;
CREATE POLICY "responses_select" ON public.checklist_responses
  FOR SELECT USING (
    checklist_id IN (
      SELECT id FROM public.checklists
      WHERE store_id IN (SELECT user_store_ids())
    ) OR is_admin()
  );

DROP POLICY IF EXISTS "responses_insert" ON public.checklist_responses;
CREATE POLICY "responses_insert" ON public.checklist_responses
  FOR INSERT WITH CHECK (
    is_admin() OR
    checklist_id IN (
      SELECT id FROM public.checklists
      WHERE store_id IN (SELECT user_store_ids()) AND created_by = auth.uid()
    ) OR
    checklist_id IN (
      SELECT c.id FROM public.checklists c
      WHERE c.sector_id IN (
        SELECT us.sector_id FROM public.user_sectors us
        WHERE us.user_id = auth.uid() AND us.role = 'member'
      ) AND c.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "responses_update" ON public.checklist_responses;
CREATE POLICY "responses_update" ON public.checklist_responses
  FOR UPDATE USING (
    is_admin() OR
    checklist_id IN (
      SELECT id FROM public.checklists
      WHERE store_id IN (SELECT user_store_ids()) AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "responses_delete" ON public.checklist_responses;
CREATE POLICY "responses_delete" ON public.checklist_responses
  FOR DELETE USING (is_admin());

-- ======= ATTACHMENTS =======
DROP POLICY IF EXISTS "attachments_select" ON public.attachments;
CREATE POLICY "attachments_select" ON public.attachments
  FOR SELECT USING (
    response_id IN (
      SELECT r.id FROM public.checklist_responses r
      JOIN public.checklists c ON r.checklist_id = c.id
      WHERE c.store_id IN (SELECT user_store_ids())
    ) OR is_admin()
  );

DROP POLICY IF EXISTS "attachments_insert" ON public.attachments;
CREATE POLICY "attachments_insert" ON public.attachments
  FOR INSERT WITH CHECK (
    is_admin() OR
    response_id IN (
      SELECT r.id FROM public.checklist_responses r
      JOIN public.checklists c ON r.checklist_id = c.id
      WHERE c.store_id IN (SELECT user_store_ids()) AND c.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "attachments_delete" ON public.attachments;
CREATE POLICY "attachments_delete" ON public.attachments
  FOR DELETE USING (is_admin());

-- ======= ACTIVITY LOG =======
DROP POLICY IF EXISTS "activity_select" ON public.activity_log;
CREATE POLICY "activity_select" ON public.activity_log
  FOR SELECT USING (store_id IN (SELECT user_store_ids()) OR is_admin());

DROP POLICY IF EXISTS "activity_insert" ON public.activity_log;
CREATE POLICY "activity_insert" ON public.activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ======= CROSS VALIDATIONS =======
DROP POLICY IF EXISTS "validations_select" ON public.cross_validations;
CREATE POLICY "validations_select" ON public.cross_validations
  FOR SELECT USING (store_id IN (SELECT user_store_ids()) OR is_admin());

DROP POLICY IF EXISTS "validations_insert" ON public.cross_validations;
CREATE POLICY "validations_insert" ON public.cross_validations
  FOR INSERT WITH CHECK (store_id IN (SELECT user_store_ids()));

DROP POLICY IF EXISTS "validations_update" ON public.cross_validations;
CREATE POLICY "validations_update" ON public.cross_validations
  FOR UPDATE USING (store_id IN (SELECT user_store_ids()) OR is_admin());

DROP POLICY IF EXISTS "validations_delete" ON public.cross_validations;
CREATE POLICY "validations_delete" ON public.cross_validations
  FOR DELETE USING (is_admin());

-- ======= SECTORS =======
DROP POLICY IF EXISTS "sectors_select" ON public.sectors;
CREATE POLICY "sectors_select" ON public.sectors
  FOR SELECT USING (
    is_admin() OR
    store_id IN (SELECT user_store_ids()) OR
    store_id IN (SELECT user_managed_store_ids()) OR
    id IN (SELECT user_sector_ids())
  );

DROP POLICY IF EXISTS "sectors_admin" ON public.sectors;
CREATE POLICY "sectors_admin" ON public.sectors
  FOR ALL USING (is_admin());

-- ======= USER SECTORS =======
DROP POLICY IF EXISTS "user_sectors_select" ON public.user_sectors;
CREATE POLICY "user_sectors_select" ON public.user_sectors
  FOR SELECT USING (
    user_id = auth.uid() OR
    is_admin() OR
    sector_id IN (
      SELECT s.id FROM public.sectors s
      WHERE s.store_id IN (SELECT user_managed_store_ids())
    )
  );

DROP POLICY IF EXISTS "user_sectors_admin" ON public.user_sectors;
CREATE POLICY "user_sectors_admin" ON public.user_sectors
  FOR ALL USING (is_admin());

-- ======= STORE MANAGERS =======
DROP POLICY IF EXISTS "store_managers_select" ON public.store_managers;
CREATE POLICY "store_managers_select" ON public.store_managers
  FOR SELECT USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "store_managers_admin" ON public.store_managers;
CREATE POLICY "store_managers_admin" ON public.store_managers
  FOR ALL USING (is_admin());


-- ############################################
-- TRIGGER PARA CRIAR USUARIO APOS SIGNUP
-- ############################################

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ############################################
-- STORAGE BUCKET PARA IMAGENS
-- ############################################

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'checklist-images',
  'checklist-images',
  true,
  2097152, -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$
BEGIN
  -- Upload por autenticados
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can upload images'
  ) THEN
    CREATE POLICY "Authenticated users can upload images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'checklist-images');
  END IF;

  -- Leitura publica
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view checklist images'
  ) THEN
    CREATE POLICY "Anyone can view checklist images"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'checklist-images');
  END IF;

  -- Delete por autenticados
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own images'
  ) THEN
    CREATE POLICY "Users can delete own images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'checklist-images');
  END IF;
END $$;


-- ############################################
-- GRANTS
-- ############################################

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;


-- ############################################
-- FIM - BANCO PRONTO!
-- ############################################
-- Apos executar:
-- 1. Crie seu primeiro usuario admin via Supabase Auth
-- 2. Execute: UPDATE public.users SET is_admin = true WHERE email = 'seu@email.com';
-- 3. Crie lojas, templates e usuarios via a interface admin
