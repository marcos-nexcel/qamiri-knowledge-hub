import { useState } from 'react';
import { Database, RefreshCw, Settings, Archive, HardDrive, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

export const AdminSystem = () => {
  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexProgress, setReindexProgress] = useState(0);
  const { toast } = useToast();

  const handleReindex = async () => {
    setIsReindexing(true);
    setReindexProgress(0);

    // Simular proceso de reindexación
    const interval = setInterval(() => {
      setReindexProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsReindexing(false);
          toast({
            title: 'Reindexación completada',
            description: 'Todos los documentos han sido reindexados exitosamente',
          });
          return 100;
        }
        return prev + 5;
      });
    }, 200);
  };

  // Mock data
  const systemStats = {
    totalDocuments: 1234,
    indexedChunks: 15678,
    storageUsed: 15.6,
    storageTotal: 100,
    lastBackup: '2024-01-15 14:30:00',
    uptime: '15 días, 8 horas',
  };

  const retentionPolicies = [
    { type: 'Documentos', retention: '5 años', autoDelete: true },
    { type: 'Logs de sistema', retention: '90 días', autoDelete: true },
    { type: 'Métricas', retention: '1 año', autoDelete: false },
    { type: 'Backups', retention: '2 años', autoDelete: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Administración del Sistema</h2>
        <p className="text-muted-foreground">Configuración, mantenimiento y control del sistema</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Vista General</TabsTrigger>
          <TabsTrigger value="reindex">Reindexación</TabsTrigger>
          <TabsTrigger value="retention">Retención</TabsTrigger>
          <TabsTrigger value="backup">Respaldos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Documentos Totales</p>
                    <p className="text-2xl font-bold text-foreground">{systemStats.totalDocuments.toLocaleString()}</p>
                  </div>
                  <Database className="h-8 w-8 text-admin-primary" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Chunks Indexados</p>
                    <p className="text-2xl font-bold text-foreground">{systemStats.indexedChunks.toLocaleString()}</p>
                  </div>
                  <RefreshCw className="h-8 w-8 text-admin-accent" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tiempo Activo</p>
                    <p className="text-2xl font-bold text-foreground">{systemStats.uptime}</p>
                  </div>
                  <Clock className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Estado del Almacenamiento</CardTitle>
              <CardDescription>
                Uso actual del espacio de almacenamiento
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Almacenamiento Utilizado</span>
                  <span className="text-sm text-muted-foreground">
                    {systemStats.storageUsed} GB / {systemStats.storageTotal} GB
                  </span>
                </div>
                <Progress value={(systemStats.storageUsed / systemStats.storageTotal) * 100} />
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center space-x-2">
                      <HardDrive className="h-5 w-5 text-admin-primary" />
                      <span className="font-medium">Documentos</span>
                    </div>
                    <p className="text-2xl font-bold mt-2">8.2 GB</p>
                    <p className="text-xs text-muted-foreground">52% del total</p>
                  </div>
                  
                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center space-x-2">
                      <Database className="h-5 w-5 text-admin-accent" />
                      <span className="font-medium">Índices</span>
                    </div>
                    <p className="text-2xl font-bold mt-2">4.8 GB</p>
                    <p className="text-xs text-muted-foreground">31% del total</p>
                  </div>
                  
                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center space-x-2">
                      <Archive className="h-5 w-5 text-green-500" />
                      <span className="font-medium">Backups</span>
                    </div>
                    <p className="text-2xl font-bold mt-2">2.6 GB</p>
                    <p className="text-xs text-muted-foreground">17% del total</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reindex" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Reindexación del Sistema</CardTitle>
              <CardDescription>
                Reconstruye los índices de búsqueda y embeddings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Configuración de Reindexación</h4>
                  
                  <div>
                    <label className="text-sm font-medium">Tipo de Reindexación</label>
                    <Select defaultValue="full">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Completa</SelectItem>
                        <SelectItem value="incremental">Incremental</SelectItem>
                        <SelectItem value="category">Por Categoría</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Prioridad</label>
                    <Select defaultValue="normal">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baja</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Estado Actual</h4>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Documentos Indexados</span>
                      <span className="text-sm font-medium">1,234 / 1,234</span>
                    </div>
                    <Progress value={100} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Última Reindexación</span>
                      <span className="text-sm font-medium">Hace 2 días</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Estado</span>
                      <Badge className="bg-green-500 text-white">Actualizado</Badge>
                    </div>
                  </div>
                </div>
              </div>

              {isReindexing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Reindexando documentos...</span>
                    <span>{reindexProgress}%</span>
                  </div>
                  <Progress value={reindexProgress} />
                </div>
              )}

              <div className="flex space-x-2">
                <Button 
                  onClick={handleReindex}
                  disabled={isReindexing}
                  className="bg-admin-primary hover:bg-admin-primary-dark"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isReindexing ? 'animate-spin' : ''}`} />
                  {isReindexing ? 'Reindexando...' : 'Iniciar Reindexación'}
                </Button>
                <Button variant="outline">
                  Programar Reindexación
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retention" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Políticas de Retención</CardTitle>
              <CardDescription>
                Configuración de retención y limpieza automática de datos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {retentionPolicies.map((policy, index) => (
                  <div key={index} className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <h4 className="font-medium">{policy.type}</h4>
                      <p className="text-sm text-muted-foreground">
                        Retención: {policy.retention}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={policy.autoDelete ? 'default' : 'secondary'}>
                        {policy.autoDelete ? 'Auto-eliminación activa' : 'Manual'}
                      </Badge>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-lg bg-muted/50">
                <h4 className="font-medium mb-2">Próximas Limpiezas Automáticas</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>• Logs de sistema: En 7 días (890 archivos)</div>
                  <div>• Documentos vencidos: En 30 días (12 documentos)</div>
                  <div>• Backups antiguos: En 45 días (3 backups)</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Configuración de Respaldos</CardTitle>
                <CardDescription>
                  Gestión de backups automáticos y manuales
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Frecuencia</label>
                  <Select defaultValue="daily">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Cada hora</SelectItem>
                      <SelectItem value="daily">Diario</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Retención de Backups</label>
                  <Select defaultValue="30">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 días</SelectItem>
                      <SelectItem value="30">30 días</SelectItem>
                      <SelectItem value="90">90 días</SelectItem>
                      <SelectItem value="365">1 año</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Último Backup</span>
                    <span className="text-sm font-medium">{systemStats.lastBackup}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Estado</span>
                    <Badge className="bg-green-500 text-white">Exitoso</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Próximo Backup</span>
                    <span className="text-sm font-medium">En 8 horas</span>
                  </div>
                </div>

                <Button className="w-full bg-admin-primary hover:bg-admin-primary-dark">
                  <Archive className="h-4 w-4 mr-2" />
                  Crear Backup Manual
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Historial de Backups</CardTitle>
                <CardDescription>
                  Últimos respaldos realizados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium">Backup #{String(i).padStart(3, '0')}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(Date.now() - i * 24 * 60 * 60 * 1000).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline">2.{i} GB</Badge>
                        <Button variant="outline" size="sm">
                          Restaurar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};