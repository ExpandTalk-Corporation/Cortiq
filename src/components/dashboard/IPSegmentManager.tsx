import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Network, Plus, Trash2, Edit2, ChevronDown, ChevronUp,
  AlertTriangle, Info, ShieldAlert, Building2, Users, Handshake, Ban, Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useIPSegments, useSaveIPSegment, useDeleteIPSegment,
  type IPSegment,
} from '@/hooks/useIPSegments';

/* ── CIDR validation helpers ─────────────────────────────────────────────── */

function parsePrefixLen(range: string): number | null {
  const parts = range.trim().split('/');
  if (parts.length === 2) {
    const n = parseInt(parts[1], 10);
    return isNaN(n) ? null : n;
  }
  return range.includes(':') ? 128 : 32; // single host
}

function isValidCIDR(range: string): boolean {
  const t = range.trim();
  if (!t) return false;
  // IPv4 with optional mask
  if (/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(t)) {
    const [ip, mask] = t.split('/');
    if (ip.split('.').map(Number).some(o => o > 255)) return false;
    if (mask !== undefined && (parseInt(mask) < 0 || parseInt(mask) > 32)) return false;
    return true;
  }
  // IPv6 with mask
  if (/^[0-9a-fA-F:]+\/\d{1,3}$/.test(t)) return true;
  // Plain IPv6
  if (/^[0-9a-fA-F:]+$/.test(t)) return true;
  return false;
}

/** Returns true if any range in the list is /30 or narrower (≤ 4 IPv4 addresses). */
function hasNarrowRange(ranges: string[]): boolean {
  return ranges.some(r => {
    const len = parsePrefixLen(r);
    if (len === null) return false;
    const isV6 = r.includes(':');
    return isV6 ? len >= 126 : len >= 30;
  });
}

function parseRangeLines(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

/* ── Category config ─────────────────────────────────────────────────────── */

const CATEGORIES = [
  { value: 'own_company', label: 'Own company',  icon: Building2, color: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
  { value: 'competitor',  label: 'Competitor',   icon: Users,     color: 'bg-rose-500/10 text-rose-700 border-rose-500/30' },
  { value: 'partner',     label: 'Partner',      icon: Handshake, color: 'bg-green-500/10 text-green-700 border-green-500/30' },
  { value: 'exclude',     label: 'Exclude',      icon: Ban,       color: 'bg-slate-500/10 text-slate-600 border-slate-400/30' },
  { value: 'custom',      label: 'Custom',       icon: Tag,       color: 'bg-purple-500/10 text-purple-700 border-purple-500/30' },
] as const;

type Category = typeof CATEGORIES[number]['value'];

function CategoryBadge({ category }: { category: string }) {
  const cfg = CATEGORIES.find(c => c.value === category) ?? CATEGORIES[4];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-xs gap-1 ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

/* ── Legal notices ───────────────────────────────────────────────────────── */

function LegalNotice({ category, narrow, intranet }: {
  category: Category;
  narrow: boolean;
  intranet: boolean;
}) {
  return (
    <div className="space-y-2">
      {category === 'own_company' && (
        <Alert className="border-amber-500/50 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs">
            <strong>Legal requirement (EU/GDPR):</strong> Employee internet monitoring requires prior
            notification under GDPR Art. 13/14. Before activating this segment, ensure your
            IT-policy or employment contract explicitly informs employees that website usage
            is monitored and for what purpose.{' '}
            <span className="font-medium">
              In Germany, Works Council (Betriebsrat) approval is typically required.
            </span>{' '}
            Consult your Data Protection Officer before use.
          </AlertDescription>
        </Alert>
      )}

      {category === 'competitor' && (
        <Alert className="border-blue-500/30 bg-blue-500/5">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-xs">
            <strong>Competitive intelligence:</strong> Analyzing traffic from known networks to your
            own website is generally permitted under EU GDPR — you are reading your own server logs.
            A company IP range is not personal data (GDPR Art. 4(1)) because it identifies an
            organization, not an individual.{' '}
            Exception: small offices where a range maps to fewer than ~10 people.
          </AlertDescription>
        </Alert>
      )}

      {narrow && (
        <Alert className="border-orange-500/50 bg-orange-500/5">
          <ShieldAlert className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-xs">
            <strong>Narrow range warning:</strong> One or more of your ranges covers 4 or fewer IP
            addresses (/30 or more specific). At this granularity the IP may effectively identify a
            specific individual, making it personal data under GDPR Art. 4(1). Ensure you have a
            valid legal basis (consent or legitimate interest with DPO sign-off) before using ranges
            this narrow.
          </AlertDescription>
        </Alert>
      )}

      {intranet && (
        <Alert className="border-sky-500/30 bg-sky-500/5">
          <Info className="h-4 w-4 text-sky-600" />
          <AlertDescription className="text-xs">
            <strong>Intranet mode (aggregate-only):</strong> When enabled, individual session IDs
            and click coordinates are NOT recorded for traffic from this segment — only page view
            counts per URL are stored. This is the recommended configuration for internal network
            analytics under EU GDPR employee-monitoring guidelines and Swedish IMY guidance.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/* ── Segment form (add / edit) ───────────────────────────────────────────── */

const BLANK: Omit<IPSegment, 'id' | 'created_at' | 'updated_at'> = {
  company_id:    '',
  name:          '',
  description:   '',
  category:      'own_company',
  ip_ranges:     [],
  color:         '#6366f1',
  intranet_mode: false,
  is_active:     true,
};

interface SegmentFormProps {
  companyId: string;
  initial?: IPSegment;
  onDone: () => void;
}

function SegmentForm({ companyId, initial, onDone }: SegmentFormProps) {
  const [form, setForm] = useState({
    name:          initial?.name          ?? '',
    description:   initial?.description   ?? '',
    category:      (initial?.category     ?? 'own_company') as Category,
    rangesText:    initial?.ip_ranges?.join('\n') ?? '',
    color:         initial?.color         ?? '#6366f1',
    intranet_mode: initial?.intranet_mode ?? false,
  });

  const save = useSaveIPSegment();

  const ranges    = parseRangeLines(form.rangesText);
  const badLines  = ranges.filter(r => !isValidCIDR(r));
  const narrow    = hasNarrowRange(ranges);
  const canSubmit = form.name.trim() && ranges.length > 0 && badLines.length === 0;

  const handleSave = () => {
    if (!canSubmit) return;
    save.mutate(
      {
        ...(initial ? { id: initial.id } : {}),
        company_id:    companyId,
        name:          form.name.trim(),
        description:   form.description.trim() || null,
        category:      form.category,
        ip_ranges:     ranges,
        color:         form.color,
        intranet_mode: form.intranet_mode,
        is_active:     true,
      } as any,
      {
        onSuccess: () => {
          toast.success(initial ? 'Segment updated' : 'Segment created');
          onDone();
        },
        onError: (e: any) => toast.error('Failed to save: ' + e.message),
      }
    );
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Name <span className="text-destructive">*</span></Label>
          <Input
            placeholder="e.g. Headquarters Stockholm"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Category <span className="text-destructive">*</span></Label>
          <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as Category }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>
                  <span className="flex items-center gap-2">
                    <c.icon className="h-3.5 w-3.5" />
                    {c.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <Label>Description</Label>
          <Input
            placeholder="Optional — e.g. 'All Stockholm office subnets'"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <Label>
            IP Ranges <span className="text-destructive">*</span>
            <span className="text-muted-foreground font-normal ml-2 text-xs">
              — one CIDR per line, e.g. 192.168.10.0/24
            </span>
          </Label>
          <Textarea
            placeholder={'192.168.10.0/24\n10.0.0.0/8\n2001:db8::/32'}
            rows={4}
            value={form.rangesText}
            onChange={e => setForm(f => ({ ...f, rangesText: e.target.value }))}
            className="font-mono text-sm"
          />
          {badLines.length > 0 && (
            <p className="text-xs text-destructive">
              Invalid format: {badLines.map(l => `"${l}"`).join(', ')}
            </p>
          )}
          {ranges.length > 0 && badLines.length === 0 && (
            <p className="text-xs text-muted-foreground">{ranges.length} range{ranges.length !== 1 ? 's' : ''} parsed</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Colour</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.color}
              onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              className="h-9 w-14 cursor-pointer rounded border p-1"
            />
            <span className="text-sm text-muted-foreground font-mono">{form.color}</span>
          </div>
        </div>

        {form.category === 'own_company' && (
          <div className="space-y-1.5">
            <Label>Intranet mode (aggregate-only)</Label>
            <div className="flex items-center gap-3 pt-1">
              <Switch
                checked={form.intranet_mode}
                onCheckedChange={v => setForm(f => ({ ...f, intranet_mode: v }))}
              />
              <span className="text-sm text-muted-foreground">
                {form.intranet_mode ? 'On — no individual session tracking' : 'Off — full session tracking'}
              </span>
            </div>
          </div>
        )}
      </div>

      <LegalNotice
        category={form.category}
        narrow={narrow}
        intranet={form.intranet_mode}
      />

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSave} disabled={!canSubmit || save.isPending}>
          {save.isPending ? 'Saving…' : initial ? 'Update segment' : 'Create segment'}
        </Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

/* ── Single segment card ─────────────────────────────────────────────────── */

interface SegmentCardProps {
  segment: IPSegment;
  companyId: string;
}

function SegmentCard({ segment, companyId }: SegmentCardProps) {
  const [editing, setEditing] = useState(false);
  const del = useDeleteIPSegment();

  const handleDelete = () => {
    if (!confirm(`Delete segment "${segment.name}"?`)) return;
    del.mutate(
      { id: segment.id, companyId },
      { onSuccess: () => toast.success('Segment deleted') }
    );
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="h-3 w-3 rounded-full shrink-0 inline-block border"
                style={{ background: segment.color, borderColor: segment.color }}
              />
              <CardTitle className="text-base">{segment.name}</CardTitle>
              <CategoryBadge category={segment.category} />
              {segment.intranet_mode && (
                <Badge variant="outline" className="text-xs bg-sky-500/10 text-sky-700 border-sky-400/30">
                  Intranet mode
                </Badge>
              )}
            </div>
            {segment.description && (
              <CardDescription className="text-xs">{segment.description}</CardDescription>
            )}
          </div>

          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setEditing(v => !v)}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={del.isPending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mt-2">
          {segment.ip_ranges.map(r => (
            <code key={r} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
              {r}
            </code>
          ))}
        </div>
      </CardHeader>

      <Collapsible open={editing}>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <SegmentForm
              companyId={companyId}
              initial={segment}
              onDone={() => setEditing(false)}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

interface IPSegmentManagerProps {
  companyId: string;
}

export function IPSegmentManager({ companyId }: IPSegmentManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const { data: segments = [], isLoading } = useIPSegments(companyId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Network className="h-5 w-5" />
            Network Segments
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Label known IP ranges — your office network, a competitor's corporate IP block, or a
            partner's servers. Traffic from these ranges is tagged in analytics with the segment name.
            Only the segment name is stored with the event, never the raw IP address.
          </p>
        </div>
        <Button onClick={() => setShowForm(v => !v)} className="shrink-0">
          {showForm ? <ChevronUp className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          {showForm ? 'Cancel' : 'Add segment'}
        </Button>
      </div>

      {/* How-it-works info */}
      <Alert className="border-border bg-muted/40">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs space-y-1">
          <p>
            <strong>How it works:</strong> When a visit matches a defined range, the segment name is
            written into the event record — not the IP address.
          </p>
          <p>
            <strong>Intranet use:</strong> For internal networks, enable <em>Intranet mode</em> on
            the segment. Only aggregated page view counts are then stored — no individual session IDs
            or click coordinates. This is the legally safe configuration for employee-facing analytics
            under EU GDPR employee-monitoring rules.
          </p>
        </AlertDescription>
      </Alert>

      {/* Add form */}
      <Collapsible open={showForm}>
        <CollapsibleContent>
          <Card className="border-primary/30 bg-primary/3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">New segment</CardTitle>
            </CardHeader>
            <CardContent>
              <SegmentForm
                companyId={companyId}
                onDone={() => setShowForm(false)}
              />
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Segment list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading segments…</p>
      ) : segments.length === 0 && !showForm ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No segments defined yet. Add your first range above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {segments.map(seg => (
            <SegmentCard key={seg.id} segment={seg} companyId={companyId} />
          ))}
        </div>
      )}
    </div>
  );
}
