// src/components/dashboard/nav/AccountMenu.tsx
import { LogOut, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Mask the account email so screenshots / shared views don't leak the full address.
// e.g. daniel.larsson@expandtalk.se -> da••••@expandtalk.se
function maskEmail(email?: string | null): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}

export function AccountMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const email = maskEmail(user?.email);
  const dark = resolvedTheme === 'dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" title={email} aria-label="Account"
          className={cn('flex min-w-0 items-center gap-2 rounded-md text-sm transition-colors hover:bg-muted',
            collapsed ? 'h-9 w-9 justify-center' : 'flex-1 px-2 py-1.5 text-left')}>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary">
            {email.charAt(0) || '?'}
          </span>
          {!collapsed && <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{email}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? 'right' : 'top'} align="start" className="min-w-[220px]">
        <DropdownMenuLabel className="font-mono text-xs font-normal text-muted-foreground">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setTheme(dark ? 'light' : 'dark')} className="cursor-pointer gap-2">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {dark ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={async () => { await signOut(); navigate('/'); }} className="cursor-pointer gap-2">
          <LogOut className="h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
