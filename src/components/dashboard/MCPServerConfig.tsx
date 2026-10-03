import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Copy, Check, Terminal, MessageSquare, Workflow,
  Bot, BarChart2, Flame, FileText, Globe, Shield,
  TrendingUp, Zap, ChevronRight, ExternalLink, Download,
  Activity, Network, FlaskConical, ShoppingCart,
} from 'lucide-react';

const MCP_ENDPOINT = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/mcp-server';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  site_id: string;
  is_active: boolean;
}

interface Site {
  id: string;
  site_name: string | null;
  domain: string;
}

const TOOL_GROUPS = [
  {
    label: 'Sites & Schema',
    icon: Globe,
    color: 'text-blue-400',
    tools: [
      { name: 'cortiq_list_sites', desc: 'List connected sites', cost: 'Free' },
      { name: 'cortiq_describe_schema', desc: 'Describe available tables and AI platforms', cost: 'Free' },
    ],
  },
  {
    label: 'Traffic Baseline',
    icon: BarChart2,
    color: 'text-green-400',
    tools: [
      { name: 'cortiq_sessions_summary', desc: 'Sessions, visitors, duration, bounce rate', cost: '5¢' },
      { name: 'cortiq_daily_visitors', desc: 'Unique visitors per day', cost: '5¢' },
      { name: 'cortiq_bounce_rate', desc: 'Site-wide bounce rate with session counts', cost: '5¢' },
      { name: 'cortiq_top_pages', desc: 'Most viewed URLs', cost: '5¢' },
      { name: 'cortiq_top_sources', desc: 'Where visitors come from', cost: '5¢' },
      { name: 'cortiq_top_entry_pages', desc: 'Landing pages with per-page bounce rate', cost: '5¢' },
      { name: 'cortiq_top_exit_pages', desc: 'Pages where sessions end', cost: '5¢' },
      { name: 'cortiq_pageviews_by_device', desc: 'Mobile / tablet / desktop split', cost: '5¢' },
    ],
  },
  {
    label: 'Engagement & Behavior',
    icon: Flame,
    color: 'text-orange-400',
    tools: [
      { name: 'cortiq_avg_engagement_time', desc: 'Dwell time and scroll depth per URL', cost: '5¢' },
      { name: 'cortiq_click_counts', desc: 'Element click leaderboard', cost: '5¢' },
      { name: 'cortiq_heatmap_grid', desc: 'Viewport-normalized click heatmap grid', cost: '5¢' },
      { name: 'cortiq_top_rage_clicks', desc: 'UX friction — elements with repeated rapid clicks', cost: '5¢' },
      { name: 'cortiq_top_outbound', desc: 'Most-clicked external links', cost: '5¢' },
      { name: 'cortiq_web_vitals', desc: 'LCP and CLS per URL', cost: '5¢' },
    ],
  },
  {
    label: 'Forms & Funnels',
    icon: FileText,
    color: 'text-purple-400',
    tools: [
      { name: 'cortiq_form_analytics', desc: 'Form completion and abandonment rates', cost: '5¢' },
      { name: 'cortiq_funnel_completion', desc: 'Step-by-step funnel drop-off', cost: '5¢' },
    ],
  },
  {
    label: 'AI Agent Analytics',
    icon: Bot,
    color: 'text-cyan-400',
    badge: 'Unique to CortIQ',
    tools: [
      { name: 'cortiq_ai_agent_traffic', desc: 'ChatGPT, Perplexity, Claude, Gemini traffic breakdown', cost: '5¢' },
      { name: 'cortiq_ai_bot_analysis', desc: 'Bot intelligence: types, threat scores, JS detection', cost: '5¢' },
      { name: 'cortiq_ai_agent_journey', desc: 'Top pages visited by AI agents — GEO signal', cost: '5¢' },
      { name: 'cortiq_ai_vs_human', desc: 'AI agents vs human visitors side-by-side', cost: '5¢' },
    ],
  },
  {
    label: 'SQL Escape Hatch',
    icon: Terminal,
    color: 'text-yellow-400',
    tools: [
      { name: 'cortiq_execute_query', desc: 'Constrained SELECT against the analytics tables', cost: '25¢' },
    ],
  },
];

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied');
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button size="sm" variant="ghost" onClick={copy} className="h-7 px-2 text-muted-foreground hover:text-foreground shrink-0">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      {label && <span className="ml-1 text-xs">{copied ? 'Copied' : label}</span>}
    </Button>
  );
}

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  return (
    <div className="relative group">
      <pre className={`bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-sm font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed`}>
        <code>{code}</code>
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton text={code} label="Copy" />
      </div>
    </div>
  );
}

export function MCPServerConfig() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);
  const [toolCount] = useState(23);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [keysResult, sitesResult] = await Promise.all([
      supabase.from('api_keys').select('id, name, key_prefix, site_id, is_active').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('sites').select('id, site_name, domain').order('domain'),
    ]);
    const keys = keysResult.data ?? [];
    setApiKeys(keys);
    setSites(sitesResult.data ?? []);
    if (keys.length > 0) setSelectedKeyId(keys[0].id);
  }

  const selectedKey = apiKeys.find(k => k.id === selectedKeyId);
  const selectedSite = sites.find(s => s.id === selectedKey?.site_id);

  const claudeCodeCommand = `claude mcp add cortiq-analytics \\
  --transport http \\
  ${MCP_ENDPOINT} \\
  --header "Authorization: Bearer ${selectedKey?.key_prefix ?? 'YOUR_API_KEY'}..."`;

  const chatGptCommand = `{
  "mcpServers": {
    "cortiq-analytics": {
      "url": "${MCP_ENDPOINT}",
      "headers": {
        "Authorization": "Bearer ${selectedKey?.key_prefix ?? 'YOUR_API_KEY'}..."
      }
    }
  }
}`;

  const n8nCommand = `MCP Tool endpoint: ${MCP_ENDPOINT}
Auth header: Authorization: Bearer ${selectedKey?.key_prefix ?? 'YOUR_API_KEY'}...`;

  async function testConnection() {
    if (!selectedKey) { toast.error('Select an API key first'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${selectedKey.key_prefix}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
      const json = await resp.json();
      if (json.result?.tools?.length > 0) {
        setTestResult('ok');
        toast.success(`Connected — ${json.result.tools.length} tools available`);
      } else {
        setTestResult('error');
        toast.error('Connection failed: ' + (json.error?.message ?? 'Unknown error'));
      }
    } catch {
      setTestResult('error');
      toast.error('Could not reach MCP server');
    } finally {
      setTesting(false);
    }
  }

  function downloadSkill() {
    const link = document.createElement('a');
    link.href = '/cortiq-analytics.skill';
    link.download = 'cortiq-analytics.skill';
    link.click();
  }

  return (
    <div className="space-y-6">

      {/* Hero */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-bold">Agent API (MCP)</h2>
            <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20">Beta</Badge>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Connect Claude Code, ChatGPT, n8n, or any MCP-compatible agent to your analytics.
            {' '}{toolCount} typed tools — including 4 AI-agent analytics tools no other platform has.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={downloadSkill}>
            <Download className="h-4 w-4 mr-2" />
            Download SKILL.md
          </Button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap gap-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <div className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-muted-foreground">Endpoint live</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          {toolCount} tools
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          Read-only · Bearer auth
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Network className="h-3.5 w-3.5" />
          MCP 2024-11-05
        </div>
        <div className="ml-auto flex items-center gap-2">
          {testResult === 'ok' && <Badge className="bg-green-500/10 text-green-400 border-green-500/20">Connection OK</Badge>}
          {testResult === 'error' && <Badge className="bg-red-500/10 text-red-400 border-red-500/20">Connection failed</Badge>}
        </div>
      </div>

      {/* API Key selector + test */}
      {apiKeys.length === 0 ? (
        <Alert>
          <AlertDescription>
            No API keys found. Create one in{' '}
            <strong>API Keys</strong> above first.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select API Key</CardTitle>
            <CardDescription>Choose which API key to use in the connection commands below.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Select value={selectedKeyId} onValueChange={setSelectedKeyId}>
                <SelectTrigger className="flex-1 max-w-sm">
                  <SelectValue placeholder="Select API key" />
                </SelectTrigger>
                <SelectContent>
                  {apiKeys.map(k => (
                    <SelectItem key={k.id} value={k.id}>
                      <span className="font-medium">{k.name}</span>
                      <span className="ml-2 text-muted-foreground text-xs">{k.key_prefix}…</span>
                      {selectedSite && k.site_id === selectedSite.id && (
                        <span className="ml-2 text-xs text-cyan-400">{selectedSite.domain}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={testConnection} disabled={testing || !selectedKeyId}>
                {testing ? (
                  <><Zap className="h-4 w-4 mr-2 animate-spin" />Testing…</>
                ) : (
                  <><Zap className="h-4 w-4 mr-2" />Test connection</>
                )}
              </Button>
            </div>
            {selectedKey && (
              <p className="text-xs text-muted-foreground mt-2">
                Key prefix: <code className="font-mono">{selectedKey.key_prefix}…</code>
                {selectedSite && <> · Site: <strong>{selectedSite.domain}</strong></>}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Endpoint URL */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">MCP Endpoint</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3">
            <code className="flex-1 text-sm font-mono text-zinc-300 break-all">{MCP_ENDPOINT}</code>
            <CopyButton text={MCP_ENDPOINT} label="Copy" />
          </div>
        </CardContent>
      </Card>

      {/* Connect tabs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connect Your Agent</CardTitle>
          <CardDescription>Pick your agent and run the command — you're ready to ask analytics questions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="claude-code">
            <TabsList className="mb-4">
              <TabsTrigger value="claude-code" className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />Claude Code
              </TabsTrigger>
              <TabsTrigger value="chatgpt" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />ChatGPT
              </TabsTrigger>
              <TabsTrigger value="n8n" className="flex items-center gap-2">
                <Workflow className="h-4 w-4" />n8n
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex items-center gap-2">
                <Network className="h-4 w-4" />Manual
              </TabsTrigger>
            </TabsList>

            <TabsContent value="claude-code" className="space-y-3">
              <p className="text-sm text-muted-foreground">Run this in your terminal. The MCP server will be available in all Claude Code sessions.</p>
              <CodeBlock code={claudeCodeCommand} />
              <div className="flex items-start gap-2 mt-3 p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
                <Download className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-cyan-400">Supercharge with the agent skill</span>
                  <p className="text-muted-foreground mt-0.5">
                    Drag <code className="font-mono text-xs">cortiq-analytics.skill</code> into your Claude Code project.
                    The skill teaches your agent the optimal report workflow — daily comparisons, AI traffic analysis, what to surface vs suppress.
                  </p>
                  <Button size="sm" variant="outline" className="mt-2 border-cyan-500/30 text-cyan-400 hover:text-cyan-300" onClick={downloadSkill}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download cortiq-analytics.skill
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="chatgpt" className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Add to your ChatGPT custom connector settings, or paste into the MCP config JSON.
              </p>
              <CodeBlock code={chatGptCommand} language="json" />
              <p className="text-xs text-muted-foreground">
                Replace <code className="font-mono">YOUR_API_KEY...</code> with your full API key (shown once when you create it above).
              </p>
            </TabsContent>

            <TabsContent value="n8n" className="space-y-3">
              <p className="text-sm text-muted-foreground">Add an MCP Tool node in your n8n workflow with these settings:</p>
              <CodeBlock code={n8nCommand} />
              <p className="text-xs text-muted-foreground">Use the "HTTP Request MCP" node type. Set Authentication to Header Auth.</p>
            </TabsContent>

            <TabsContent value="manual" className="space-y-3">
              <p className="text-sm text-muted-foreground">Any MCP-compatible client (Cursor, Windsurf, etc.) accepts this config:</p>
              <CodeBlock code={`POST ${MCP_ENDPOINT}
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{"jsonrpc":"2.0","id":1,"method":"tools/list"}`} />
              <p className="text-xs text-muted-foreground">
                Transport: Streamable HTTP (MCP 2024-11-05). Auth: Bearer token.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Tool Library */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Tool Library</h3>
            <p className="text-sm text-muted-foreground">{toolCount} tools your agent can call</p>
          </div>
        </div>
        <div className="space-y-3">
          {TOOL_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <Card key={group.label} className="overflow-hidden">
                <CardHeader className="py-3 px-4 bg-zinc-900/50">
                  <div className="flex items-center gap-2">
                    <GroupIcon className={`h-4 w-4 ${group.color}`} />
                    <span className="font-medium text-sm">{group.label}</span>
                    {group.badge && (
                      <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-xs">{group.badge}</Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{group.tools.length} tools</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {group.tools.map((tool) => (
                      <div key={tool.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group">
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        <code className="text-xs font-mono text-foreground min-w-0 flex-1">{tool.name}</code>
                        <span className="text-xs text-muted-foreground flex-1 hidden sm:block">{tool.desc}</span>
                        <Badge variant="outline" className="text-xs shrink-0 ml-auto">{tool.cost}</Badge>
                        <CopyButton text={tool.name} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What your agent can do</CardTitle>
          <CardDescription>Example questions your agent answers by calling CortIQ tools</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: TrendingUp, q: '"Daily report for cortiq.se"', tools: '13 tool calls, period comparison built-in' },
              { icon: Bot, q: '"How much of my traffic is from AI agents?"', tools: 'cortiq_ai_agent_traffic + cortiq_ai_vs_human' },
              { icon: Flame, q: '"Which pages have rage click problems?"', tools: 'cortiq_top_rage_clicks' },
              { icon: BarChart2, q: '"Why did bounce rate jump this week?"', tools: 'cortiq_bounce_rate + cortiq_top_entry_pages' },
              { icon: FlaskConical, q: '"Which content do ChatGPT agents read most?"', tools: 'cortiq_ai_agent_journey (unique to CortIQ)' },
              { icon: ShoppingCart, q: '"Where does my signup funnel leak?"', tools: 'cortiq_form_analytics + cortiq_funnel_completion' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.q} className="flex gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{item.q}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.tools}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Privacy note */}
      <Card className="border-zinc-800 bg-zinc-900/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <span className="font-medium text-green-400">Read-only by design.</span>
              <span className="text-muted-foreground">
                {' '}Your agent can only query data. No tracking events, sessions, or settings can be modified through the MCP API.
                All queries are scoped to your site — no cross-tenant access is possible.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Docs link */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
          <a href="https://cortiq.se/docs/mcp" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Full API reference
          </a>
        </Button>
      </div>

    </div>
  );
}
