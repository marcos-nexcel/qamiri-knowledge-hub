-- Agregar política RLS para permitir que los administradores eliminen perfiles
CREATE POLICY "Admins can delete profiles" 
ON public.profiles 
FOR DELETE 
USING (is_admin(auth.uid()));