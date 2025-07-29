import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserActivationRequest {
  email: string;
  fullName: string;
  activationToken: string;
  activationUrl: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, fullName, activationToken, activationUrl }: UserActivationRequest = await req.json();

    const emailResponse = await resend.emails.send({
      from: "QAMIRI <onboarding@resend.dev>",
      to: [email],
      subject: "Activación de cuenta QAMIRI",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Activación de cuenta QAMIRI</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              margin: 0;
              padding: 20px;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white; 
              border-radius: 12px; 
              overflow: hidden;
              box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            }
            .header { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 40px 30px; 
              text-align: center; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 28px; 
              font-weight: 700; 
            }
            .content { 
              padding: 40px 30px; 
            }
            .greeting { 
              font-size: 18px; 
              margin-bottom: 20px; 
              color: #2d3748; 
            }
            .message { 
              margin-bottom: 30px; 
              line-height: 1.8; 
              color: #4a5568; 
            }
            .button { 
              display: inline-block; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 16px 32px; 
              text-decoration: none; 
              border-radius: 8px; 
              font-weight: 600; 
              font-size: 16px; 
              text-align: center; 
              margin: 20px 0; 
              transition: transform 0.2s;
            }
            .button:hover { 
              transform: translateY(-2px); 
            }
            .token { 
              background: #f7fafc; 
              border: 2px dashed #e2e8f0; 
              padding: 20px; 
              border-radius: 8px; 
              font-family: 'Courier New', monospace; 
              font-size: 18px; 
              font-weight: 600; 
              text-align: center; 
              margin: 20px 0; 
              color: #2d3748; 
              letter-spacing: 2px;
            }
            .footer { 
              background: #f7fafc; 
              padding: 30px; 
              text-align: center; 
              border-top: 1px solid #e2e8f0; 
              color: #718096; 
              font-size: 14px; 
            }
            .warning { 
              background: #fed7d7; 
              border-left: 4px solid #f56565; 
              padding: 15px; 
              margin: 20px 0; 
              border-radius: 4px; 
              color: #c53030; 
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 QAMIRI</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Plataforma de Conocimiento Inteligente</p>
            </div>
            
            <div class="content">
              <div class="greeting">¡Hola ${fullName || 'Usuario'}!</div>
              
              <div class="message">
                <p>Te damos la bienvenida a <strong>QAMIRI</strong>. Tu cuenta ha sido creada por un administrador y necesitas activarla para poder acceder al sistema.</p>
                
                <p>Para completar la configuración de tu cuenta, haz clic en el siguiente botón:</p>
              </div>
              
              <div style="text-align: center;">
                <a href="${activationUrl}" class="button">
                  ✨ Activar mi cuenta
                </a>
              </div>
              
              <div class="message">
                <p><strong>O usa este código de activación:</strong></p>
              </div>
              
              <div class="token">${activationToken}</div>
              
              <div class="warning">
                <strong>⚠️ Importante:</strong> Este enlace expirará en 24 horas por seguridad. Si no puedes activar tu cuenta, contacta al administrador del sistema.
              </div>
              
              <div class="message">
                <p>Una vez activada tu cuenta, podrás:</p>
                <ul style="margin: 15px 0; padding-left: 25px; color: #4a5568;">
                  <li>Acceder al chat inteligente con IA</li>
                  <li>Consultar documentos de tu categoría</li>
                  <li>Gestionar tu perfil personal</li>
                </ul>
              </div>
            </div>
            
            <div class="footer">
              <p><strong>QAMIRI</strong> - Sistema de Gestión de Conocimiento</p>
              <p>Si no solicitaste esta cuenta, puedes ignorar este email.</p>
              <p style="margin-top: 15px; font-size: 12px; opacity: 0.7;">
                Este es un email automático, por favor no respondas a esta dirección.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Activation email sent successfully:", emailResponse);

    return new Response(JSON.stringify({
      success: true,
      messageId: emailResponse.data?.id
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error sending activation email:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);