import type { ReactNode } from "react";
import PublicNavigation from "@/components/PublicNavigation";
import PublicFooter from "@/components/PublicFooter";

// Shared shell for every page outside the dashboard, so navigation and footer are
// the same across the site.
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicNavigation />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
