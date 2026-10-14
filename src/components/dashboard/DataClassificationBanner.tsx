import { Shield, BarChart3, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DataClassificationBannerProps {
  variant: 'security' | 'analytics';
}

const CONFIG = {
  security: {
    icon: Shield,
    label: 'Security Data',
    color: 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400',
    iconColor: 'text-orange-500',
    details: [
      'Legal basis: Legitimate interest (Art. 6(1)(f) GDPR)',
      'IP addresses: truncated to /24 (IPv6 /48), cleared after 30 days',
      'Retention: site retention period (default 365 days)',
    ],
    tooltip: 'Server-side bot and security data is processed under legitimate interest for crawler measurement and site protection. Full IP addresses are never stored: they are truncated before storage and the truncated value is cleared after 30 days.',
  },
  analytics: {
    icon: BarChart3,
    label: 'Analytics Data',
    color: 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400',
    iconColor: 'text-blue-500',
    details: [
      'Collected only after analytics consent',
      'Pseudonymous at most — no names, emails or IP addresses',
      'Retention: 365 days by default',
    ],
    tooltip: 'Visitor analytics are collected only after analytics consent. No cookies are set by the tracking script and no IP addresses are stored with visitor analytics; only AI-bot records keep a truncated IP, cleared after 30 days.',
  },
};

export function DataClassificationBanner({ variant }: DataClassificationBannerProps) {
  const config = CONFIG[variant];
  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${config.color}`}>
      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
      <div className="flex-1 min-w-0">
        <span className="font-semibold">{config.label}</span>
        <span className="mx-2 opacity-40">·</span>
        <span className="opacity-80">{config.details.join(' · ')}</span>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5 opacity-60 cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs" side="left">
            {config.tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
