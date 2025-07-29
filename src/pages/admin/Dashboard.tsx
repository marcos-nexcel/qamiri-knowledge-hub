import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Tags, FileText, Activity } from 'lucide-react';

export const AdminDashboard = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Dashboard</h2>
        <p className="text-muted-foreground">Vista general del sistema QAMIRI</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-admin-primary/10 to-admin-primary/5 border-admin-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuarios Activos</CardTitle>
            <Users className="h-4 w-4 text-admin-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">1,234</div>
            <p className="text-xs text-muted-foreground">+10% desde el mes pasado</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-admin-accent/10 to-admin-accent/5 border-admin-accent/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categorías</CardTitle>
            <Tags className="h-4 w-4 text-admin-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">12</div>
            <p className="text-xs text-muted-foreground">3 categorías nuevas</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documentos</CardTitle>
            <FileText className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">5,678</div>
            <p className="text-xs text-muted-foreground">+25% documentos procesados</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consultas Hoy</CardTitle>
            <Activity className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">892</div>
            <p className="text-xs text-muted-foreground">+15% vs ayer</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Acciones Rápidas</CardTitle>
            <CardDescription>Operaciones frecuentes del sistema</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button className="p-4 rounded-lg border border-border hover:bg-secondary transition-colors text-left">
                <Users className="h-6 w-6 text-admin-primary mb-2" />
                <div className="font-medium">Nuevo Usuario</div>
                <div className="text-sm text-muted-foreground">Crear usuario</div>
              </button>
              
              <button className="p-4 rounded-lg border border-border hover:bg-secondary transition-colors text-left">
                <Tags className="h-6 w-6 text-admin-accent mb-2" />
                <div className="font-medium">Nueva Categoría</div>
                <div className="text-sm text-muted-foreground">Crear categoría</div>
              </button>
              
              <button className="p-4 rounded-lg border border-border hover:bg-secondary transition-colors text-left">
                <FileText className="h-6 w-6 text-green-500 mb-2" />
                <div className="font-medium">Subir Documentos</div>
                <div className="text-sm text-muted-foreground">Cargar archivos</div>
              </button>
              
              <button className="p-4 rounded-lg border border-border hover:bg-secondary transition-colors text-left">
                <Activity className="h-6 w-6 text-orange-500 mb-2" />
                <div className="font-medium">Ver Métricas</div>
                <div className="text-sm text-muted-foreground">Analizar datos</div>
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
            <CardDescription>Últimas acciones en el sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="h-2 w-2 rounded-full bg-admin-primary mt-2"></div>
                <div className="flex-1">
                  <p className="text-sm">Usuario Juan Pérez creado</p>
                  <p className="text-xs text-muted-foreground">Hace 5 minutos</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="h-2 w-2 rounded-full bg-admin-accent mt-2"></div>
                <div className="flex-1">
                  <p className="text-sm">Categoría "Finanzas" actualizada</p>
                  <p className="text-xs text-muted-foreground">Hace 12 minutos</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="h-2 w-2 rounded-full bg-green-500 mt-2"></div>
                <div className="flex-1">
                  <p className="text-sm">15 documentos procesados</p>
                  <p className="text-xs text-muted-foreground">Hace 1 hora</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="h-2 w-2 rounded-full bg-orange-500 mt-2"></div>
                <div className="flex-1">
                  <p className="text-sm">Reindexación completada</p>
                  <p className="text-xs text-muted-foreground">Hace 2 horas</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};