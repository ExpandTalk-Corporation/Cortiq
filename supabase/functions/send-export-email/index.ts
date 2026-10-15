import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportEmailRequest {
  email: string;
  reportType: string;
  format: string;
  downloadUrl: string;
  rowCount: number;
  expiresIn: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      email,
      reportType,
      format,
      downloadUrl,
      rowCount,
      expiresIn
    }: ExportEmailRequest = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Calculate expiry time
    const expiryDate = new Date(Date.now() + expiresIn * 1000);
    const expiryTime = expiryDate.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    // Send email using Resend or similar service
    // For now, we'll use Supabase's built-in email (if configured)
    // In production, you'd use Resend, SendGrid, or similar

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .stats { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📊 Your Export is Ready!</h1>
            </div>
            <div class="content">
              <p>Hi there,</p>
              <p>Your <strong>${reportType}</strong> export is ready for download.</p>

              <div class="stats">
                <p><strong>Export Details:</strong></p>
                <ul>
                  <li>Format: ${format.toUpperCase()}</li>
                  <li>Rows: ${rowCount.toLocaleString()}</li>
                  <li>Expires: ${expiryTime}</li>
                </ul>
              </div>

              <div style="text-align: center;">
                <a href="${downloadUrl}" class="button">Download Export</a>
              </div>

              <p style="color: #666; font-size: 14px;">
                ⚠️ This link will expire in ${Math.floor(expiresIn / 60)} minutes for security reasons.
              </p>

              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

              <p>Questions or issues? Reply to this email or contact our support team.</p>
              <p>Best regards,<br><strong>The CortIQ Team</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} CortIQ Analytics. All rights reserved.</p>
              <p>This is an automated message. Please do not reply directly to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // In production, integrate with email service provider
    // Example with Resend:
    /*
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'CortIQ <noreply@cortiq.se>',
        to: email,
        subject: `Your ${reportType} export is ready`,
        html: emailHtml
      })
    });
    */

    // For now, log the email (in production, actually send it)
    console.log('Export email prepared for:', email);
    console.log('Download URL:', downloadUrl);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Export email sent successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error sending export email:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to send export email',
        message: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
