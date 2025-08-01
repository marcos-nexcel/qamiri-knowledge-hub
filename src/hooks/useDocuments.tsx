import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// ────── Tipos ────────────────────────────────────────────────────────────────
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

// ────── Hook ────────────────────────────────────────────────────────────────
export const useDocuments = () => {
  // State
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Auth
  const { user } = useAuth();

  // ─── Cargar datos (memoizado) ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);

      // 1) Categorías
      const { data: cats, error: catErr } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (catErr) {
        console.error(catErr);
        toast.error('Error al cargar categorías');
      } else {
        setCategories(cats ?? []);
      }

      // 2) Documentos + nombre de categoría
      const { data: docs, error: docErr } = await supabase
        .from('documents')
        .select(`
          *,
          categories!inner(name)
        `)
        .order('created_at', { ascending: false });

      if (docErr) {
        console.error(docErr);
        toast.error('Error al cargar documentos');
      } else {
        setDocuments(docs as Document[]);
      }
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ─── Tipos de archivo soportados ─────────────────────────────────────────
  const SUPPORTED_MIME_TYPES = {
    'application/pdf': { extensions: ['.pdf'], maxSize: 50 * 1024 * 1024 }, // 50MB
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extensions: ['.docx'], maxSize: 50 * 1024 * 1024 },
    'application/msword': { extensions: ['.doc'], maxSize: 50 * 1024 * 1024 },
    'text/plain': { extensions: ['.txt'], maxSize: 10 * 1024 * 1024 }, // 10MB
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { extensions: ['.xlsx'], maxSize: 100 * 1024 * 1024 }, // 100MB
    'application/vnd.ms-excel': { extensions: ['.xls'], maxSize: 100 * 1024 * 1024 },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': { extensions: ['.pptx'], maxSize: 100 * 1024 * 1024 },
    'application/vnd.ms-powerpoint': { extensions: ['.ppt'], maxSize: 100 * 1024 * 1024 },
    'text/csv': { extensions: ['.csv'], maxSize: 50 * 1024 * 1024 },
    'application/csv': { extensions: ['.csv'], maxSize: 50 * 1024 * 1024 }
  };

  // ─── Validar archivo antes de subir ──────────────────────────────────────
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Verificar extensión
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    const supportedType = Object.entries(SUPPORTED_MIME_TYPES).find(
      ([mime, config]) => config.extensions.includes(extension)
    );

    if (!supportedType) {
      return { 
        valid: false, 
        error: `Formato no soportado: ${extension}. Formatos válidos: PDF, DOC, DOCX, TXT, XLS, XLSX, PPT, PPTX, CSV` 
      };
    }

    // Verificar tamaño
    const [mimeType, config] = supportedType;
    if (file.size > config.maxSize) {
      const maxSizeMB = Math.round(config.maxSize / (1024 * 1024));
      return { 
        valid: false, 
        error: `Archivo demasiado grande. Máximo ${maxSizeMB}MB para archivos ${extension}` 
      };
    }

    return { valid: true };
  };

  // ─── Subir documento ──────────────────────────────────────────────────────
  const uploadDocument = async (file: File, categoryId: string): Promise<boolean> => {
    if (!user) {
      toast.error('Usuario no autenticado');
      return false;
    }

    // Validar archivo
    const validation = validateFile(file);
    if (!validation.valid) {
      toast.error(validation.error!);
      return false;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      // Nombre/ubicación únicos
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const filePath = `${categoryId}/${fileName}`;

      // 1) Subir a Storage
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadErr) throw uploadErr;
      setUploadProgress(50);          // indicador aproximado

      // 2) Insertar registro
      const { data: doc, error: docErr } = await supabase
        .from('documents')
        .insert({
          category_id: categoryId,
          name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type || 'application/octet-stream',
          uploaded_by: user.id,
          status: 'pending',
        })
        .select()
        .single();

      if (docErr) throw docErr;
      setUploadProgress(75);

      // 3) Lanzar función de procesamiento
      const { error: procErr } = await supabase.functions.invoke('process-document', {
        body: { documentId: doc.id },
      });
      if (procErr) console.error('Process‑document error:', procErr);

      setUploadProgress(100);
      toast.success('Documento subido correctamente');
      await loadData();
      return true;
    } catch (e) {
      console.error(e);
      toast.error('Error al subir documento');
      return false;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ─── Eliminar documento ───────────────────────────────────────────────────
  const deleteDocument = async (documentId: string): Promise<boolean> => {
    try {
      // 1) Localiza el path
      const { data: doc, error: getErr } = await supabase
        .from('documents')
        .select('file_path')
        .eq('id', documentId)
        .single();
      if (getErr) throw getErr;

      // 2) Borra archivo de Storage
      const { error: storageErr } = await supabase.storage
        .from('documents')
        .remove([doc.file_path]);
      if (storageErr) console.error('Storage delete:', storageErr);

      // 3) Borra registro (y chunks si hay FK‑cascade)
      const { error: delErr } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);
      if (delErr) throw delErr;

      toast.success('Documento eliminado');
      await loadData();
      return true;
    } catch (e) {
      console.error(e);
      toast.error('Error al eliminar documento');
      return false;
    }
  };

  // ─── Reprocesar documento ────────────────────────────────────────────────
  const reprocessDocument = async (documentId: string): Promise<boolean> => {
    try {
      const { error: updErr } = await supabase
        .from('documents')
        .update({ status: 'pending' })
        .eq('id', documentId);
      if (updErr) throw updErr;

      const { error: procErr } = await supabase.functions.invoke('process-document', {
        body: { documentId },
      });
      if (procErr) throw procErr;

      toast.success('Reprocesamiento iniciado');
      await loadData();
      return true;
    } catch (e) {
      console.error(e);
      toast.error('Error al reprocesar documento');
      return false;
    }
  };

  // ─── Descargar documento ─────────────────────────────────────────────────
  const downloadDocument = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(filePath);
      if (error) throw error;

      // `data` is already a Blob
      const blob = data;
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error('Error al descargar documento');
    }
  };

  // ─── Buscar con embeddings ───────────────────────────────────────────────
  const searchDocuments = async (query: string, categoryId?: string) => {
    try {
      // 1) Embedding de la query
      const { data: embResp, error: embErr } = await supabase.functions.invoke(
        'generate-embedding',
        { body: { text: query } },
      );
      if (embErr) throw embErr;

      const { embedding } = embResp ?? {};
      if (!embedding) throw new Error('Sin embedding en la respuesta');

      // 2) RPC en Postgres
      const { data: results, error: searchErr } = await supabase.rpc(
        'search_similar_documents',
        {
          query_embedding: embedding,
          match_threshold: 0.7,
          match_count: 20,
          category_filter: categoryId ?? null,
        },
      );
      if (searchErr) throw searchErr;

      return results ?? [];
    } catch (e) {
      console.error(e);
      toast.error('Error en la búsqueda');
      return [];
    }
  };

  // ─── Efecto inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── API que expone el hook ──────────────────────────────────────────────
  return {
    // datos
    documents,
    categories,
    loading,

    // estado de subida
    uploading,
    uploadProgress,

    // acciones
    uploadDocument,
    deleteDocument,
    reprocessDocument,
    downloadDocument,
    searchDocuments,
    refreshData: loadData,
  };
};
