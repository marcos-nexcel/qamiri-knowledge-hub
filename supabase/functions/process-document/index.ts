import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getDocument } from 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId } = await req.json();

    if (!documentId) {
      throw new Error('Document ID is required');
    }

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log(`Processing document: ${documentId}`);
    console.log(`OpenAI API key configured: ${!!openAIApiKey}`);

    // Create Supabase client with service role key for full access
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get document details
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    // Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.file_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // Extract text from file
    let fileText: string;
    
    if (document.file_type === 'application/pdf') {
      // Extract text from PDF
      fileText = await extractTextFromPDF(fileData);
    } else {
      // For text files, try to read as text
      fileText = await fileData.text();
    }
    
    // Split text into chunks
    const chunks = splitTextIntoChunks(fileText, 1000, 100);
    
    console.log(`Split document into ${chunks.length} chunks`);

    // Process chunks and generate embeddings
    const processedChunks = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        // Generate embedding using OpenAI
        const embedding = await generateEmbedding(chunk);
        
        // Store chunk with embedding
        const { error: chunkError } = await supabase
          .from('document_chunks')
          .insert({
            document_id: documentId,
            chunk_index: i,
            content: chunk,
            embedding: embedding,
            metadata: {
              length: chunk.length,
              position: i
            }
          });

        if (chunkError) {
          console.error(`Error storing chunk ${i}:`, chunkError);
        } else {
          processedChunks.push(i);
        }
      } catch (error) {
        console.error(`Error processing chunk ${i}:`, error);
      }
    }

    // Update document status and chunk count
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        status: processedChunks.length === chunks.length ? 'processed' : 'error',
        chunk_count: processedChunks.length,
        processed_at: new Date().toISOString()
      })
      .eq('id', documentId);

    if (updateError) {
      console.error('Error updating document:', updateError);
    }

    console.log(`Successfully processed ${processedChunks.length}/${chunks.length} chunks`);

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        chunksProcessed: processedChunks.length,
        totalChunks: chunks.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-document function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Document processing failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Helper function to split text into chunks
function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  
  // Clean the text to remove null characters and other problematic characters
  const cleanText = text
    .replace(/\u0000/g, '') // Remove null characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control characters
    .trim();
  
  let start = 0;

  while (start < cleanText.length) {
    const end = Math.min(start + chunkSize, cleanText.length);
    const chunk = cleanText.slice(start, end).trim();
    
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    if (end === cleanText.length) break;
    start = end - overlap;
  }

  return chunks;
}

// Helper function to extract text from PDF
async function extractTextFromPDF(fileData: Blob): Promise<string> {
  try {
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    const pdf = await getDocument({
      data: uint8Array,
      verbosity: 0 // Reduce logging
    }).promise;
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    // Fallback: return empty string or throw error
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

// Helper function to generate embeddings using OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}