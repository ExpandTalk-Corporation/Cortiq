import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Target, FormInput, Phone, Eye, AlertTriangle, CheckCircle, VolumeX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useConversionGoalHealth } from '@/hooks/useConversionGoalHealth';
import { ANY_FORM_GOAL, PREDEFINED_GOALS, conversionSetupHint } from '@/lib/conversionSetupHint';
import type { Site } from '@/types/dashboard';

interface ConversionGoal {
  id: string;
  name: string;
  type: 'form_submission' | 'element_click' | 'page_visit' | 'phone_click';
  selector: string;
  value?: number;
  is_primary?: boolean;
}

interface ConversionGoalsConfigProps {
  selectedSite: Site;
  onUpdate?: () => void;
}

export function ConversionGoalsConfig({ selectedSite, onUpdate }: ConversionGoalsConfigProps) {
  const [goals, setGoals] = useState<ConversionGoal[]>([]);
  const [newGoal, setNewGoal] = useState<Partial<ConversionGoal>>({
    type: 'form_submission',
    is_primary: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { data: healthData } = useConversionGoalHealth(selectedSite.id);
  const [completedForms30d, setCompletedForms30d] = useState(0);

  useEffect(() => {
    if (selectedSite) {
      loadGoals();
    }
  }, [selectedSite]);

  useEffect(() => {
    let live = true;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    supabase.from('form_sessions').select('id', { count: 'exact', head: true })
      .eq('site_id', selectedSite.id).not('completed_at', 'is', null).gte('completed_at', since)
      .then(({ count }) => { if (live) setCompletedForms30d(count ?? 0); });
    return () => { live = false; };
  }, [selectedSite.id]);

  const hint = conversionSetupHint({ completedForms30d, goals });
  const addAnyFormGoal = () => setGoals([...goals, { id: `goal_${Date.now()}`, ...ANY_FORM_GOAL, is_primary: goals.length === 0 }]);

  const loadGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('sites')
        .select('conversion_goals')
        .eq('id', selectedSite.id)
        .single();

      if (error) throw error;
      
      const goals = (data.conversion_goals as unknown as ConversionGoal[]) || [];
      setGoals(goals);
    } catch (error) {
      console.error('Error loading conversion goals:', error);
    }
  };

  const saveGoals = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('sites')
        .update({ conversion_goals: goals as any })
        .eq('id', selectedSite.id);

      if (error) throw error;

      toast({
        title: "✅ Conversion goals saved",
        description: "Your conversion goals have been updated"
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error saving conversion goals:', error);
      toast({
        title: "❌ Error",
        description: "Could not save conversion goals",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addGoal = () => {
    if (!newGoal.name || !newGoal.selector) {
      toast({
        title: "⚠️ Incomplete information",
        description: "Enter a name and CSS selector",
        variant: "destructive"
      });
      return;
    }

    const goal: ConversionGoal = {
      id: `goal_${Date.now()}`,
      name: newGoal.name!,
      type: newGoal.type!,
      selector: newGoal.selector!,
      value: newGoal.value || 0,
      is_primary: newGoal.is_primary || false,
    };

    setGoals([...goals, goal]);
    setNewGoal({ type: 'form_submission' });
  };

  const removeGoal = (goalId: string) => {
    setGoals(goals.filter(g => g.id !== goalId));
  };

  const getGoalIcon = (type: string) => {
    switch (type) {
      case 'form_submission': return <FormInput className="h-4 w-4" />;
      case 'phone_click': return <Phone className="h-4 w-4" />;
      case 'page_visit': return <Eye className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  const getGoalTypeLabel = (type: string) => {
    switch (type) {
      case 'form_submission': return 'Form submission';
      case 'element_click': return 'Element click';
      case 'phone_click': return 'Phone click';
      case 'page_visit': return 'Page visit';
      default: return type;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-green-500" />
          Conversion goals
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Define important actions users can take on your website
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {hint !== 'ok' && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm space-y-2">
            <p>
              {completedForms30d} forms were completed on this site in the last 30 days, but no conversion was recorded:{' '}
              {hint === 'no_goals'
                ? 'the site has no conversion goals.'
                : 'the goals still use the example selectors, which match no form on the site.'}
            </p>
            <Button size="sm" onClick={addAnyFormGoal}>Add goal: any form submission</Button>
            <p className="text-xs text-muted-foreground">Then press Save. You can narrow the selector later.</p>
          </div>
        )}

        {/* Befintliga mål */}
        <div className="space-y-3">
          <h4 className="font-medium">Active conversion goals ({goals.length})</h4>
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No conversion goals configured yet. Add one below.
            </p>
          ) : (
            <div className="space-y-2">
              {goals.map((goal) => {
                const health = healthData?.find(h => h.goalId === goal.id);
                return (
                  <div key={goal.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getGoalIcon(goal.type)}
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {goal.name}
                            {goal.is_primary && <Badge variant="default" className="text-xs">Primary</Badge>}
                            {!goal.is_primary && <Badge variant="outline" className="text-xs">Observation</Badge>}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {getGoalTypeLabel(goal.type)} • {goal.selector}
                          </div>
                        </div>
                        <Badge variant="outline">{goal.value || 0} pts</Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeGoal(goal.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between pl-7">
                      <div className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={goal.is_primary || false}
                          onCheckedChange={(v) =>
                            setGoals(goals.map(g => g.id === goal.id ? { ...g, is_primary: v } : g))
                          }
                        />
                        <span className="text-muted-foreground">Primary goal (affects Smart Bidding)</span>
                      </div>
                      {health && health.status !== 'healthy' && (
                        <div className="flex items-center gap-1 text-xs text-yellow-500">
                          {health.status === 'silent' ? <VolumeX className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {health.warning}
                        </div>
                      )}
                      {health && health.status === 'healthy' && (
                        <div className="flex items-center gap-1 text-xs text-green-500">
                          <CheckCircle className="h-3 w-3" />
                          Healthy ({Math.round(health.firingRate * 100)}% of sessions)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Snabbmål */}
        <div className="space-y-3">
          <h4 className="font-medium">Quick templates</h4>
          <div className="grid gap-2">
            {PREDEFINED_GOALS.map((goal, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => {
                  const newGoal: ConversionGoal = {
                    ...goal,
                    id: `goal_${Date.now()}_${index}`
                  };
                  setGoals([...goals, newGoal]);
                }}
                className="justify-start"
              >
                {getGoalIcon(goal.type)}
                {goal.name} ({goal.value} points)
              </Button>
            ))}
          </div>
        </div>

        {/* Lägg till nytt mål */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
          <h4 className="font-medium">Add new goal</h4>

          <div className="grid gap-4">
            <div>
              <Label htmlFor="goal-name">Goal name</Label>
              <Input
                id="goal-name"
                placeholder="e.g. Contact form"
                value={newGoal.name || ''}
                onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="goal-type">Type</Label>
              <Select
                value={newGoal.type}
                onValueChange={(value: any) => setNewGoal({ ...newGoal, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="form_submission">Form submission</SelectItem>
                  <SelectItem value="element_click">Element click</SelectItem>
                  <SelectItem value="phone_click">Phone click</SelectItem>
                  <SelectItem value="page_visit">Page visit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="goal-selector">CSS selector</Label>
              <Input
                id="goal-selector"
                placeholder="e.g. #contact-form, .contact-button"
                value={newGoal.selector || ''}
                onChange={(e) => setNewGoal({ ...newGoal, selector: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                CSS selector that identifies the element on your website
              </p>
            </div>

            <div>
              <Label htmlFor="goal-value">Point value (optional)</Label>
              <Input
                id="goal-value"
                type="number"
                placeholder="0"
                value={newGoal.value || ''}
                onChange={(e) => setNewGoal({ ...newGoal, value: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="goal-primary"
                checked={newGoal.is_primary || false}
                onCheckedChange={(v) => setNewGoal({ ...newGoal, is_primary: v })}
              />
              <Label htmlFor="goal-primary">Primary goal (affects Smart Bidding)</Label>
            </div>

            <Button onClick={addGoal} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add goal
            </Button>
          </div>
        </div>

        {/* Spara ändringar */}
        <Button 
          onClick={saveGoals} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? 'Saving...' : 'Save conversion goals'}
        </Button>
      </CardContent>
    </Card>
  );
}