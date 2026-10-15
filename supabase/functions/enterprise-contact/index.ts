import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "../_shared/supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContactRequest {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.log("RESEND_API_KEY not configured, saving lead without email");
    }

    // Initialize Supabase with service role key to bypass RLS
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { name, email, company, phone, message }: ContactRequest = await req.json();

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: "Namn, e-post och meddelande är obligatoriska" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Save lead to database
    const { data: lead, error: leadError } = await supabaseClient
      .from("leads")
      .insert({
        name,
        email,
        company,
        phone,
        message,
        lead_type: "enterprise",
        status: "new"
      })
      .select()
      .single();

    if (leadError) {
      console.error("Error saving lead:", leadError);
      return new Response(
        JSON.stringify({ error: "Kunde inte spara förfrågan" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Lead saved successfully:", lead.id);

    // Send email if Resend is configured
    if (resendKey) {
      const resend = new Resend(resendKey);
      
      try {
        // Send notification to info@expandtalk.se
        await resend.emails.send({
          from: "Heatmap Analytics <noreply@resend.dev>",
          to: ["info@expandtalk.se"],
          subject: `Ny Enterprise-förfrågan från ${name}`,
          html: `
            <h2>Ny Enterprise-förfrågan</h2>
            <p><strong>Namn:</strong> ${name}</p>
            <p><strong>E-post:</strong> ${email}</p>
            ${company ? `<p><strong>Företag:</strong> ${company}</p>` : ''}
            ${phone ? `<p><strong>Telefon:</strong> ${phone}</p>` : ''}
            <p><strong>Meddelande:</strong></p>
            <p>${message}</p>
            <hr>
            <p><em>Lead ID: ${lead.id}</em></p>
          `,
        });

        // Send confirmation to customer
        await resend.emails.send({
          from: "Heatmap Analytics <noreply@resend.dev>",
          to: [email],
          subject: "Tack för din förfrågan - Heatmap Analytics",
          html: `
            <h2>Tack för din förfrågan!</h2>
            <p>Hej ${name},</p>
            <p>Vi har mottagit din förfrågan om vår Enterprise-lösning och kommer att återkomma inom 24 timmar.</p>
            <p>Vårt team på Expandtalk Corporation AB kommer att kontakta dig för att diskutera hur vi kan hjälpa dig med skräddarsydda analyslösningar.</p>
            <p>Med vänliga hälsningar,<br>
            Heatmap Analytics Team<br>
            Expandtalk Corporation AB</p>
          `,
        });

        console.log("Emails sent successfully");
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        // Don't fail the request if email fails, lead is already saved
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Tack för din förfrågan! Vi återkommer inom 24 timmar.",
        lead_id: lead.id
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error in enterprise-contact function:", error);
    return new Response(
      JSON.stringify({ error: "Ett fel uppstod. Försök igen." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});