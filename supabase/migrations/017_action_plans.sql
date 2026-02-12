-- ============================================
-- MIGRATION 017: Planos de Acao, Condicoes de Campo, Notificacoes
-- ============================================

-- 1. Condicoes de nao-conformidade por campo de template
CREATE TABLE IF NOT EXISTS field_conditions (
  id SERIAL PRIMARY KEY,
  field_id INTEGER NOT NULL REFERENCES template_fields(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (condition_type IN (
    'equals','not_equals','less_than','greater_than','between','in_list','not_in_list','empty'
  )),
  -- Exemplos de condition_value:
  --   yes_no:    {"value": "Nao"}
  --   number:    {"min": 0, "max": 100}
  --   rating:    {"threshold": 3}
  --   dropdown:  {"values": ["Ruim", "Pessimo"]}
  --   checkbox:  {"required": ["Item A"], "forbidden": ["Item B"]}
  --   text:      {"pattern": "^$"}
  condition_value JSONB NOT NULL,
  severity TEXT NOT NULL DEFAULT 'media' CHECK (severity IN ('baixa','media','alta','critica')),
  default_assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deadline_days INTEGER NOT NULL DEFAULT 7,
  description_template TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Planos de acao
CREATE TABLE IF NOT EXISTS action_plans (
  id SERIAL PRIMARY KEY,
  -- Origem (auto-gerado ou manual)
  checklist_id INTEGER REFERENCES checklists(id) ON DELETE SET NULL,
  field_id INTEGER REFERENCES template_fields(id) ON DELETE SET NULL,
  field_condition_id INTEGER REFERENCES field_conditions(id) ON DELETE SET NULL,
  response_id INTEGER REFERENCES checklist_responses(id) ON DELETE SET NULL,
  -- Contexto
  template_id INTEGER REFERENCES checklist_templates(id) ON DELETE SET NULL,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sector_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL,
  -- Detalhes do plano
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'media' CHECK (severity IN ('baixa','media','alta','critica')),
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_andamento','concluido','vencido','cancelado')),
  -- Atribuicao
  assigned_to UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Datas
  deadline DATE NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Reincidencia
  is_reincidencia BOOLEAN NOT NULL DEFAULT false,
  reincidencia_count INTEGER NOT NULL DEFAULT 0,
  parent_action_plan_id INTEGER REFERENCES action_plans(id) ON DELETE SET NULL,
  -- Valor que disparou o plano
  non_conformity_value TEXT,
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Atualizacoes/comentarios dos planos de acao
CREATE TABLE IF NOT EXISTS action_plan_updates (
  id SERIAL PRIMARY KEY,
  action_plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  update_type TEXT NOT NULL CHECK (update_type IN ('comment','status_change','evidence','reassign')),
  content TEXT,
  old_status TEXT,
  new_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Evidencias (fotos/documentos) dos planos
CREATE TABLE IF NOT EXISTS action_plan_evidence (
  id SERIAL PRIMARY KEY,
  action_plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  update_id INTEGER REFERENCES action_plan_updates(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  storage_path TEXT NOT NULL,
  storage_url TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Notificacoes in-app
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'action_plan_created','action_plan_assigned','action_plan_deadline',
    'action_plan_overdue','action_plan_completed','action_plan_comment',
    'reincidencia_detected','validation_divergence'
  )),
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDICES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_fc_field ON field_conditions(field_id);
CREATE INDEX IF NOT EXISTS idx_ap_assigned ON action_plans(assigned_to);
CREATE INDEX IF NOT EXISTS idx_ap_store ON action_plans(store_id);
CREATE INDEX IF NOT EXISTS idx_ap_status ON action_plans(status);
CREATE INDEX IF NOT EXISTS idx_ap_field ON action_plans(field_id);
CREATE INDEX IF NOT EXISTS idx_ap_deadline ON action_plans(deadline);
CREATE INDEX IF NOT EXISTS idx_ap_checklist ON action_plans(checklist_id);
CREATE INDEX IF NOT EXISTS idx_ap_template ON action_plans(template_id);
CREATE INDEX IF NOT EXISTS idx_apu_plan ON action_plan_updates(action_plan_id);
CREATE INDEX IF NOT EXISTS idx_ape_plan ON action_plan_evidence(action_plan_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE field_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plan_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plan_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- field_conditions: todos podem ler, apenas admin pode escrever
CREATE POLICY "fc_select" ON field_conditions FOR SELECT TO authenticated USING (true);
CREATE POLICY "fc_insert" ON field_conditions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "fc_update" ON field_conditions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "fc_delete" ON field_conditions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));

-- action_plans: admin ve todos, usuario ve os atribuidos a ele ou criados por ele
CREATE POLICY "ap_select" ON action_plans FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );
CREATE POLICY "ap_insert" ON action_plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ap_update" ON action_plans FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );
CREATE POLICY "ap_delete" ON action_plans FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));

-- action_plan_updates: todos autenticados podem ler e inserir
CREATE POLICY "apu_select" ON action_plan_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "apu_insert" ON action_plan_updates FOR INSERT TO authenticated WITH CHECK (true);

-- action_plan_evidence: todos autenticados podem ler e inserir
CREATE POLICY "ape_select" ON action_plan_evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY "ape_insert" ON action_plan_evidence FOR INSERT TO authenticated WITH CHECK (true);

-- notifications: usuario ve apenas suas proprias
CREATE POLICY "notif_select" ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notif_insert" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notif_update" ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notif_delete" ON notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================
-- REALTIME para notificacoes
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
