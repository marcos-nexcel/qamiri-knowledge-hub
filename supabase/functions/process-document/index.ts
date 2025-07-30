import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Configure PDF.js worker for Deno environment
globalThis.GlobalWorkerOptions = {
  workerSrc: 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs'
};

import { getDocument } from 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs';

// Import libraries for document processing
import JSZip from 'https://esm.sh/jszip@3.10.1';
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

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

    // Extract text from file based on type
    console.log(`Extracting text from file type: ${document.file_type}`);
    let fileText: string;
    
    try {
      fileText = await extractTextFromFile(fileData, document.file_type);
      
      if (!fileText || fileText.trim().length === 0) {
        throw new Error('No text could be extracted from the document');
      }
      
      console.log(`Extracted ${fileText.length} characters from document`);
    } catch (extractError) {
      console.error('Text extraction failed:', extractError);
      throw new Error(`Failed to extract text: ${extractError.message}`);
    }
    
    // Split text into chunks
    const chunks = splitTextIntoChunks(fileText, 1000, 100);
    
    console.log(`Split document into ${chunks.length} chunks`);

    // Clear existing chunks for this document before processing new ones
    console.log('Clearing existing chunks for document...');
    const { error: deleteError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);
    
    if (deleteError) {
      console.error('Error deleting existing chunks:', deleteError);
    }

    // Process chunks in batches for better efficiency
    const BATCH_SIZE = 10;
    const processedChunks = [];
    
    console.log(`Processing ${chunks.length} chunks in batches of ${BATCH_SIZE}...`);
    
    for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
      const batch = chunks.slice(batchStart, batchEnd);
      
      console.log(`Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (chunks ${batchStart}-${batchEnd - 1})`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (chunk, index) => {
        const chunkIndex = batchStart + index;
        
        try {
          // Generate embedding using OpenAI with retry logic
          const embedding = await generateEmbeddingWithRetry(chunk, 3);
          
          return {
            document_id: documentId,
            chunk_index: chunkIndex,
            content: chunk,
            embedding: embedding,
            metadata: {
              length: chunk.length,
              position: chunkIndex,
              batch: Math.floor(batchStart / BATCH_SIZE) + 1
            }
          };
        } catch (error) {
          console.error(`Error processing chunk ${chunkIndex}:`, error);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      const validChunks = batchResults.filter(chunk => chunk !== null);
      
      if (validChunks.length > 0) {
        // Store batch in database
        const { error: batchInsertError } = await supabase
          .from('document_chunks')
          .insert(validChunks);
        
        if (batchInsertError) {
          console.error(`Error storing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}:`, batchInsertError);
          
          // Try inserting chunks individually as fallback
          for (const chunk of validChunks) {
            try {
              const { error: individualError } = await supabase
                .from('document_chunks')
                .insert(chunk);
              
              if (!individualError) {
                processedChunks.push(chunk.chunk_index);
              } else {
                console.error(`Error storing individual chunk ${chunk.chunk_index}:`, individualError);
              }
            } catch (individualError) {
              console.error(`Failed to store chunk ${chunk.chunk_index}:`, individualError);
            }
          }
        } else {
          // Success - add all chunk indices to processed list
          validChunks.forEach(chunk => processedChunks.push(chunk.chunk_index));
          console.log(`Successfully stored batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (${validChunks.length} chunks)`);
        }
      }
      
      // Add small delay between batches to avoid overwhelming the API
      if (batchEnd < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
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

// Main function to extract text from any supported file type
async function extractTextFromFile(fileData: Blob, fileType: string): Promise<string> {
  console.log(`Starting text extraction for file type: ${fileType}`);
  
  switch (fileType) {
    case 'application/pdf':
      return await extractTextFromPDF(fileData);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return await extractTextFromDOCX(fileData);
    case 'application/msword':
      return await extractTextFromDOC(fileData);
    case 'text/plain':
      return await fileData.text();
    default:
      // Try to read as text for unknown types
      try {
        const text = await fileData.text();
        if (text && text.trim().length > 0) {
          return text;
        }
        throw new Error(`Unsupported file type: ${fileType}`);
      } catch {
        throw new Error(`Unsupported file type: ${fileType}`);
      }
  }
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
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

// Helper function to extract text from DOCX files
async function extractTextFromDOCX(fileData: Blob): Promise<string> {
  try {
    const arrayBuffer = await fileData.arrayBuffer();
    const zip = new JSZip();
    const zipFile = await zip.loadAsync(arrayBuffer);
    
    const documentXml = await zipFile.file('word/document.xml')?.async('string');
    if (!documentXml) {
      throw new Error('Invalid DOCX file: document.xml not found');
    }
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(documentXml, 'text/xml');
    
    // Extract text from all text nodes
    const textNodes = doc.getElementsByTagName('w:t');
    let fullText = '';
    
    for (let i = 0; i < textNodes.length; i++) {
      const textContent = textNodes[i].textContent;
      if (textContent) {
        fullText += textContent + ' ';
      }
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('Error extracting text from DOCX:', error);
    throw new Error(`Failed to extract text from DOCX: ${error.message}`);
  }
}

// Helper function to extract text from DOC files (legacy format)
async function extractTextFromDOC(fileData: Blob): Promise<string> {
  try {
    // For DOC files, we'll try a simple text extraction approach
    // This is a basic implementation - DOC format is complex
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to string and try to extract readable text
    let text = '';
    let inTextRegion = false;
    
    for (let i = 0; i < uint8Array.length - 1; i++) {
      const char = uint8Array[i];
      
      // Skip non-printable characters except spaces and newlines
      if ((char >= 32 && char <= 126) || char === 9 || char === 10 || char === 13) {
        const charStr = String.fromCharCode(char);
        
        // Simple heuristic to detect text regions
        if (/[a-zA-Z]/.test(charStr)) {
          inTextRegion = true;
        }
        
        if (inTextRegion) {
          text += charStr;
          
          // Reset if we hit too many non-letters in a row
          if (!/[a-zA-Z\s]/.test(charStr)) {
            let nonLetterCount = 0;
            for (let j = i; j < Math.min(i + 10, uint8Array.length); j++) {
              if (!/[a-zA-Z\s]/.test(String.fromCharCode(uint8Array[j]))) {
                nonLetterCount++;
              }
            }
            if (nonLetterCount > 5) {
              inTextRegion = false;
            }
          }
        }
      } else if (inTextRegion && char === 0) {
        // Null character might indicate end of text region
        text += ' ';
      }
    }
    
    // Clean up the extracted text
    text = text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s.,;:!?()-]/g, '') // Remove most special characters
      .trim();
    
    if (!text || text.length < 10) {
      throw new Error('Could not extract meaningful text from DOC file');
    }
    
    return text;
  } catch (error) {
    console.error('Error extracting text from DOC:', error);
    throw new Error(`Failed to extract text from DOC: ${error.message}`);
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

// Helper function to generate embeddings with retry logic
async function generateEmbeddingWithRetry(text: string, maxRetries: number): Promise<number[]> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateEmbedding(text);
    } catch (error) {
      lastError = error as Error;
      console.error(`Embedding generation attempt ${attempt}/${maxRetries} failed:`, error);
      
      if (attempt < maxRetries) {
        // Exponential backoff: wait 2^attempt seconds
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw new Error(`Failed to generate embedding after ${maxRetries} attempts: ${lastError.message}`);
}