-- Habilitar la extensión vector para embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Crear bucket de storage para documentos
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Crear tabla de documentos
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'error')),
  chunk_count INTEGER DEFAULT 0,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Crear tabla de chunks (fragmentos de documentos)
CREATE TABLE public.document_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536), -- OpenAI embeddings tienen 1536 dimensiones
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear índices para optimizar búsquedas
CREATE INDEX idx_documents_category_id ON public.documents(category_id);
CREATE INDEX idx_documents_status ON public.documents(status);
CREATE INDEX idx_documents_uploaded_by ON public.documents(uploaded_by);
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_document_chunks_embedding ON public.document_chunks USING ivfflat (embedding vector_cosine_ops);

-- Habilitar RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para documentos
CREATE POLICY "Admins can manage all documents" 
ON public.documents 
FOR ALL 
USING (is_admin(auth.uid()));

CREATE POLICY "Users can view documents in their accessible categories" 
ON public.documents 
FOR SELECT 
USING (
  can_access_category(auth.uid(), category_id)
);

-- Políticas RLS para chunks
CREATE POLICY "Admins can manage all chunks" 
ON public.document_chunks 
FOR ALL 
USING (is_admin(auth.uid()));

CREATE POLICY "Users can view chunks from accessible documents" 
ON public.document_chunks 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.documents d 
    WHERE d.id = document_id 
    AND can_access_category(auth.uid(), d.category_id)
  )
);

-- Políticas de storage para documentos
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can view documents they have access to"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents' 
  AND (
    is_admin(auth.uid()) 
    OR EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.categories c ON d.category_id = c.id
      WHERE d.file_path = name
      AND can_access_category(auth.uid(), c.id)
    )
  )
);

CREATE POLICY "Admins can manage all document files"
ON storage.objects
FOR ALL
USING (bucket_id = 'documents' AND is_admin(auth.uid()));

-- Trigger para actualizar updated_at
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Función para buscar documentos similares usando embeddings
CREATE OR REPLACE FUNCTION public.search_similar_documents(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.8,
  match_count INT DEFAULT 10,
  category_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  document_id UUID,
  document_name TEXT,
  category_name TEXT,
  chunk_content TEXT,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    d.id as document_id,
    d.name as document_name,
    c.name as category_name,
    dc.content as chunk_content,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  JOIN categories c ON d.category_id = c.id
  WHERE 
    1 - (dc.embedding <=> query_embedding) > match_threshold
    AND (category_filter IS NULL OR d.category_id = category_filter)
    AND can_access_category(auth.uid(), d.category_id)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;