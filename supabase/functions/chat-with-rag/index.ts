import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl!, supabaseServiceRoleKey!);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, categoryId, userId } = await req.json();

    if (!message) {
      throw new Error('Message is required');
    }

    if (!categoryId) {
      throw new Error('Category ID is required');
    }

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log(`Processing chat message for category: ${categoryId}`);

    // Generate embedding for the user's message
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: message,
        encoding_format: 'float'
      }),
    });

    if (!embeddingResponse.ok) {
      throw new Error('Failed to generate embedding');
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    console.log('Generated embedding for user message');

    // Search for similar documents in the specified category
    const { data: searchResults, error: searchError } = await supabase.rpc(
      'search_similar_documents',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: 5,
        category_filter: categoryId
      }
    );

    if (searchError) {
      console.error('Search error:', searchError);
      throw new Error('Failed to search documents');
    }

    console.log(`Found ${searchResults?.length || 0} relevant documents`);

    // Prepare context from search results
    let context = '';
    if (searchResults && searchResults.length > 0) {
      context = searchResults
        .map((result: any) => `Documento: ${result.document_name}\nContenido: ${result.chunk_content}`)
        .join('\n\n');
    }

    // Get category name for context
    const { data: categoryData } = await supabase
      .from('categories')
      .select('name')
      .eq('id', categoryId)
      .single();

    const categoryName = categoryData?.name || 'la categoría seleccionada';

    // Generate response using OpenAI
    const systemPrompt = `Eres un asistente especializado en responder preguntas basadas en documentos de la categoría "${categoryName}". 

INSTRUCCIONES IMPORTANTES:
- Responde ÚNICAMENTE basándote en la información proporcionada en el contexto
- Si la información no está en el contexto, indica claramente que no tienes esa información en los documentos disponibles
- Cita los documentos relevantes cuando sea apropiado
- Mantén un tono profesional y útil
- Responde en español

CONTEXTO DE DOCUMENTOS:
${context || 'No se encontraron documentos relevantes para esta consulta.'}`;

    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 1000
      }),
    });

    if (!chatResponse.ok) {
      throw new Error('Failed to generate chat response');
    }

    const chatData = await chatResponse.json();
    const assistantMessage = chatData.choices[0].message.content;

    console.log('Generated chat response successfully');

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        sources: searchResults?.map((result: any) => ({
          document_name: result.document_name,
          similarity: result.similarity
        })) || []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in chat-with-rag function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Chat generation failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});