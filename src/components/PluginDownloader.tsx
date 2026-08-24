import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, Calendar, FileText, Shield } from 'lucide-react';
import { usePluginDownloader } from '@/hooks/usePluginDownloader';
import { PLUGIN_VERSION, PLUGIN_LAST_UPDATED as LAST_UPDATED } from '@/lib/plugin-version';

interface PluginDownloaderProps {
  trackingId?: string;
}

export default function PluginDownloader({ trackingId }: PluginDownloaderProps) {
  const { downloadPlugin, isProcessing } = usePluginDownloader();

  return (
    <div className="space-y-4">
      {/* Plugin information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="h-8 w-8 mx-auto mb-2 text-primary" />
            <div className="font-semibold">Version</div>
            <div className="text-muted-foreground">{PLUGIN_VERSION}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="h-8 w-8 mx-auto mb-2 text-green-600" />
            <div className="font-semibold">Last updated</div>
            <div className="text-muted-foreground">{LAST_UPDATED}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Shield className="h-8 w-8 mx-auto mb-2 text-blue-600" />
            <div className="font-semibold">GDPR</div>
            <div className="text-muted-foreground">Compliant</div>
          </CardContent>
        </Card>
      </div>

      {/* Download */}
      <div className="text-center">
        <Button
          onClick={downloadPlugin}
          disabled={isProcessing}
          size="lg"
          className="flex items-center gap-2 px-8 py-4 text-lg"
        >
          <Download className="h-5 w-5" />
          {isProcessing ? 'Preparing…' : 'Download WordPress Plugin (ZIP)'}
        </Button>
        <p className="text-sm text-muted-foreground mt-2">
          CortIQ Analytics v{PLUGIN_VERSION} — cookie-free tracking, GA4 Consent Mode v2,
          optional geo-gating, click &amp; scroll heatmaps.
        </p>
      </div>

      {/* Your tracking ID */}
      {trackingId && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <Shield className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium text-green-800">Your Tracking ID is ready</p>
                <p className="text-sm text-green-700 mt-1">
                  Tracking ID: <code className="bg-green-100 px-1 rounded">{trackingId}</code>
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Paste it in the plugin settings after activation.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Installation */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800">Installation</p>
              <ol className="text-sm text-blue-700 mt-1 list-decimal ml-4 space-y-1">
                <li>Remove any older CortIQ / Heatmap plugin first.</li>
                <li>Download the ZIP above.</li>
                <li>WordPress admin → Plugins → Add New → Upload Plugin → choose the ZIP → Install → Activate.</li>
                <li>Settings → CortIQ Analytics → paste your Tracking ID and choose a tracking mode.</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
