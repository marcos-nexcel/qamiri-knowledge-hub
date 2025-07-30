import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Tags, FileText, Activity, Plus, Upload, BarChart3, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalCategories: number;
  totalDocuments: number;
  processingDocuments: number;
  todayQueries: number;
}

interface ActivityItem {
  id: string;
  type: 'user' | 'category' | 'document' | 'system';
  message: string;
  timestamp: string;
}

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalCategories: 0,
    totalDocuments: 0,
    processingDocuments: 0,
    todayQueries: 0
  });
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch users stats
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('is_active');
      
      if (usersError) throw usersError;

      // Fetch categories stats
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('is_active');
      
      if (categoriesError) throw categoriesError;

      // Fetch documents stats
      const { data: documentsData, error: documentsError } = await supabase
        .from('documents')
        .select('status');
      
      if (documentsError) throw documentsError;

      // Calculate stats
      const totalUsers = usersData?.length || 0;
      const activeUsers = usersData?.filter(user => user.is_active).length || 0;
      const totalCategories = categoriesData?.filter(cat => cat.is_active).length || 0;
      const totalDocuments = documentsData?.length || 0;
      const processingDocuments = documentsData?.filter(doc => doc.status === 'processing').length || 0;

      setStats({
        totalUsers,
        activeUsers,
        totalCategories,
        totalDocuments,
        processingDocuments,
        todayQueries: Math.floor(Math.random() * 1000) + 100 // Simulado por ahora
      });

      // Fetch recent activity (simulado con datos reales)
      const activity: ActivityItem[] = [];
      
      // Recent users
      const { data: recentUsers } = await supabase
        .from('profiles')
        .select('email, created_at')
        .order('created_at', { ascending: false })
        .limit(2);

      recentUsers?.forEach(user => {
        activity.push({
          id: crypto.randomUUID(),
          type: 'user',
          message: `Usuario ${user.email} creado`,
          timestamp: user.created_at
        });
      });

      // Recent categories
      const { data: recentCategories } = await supabase
        .from('categories')
        .select('name, created_at')
        .order('created_at', { ascending: false })
        .limit(2);

      recentCategories?.forEach(category => {
        activity.push({
          id: crypto.randomUUID(),
          type: 'category',
          message: `Categoría "${category.name}" creada`,
          timestamp: category.created_at
        });
      });

      // Recent documents
      const { data: recentDocuments } = await supabase
        .from('documents')
        .select('name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(2);

      recentDocuments?.forEach(doc => {
        activity.push({
          id: crypto.randomUUID(),
          type: 'document',
          message: `Documento "${doc.name}" ${doc.status === 'completed' ? 'procesado' : 'cargado'}`,
          timestamp: doc.created_at
        });
      });

      // Sort activity by timestamp
      activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentActivity(activity.slice(0, 5));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del dashboard',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user': return <Users className="h-4 w-4 text-admin-primary" />;
      case 'category': return <Tags className="h-4 w-4 text-admin-accent" />;
      case 'document': return <FileText className="h-4 w-4 text-green-500" />;
      default: return <Activity className="h-4 w-4 text-orange-500" />;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Hace un momento';
    if (diffInMinutes < 60) return `Hace ${diffInMinutes} min`;
    if (diffInMinutes < 1440) return `Hace ${Math.floor(diffInMinutes / 60)} h`;
    return `Hace ${Math.floor(diffInMinutes / 1440)} días`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

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
            <div className="text-2xl font-bold text-foreground">{stats.activeUsers}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalUsers} usuarios totales
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-admin-accent/10 to-admin-accent/5 border-admin-accent/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categorías</CardTitle>
            <Tags className="h-4 w-4 text-admin-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.totalCategories}</div>
            <p className="text-xs text-muted-foreground">categorías activas</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documentos</CardTitle>
            <FileText className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.totalDocuments}</div>
            <p className="text-xs text-muted-foreground">
              {stats.processingDocuments} en procesamiento
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consultas Hoy</CardTitle>
            <Activity className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.todayQueries}</div>
            <p className="text-xs text-muted-foreground">consultas procesadas</p>
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
              <Button
                variant="outline"
                className="p-4 h-auto flex-col items-start text-left hover:bg-admin-primary/5"
                onClick={() => navigate('/admin/users')}
              >
                <div className="flex items-center space-x-2 mb-2">
                  <UserPlus className="h-6 w-6 text-admin-primary" />
                  <div className="font-medium">Nuevo Usuario</div>
                </div>
                <div className="text-sm text-muted-foreground">Crear usuario</div>
              </Button>
              
              <Button
                variant="outline"
                className="p-4 h-auto flex-col items-start text-left hover:bg-admin-accent/5"
                onClick={() => navigate('/admin/categories')}
              >
                <div className="flex items-center space-x-2 mb-2">
                  <Plus className="h-6 w-6 text-admin-accent" />
                  <div className="font-medium">Nueva Categoría</div>
                </div>
                <div className="text-sm text-muted-foreground">Crear categoría</div>
              </Button>
              
              <Button
                variant="outline"
                className="p-4 h-auto flex-col items-start text-left hover:bg-green-500/5"
                onClick={() => navigate('/admin/documents')}
              >
                <div className="flex items-center space-x-2 mb-2">
                  <Upload className="h-6 w-6 text-green-500" />
                  <div className="font-medium">Subir Documentos</div>
                </div>
                <div className="text-sm text-muted-foreground">Cargar archivos</div>
              </Button>
              
              <Button
                variant="outline"
                className="p-4 h-auto flex-col items-start text-left hover:bg-orange-500/5"
                onClick={() => navigate('/admin/metrics')}
              >
                <div className="flex items-center space-x-2 mb-2">
                  <BarChart3 className="h-6 w-6 text-orange-500" />
                  <div className="font-medium">Ver Métricas</div>
                </div>
                <div className="text-sm text-muted-foreground">Analizar datos</div>
              </Button>
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
              {recentActivity.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">
                  No hay actividad reciente
                </div>
              ) : (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    {getActivityIcon(activity.type)}
                    <div className="flex-1">
                      <p className="text-sm">{activity.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeAgo(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};