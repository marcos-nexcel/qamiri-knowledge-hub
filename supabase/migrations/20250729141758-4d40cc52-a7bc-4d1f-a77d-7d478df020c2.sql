-- Crear tabla para tokens de activación de usuarios
CREATE TABLE IF NOT EXISTS public.user_activation_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  used_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_user_activation_tokens_token ON public.user_activation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_user_activation_tokens_user_id ON public.user_activation_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activation_tokens_expires_at ON public.user_activation_tokens(expires_at);

-- RLS para seguridad
ALTER TABLE public.user_activation_tokens ENABLE ROW LEVEL SECURITY;

-- Política para que los tokens sean accesibles solo por el sistema
CREATE POLICY "Sistema puede gestionar tokens de activación" 
ON public.user_activation_tokens 
FOR ALL 
USING (true);

-- Función para limpiar tokens expirados automáticamente
CREATE OR REPLACE FUNCTION public.cleanup_expired_activation_tokens()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.user_activation_tokens 
  WHERE expires_at < now() OR used_at IS NOT NULL;
$$;