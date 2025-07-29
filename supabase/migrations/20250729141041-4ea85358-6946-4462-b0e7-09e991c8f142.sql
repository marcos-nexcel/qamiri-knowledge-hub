-- Eliminar la restricción de clave foránea que está causando problemas
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Esto permite crear perfiles independientes sin requerir que existan en auth.users primero