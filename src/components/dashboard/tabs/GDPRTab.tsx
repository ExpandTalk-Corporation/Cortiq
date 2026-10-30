import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GDPRSettings } from '@/components/gdpr/GDPRSettings';
import CMPDashboard from '@/components/dashboard/CMPDashboard';
import type { Site } from '@/types/dashboard';
import type { SitePatch } from '@/hooks/useSites';

interface GDPRTabProps {
  selectedSite: Site;
  onSiteUpdated?: (patch: SitePatch) => void;
}

export function GDPRTab({ selectedSite, onSiteUpdated }: GDPRTabProps) {
  return (
    <Tabs defaultValue="gdpr" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="gdpr">GDPR Settings</TabsTrigger>
        <TabsTrigger value="cmp">CMP Dashboard</TabsTrigger>
      </TabsList>
      
      <TabsContent value="gdpr">
        <GDPRSettings siteId={selectedSite.id} />
      </TabsContent>
      
      <TabsContent value="cmp">
        <CMPDashboard key={selectedSite.id} selectedSite={selectedSite} onSiteUpdated={onSiteUpdated} />
      </TabsContent>
    </Tabs>
  );
}