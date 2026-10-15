import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, FormInput, CheckCircle, AlertCircle } from 'lucide-react';
import { useFormRegistry, useUpdateFormRegistry } from '@/hooks/useFormRegistry';
import { useToast } from '@/hooks/use-toast';
import type { Site } from '@/types/dashboard';

interface FormDiscoveryWidgetProps {
  selectedSite: Site;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  hubspot: 'HubSpot',
  gravity: 'Gravity Forms',
  contact7: 'Contact Form 7',
  custom: 'Custom',
  generic: 'Generic HTML',
  sentrisk: 'SentriSK',
  traffikboost: 'SentriSK', // rows detected before the rename
  woocommerce_checkout: 'WooCommerce',
};

export function FormDiscoveryWidget({ selectedSite }: FormDiscoveryWidgetProps) {
  const { data: forms, isLoading } = useFormRegistry(selectedSite.id);
  const updateForm = useUpdateFormRegistry(selectedSite.id);
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  if (isLoading) return null;
  if (!forms || forms.length === 0) return null;

  const tagged = forms.filter(f => f.conversion_goal_id || f.form_label);
  const untagged = forms.filter(f => !f.conversion_goal_id && !f.form_label);

  const handleSaveLabel = async (id: string) => {
    await updateForm.mutateAsync({ id, updates: { form_label: editLabel } });
    setEditingId(null);
    toast({ title: 'Form label saved' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4 text-blue-500" />
          Discovered forms
          <Badge variant="outline" className="ml-auto">
            {forms.length} found
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {tagged.length} identified · {untagged.length} unidentified
          {untagged.length > 0 && (
            <span className="text-yellow-500 ml-1">— assign names to track them as goals</span>
          )}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {forms.map((form) => (
            <div
              key={form.id}
              className="flex items-start gap-3 p-3 border rounded-lg text-sm"
            >
              <FormInput className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {editingId === form.id ? (
                    <div className="flex gap-2 items-center">
                      <Input
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        className="h-7 w-48 text-sm"
                        placeholder="e.g. Demo Request"
                        autoFocus
                      />
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveLabel(form.id)}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium">
                        {form.form_label || <span className="text-muted-foreground italic">Unidentified</span>}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {FORM_TYPE_LABELS[form.form_type] || form.form_type}
                      </Badge>
                      {form.conversion_goal_id ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                      )}
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {form.form_guid} · {form.detected_url || 'URL unknown'}
                </div>
              </div>
              {editingId !== form.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={() => {
                    setEditingId(form.id);
                    setEditLabel(form.form_label || '');
                  }}
                >
                  {form.form_label ? 'Rename' : 'Name it'}
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
