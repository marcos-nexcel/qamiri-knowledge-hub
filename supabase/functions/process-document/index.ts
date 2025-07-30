import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.211.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

// ─── Config ──────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Server ──────────────────────────────────────────────────────────────────
serve(async (req) => {
  console.log(`${req.method} ${req.url}`);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let documentId: string | null = null;

  try {
    const body = await req.json();
    documentId = body.documentId;
    
    if (!documentId) throw new Error("Document ID is required");
    if (!openAIApiKey) throw new Error("OPENAI_API_KEY not configured");

    console.log(`Processing document: ${documentId}`);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1️⃣  Recupera metadatos
    const { data: document, error: docError } = await supabase
      .from("documents").select("*").eq("id", documentId).single();
    if (docError || !document) throw new Error(`Document not found: ${docError?.message}`);

    console.log(`Document found: ${document.name}, type: ${document.file_type}, size: ${document.file_size} bytes`);

    // 2️⃣  Actualizar estado a processing
    await supabase.from("documents")
      .update({ 
        status: "processing",
        updated_at: new Date().toISOString() 
      }).eq("id", documentId);

    // 3️⃣  Descarga el archivo
    console.log(`Downloading file: ${document.file_path}`);
    const { data: blob, error: downloadError } = await supabase.storage
      .from("documents").download(document.file_path);
    if (downloadError || !blob) throw new Error(`Download error: ${downloadError?.message}`);

    console.log(`File downloaded: ${blob.size} bytes`);

    // 4️⃣  Extrae texto según MIME
    const fileText = await extractText(blob, document.file_type);
    console.log(`Text extracted: ${fileText.length} characters`);

    if (!fileText || fileText.length < 10) {
      throw new Error("No meaningful text could be extracted from the document");
    }

    // 5️⃣  Divide y vectoriza
    const chunks = splitText(fileText, 1000, 100);
    console.log(`Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      throw new Error("No chunks could be created from the extracted text");
    }

    // 6️⃣  Limpiar chunks existentes del documento
    const { error: deleteError } = await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId);
      
    if (deleteError) {
      console.warn("Error deleting existing chunks:", deleteError);
    }

    // 7️⃣  Procesar chunks uno por uno con mejor logging
    const processed: number[] = [];
    
    for (const [i, chunk] of chunks.entries()) {
      try {
        console.log(`Processing chunk ${i + 1}/${chunks.length}`);
        
        if (chunk.trim().length < 10) {
          console.warn(`Skipping chunk ${i} - too short`);
          continue;
        }

        const embedding = await embed(chunk);
        
        const { error } = await supabase.from("document_chunks").insert({
          document_id: documentId,
          chunk_index: i,
          content: chunk,
          embedding,
          metadata: { 
            length: chunk.length, 
            position: i,
            total_chunks: chunks.length 
          },
        });
        
        if (error) {
          console.error(`Error inserting chunk ${i}:`, error);
          throw error;
        }
        
        processed.push(i);
        
        // Pequeña pausa para evitar rate limiting
        if (i > 0 && i % 5 === 0) {
          console.log(`Processed ${processed.length} chunks, waiting 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (e) {
        console.error(`Failed processing chunk ${i}:`, e);
        // No lanzar error aquí, continuar con el siguiente chunk
      }
    }

    console.log(`Successfully processed ${processed.length}/${chunks.length} chunks`);

    // 8️⃣  Estado final
    const finalStatus = processed.length > 0 ? "processed" : "error";
    
    await supabase.from("documents").update({
      status: finalStatus,
      chunk_count: processed.length,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", documentId);

    console.log(`Document processing completed: ${finalStatus}`);

    return json({ 
      success: true, 
      documentId, 
      chunksProcessed: processed.length, 
      totalChunks: chunks.length,
      status: finalStatus
    });
    
  } catch (err) {
    console.error("Processing failed:", err);
    
    // Actualizar documento con error si tenemos el ID
    if (documentId) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase.from("documents").update({
          status: "error",
          updated_at: new Date().toISOString()
        }).eq("id", documentId);
      } catch (updateError) {
        console.error("Failed to update document status to error:", updateError);
      }
    }
    
    return json({ 
      error: "Processing failed", 
      details: err.message,
      documentId: documentId || "unknown"
    }, 500);
  }
}, { onListen: ({ hostname, port }) => console.log(`➜  Listening on http://${hostname}:${port}`) });

// ─── Utilidades ──────────────────────────────────────────────────────────────
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function splitText(text: string, size: number, overlap: number) {
  const clean = text
    .replace(/\u0000/g, "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
    
  if (clean.length <= size) {
    return [clean];
  }
    
  const out: string[] = [];
  for (let start = 0; start < clean.length;) {
    let end = Math.min(start + size, clean.length);
    
    // Buscar un punto de corte natural
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(" ", end);
      const lastPeriod = clean.lastIndexOf(".", end);
      const cutPoint = Math.max(lastSpace, lastPeriod);
      
      if (cutPoint > start + 100) {
        end = cutPoint + 1;
      }
    }
    
    const chunk = clean.slice(start, end).trim();
    if (chunk.length > 50) { // Solo chunks significativos
      out.push(chunk);
    }
    
    if (end === clean.length) break;
    start = end - overlap;
  }
  
  return out.filter(chunk => chunk.length > 0);
}

async function embed(text: string) {
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${openAIApiKey}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({ 
        model: "text-embedding-3-small", 
        input: text, 
        encoding_format: "float" 
      }),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenAI API error: ${res.status} - ${errorText}`);
    }
    
    const data = await res.json();
    
    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error("Invalid response from OpenAI API");
    }
    
    return data.data[0].embedding as number[];
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

async function extractText(blob: Blob, mime: string): Promise<string> {
  console.log(`Extracting text from ${mime}, size: ${blob.size} bytes`);
  
  switch (mime) {
    case "application/pdf":
      return extractPdf(blob);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(blob);
    case "application/msword":
      return extractDoc(blob);
    case "text/plain":
      return extractTxt(blob);
    default:
      console.warn(`Unsupported file type: ${mime}, trying text extraction`);
      return extractTxt(blob);
  }
}

// ── PDF (método simplificado sin PDF.js) ────────────────────────────────────
async function extractPdf(blob: Blob): Promise<string> {
  try {
    console.log("Attempting PDF text extraction...");
    
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const text = new TextDecoder('latin1').decode(uint8Array);
    
    // Buscar objetos de texto en PDF usando patrones básicos
    const textObjects: string[] = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      // Buscar texto entre paréntesis o corchetes (formato común en PDF)
      const textMatches = line.match(/\((.*?)\)/g) || line.match(/\[(.*?)\]/g);
      if (textMatches) {
        for (const match of textMatches) {
          const cleanText = match.replace(/[()[\]]/g, '').trim();
          if (cleanText.length > 3 && /[a-zA-Z]/.test(cleanText)) {
            textObjects.push(cleanText);
          }
        }
      }
      
      // También buscar texto plano legible
      const plainText = line.replace(/[^\x20-\x7E]/g, ' ').trim();
      if (plainText.length > 10 && /[a-zA-Z].*[a-zA-Z]/.test(plainText)) {
        textObjects.push(plainText);
      }
    }
    
    const extractedText = textObjects.join(' ').replace(/\s+/g, ' ').trim();
    console.log(`PDF extraction result: ${extractedText.length} characters`);
    
    if (extractedText.length < 10) {
      throw new Error("Could not extract meaningful text from PDF");
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

// ── DOCX (método mejorado sin DOMParser) ───────────────────────────────────
async function extractDocx(blob: Blob): Promise<string> {
  try {
    console.log("Attempting DOCX text extraction with JSZip...");
    
    // Import JSZip dynamically
    const JSZip = (await import('https://esm.sh/jszip@3.10.1')).default;
    
    const arrayBuffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Get the main document XML file
    const documentXml = zip.file("word/document.xml");
    if (!documentXml) {
      throw new Error("word/document.xml not found in DOCX file");
    }
    
    const xmlContent = await documentXml.async("string");
    console.log(`Extracted XML content: ${xmlContent.length} characters`);
    
    // Extract text using regex patterns instead of DOMParser
    const textNodes: string[] = [];
    
    // Pattern for text content in w:t tags
    const textPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let match;
    
    while ((match = textPattern.exec(xmlContent)) !== null) {
      const textContent = match[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
      
      if (textContent && textContent.length > 0) {
        textNodes.push(textContent);
      }
    }
    
    // Also try to extract from w:p (paragraph) content
    const paragraphPattern = /<w:p[^>]*>(.*?)<\/w:p>/gs;
    let pMatch;
    
    while ((pMatch = paragraphPattern.exec(xmlContent)) !== null) {
      const paragraphContent = pMatch[1];
      // Extract just text, ignoring other XML tags
      const textInParagraph = paragraphContent
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (textInParagraph && textInParagraph.length > 3) {
        textNodes.push(textInParagraph);
      }
    }
    
    const extractedText = textNodes.join(' ').replace(/\s+/g, ' ').trim();
    console.log(`DOCX extraction result: ${extractedText.length} characters`);
    
    if (extractedText.length < 10) {
      throw new Error("Could not extract meaningful text from DOCX");
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting DOCX text:', error);
    throw new Error(`DOCX extraction failed: ${error.message}`);
  }
}

// ── DOC (formato legacy) ──────────────────────────────────────────────────
async function extractDoc(blob: Blob): Promise<string> {
  try {
    console.log("Attempting DOC text extraction...");
    
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const text = new TextDecoder('latin1').decode(uint8Array);
    
    // DOC tiene una estructura binaria compleja, extraer texto legible
    const readableChunks: string[] = [];
    const lines = text.split(/[\r\n]+/);
    
    for (const line of lines) {
      // Buscar secuencias de texto legible
      const cleanLine = line
        .replace(/[\x00-\x1F\x7F-\xFF]/g, ' ') // Remover caracteres de control y binarios
        .replace(/\s+/g, ' ')
        .trim();
      
      // Solo mantener líneas que parezcan texto real
      if (cleanLine.length > 5 && /[a-zA-Z].*[a-zA-Z]/.test(cleanLine)) {
        readableChunks.push(cleanLine);
      }
    }
    
    const extractedText = readableChunks.join(' ').trim();
    console.log(`DOC extraction result: ${extractedText.length} characters`);
    
    if (extractedText.length < 10) {
      throw new Error("Could not extract meaningful text from DOC");
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting DOC text:', error);
    throw new Error(`DOC extraction failed: ${error.message}`);
  }
}

// ── TXT ─────────────────────────────────────────────────────────────────────
async function extractTxt(blob: Blob): Promise<string> {
  try {
    console.log("Attempting TXT text extraction...");
    
    // Intentar UTF-8 primero
    try {
      const text = new TextDecoder('utf-8').decode(await blob.arrayBuffer());
      console.log(`TXT extraction (UTF-8): ${text.length} characters`);
      return text;
    } catch {
      // Si falla, intentar Latin-1
      const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
      console.log(`TXT extraction (Latin-1): ${text.length} characters`);
      return text;
    }
  } catch (error) {
    console.error('Error extracting TXT text:', error);
    throw new Error(`TXT extraction failed: ${error.message}`);
  }
}
