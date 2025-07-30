import { useState, useRef } from 'react';
import { Upload, FileText, Search, Download, Trash2, RefreshCw, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useDocuments } from '@/hooks/useDocuments';
import { CategorySelector } from '@/components/documents/CategorySelector';
import { toast } from 'sonner';

export const AdminDocuments = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [selectedUploadCategory, setSelectedUploadCategory] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    documents,
    categories,
    loading,
    uploading,
    uploadProgress,
    uploadDocument,
    deleteDocument,
    reprocessDocument,
    downloadDocument,
    refreshData
  } = useDocuments();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!selectedUploadCategory) {
      toast.error('Por favor selecciona una categoría');
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await uploadDocument(file, selectedUploadCategory);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    
    if (!selectedUploadCategory) {
      toast.error('Por favor selecciona una categoría');
      return;
    }

    for (const file of files) {
      await uploadDocument(file, selectedUploadCategory);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return (
          <Badge className="bg-green-500 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Procesado
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-yellow-500 text-white">
            <Clock className="h-3 w-3 mr-1" />
            Procesando
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pendiente
          </Badge>
        );
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategoryFilter === 'all' || doc.category_id === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const totalDocuments = documents.length;
  const processingDocuments = documents.filter(d => d.status === 'processing').length;
  const totalStorage = documents.reduce((acc, doc) => acc + doc.file_size, 0);

  const handleReindexAll = async () => {
    try {
      const documentsToReprocess = documents.filter(doc => doc.status === 'processed' || doc.status === 'error');
      
      for (const doc of documentsToReprocess) {
        await reprocessDocument(doc.id);
      }
      
      toast.success(`Iniciando reindexación de ${documentsToReprocess.length} documentos`);
    } catch (error) {
      toast.error('Error al iniciar la reindexación');
    }
  };

  const handleClearIndex = async () => {
    toast.info('Funcionalidad en desarrollo: Limpiar índices');
  };

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
              <CategorySelector
                categories={categories}
                selectedCategory={selectedUploadCategory}
                onCategoryChange={setSelectedUploadCategory}
                onCategoryCreated={refreshData}
              />
              
              <div 
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Arrastra archivos aquí</h3>
                  <p className="text-muted-foreground">o haz clic para seleccionar archivos</p>
                </div>
                <Input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
                  onChange={handleFileUpload}
                  className="mt-4"
                  disabled={!selectedUploadCategory}
                />
                {!selectedUploadCategory && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Selecciona una categoría para habilitar la carga
                  </p>
                )}
              </div>

              {uploading && (
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
                    <div className="text-2xl font-bold">{totalDocuments}</div>
                    <div className="text-sm text-muted-foreground">Documentos Totales</div>
                  </div>
                </Card>
                
                <Card className="p-4">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold">{processingDocuments}</div>
                    <div className="text-sm text-muted-foreground">En Procesamiento</div>
                  </div>
                </Card>
                
                <Card className="p-4">
                  <div className="text-center">
                    <Download className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold">{formatFileSize(totalStorage)}</div>
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
                  <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filtrar por categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las categorías</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
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
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        Cargando documentos...
                      </TableCell>
                    </TableRow>
                  ) : filteredDocuments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        No se encontraron documentos
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDocuments.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-admin-primary" />
                            <span className="font-medium">{doc.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {doc.categories?.name || 'Sin categoría'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {doc.file_type.split('/').pop()?.toUpperCase() || 'Unknown'}
                        </TableCell>
                        <TableCell>{formatFileSize(doc.file_size)}</TableCell>
                        <TableCell>{getStatusBadge(doc.status)}</TableCell>
                        <TableCell>{doc.chunk_count} chunks</TableCell>
                        <TableCell>{new Date(doc.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => downloadDocument(doc.file_path, doc.name)}
                              title="Descargar"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => reprocessDocument(doc.id)}
                              disabled={doc.status === 'processing'}
                              title="Reprocesar"
                            >
                              <RefreshCw className={`h-4 w-4 ${doc.status === 'processing' ? 'animate-spin' : ''}`} />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="text-destructive hover:text-destructive"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta acción no se puede deshacer. Se eliminará permanentemente el documento "{doc.name}" y todos sus chunks procesados.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteDocument(doc.id)}>
                                    Eliminar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
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
                  <Button 
                    className="w-full bg-admin-primary hover:bg-admin-primary-dark"
                    onClick={handleReindexAll}
                    disabled={loading}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Reindexar Todo
                  </Button>
                  <Button variant="outline" className="w-full" onClick={handleClearIndex}>
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
                    <span className="text-sm font-medium">{processingDocuments} documentos</span>
                  </div>
                  <Progress value={processingDocuments > 0 ? 50 : 0} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Documentos Procesados</span>
                    <span className="text-sm font-medium">{documents.filter(d => d.status === 'processed').length} / {totalDocuments}</span>
                  </div>
                  <Progress value={totalDocuments > 0 ? (documents.filter(d => d.status === 'processed').length / totalDocuments) * 100 : 0} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Chunks Totales</span>
                    <span className="text-sm font-medium">{documents.reduce((acc, doc) => acc + (doc.chunk_count || 0), 0)} chunks</span>
                  </div>
                  <Progress value={100} />
                </div>

                <div className="pt-4 space-y-2">
                  <div className="text-sm font-medium">Últimas Actividades:</div>
                  <div className="space-y-1 text-xs text-muted-foreground max-h-32 overflow-y-auto">
                    {documents
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .slice(0, 5)
                      .map((doc) => (
                        <div key={doc.id} className="flex justify-between">
                          <span>• {doc.name.length > 25 ? doc.name.substring(0, 25) + '...' : doc.name}</span>
                          <span className={
                            doc.status === 'processed' ? 'text-green-600' :
                            doc.status === 'processing' ? 'text-yellow-600' :
                            doc.status === 'error' ? 'text-red-600' : 'text-gray-600'
                          }>
                            {doc.status === 'processed' ? 'Procesado' :
                             doc.status === 'processing' ? 'Procesando' :
                             doc.status === 'error' ? 'Error' : 'Pendiente'}
                          </span>
                        </div>
                      ))}
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