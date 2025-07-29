import { useState } from 'react';
import { Upload, FileText, Search, Download, Trash2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const AdminDocuments = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Mock data - esto se conectaría con la base de datos real
  const documents = [
    {
      id: '1',
      name: 'Manual de Procedimientos.pdf',
      category: 'Procedimientos',
      size: '2.5 MB',
      type: 'PDF',
      uploadedAt: '2024-01-15',
      status: 'processed',
      chunks: 25,
    },
    {
      id: '2',
      name: 'Políticas de Seguridad.docx',
      category: 'Seguridad',
      size: '1.8 MB',
      type: 'DOCX',
      uploadedAt: '2024-01-14',
      status: 'processing',
      chunks: 18,
    },
    {
      id: '3',
      name: 'Reporte Financiero Q4.xlsx',
      category: 'Finanzas',
      size: '3.2 MB',
      type: 'XLSX',
      uploadedAt: '2024-01-13',
      status: 'processed',
      chunks: 42,
    },
  ];

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    setIsUploading(true);
    setUploadProgress(0);

    // Simular progreso de carga
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return <Badge className="bg-green-500 text-white">Procesado</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-500 text-white">Procesando</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Pendiente</Badge>;
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Gestión de Documentos</h2>
        <p className="text-muted-foreground">Carga, procesa y administra documentos del sistema</p>
      </div>

      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload">Cargar Documentos</TabsTrigger>
          <TabsTrigger value="manage">Gestionar Documentos</TabsTrigger>
          <TabsTrigger value="process">Procesamiento</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cargar Nuevos Documentos</CardTitle>
              <CardDescription>
                Sube documentos PDF, Word, Excel o texto plano para procesamiento
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Arrastra archivos aquí</h3>
                  <p className="text-muted-foreground">o haz clic para seleccionar archivos</p>
                </div>
                <Input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
                  onChange={handleFileUpload}
                  className="mt-4"
                />
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Cargando documentos...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4">
                  <div className="text-center">
                    <FileText className="h-8 w-8 text-admin-primary mx-auto mb-2" />
                    <div className="text-2xl font-bold">1,234</div>
                    <div className="text-sm text-muted-foreground">Documentos Totales</div>
                  </div>
                </Card>
                
                <Card className="p-4">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold">12</div>
                    <div className="text-sm text-muted-foreground">En Procesamiento</div>
                  </div>
                </Card>
                
                <Card className="p-4">
                  <div className="text-center">
                    <Download className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold">15.6 GB</div>
                    <div className="text-sm text-muted-foreground">Almacenamiento</div>
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle>Documentos Cargados</CardTitle>
                  <CardDescription>
                    {filteredDocuments.length} documentos encontrados
                  </CardDescription>
                </div>
                <div className="flex space-x-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar documentos..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filtrar por categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las categorías</SelectItem>
                      <SelectItem value="Procedimientos">Procedimientos</SelectItem>
                      <SelectItem value="Seguridad">Seguridad</SelectItem>
                      <SelectItem value="Finanzas">Finanzas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Tamaño</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Chunks</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-admin-primary" />
                          <span className="font-medium">{doc.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{doc.category}</Badge>
                      </TableCell>
                      <TableCell>{doc.type}</TableCell>
                      <TableCell>{doc.size}</TableCell>
                      <TableCell>{getStatusBadge(doc.status)}</TableCell>
                      <TableCell>{doc.chunks} chunks</TableCell>
                      <TableCell>{new Date(doc.uploadedAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="process" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Configuración de Procesamiento</CardTitle>
                <CardDescription>
                  Ajusta los parámetros de extracción y embeddings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Tamaño de Chunk</label>
                  <Select defaultValue="1000">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="500">500 caracteres</SelectItem>
                      <SelectItem value="1000">1000 caracteres</SelectItem>
                      <SelectItem value="1500">1500 caracteres</SelectItem>
                      <SelectItem value="2000">2000 caracteres</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium">Overlap entre Chunks</label>
                  <Select defaultValue="100">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50 caracteres</SelectItem>
                      <SelectItem value="100">100 caracteres</SelectItem>
                      <SelectItem value="200">200 caracteres</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Button className="w-full bg-admin-primary hover:bg-admin-primary-dark">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reindexar Todo
                  </Button>
                  <Button variant="outline" className="w-full">
                    Limpiar Índices
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Estado del Sistema</CardTitle>
                <CardDescription>
                  Monitoreo en tiempo real del procesamiento
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Cola de Procesamiento</span>
                    <span className="text-sm font-medium">12 documentos</span>
                  </div>
                  <Progress value={65} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Memoria Utilizada</span>
                    <span className="text-sm font-medium">2.3 / 4.0 GB</span>
                  </div>
                  <Progress value={57} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Índices Creados</span>
                    <span className="text-sm font-medium">89%</span>
                  </div>
                  <Progress value={89} />
                </div>

                <div className="pt-4 space-y-2">
                  <div className="text-sm font-medium">Últimas Actividades:</div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>• Manual de Procedimientos.pdf - Procesado</div>
                    <div>• Políticas de Seguridad.docx - En proceso</div>
                    <div>• Reporte Q4.xlsx - Indexando</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};