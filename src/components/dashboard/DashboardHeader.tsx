import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, Settings, ChevronDown, Check, Sparkles, BarChart3 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { DateRange } from 'react-day-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AIAssistantPanel } from '@/components/dashboard/AIAssistantPanel';

interface Site {
  id: string;
  site_name: string;
  domain: string;
  tracking_id: string;
  is_active: boolean;
  created_at: string;
}

interface DashboardHeaderProps {
  selectedSite: Site | null;
  sites: Site[];
  onSiteSelect: (site: Site) => void;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
}

// Mask the account email so screenshots / shared views don't leak the full address.
// e.g. daniel.larsson@expandtalk.se -> da••••@expandtalk.se
function maskEmail(email?: string | null): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}

export function DashboardHeader({ selectedSite, sites, onSiteSelect, dateRange, onDateRangeChange }: DashboardHeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  return (
    <>
    <div className="flex justify-between items-center py-4">
      <div className="flex items-center gap-6">
        <div>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-gradient-primary tracking-tight">CortIQ</h1>
          </div>
          <p className="text-muted-foreground text-sm font-mono mt-1">Professional Analytics Dashboard</p>
        </div>
        
        {/* Site Selector - Professional SaaS Style */}
        {sites.length > 0 && (
          <div className="flex items-center gap-4 glass p-4 rounded-lg">
            <span className="text-sm text-muted-foreground font-mono">Site:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  className="bg-card-elevated text-foreground border-border min-w-[280px] justify-between font-mono text-sm"
                >
                  <span className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${selectedSite?.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {selectedSite ? `${selectedSite.site_name} (${selectedSite.domain})` : 'Select site'}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[280px] max-h-[400px] overflow-y-auto bg-popover">
                {sites.map(site => (
                  <DropdownMenuItem
                    key={site.id}
                    onClick={() => onSiteSelect(site)}
                    className="font-mono text-sm cursor-pointer"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div className={`w-2 h-2 rounded-full ${site.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                      <span className="flex-1">{site.site_name} ({site.domain})</span>
                      {selectedSite?.id === site.id && <Check className="h-4 w-4" />}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Global Date Range */}
        {onDateRangeChange && (
          <div className="glass p-2 rounded-lg">
            <DateRangePicker dateRange={dateRange} onDateRangeChange={onDateRangeChange} />
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-4">
        {selectedSite && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAiPanelOpen(true)}
            className="font-mono text-sm gap-2 border-primary/40 hover:border-primary hover:bg-primary/10"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            Ask AI
          </Button>
        )}
        <ThemeToggle />
        <div className="flex items-center gap-3 px-3 py-2 glass rounded-lg">
          <div className="status-dot status-online"></div>
          <span className="text-sm text-muted-foreground font-mono">
            {maskEmail(user?.email)}
          </span>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
          className="font-mono px-4 py-2"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </div>
    {selectedSite && (
      <AIAssistantPanel
        selectedSite={selectedSite}
        open={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
      />
    )}
    </>
  );
}