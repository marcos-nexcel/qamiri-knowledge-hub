import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle } from 'lucide-react';

export const UserActivation = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');

  // Validar token al cargar la página
  useEffect(() => {
    if (token) {
      validateToken();
    }
  }, [token]);

  const validateToken = async () => {
    try {
      // Primero obtener el token y user_id
      const { data: tokenData, error: tokenError } = await supabase
        .from('user_activation_tokens')
        .select('user_id, expires_at, used_at')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .is('used_at', null)
        .single();

      if (tokenError || !tokenData) {
        setTokenValid(false);
        return;
      }

      // Luego obtener el perfil del usuario
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', tokenData.user_id)
        .single();

      if (profileError || !profileData) {
        setTokenValid(false);
        return;
      }

      setTokenValid(true);
      setUserEmail(profileData.email || '');
    } catch (error) {
      console.error('Error validating token:', error);
      setTokenValid(false);
    }
  };

  const validatePassword = (password: string) => {
    const requirements = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    return requirements;
  };

  const handleActivateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: 'Error',
        description: 'Las contraseñas no coinciden',
        variant: 'destructive',
      });
      return;
    }

    const passwordReqs = validatePassword(formData.password);
    const isValidPassword = Object.values(passwordReqs).every(req => req);
    
    if (!isValidPassword) {
      toast({
        title: 'Contraseña débil',
        description: 'La contraseña debe cumplir todos los requisitos de seguridad',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    
    try {
      // Obtener datos del token
      const { data: tokenData, error: tokenError } = await supabase
        .from('user_activation_tokens')
        .select('user_id')
        .eq('token', token)
        .single();

      if (tokenError || !tokenData) {
        throw new Error('Token inválido o expirado');
      }

      // Obtener datos del perfil
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', tokenData.user_id)
        .single();

      if (profileError || !profileData) {
        throw new Error('Usuario no encontrado');
      }

      // Crear usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: profileData.email || '',
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: profileData.full_name,
          }
        }
      });

      if (authError) throw authError;

      // Marcar token como usado
      await supabase
        .from('user_activation_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('token', token);

      // Actualizar perfil con el nuevo user ID de auth
      if (authData.user) {
        await supabase
          .from('profiles')
          .update({ id: authData.user.id })
          .eq('id', tokenData.user_id);
      }

      toast({
        title: 'Cuenta activada',
        description: 'Tu cuenta ha sido activada exitosamente. Ya puedes iniciar sesión.',
      });

      // Redirigir al login después de 2 segundos
      setTimeout(() => {
        navigate('/auth');
      }, 2000);

    } catch (error) {
      console.error('Error activating account:', error);
      toast({
        title: 'Error de activación',
        description: error instanceof Error ? error.message : 'No se pudo activar la cuenta',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const passwordReqs = validatePassword(formData.password);

  if (tokenValid === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle className="text-destructive">Token Inválido</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              El enlace de activación es inválido o ha expirado.
            </p>
            <p className="text-sm text-muted-foreground">
              Por favor, contacta al administrador para obtener un nuevo enlace de activación.
            </p>
            <Button onClick={() => navigate('/auth')} variant="outline" className="w-full">
              Ir al Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tokenValid === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Lock className="h-12 w-12 text-primary mx-auto mb-4" />
          <CardTitle>Activar Cuenta</CardTitle>
          <p className="text-sm text-muted-foreground">
            Configura tu contraseña para activar tu cuenta en QAMIRI
          </p>
          {userEmail && (
            <p className="text-sm font-medium text-foreground mt-2">
              {userEmail}
            </p>
          )}
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleActivateAccount} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Crea una contraseña segura"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Confirma tu contraseña"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Requisitos de contraseña */}
            {formData.password && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Requisitos de contraseña:</Label>
                <div className="space-y-1">
                  {Object.entries({
                    length: 'Mínimo 8 caracteres',
                    uppercase: 'Al menos una mayúscula',
                    lowercase: 'Al menos una minúscula', 
                    number: 'Al menos un número',
                    special: 'Al menos un carácter especial',
                  }).map(([key, description]) => (
                    <div key={key} className="flex items-center space-x-2 text-xs">
                      <CheckCircle className={`h-3 w-3 ${
                        passwordReqs[key as keyof typeof passwordReqs] 
                          ? 'text-green-500' 
                          : 'text-muted-foreground'
                      }`} />
                      <span className={
                        passwordReqs[key as keyof typeof passwordReqs]
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-muted-foreground'
                      }>
                        {description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Validación de confirmación */}
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Las contraseñas no coinciden
                </AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-full"
              disabled={loading || !Object.values(passwordReqs).every(req => req) || formData.password !== formData.confirmPassword}
            >
              {loading ? 'Activando cuenta...' : 'Activar Cuenta'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};