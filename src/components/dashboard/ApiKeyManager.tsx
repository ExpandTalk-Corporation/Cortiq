/**
 * API Key Manager Component
 *
 * Create, view, disable and delete CortIQ API keys. A key is scoped to one site and
 * works for both the Public REST API (public-api) and the MCP server (mcp-server).
 * Only the SHA-256 hash is stored; the plaintext key is shown once at creation.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Key, Trash2, Plus, ExternalLink } from 'lucide-react';
import { ApiKey, generateApiKey, getKeyPrefix, hashApiKey } from '@/types/apiKeys';

interface Site {
  id: string;
  site_name: string | null;
  domain: string;
}

const API_BASE = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/public-api';

export default function ApiKeyManager() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  // Form state
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [rateLimit, setRateLimit] = useState(1000);

  useEffect(() => {
    loadApiKeys();
    loadSites();
  }, []);

  async function loadSites() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Only sites the user owns — the api_keys RLS policies require site ownership.
      const { data, error } = await supabase
        .from('sites')
        .select('id, site_name, domain')
        .eq('user_id', user.id)
        .order('domain');

      if (error) throw error;
      setSites(data || []);
    } catch (error) {
      console.error('Error loading sites:', error);
      toast.error('Failed to load sites');
    }
  }

  async function loadApiKeys() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }

  async function createApiKey() {
    const name = newKeyName.trim();
    if (name.length < 3 || name.length > 100) {
      toast.error('Key name must be 3–100 characters');
      return;
    }
    if (!Number.isFinite(rateLimit) || rateLimit < 1 || rateLimit > 100000) {
      toast.error('Rate limit must be between 1 and 100,000 requests/hour');
      return;
    }

    if (!selectedSiteId) {
      toast.error('Please select a site');
      return;
    }

    try {
      setCreating(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Generate new API key
      const apiKey = generateApiKey();
      const keyHash = await hashApiKey(apiKey);
      const keyPrefix = getKeyPrefix(apiKey);

      // Insert into database
      const { data, error } = await supabase
        .from('api_keys')
        .insert({
          site_id: selectedSiteId,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          name,
          permissions: ['read'],
          rate_limit: rateLimit,
          created_by: user.id,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Show the new API key (only time it will be visible!)
      setNewApiKey(apiKey);
      setShowNewKeyDialog(false);

      // Reset form
      setNewKeyName('');
      setSelectedSiteId('');
      setRateLimit(1000);

      // Reload keys
      await loadApiKeys();

      toast.success('API key created successfully!');
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('Failed to create API key');
    } finally {
      setCreating(false);
    }
  }

  async function deleteApiKey(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete the API key "${name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('API key deleted');
      await loadApiKeys();
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Failed to delete API key');
    }
  }

  async function toggleKeyActive(id: string, currentlyActive: boolean) {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: !currentlyActive })
        .eq('id', id);

      if (error) throw error;

      toast.success(currentlyActive ? 'API key disabled' : 'API key enabled');
      await loadApiKeys();
    } catch (error) {
      console.error('Error toggling API key:', error);
      toast.error('Failed to update API key');
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }

  const getSiteName = (siteId: string) => {
    const site = sites.find(s => s.id === siteId);
    return site ? (site.site_name ? `${site.site_name} (${site.domain})` : site.domain) : siteId;
  };

  return (
    <div className="space-y-6">
      {/* New API Key Alert */}
      {newApiKey && (
        <Alert className="border-green-500 bg-green-50">
          <Key className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-semibold">Your new API key has been created!</p>
              <p className="text-sm text-muted-foreground">
                Make sure to copy it now. You won't be able to see it again!
              </p>
              <div className="flex gap-2 items-center mt-2">
                <code className="flex-1 p-2 bg-white border rounded text-sm font-mono">
                  {newApiKey}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(newApiKey)}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNewApiKey(null)}
                className="mt-2"
              >
                I've saved the key
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Keys for the CortIQ REST API and MCP server. Each key reads one site's data.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('/api', '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                API Documentation
              </Button>
              <Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create API Key
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New API Key</DialogTitle>
                    <DialogDescription>
                      Generate a new API key for programmatic access to your analytics data.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="keyName">Key Name</Label>
                      <Input
                        id="keyName"
                        placeholder="e.g., Production Server, Analytics Dashboard"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor="site">Site</Label>
                      <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a site" />
                        </SelectTrigger>
                        <SelectContent>
                          {sites.map((site) => (
                            <SelectItem key={site.id} value={site.id}>
                              {site.site_name ? `${site.site_name} (${site.domain})` : site.domain}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="rateLimit">Rate Limit (requests/hour)</Label>
                      <Input
                        id="rateLimit"
                        type="number"
                        min="100"
                        max="100000"
                        value={rateLimit}
                        onChange={(e) => setRateLimit(parseInt(e.target.value))}
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Default: 1,000 requests per hour
                      </p>
                    </div>

                    <div className="flex gap-2 justify-end mt-6">
                      <Button
                        variant="outline"
                        onClick={() => setShowNewKeyDialog(false)}
                        disabled={creating}
                      >
                        Cancel
                      </Button>
                      <Button onClick={createApiKey} disabled={creating}>
                        {creating ? 'Creating...' : 'Create API Key'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading API keys...
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No API keys yet</p>
              <p className="text-sm">Create your first API key to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Rate Limit</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getSiteName(key.site_id)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono">
                          {key.key_prefix}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{key.rate_limit}/hour</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.is_active ? 'default' : 'secondary'}>
                        {key.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleKeyActive(key.id, key.is_active)}
                        >
                          {key.is_active ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteApiKey(key.id, key.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Documentation Card */}
      <Card>
        <CardHeader>
          <CardTitle>Getting Started with the API</CardTitle>
          <CardDescription>
            Use your API key to access CortIQ analytics data programmatically
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Authentication</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Include your API key in the Authorization header:
            </p>
            <code className="block p-3 bg-muted rounded text-sm">
              Authorization: Bearer ck_live_your_api_key_here
            </code>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Example Request</h4>
            <pre className="block p-3 bg-muted rounded text-sm whitespace-pre-wrap break-all">
{`curl ${API_BASE}/sites \
  -H "Authorization: Bearer ck_live_your_api_key_here"`}
            </pre>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Available Endpoints</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• GET /sites — the site this key belongs to</li>
              <li>• GET /sites/{'{id}'}/visits — sessions</li>
              <li>• GET /sites/{'{id}'}/pages — page views</li>
              <li>• GET /sites/{'{id}'}/referrers — traffic sources</li>
              <li>• GET /sites/{'{id}'}/agents — AI bot traffic</li>
              <li>• GET /sites/{'{id}'}/conversions — conversions</li>
              <li>• GET /sites/{'{id}'}/heatmaps — click and scroll data</li>
            </ul>
          </div>

          <Button variant="outline" className="w-full" onClick={() => window.open('/api', '_blank')}>
            <ExternalLink className="h-4 w-4 mr-2" />
            View Full API Documentation
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
