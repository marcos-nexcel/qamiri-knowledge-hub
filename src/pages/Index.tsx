import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDocuments } from '@/hooks/useDocuments';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, LogOut, Settings, MessageSquare } from 'lucide-react';
import ChatInterface from '@/components/chat/ChatInterface';
import { useState } from 'react';

const Index = () => {
  const { user, profile, loading, signOut, isAdmin } = useAuth();
  const { categories } = useDocuments();
  const [showChat, setShowChat] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">QAMIRI</h1>
            <Badge variant={isAdmin ? "default" : "secondary"}>
              {isAdmin ? "Administrador" : "Usuario"}
            </Badge>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              {profile?.full_name || profile?.email}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Chat Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageSquare className="h-5 w-5 mr-2" />
                Chat con IA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Interactúa con el chatbot basado en conocimiento de categorías específicas.
              </p>
              <Button 
                className="w-full" 
                onClick={() => setShowChat(true)}
                disabled={!categories || categories.length === 0}
              >
                {categories && categories.length > 0 ? 'Iniciar Chat' : 'Sin categorías disponibles'}
              </Button>
            </CardContent>
          </Card>

          {/* Admin Panel Card */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Panel de Administración
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Gestiona usuarios, categorías, documentos y permisos.
                </p>
                <Button asChild className="w-full bg-admin-primary hover:bg-admin-primary-dark text-admin-primary-foreground">
                  <Link to="/admin">Ir al Panel</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle>Mi Perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p>{profile?.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Nombre</label>
                <p>{profile?.full_name || 'No especificado'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Rol</label>
                <p>{isAdmin ? 'Administrador' : 'Usuario'}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Welcome Message */}
        <div className="mt-8 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Bienvenido a QAMIRI, {profile?.full_name?.split(' ')[0] || 'Usuario'}
          </h2>
          <p className="text-xl text-muted-foreground">
            Plataforma de conocimiento con arquitectura RAG
          </p>
        </div>
      </main>

      {/* Chat Interface */}
      {showChat && (
        <ChatInterface 
          categories={categories || []} 
          onClose={() => setShowChat(false)} 
        />
      )}
    </div>
  );
};

export default Index;
