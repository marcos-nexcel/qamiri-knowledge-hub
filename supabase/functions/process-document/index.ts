// deno run --allow-net --allow-env --unstable main.ts
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.211.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import JSZip from "https://esm.sh/jszip@3.10.1";

// ─── PDF.js ──────────────────────────────────────────────────────────────────
import { GlobalWorkerOptions, getDocument } from
  "https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.mjs";
GlobalWorkerOptions.workerSrc =
  "https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.worker.mjs";

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId } = await req.json();
    if (!documentId) throw new Error("Document ID is required");
    if (!openAIApiKey) throw new Error("OPENAI_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1️⃣  Recupera metadatos
    const { data: document, error: docError } = await supabase
      .from("documents").select("*").eq("id", documentId).single();
    if (docError || !document) throw new Error(`Document not found: ${docError?.message}`);

    await supabase.from("documents")
      .update({ status: "processing" }).eq("id", documentId);

    // 2️⃣  Descarga el archivo
    const { data: blob, error: downloadError } = await supabase.storage
      .from("documents").download(document.file_path);
    if (downloadError || !blob) throw new Error(`Download error: ${downloadError?.message}`);

    // 3️⃣  Extrae texto según MIME
    const fileText = await extractText(blob, document.file_type);

    // 4️⃣  Divide y vectoriza
    const chunks = splitText(fileText, 1000, 100);
    const processed: number[] = [];

    for (const [i, chunk] of chunks.entries()) {
      try {
        const embedding = await embed(chunk);
        const { error } = await supabase.from("document_chunks").insert({
          document_id: documentId,
          chunk_index: i,
          content: chunk,
          embedding,
          metadata: { length: chunk.length, position: i },
        });
        if (error) throw error;
        processed.push(i);
      } catch (e) {
        console.error("chunk", i, e);
      }
    }

    // 5️⃣  Estado final
    await supabase.from("documents").update({
      status: processed.length === chunks.length ? "processed" : "error",
      chunk_count: processed.length,
      processed_at: new Date().toISOString(),
    }).eq("id", documentId);

    return json({ success: true, documentId, chunksProcessed: processed.length, totalChunks: chunks.length });
  } catch (err) {
    console.error(err);
    return json({ error: "Processing failed", details: err.message }, 500);
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
  const clean = text.replace(/\u0000/g, "").replace(/[\x00-\x1F\x7F]/g, "").trim();
  const out: string[] = [];
  for (let start = 0; start < clean.length;) {
    const end = Math.min(start + size, clean.length);
    out.push(clean.slice(start, end).trim());
    if (end === clean.length) break;
    start = end - overlap;
  }
  return out;
}

async function embed(text: string) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAIApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text, encoding_format: "float" }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.data[0].embedding as number[];
}

async function extractText(blob: Blob, mime: string): Promise<string> {
  switch (mime) {
    case "application/pdf":
      return extractPdf(blob);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(blob);
    case "application/msword":
      throw new Error("Legacy .doc not supported – convert to DOCX or PDF first.");
    default:
      // Intenta decodificar como UTF‑8
      return new TextDecoder().decode(await blob.arrayBuffer());
  }
}

// ── PDF ──────────────────────────────────────────────────────────────────────
async function extractPdf(blob: Blob) {
  const pdf = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const { items } = await page.getTextContent();
    text += items.map((it: any) => it.str).join(" ") + "\n";
  }
  return text.trim();
}

// ── DOCX ─────────────────────────────────────────────────────────────────────
async function extractDocx(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("document.xml not found");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const texts = [...doc.getElementsByTagName("w:t")].map((t) => t.textContent ?? "");
  return texts.join(" ").replace(/\s+/g, " ").trim();
}
