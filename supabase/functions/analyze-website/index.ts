import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalysisRequest {
  url: string;
  device: 'desktop' | 'mobile';
  type: string;
}

interface HeatmapData {
  elements: number;
  buttons: number;
  forms: number;
  images: number;
  h1Count: number;
  hasLogo: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, device, type }: AnalysisRequest = await req.json();
    
    // Simulate fetching website content
    const websiteData = await analyzeWebsite(url, device);
    
    // Generate heatmap analysis
    const heatmapAnalysis = generateHeatmapAnalysis(websiteData, device, type);
    
    // Generate WCAG analysis  
    const wcagAnalysis = generateWCAGAnalysis(websiteData);
    
    // Generate form analysis
    const formAnalysis = generateFormAnalysis(websiteData);

    const analysis = {
      url,
      device,
      type,
      timestamp: new Date().toISOString(),
      heatmap: heatmapAnalysis,
      wcag: wcagAnalysis,
      forms: formAnalysis,
      overall_score: Math.round((heatmapAnalysis.score + wcagAnalysis.score + formAnalysis.score) / 3)
    };

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function analyzeWebsite(url: string, device: string): Promise<HeatmapData> {
  // In a real implementation, you would fetch and parse the actual website
  // For now, return mock data
  return {
    elements: Math.floor(Math.random() * 50) + 20,
    buttons: Math.floor(Math.random() * 10) + 3,
    forms: Math.floor(Math.random() * 3) + 1,
    images: Math.floor(Math.random() * 20) + 5,
    h1Count: Math.floor(Math.random() * 3) + 1,
    hasLogo: Math.random() > 0.3
  };
}

function generateHeatmapAnalysis(data: HeatmapData, device: string, type: string) {
  const baseScore = 60;
  let score = baseScore;
  
  // Scoring logic
  if (data.hasLogo) score += 10;
  if (data.buttons >= 3 && data.buttons <= 8) score += 15;
  if (data.h1Count === 1) score += 10;
  if (device === 'mobile' && type === 'ecommerce') score += 5;
  
  const zones = {
    high: Math.min(Math.floor(data.buttons / 2) + (data.hasLogo ? 3 : 0), 8),
    medium: Math.min(Math.floor(data.elements / 5), 15),
    low: Math.floor(data.elements / 10)
  };

  return {
    score: Math.min(score, 100),
    zones,
    recommendations: generateHeatmapRecommendations(data, device, type)
  };
}

function generateWCAGAnalysis(data: HeatmapData) {
  const checks = [
    { name: 'H1-struktur', passed: data.h1Count === 1, weight: 10 },
    { name: 'Alt-texter', passed: Math.random() > 0.3, weight: 15 },
    { name: 'Färgkontrast', passed: Math.random() > 0.4, weight: 20 },
    { name: 'Tangentbordsnavigation', passed: Math.random() > 0.2, weight: 15 },
    { name: 'Formulärlabels', passed: Math.random() > 0.3, weight: 10 }
  ];

  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const passedWeight = checks.filter(check => check.passed).reduce((sum, check) => sum + check.weight, 0);
  
  return {
    score: Math.round((passedWeight / totalWeight) * 100),
    checks,
    passed: checks.filter(check => check.passed).length,
    total: checks.length
  };
}

function generateFormAnalysis(data: HeatmapData) {
  const score = data.forms > 0 ? Math.floor(Math.random() * 40) + 60 : 30;
  
  return {
    score,
    forms_found: data.forms,
    conversion_rate: Math.floor(Math.random() * 20) + 10,
    recommendations: data.forms === 0 
      ? ['Lägg till kontaktformulär för bättre användarengagemang']
      : ['Optimera formulärvalidering', 'Förkorta formulärlängd']
  };
}

function generateHeatmapRecommendations(data: HeatmapData, device: string, type: string): string[] {
  const recommendations = [];
  
  if (!data.hasLogo) {
    recommendations.push('Lägg till en tydlig logotyp i headern');
  }
  
  if (data.buttons < 3) {
    recommendations.push('Lägg till fler call-to-action knappar');
  }
  
  if (device === 'mobile') {
    recommendations.push('Optimera för fingertryck på mobila enheter');
  }
  
  if (type === 'ecommerce' && data.buttons < 5) {
    recommendations.push('Lägg till "Köp nu" och "Lägg i varukorg" knappar');
  }

  return recommendations;
}