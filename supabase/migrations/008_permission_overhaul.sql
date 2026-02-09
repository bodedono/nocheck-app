-- NôCheck v3.0 - Reestruturação de Permissões
-- Execute este SQL no Supabase SQL Editor
--
-- Mudanças:
-- 1. Nova tabela "functions" (funções genéricas: cozinheiro, zelador, etc.)
-- 2. Colunas diretas em "users": store_id, function_id, sector_id, is_manager
-- 3. function_id em template_visibility (Loja + Setor + Função)
-- 4. Novo tipo de campo: yes_no
-- 5. RLS atualizado: funcionário vê SÓ seus checklists, gerente vê toda a loja
-- 6. Tabelas antigas (user_store_roles, user_sectors, store_managers) NÃO são apagadas

-- ============================================
-- 1. TABELA DE FUNÇÕES (global, não por loja)
-- ============================================
CREATE TABLE IF NOT EXISTS public.functions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'briefcase',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.functions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "functions_select" ON public.functions
  FOR SELECT USING (is_active = true OR is_admin());

CREATE POLICY "functions_admin" ON public.functions
  FOR ALL USING (is_admin());

-- Grants
GRANT ALL ON public.functions TO service_role;
GRANT ALL ON SEQUENCE public.functions_id_seq TO service_role;

-- ============================================
-- 2. SEED DE FUNÇÕES PADRÃO
-- ============================================
INSERT INTO public.functions (name, description, color, icon) VALUES
  ('Estoquista', 'Recebimento e controle de estoque', '#10b981', 'package'),
  ('Cozinheiro', 'Preparação de alimentos e higiene', '#f59e0b', 'flame'),
  ('Zelador', 'Limpeza e manutenção geral', '#8b5cf6', 'sparkles'),
  ('Garçom', 'Atendimento ao cliente no salão', '#3b82f6', 'users'),
  ('Aprendiz', 'Funcionário em treinamento', '#f97316', 'book-open')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 3. NOVAS COLUNAS EM USERS
-- ============================================
-- Cada usuário tem UMA loja, UMA função, UM setor
-- is_manager: gerente vê tudo da loja mas não preenche

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES public.stores(id) ON DELETE SET NULL;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS function_id INTEGER REFERENCES public.functions(id) ON DELETE SET NULL;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS sector_id INTEGER REFERENCES public.sectors(id) ON DELETE SET NULL;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_manager BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_store ON public.users(store_id);
CREATE INDEX IF NOT EXISTS idx_users_function ON public.users(function_id);
CREATE INDEX IF NOT EXISTS idx_users_sector ON public.users(sector_id);

-- ============================================
-- 4. FUNCTION_ID EM TEMPLATE_VISIBILITY
-- ============================================
-- NULL = visível para TODAS as funções naquele setor/loja

ALTER TABLE public.template_visibility
ADD COLUMN IF NOT EXISTS function_id INTEGER REFERENCES public.functions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_template_visibility_function ON public.template_visibility(function_id);

-- Atualizar UNIQUE constraint (drop da 007, recriar com function_id)
ALTER TABLE public.template_visibility
DROP CONSTRAINT IF EXISTS template_visibility_template_store_sector_key;

ALTER TABLE public.template_visibility
DROP CONSTRAINT IF EXISTS template_visibility_template_id_store_id_key;

ALTER TABLE public.template_visibility
ADD CONSTRAINT template_visibility_unique_combo
UNIQUE(template_id, store_id, sector_id, function_id);

-- ============================================
-- 5. NOVO TIPO DE CAMPO: yes_no
-- ============================================
ALTER TABLE public.template_fields
DROP CONSTRAINT IF EXISTS template_fields_field_type_check;

ALTER TABLE public.template_fields
ADD CONSTRAINT template_fields_field_type_check
CHECK (field_type IN (
  'text', 'number', 'photo', 'dropdown', 'signature',
  'datetime', 'checkbox_multiple', 'gps', 'barcode', 'calculated',
  'yes_no'
));

-- ============================================
-- 6. FUNÇÕES AUXILIARES (novo modelo)
-- ============================================

-- Retorna o store_id do usuário logado
CREATE OR REPLACE FUNCTION user_store_id()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT store_id FROM public.users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verifica se o usuário é gerente
CREATE OR REPLACE FUNCTION user_is_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE((SELECT is_manager FROM public.users WHERE id = auth.uid()), false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Retorna o function_id do usuário logado
CREATE OR REPLACE FUNCTION user_function_id()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT function_id FROM public.users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Retorna o sector_id do usuário logado
CREATE OR REPLACE FUNCTION user_sector_id()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT sector_id FROM public.users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualiza user_store_ids() para usar novo modelo + fallback legado
CREATE OR REPLACE FUNCTION user_store_ids()
RETURNS SETOF INTEGER AS $$
BEGIN
  RETURN QUERY
  -- Novo modelo: direto da tabela users
  SELECT u.store_id FROM public.users u
  WHERE u.id = auth.uid() AND u.store_id IS NOT NULL
  UNION
  -- Fallback legado: user_store_roles (segurança durante migração)
  SELECT usr.store_id FROM public.user_store_roles usr
  WHERE usr.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. ATUALIZAR POLÍTICAS RLS - CHECKLISTS
-- ============================================
-- Regra: funcionário vê SÓ os seus, gerente vê TODOS da loja, admin vê tudo

DROP POLICY IF EXISTS "checklists_select" ON public.checklists;
CREATE POLICY "checklists_select" ON public.checklists
  FOR SELECT USING (
    is_admin()
    OR (user_is_manager() AND store_id = user_store_id())
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "checklists_insert" ON public.checklists;
CREATE POLICY "checklists_insert" ON public.checklists
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND store_id = user_store_id()
    AND NOT user_is_manager()
  );

DROP POLICY IF EXISTS "checklists_update" ON public.checklists;
CREATE POLICY "checklists_update" ON public.checklists
  FOR UPDATE USING (
    is_admin()
    OR (created_by = auth.uid() AND store_id = user_store_id())
  );

-- ============================================
-- 8. ATUALIZAR POLÍTICAS RLS - RESPOSTAS
-- ============================================

DROP POLICY IF EXISTS "responses_select" ON public.checklist_responses;
CREATE POLICY "responses_select" ON public.checklist_responses
  FOR SELECT USING (
    is_admin()
    OR checklist_id IN (
      SELECT id FROM public.checklists
      WHERE (user_is_manager() AND store_id = user_store_id())
         OR created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "responses_insert" ON public.checklist_responses;
CREATE POLICY "responses_insert" ON public.checklist_responses
  FOR INSERT WITH CHECK (
    checklist_id IN (
      SELECT id FROM public.checklists
      WHERE created_by = auth.uid() AND store_id = user_store_id()
    )
  );

DROP POLICY IF EXISTS "responses_update" ON public.checklist_responses;
CREATE POLICY "responses_update" ON public.checklist_responses
  FOR UPDATE USING (
    is_admin()
    OR checklist_id IN (
      SELECT id FROM public.checklists
      WHERE created_by = auth.uid() AND store_id = user_store_id()
    )
  );

-- ============================================
-- 9. ATUALIZAR POLÍTICAS RLS - ANEXOS
-- ============================================

DROP POLICY IF EXISTS "attachments_select" ON public.attachments;
CREATE POLICY "attachments_select" ON public.attachments
  FOR SELECT USING (
    is_admin()
    OR response_id IN (
      SELECT r.id FROM public.checklist_responses r
      JOIN public.checklists c ON r.checklist_id = c.id
      WHERE (user_is_manager() AND c.store_id = user_store_id())
         OR c.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "attachments_insert" ON public.attachments;
CREATE POLICY "attachments_insert" ON public.attachments
  FOR INSERT WITH CHECK (
    response_id IN (
      SELECT r.id FROM public.checklist_responses r
      JOIN public.checklists c ON r.checklist_id = c.id
      WHERE c.created_by = auth.uid() AND c.store_id = user_store_id()
    )
  );

-- ============================================
-- 10. MIGRAR DADOS EXISTENTES
-- ============================================

-- 10a. Gerentes: store_managers → users.is_manager + store_id
UPDATE public.users u
SET is_manager = true,
    store_id = sm.store_id
FROM public.store_managers sm
WHERE sm.user_id = u.id
AND u.store_id IS NULL;

-- 10b. Usuários com setores: user_sectors → users.sector_id + store_id
UPDATE public.users u
SET sector_id = us.sector_id,
    store_id = COALESCE(u.store_id, s.store_id)
FROM public.user_sectors us
JOIN public.sectors s ON us.sector_id = s.id
WHERE us.user_id = u.id
AND u.sector_id IS NULL;

-- 10c. Usuários com roles: user_store_roles → users.store_id + function_id
DO $$
DECLARE
  role_rec RECORD;
  func_id INTEGER;
BEGIN
  FOR role_rec IN
    SELECT usr.user_id, usr.store_id, usr.role
    FROM public.user_store_roles usr
    JOIN public.users u ON usr.user_id = u.id
    WHERE u.store_id IS NULL OR u.function_id IS NULL
  LOOP
    -- Mapear role para function
    CASE role_rec.role
      WHEN 'estoquista' THEN
        SELECT id INTO func_id FROM public.functions WHERE name = 'Estoquista';
      WHEN 'aprendiz' THEN
        SELECT id INTO func_id FROM public.functions WHERE name = 'Aprendiz';
      WHEN 'gerente' THEN
        -- Gerente já migrado acima
        UPDATE public.users SET
          is_manager = true,
          store_id = COALESCE(store_id, role_rec.store_id)
        WHERE id = role_rec.user_id;
        CONTINUE;
      ELSE
        func_id := NULL;
    END CASE;

    UPDATE public.users SET
      store_id = COALESCE(store_id, role_rec.store_id),
      function_id = COALESCE(function_id, func_id)
    WHERE id = role_rec.user_id;
  END LOOP;
END $$;

-- ============================================
-- 11. VERIFICAÇÃO
-- ============================================
SELECT
  'users com store_id' as info,
  COUNT(*) FILTER (WHERE store_id IS NOT NULL) as com_loja,
  COUNT(*) FILTER (WHERE store_id IS NULL) as sem_loja,
  COUNT(*) FILTER (WHERE is_manager = true) as gerentes,
  COUNT(*) FILTER (WHERE function_id IS NOT NULL) as com_funcao
FROM public.users
WHERE is_admin = false;

SELECT
  'functions' as info,
  COUNT(*) as total
FROM public.functions;
