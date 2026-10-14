/**
 * One-time setup script — creates company records and generates API keys.
 * Run once per environment: npx tsx src/scripts/setup-companies.ts
 *
 * Required environment variables:
 *   VITE_SUPABASE_URL          — your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — found in Supabase dashboard → Settings → API
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing environment variables. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Replace these with your actual site names before running.
const companies = [
  {
    name: 'My Site 1',
    consent_settings: {
      consent_mode: 'opt-out',
      data_retention_days: 365,
      anonymize_ip: true,
      allowed_event_types: ['view', 'click', 'conversion', 'submission'],
      gdpr_settings: {
        store_user_agent: false,
        store_referrer: true,
        geographic_restrictions: ['EU']
      }
    }
  },
  {
    name: 'My Site 2',
    consent_settings: {
      consent_mode: 'opt-out',
      data_retention_days: 365,
      anonymize_ip: true,
      allowed_event_types: ['view', 'click', 'conversion', 'submission'],
      gdpr_settings: {
        store_user_agent: false,
        store_referrer: true,
        geographic_restrictions: ['EU']
      }
    }
  },
  {
    name: 'My SaaS App',
    consent_settings: {
      consent_mode: 'opt-out',
      data_retention_days: 365,
      anonymize_ip: true,
      allowed_event_types: ['view', 'click', 'conversion', 'submission'],
      gdpr_settings: {
        store_user_agent: false,
        store_referrer: true,
        geographic_restrictions: []
      }
    }
  }
];

async function setupCompanies() {
  console.log('Creating company records...\n');

  for (const company of companies) {
    const { data, error } = await supabase
      .from('companies')
      .insert(company)
      .select()
      .single();

    if (error) {
      console.error(`Error creating ${company.name}:`, error);
    } else {
      console.log(`✅ ${data.name}`);
      console.log(`   Company ID: ${data.id}`);
      console.log(`   API Key: ${data.api_key.substring(0, 8)}...`);
      console.log('');
    }
  }
}

setupCompanies();
