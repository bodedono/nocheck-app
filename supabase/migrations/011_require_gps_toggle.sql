-- Toggle para desativar verificacao GPS por loja
ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS require_gps BOOLEAN NOT NULL DEFAULT true;
