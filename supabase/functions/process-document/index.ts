import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.211.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

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

    // 5️⃣  Divide y vectoriza con estrategia inteligente
    const chunks = createIntelligentChunks(fileText, document.file_type);
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

// ─── Chunking inteligente por tipo de documento ────────────────────────────
function createIntelligentChunks(text: string, mimeType: string): string[] {
  const clean = text
    .replace(/\u0000/g, "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Configuración por tipo de documento
  const chunkConfig = getChunkConfigByType(mimeType);
  
  if (clean.length <= chunkConfig.size) {
    return [clean];
  }

  // Para CSV y Excel, chunking por filas
  if (mimeType.includes('csv') || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    return chunkCsvOrExcel(clean, chunkConfig);
  }
  
  // Para presentaciones, chunking por slides
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    return chunkPresentation(clean, chunkConfig);
  }
  
  // Para documentos de texto tradicionales
  return chunkTextDocument(clean, chunkConfig);
}

function getChunkConfigByType(mimeType: string) {
  if (mimeType.includes('csv') || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    return { size: 1500, overlap: 50 }; // Chunks más grandes para datos tabulares
  }
  
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    return { size: 800, overlap: 100 }; // Chunks medianos para slides
  }
  
  return { size: 1000, overlap: 100 }; // Configuración estándar
}

function chunkCsvOrExcel(text: string, config: { size: number; overlap: number }): string[] {
  const lines = text.split(/[\r\n]+/).filter(line => line.trim().length > 0);
  const chunks: string[] = [];
  
  // Mantener headers en cada chunk si es posible
  const headers = lines.length > 0 ? lines[0] : '';
  const dataLines = lines.slice(1);
  
  let currentChunk = headers;
  
  for (const line of dataLines) {
    const testChunk = currentChunk + '\n' + line;
    
    if (testChunk.length > config.size && currentChunk !== headers) {
      chunks.push(currentChunk.trim());
      currentChunk = headers + '\n' + line; // Nuevo chunk con headers
    } else {
      currentChunk = testChunk;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 50);
}

function chunkPresentation(text: string, config: { size: number; overlap: number }): string[] {
  // Dividir por slides si hay marcadores
  const slideParts = text.split(/--- Slide \d+ ---/);
  const chunks: string[] = [];
  
  for (let i = 0; i < slideParts.length; i++) {
    const slidePart = slideParts[i].trim();
    if (slidePart.length > 0) {
      if (slidePart.length <= config.size) {
        chunks.push(slidePart);
      } else {
        // Si un slide es muy largo, dividirlo normalmente
        chunks.push(...chunkTextDocument(slidePart, config));
      }
    }
  }
  
  return chunks.filter(chunk => chunk.length > 50);
}

function chunkTextDocument(text: string, config: { size: number; overlap: number }): string[] {
  const out: string[] = [];
  
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + config.size, text.length);
    
    // Buscar un punto de corte natural
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const cutPoint = Math.max(lastSpace, lastPeriod, lastNewline);
      
      if (cutPoint > start + 100) {
        end = cutPoint + 1;
      }
    }
    
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {
      out.push(chunk);
    }
    
    if (end === text.length) break;
    start = end - config.overlap;
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
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return extractXlsx(blob);
    case "application/vnd.ms-excel":
    case "application/x-ms-excel":
      return extractXls(blob);
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return extractPptx(blob);
    case "application/vnd.ms-powerpoint":
      return extractPpt(blob);
    case "text/csv":
    case "application/csv":
      return extractCsv(blob);
    default:
      console.warn(`Unsupported file type: ${mime}, trying text extraction`);
      return extractTxt(blob);
  }
}

// ── PDF (método completamente nuevo sin bibliotecas externas) ──────────────
export async function extractPdf(
  blob: Blob,
  opts: { maxChars?: number } = {},
): Promise<string[]> {
  const { maxChars = 2_000 } = opts;

  /* En navegador indica una vez la ruta del worker de PDF.js:
     GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'; */

  // 1) Cargar y parsear el PDF (incluye descompresión y decodificación)
  const data = new Uint8Array(await blob.arrayBuffer());
  const pdf = await getDocument({ data }).promise;                 // :contentReference[oaicite:0]{index=0}

  // 2) Acumular texto página a página
  let fullText = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    fullText += items.map(i => (i as any).str).join(' ') + '\n';

    //  Evita bloquear el event-loop en PDFs gigantes
    if (p % 10 === 0) await new Promise(r => setTimeout(r));
  }

  // 3) Splitter: agrupa por frases hasta `maxChars`
  const sentences = fullText
    .replace(/\s+/g, ' ')            // normaliza espacios
    .split(/(?<=[.!?¡¿])\s+/);       // separa por signos de puntuación

  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxChars) {
      chunks.push(current.trim());
      current = '';
    }
    current += s + ' ';
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;                                                         // :contentReference[oaicite:1]{index=1}
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

// ── XLSX (Excel 2007+) ──────────────────────────────────────────────────────
async function extractXlsx(blob: Blob): Promise<string> {
  try {
    console.log("Attempting XLSX text extraction...");
    
    const JSZip = (await import('https://esm.sh/jszip@3.10.1')).default;
    
    const arrayBuffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Extraer strings compartidas
    const sharedStringsFile = zip.file("xl/sharedStrings.xml");
    const sharedStrings: string[] = [];
    
    if (sharedStringsFile) {
      const sharedStringsXml = await sharedStringsFile.async("string");
      const stringPattern = /<t[^>]*>([^<]*)<\/t>/g;
      let match;
      while ((match = stringPattern.exec(sharedStringsXml)) !== null) {
        sharedStrings.push(match[1]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
        );
      }
    }
    
    // Procesar hojas de trabajo
    const workbookFile = zip.file("xl/workbook.xml");
    const allText: string[] = [];
    
    if (workbookFile) {
      const workbookXml = await workbookFile.async("string");
      const sheetPattern = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g;
      let sheetMatch;
      
      while ((sheetMatch = sheetPattern.exec(workbookXml)) !== null) {
        const sheetName = sheetMatch[1];
        console.log(`Processing sheet: ${sheetName}`);
        
        // Buscar archivo de hoja correspondiente
        const worksheetFiles = Object.keys(zip.files).filter(name => 
          name.startsWith("xl/worksheets/sheet") && name.endsWith(".xml")
        );
        
        for (const worksheetPath of worksheetFiles) {
          const worksheetFile = zip.file(worksheetPath);
          if (worksheetFile) {
            const worksheetXml = await worksheetFile.async("string");
            
            // Extraer valores de celdas
            const cellPattern = /<c[^>]*r="[^"]*"[^>]*(?:t="s"[^>]*)?><v>([^<]*)<\/v><\/c>/g;
            const inlineStringPattern = /<c[^>]*r="[^"]*"[^>]*><is><t>([^<]*)<\/t><\/is><\/c>/g;
            
            let cellMatch;
            const rowData: string[] = [];
            
            // Valores con referencia a string compartida
            while ((cellMatch = cellPattern.exec(worksheetXml)) !== null) {
              const value = cellMatch[1];
              const numValue = parseInt(value);
              if (!isNaN(numValue) && sharedStrings[numValue]) {
                rowData.push(sharedStrings[numValue]);
              } else {
                rowData.push(value);
              }
            }
            
            // Strings inline
            while ((cellMatch = inlineStringPattern.exec(worksheetXml)) !== null) {
              rowData.push(cellMatch[1]);
            }
            
            if (rowData.length > 0) {
              allText.push(`Hoja: ${sheetName}`, ...rowData);
            }
          }
        }
      }
    }
    
    const extractedText = allText.join(' ').replace(/\s+/g, ' ').trim();
    console.log(`XLSX extraction result: ${extractedText.length} characters`);
    
    if (extractedText.length < 10) {
      throw new Error("Could not extract meaningful text from XLSX");
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting XLSX text:', error);
    throw new Error(`XLSX extraction failed: ${error.message}`);
  }
}

// ── XLS (Excel legacy) ──────────────────────────────────────────────────────
async function extractXls(blob: Blob): Promise<string> {
  try {
    console.log("Attempting XLS text extraction...");
    
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const text = new TextDecoder('latin1').decode(uint8Array);
    
    // XLS tiene estructura binaria BIFF, extraer strings legibles
    const readableChunks: string[] = [];
    const chunks = text.split(/[\x00-\x1F]+/);
    
    for (const chunk of chunks) {
      const cleanChunk = chunk
        .replace(/[\x7F-\xFF]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Solo mantener chunks que parezcan texto real
      if (cleanChunk.length > 3 && /[a-zA-Z0-9]/.test(cleanChunk)) {
        // Filtrar chunks que son solo símbolos o caracteres especiales
        if (!/^[^\w\s]+$/.test(cleanChunk)) {
          readableChunks.push(cleanChunk);
        }
      }
    }
    
    const extractedText = readableChunks.join(' ').trim();
    console.log(`XLS extraction result: ${extractedText.length} characters`);
    
    if (extractedText.length < 10) {
      throw new Error("Could not extract meaningful text from XLS");
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting XLS text:', error);
    throw new Error(`XLS extraction failed: ${error.message}`);
  }
}

// ── PPTX (PowerPoint 2007+) ─────────────────────────────────────────────────
async function extractPptx(blob: Blob): Promise<string> {
  try {
    console.log("Attempting PPTX text extraction...");
    
    const JSZip = (await import('https://esm.sh/jszip@3.10.1')).default;
    
    const arrayBuffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    const allText: string[] = [];
    
    // Buscar archivos de slides
    const slideFiles = Object.keys(zip.files).filter(name => 
      name.startsWith("ppt/slides/slide") && name.endsWith(".xml")
    );
    
    for (const slidePath of slideFiles) {
      const slideFile = zip.file(slidePath);
      if (slideFile) {
        const slideNumber = slidePath.match(/slide(\d+)\.xml/)?.[1] || '?';
        console.log(`Processing slide ${slideNumber}`);
        
        const slideXml = await slideFile.async("string");
        
        // Extraer texto de elementos a:t (texto)
        const textPattern = /<a:t[^>]*>([^<]*)<\/a:t>/g;
        let match;
        const slideTexts: string[] = [`--- Slide ${slideNumber} ---`];
        
        while ((match = textPattern.exec(slideXml)) !== null) {
          const textContent = match[1]
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .trim();
          
          if (textContent && textContent.length > 0) {
            slideTexts.push(textContent);
          }
        }
        
        // También extraer de p:sp (shapes con texto)
        const shapeTextPattern = /<p:sp[^>]*>(.*?)<\/p:sp>/gs;
        let shapeMatch;
        
        while ((shapeMatch = shapeTextPattern.exec(slideXml)) !== null) {
          const shapeContent = shapeMatch[1];
          const innerTextPattern = /<a:t[^>]*>([^<]*)<\/a:t>/g;
          let innerMatch;
          
          while ((innerMatch = innerTextPattern.exec(shapeContent)) !== null) {
            const textContent = innerMatch[1].trim();
            if (textContent && textContent.length > 0) {
              slideTexts.push(textContent);
            }
          }
        }
        
        if (slideTexts.length > 1) {
          allText.push(...slideTexts);
        }
      }
    }
    
    const extractedText = allText.join(' ').replace(/\s+/g, ' ').trim();
    console.log(`PPTX extraction result: ${extractedText.length} characters`);
    
    if (extractedText.length < 10) {
      throw new Error("Could not extract meaningful text from PPTX");
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting PPTX text:', error);
    throw new Error(`PPTX extraction failed: ${error.message}`);
  }
}

// ── PPT (PowerPoint legacy) ─────────────────────────────────────────────────
async function extractPpt(blob: Blob): Promise<string> {
  try {
    console.log("Attempting PPT text extraction...");
    
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const text = new TextDecoder('latin1').decode(uint8Array);
    
    // PPT tiene estructura binaria compleja, extraer texto legible
    const readableChunks: string[] = [];
    
    // Buscar bloques de texto que parezcan slides
    const chunks = text.split(/[\x00-\x1F]+/);
    
    for (const chunk of chunks) {
      const cleanChunk = chunk
        .replace(/[\x7F-\xFF]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Solo mantener chunks que parezcan texto real de presentación
      if (cleanChunk.length > 5 && /[a-zA-Z].*[a-zA-Z]/.test(cleanChunk)) {
        // Filtrar chunks que son solo símbolos o metadatos
        if (!/^[^\w\s]+$/.test(cleanChunk) && 
            !cleanChunk.includes('Microsoft') && 
            !cleanChunk.includes('PowerPoint')) {
          readableChunks.push(cleanChunk);
        }
      }
    }
    
    const extractedText = readableChunks.join(' ').trim();
    console.log(`PPT extraction result: ${extractedText.length} characters`);
    
    if (extractedText.length < 10) {
      throw new Error("Could not extract meaningful text from PPT");
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting PPT text:', error);
    throw new Error(`PPT extraction failed: ${error.message}`);
  }
}

// ── CSV ─────────────────────────────────────────────────────────────────────
async function extractCsv(blob: Blob): Promise<string> {
  try {
    console.log("Attempting CSV text extraction...");
    
    // Intentar diferentes encodings
    let csvText: string;
    try {
      csvText = new TextDecoder('utf-8').decode(await blob.arrayBuffer());
    } catch {
      csvText = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    }
    
    // Detectar delimitador
    const commaCount = (csvText.match(/,/g) || []).length;
    const semicolonCount = (csvText.match(/;/g) || []).length;
    const tabCount = (csvText.match(/\t/g) || []).length;
    
    let delimiter = ',';
    if (semicolonCount > commaCount && semicolonCount > tabCount) {
      delimiter = ';';
    } else if (tabCount > commaCount && tabCount > semicolonCount) {
      delimiter = '\t';
    }
    
    console.log(`Detected CSV delimiter: "${delimiter}"`);
    
    const lines = csvText.split(/[\r\n]+/).filter(line => line.trim().length > 0);
    const processedRows: string[] = [];
    
    // Procesar máximo 1000 filas para evitar contenido excesivo
    const maxRows = Math.min(lines.length, 1000);
    
    for (let i = 0; i < maxRows; i++) {
      const line = lines[i];
      const columns = line.split(delimiter).map(col => 
        col.replace(/^["']|["']$/g, '').trim()
      );
      
      // Solo incluir filas con contenido significativo
      const meaningfulColumns = columns.filter(col => 
        col.length > 0 && col !== delimiter
      );
      
      if (meaningfulColumns.length > 0) {
        if (i === 0) {
          processedRows.push(`Cabeceras: ${meaningfulColumns.join(' | ')}`);
        } else {
          processedRows.push(`Fila ${i}: ${meaningfulColumns.join(' | ')}`);
        }
      }
    }
    
    const extractedText = processedRows.join('\n').trim();
    console.log(`CSV extraction result: ${extractedText.length} characters from ${maxRows} rows`);
    
    if (extractedText.length < 10) {
      throw new Error("Could not extract meaningful text from CSV");
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting CSV text:', error);
    throw new Error(`CSV extraction failed: ${error.message}`);
  }
}
