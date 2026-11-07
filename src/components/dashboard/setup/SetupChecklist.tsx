// src/components/dashboard/setup/SetupChecklist.tsx
// "How to get data here" checklist shared by the Acquisition tabs. Each step shows a live
// status: done, todo, or unknown (CortIQ cannot check it, e.g. access inside Google).
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, ExternalLink, HelpCircle } from 'lucide-react';

export type StepStatus = 'done' | 'todo' | 'unknown';

export interface ChecklistStep {
  id: string;
  title: string;
  status: StepStatus;
  detail?: ReactNode;
  optional?: boolean;
  /** A dashboard tab to open, or an external URL. */
  action?: { label: string; tab?: string; href?: string };
}

interface SetupChecklistProps {
  title: string;
  description?: ReactNode;
  steps: ChecklistStep[];
  onNavigate?: (tab: string) => void;
  children?: ReactNode;
}

function Marker({ n, status }: { n: number; status: StepStatus }) {
  const base = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium';
  if (status === 'done') {
    return <span className={`${base} bg-primary text-primary-foreground`} aria-label="Done"><CheckCircle className="h-3.5 w-3.5" /></span>;
  }
  if (status === 'unknown') {
    return <span className={`${base} border border-dashed text-muted-foreground`} aria-label="Cannot be checked from CortIQ"><HelpCircle className="h-3.5 w-3.5" /></span>;
  }
  return <span className={`${base} border text-muted-foreground`} aria-label="To do">{n}</span>;
}

export function SetupChecklist({ title, description, steps, onNavigate, children }: SetupChecklistProps) {
  const done = steps.filter((s) => s.status === 'done').length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <p className="text-xs text-muted-foreground">{done} of {steps.length} steps done</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-4">
          {steps.map((step, i) => (
            <li key={step.id} className="flex gap-3">
              <Marker n={i + 1} status={step.status} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-medium">
                  {step.title}
                  {step.optional && <span className="ml-2 text-xs font-normal text-muted-foreground">Optional</span>}
                </p>
                {step.detail && <div className="text-sm text-muted-foreground space-y-1">{step.detail}</div>}
                {step.action && step.status !== 'done' && (
                  step.action.href ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={step.action.href} target="_blank" rel="noopener noreferrer">
                        {step.action.label} <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </Button>
                  ) : step.action.tab && onNavigate ? (
                    <Button size="sm" variant="outline" onClick={() => onNavigate(step.action!.tab!)}>
                      {step.action.label}
                    </Button>
                  ) : null
                )}
              </div>
            </li>
          ))}
        </ol>
        {children}
      </CardContent>
    </Card>
  );
}
