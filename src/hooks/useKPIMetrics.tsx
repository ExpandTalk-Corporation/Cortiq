import { useState, useMemo } from 'react';
import { KPIMetric } from '@/types/kpi';

const defaultKPIMetrics: KPIMetric[] = [
  {
    id: 'ai-bot-traffic',
    title: 'AI Bot Traffic',
    description: 'Measures visits from AI bots such as GPTBot, CCBot, Perplexity, and other LLM crawlers indexing your content.',
    businessValue: 'Shows which AI systems are actively crawling your website. Higher traffic from AI bots indicates your content is being discovered and indexed for AI answers.',
    status: 'activated',
    category: 'critical',
    priority: 'critical',
    dataSources: ['Server logs', 'Custom tracking'],
    integrations: ['Internal tracking'],
    order: 1,
    enabled: true,
    hasLiveData: true,
  },
  {
    id: 'ai-citations',
    title: 'Citation Crawler Requests',
    description: 'Requests from AI search crawlers (PerplexityBot, OAI-SearchBot, …) that index your pages so AI answers can cite them. It does not show whether an answer actually cited you.',
    businessValue: 'A visibility signal: which pages AI search engines fetch. Compare with AI-referred visits to see whether indexing turns into traffic.',
    status: 'activated',
    category: 'critical',
    priority: 'critical',
    dataSources: ['AI bot tracking'],
    integrations: ['Internal tracking'],
    order: 2,
    enabled: true,
    hasLiveData: true,
  },
  {
    id: 'ai-traffic-sources',
    title: 'Top AI Traffic Sources',
    description: 'Identifies which AI platforms (ChatGPT, Perplexity, Gemini, etc.) send the most traffic to your website.',
    businessValue: 'Helps you prioritize optimization for the AI platforms that deliver the most business value.',
    status: 'activated',
    category: 'live-data',
    priority: 'high',
    dataSources: ['Google Analytics 4', 'Custom tracking'],
    integrations: ['Internal tracking'],
    order: 3,
    enabled: true,
    hasLiveData: true,
  },
  {
    id: 'ai-bot-detection',
    title: 'AI Bot Detection & Monitoring',
    description: 'Real-time monitoring and security review of AI bot activity on your website.',
    businessValue: 'Ensures AI bots are behaving correctly and identifies potentially harmful crawlers.',
    status: 'activated',
    category: 'live-data',
    priority: 'high',
    dataSources: ['Server logs', 'Bot signatures'],
    integrations: ['Internal tracking'],
    order: 4,
    enabled: true,
    hasLiveData: true,
  },
  {
    id: 'google-search-console',
    title: 'Google Search Console Performance',
    description: 'Shows which keywords you rank for and how much traffic you receive from Google. Strong correlation between Google rankings and AI citations.',
    businessValue: 'Provides concrete data on the topics and keywords you are strong in, helping you understand where to expect AI citations.',
    status: 'partial',
    category: 'live-data',
    priority: 'high',
    dataSources: ['Google Search Console', 'Google Analytics 4'],
    integrations: ['Google Search Console', 'GA4'],
    order: 5,
    enabled: false,
    hasLiveData: true,
  },
  {
    id: 'bing-webmaster',
    title: 'Bing Webmaster Tools Performance',
    description: 'Bing is owned by Microsoft, which develops ChatGPT. Content that ranks well in Bing has a higher chance of being cited in ChatGPT.',
    businessValue: 'Critical for ChatGPT optimization because ChatGPT uses Bing as a data source. Bing also reports IndexNow adoption.',
    status: 'partial',
    category: 'live-data',
    priority: 'high',
    dataSources: ['Bing Webmaster Tools', 'IndexNow'],
    integrations: ['Bing Webmaster Tools'],
    order: 6,
    enabled: false,
    hasLiveData: true,
  },
];

export const useKPIMetrics = () => {
  const [metrics, setMetrics] = useState<KPIMetric[]>(defaultKPIMetrics);

  const toggleMetric = (metricId: string) => {
    setMetrics(prev => 
      prev.map(m => 
        m.id === metricId ? { ...m, enabled: !m.enabled } : m
      )
    );
  };

  const criticalMetrics = useMemo(
    () => metrics.filter(m => m.category === 'critical').sort((a, b) => a.order - b.order),
    [metrics]
  );

  const liveDataMetrics = useMemo(
    () => metrics.filter(m => m.category === 'live-data').sort((a, b) => a.order - b.order),
    [metrics]
  );

  return {
    metrics,
    criticalMetrics,
    liveDataMetrics,
    toggleMetric,
  };
};
