import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Document {
  id: string;
  category_id: string;
  name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  status: 'pending' | 'processing' | 'processed' | 'error';
  chunk_count: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  processed_at?: string;
  categories?: {
    name: string;
  };
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
}

export const useDocuments = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { user } = useAuth();

  // Load documents and categories
  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Load categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (categoriesError) {
        console.error('Error loading categories:', categoriesError);
        toast.error('Error al cargar categorías');
      } else {
        setCategories(categoriesData || []);
      }

      // Load documents with category info
      const { data: documentsData, error: documentsError } = await supabase
        .from('documents')
        .select(`
          *,
          categories!inner(name)
        `)
        .order('created_at', { ascending: false });

      if (documentsError) {
        console.error('Error loading documents:', documentsError);
        toast.error('Error al cargar documentos');
      } else {
        setDocuments((documentsData || []) as Document[]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  // Upload document
  const uploadDocument = async (file: File, categoryId: string): Promise<boolean> => {
    if (!user) {
      toast.error('Usuario no autenticado');
      return false;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      // Validate file type - now supports PDF, DOCX, DOC, and text files
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
        'application/msword', // DOC
        'text/plain'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Tipo de archivo no soportado. Solo se permiten archivos PDF, DOCX, DOC y de texto.');
      }
      
      // Validate file size (max 50MB)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        throw new Error('Archivo demasiado grande. El tamaño máximo es 50MB.');
      }

      // Generate unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${categoryId}/${fileName}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      setUploadProgress(50);

      // Create document record
      const { data: documentData, error: docError } = await supabase
        .from('documents')
        .insert({
          category_id: categoryId,
          name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type || 'application/octet-stream',
          uploaded_by: user.id,
          status: 'pending'
        })
        .select()
        .single();

      if (docError) {
        throw docError;
      }

      setUploadProgress(75);

      // Trigger document processing
      const { error: processError } = await supabase.functions.invoke('process-document', {
        body: { documentId: documentData.id }
      });

      if (processError) {
        console.error('Error triggering document processing:', processError);
        // Don't throw here - document is uploaded, processing can be retried
      }

      setUploadProgress(100);
      toast.success('Documento subido exitosamente');
      
      // Reload documents
      await loadData();
      
      return true;
    } catch (error) {
      console.error('Error uploading document:', error);
      toast.error('Error al subir documento');
      return false;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Delete document
  const deleteDocument = async (documentId: string): Promise<boolean> => {
    try {
      // Get document info first
      const { data: document, error: getError } = await supabase
        .from('documents')
        .select('file_path')
        .eq('id', documentId)
        .single();

      if (getError) {
        throw getError;
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([document.file_path]);

      if (storageError) {
        console.error('Error deleting file from storage:', storageError);
        // Continue with database deletion even if storage fails
      }

      // Delete document record (this will cascade to chunks)
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (deleteError) {
        throw deleteError;
      }

      toast.success('Documento eliminado');
      await loadData();
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Error al eliminar documento');
      return false;
    }
  };

  // Reprocess document
  const reprocessDocument = async (documentId: string): Promise<boolean> => {
    try {
      // Update status to pending
      const { error: updateError } = await supabase
        .from('documents')
        .update({ status: 'pending' })
        .eq('id', documentId);

      if (updateError) {
        throw updateError;
      }

      // Trigger processing
      const { error: processError } = await supabase.functions.invoke('process-document', {
        body: { documentId }
      });

      if (processError) {
        throw processError;
      }

      toast.success('Reprocesamiento iniciado');
      await loadData();
      return true;
    } catch (error) {
      console.error('Error reprocessing document:', error);
      toast.error('Error al reprocesar documento');
      return false;
    }
  };

  // Download document
  const downloadDocument = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(filePath);

      if (error) {
        throw error;
      }

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error('Error al descargar documento');
    }
  };

  // Search documents using embeddings
  const searchDocuments = async (query: string, categoryId?: string) => {
    try {
      // First, generate embedding for the query
      const { data: embedding, error: embeddingError } = await supabase.functions.invoke('generate-embedding', {
        body: { text: query }
      });

      if (embeddingError) {
        throw embeddingError;
      }

      // Search similar documents
      const { data: results, error: searchError } = await supabase.rpc('search_similar_documents', {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: 20,
        category_filter: categoryId || null
      });

      if (searchError) {
        throw searchError;
      }

      return results || [];
    } catch (error) {
      console.error('Error searching documents:', error);
      toast.error('Error en la búsqueda');
      return [];
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  return {
    documents,
    categories,
    loading,
    uploading,
    uploadProgress,
    uploadDocument,
    deleteDocument,
    reprocessDocument,
    downloadDocument,
    searchDocuments,
    refreshData: loadData
  };
};