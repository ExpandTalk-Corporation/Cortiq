import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ServerLogImporterProps {
  siteId: string;
}

type LogFormat = 'combined' | 'json' | 'csv';

export function ServerLogImporter({ siteId }: ServerLogImporterProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [logFormat, setLogFormat] = useState<LogFormat>('combined');
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error('Select a log file first');
      return;
    }

    setIsUploading(true);
    setImportResult(null);

    try {
      // Read file content
      const fileContent = await selectedFile.text();

      // Call edge function to process logs
      const { data, error } = await supabase.functions.invoke('import-server-logs', {
        body: {
          site_id: siteId,
          log_content: fileContent,
          log_format: logFormat
        }
      });

      if (error) {
        throw error;
      }

      setImportResult(data);
      toast.success(`Import complete! ${data.stats.processed_lines} rows processed`);
      setSelectedFile(null);
      
      // Reset file input
      const fileInput = document.getElementById('log-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (error: any) {
      console.error('Import error:', error);
      toast.error('Import error: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="glass shadow-elegant">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Upload className="h-6 w-6 text-primary" />
          <div>
            <CardTitle>Import Server Logs</CardTitle>
            <CardDescription>
              Upload server log files for cookie-free analytics (IP anonymization is automatic)
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Format Information */}
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertTitle>Supported log file formats:</AlertTitle>
          <AlertDescription className="space-y-2 mt-2">
            <div className="text-sm space-y-1">
              <p><strong>Combined Log Format (Apache/Nginx):</strong></p>
              <code className="text-xs bg-muted p-1 rounded">
                93.184.216.34 - - [10/Jan/2025:13:55:36] "GET /produkter HTTP/1.1" 200...
              </code>
            </div>
            <div className="text-sm space-y-1 mt-2">
              <p><strong>JSON format:</strong></p>
              <code className="text-xs bg-muted p-1 rounded">
                {"{"}"timestamp":"2025-01-10T13:55:36Z","ip":"93.184.216.34",...{"}"}
              </code>
            </div>
            <div className="text-sm space-y-1 mt-2">
              <p><strong>CSV format:</strong></p>
              <code className="text-xs bg-muted p-1 rounded">
                timestamp,ip,method,url,status,referrer,user_agent
              </code>
            </div>
          </AlertDescription>
        </Alert>

        {/* Format Selection */}
        <div className="space-y-2">
          <Label htmlFor="log-format">Log file format</Label>
          <Select value={logFormat} onValueChange={(value) => setLogFormat(value as LogFormat)}>
            <SelectTrigger id="log-format">
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="combined">Combined Log Format (Apache/Nginx)</SelectItem>
              <SelectItem value="json">JSON-format</SelectItem>
              <SelectItem value="csv">CSV-format</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* File Upload */}
        <div className="space-y-2">
          <Label htmlFor="log-file-input">Select log file</Label>
          <div className="flex items-center space-x-2">
            <input
              id="log-file-input"
              type="file"
              accept=".log,.txt,.json,.csv"
              onChange={handleFileSelect}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {selectedFile && (
            <p className="text-sm text-muted-foreground flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>{selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)</span>
            </p>
          )}
        </div>

        {/* Import Button */}
        <Button
          onClick={handleImport}
          disabled={!selectedFile || isUploading}
          className="w-full bg-gradient-primary hover-scale"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Import log file
            </>
          )}
        </Button>

        {/* Import Result */}
        {importResult && (
          <Alert className={importResult.stats.failed_lines > 0 ? 'border-yellow-500' : 'border-green-500'}>
            {importResult.stats.failed_lines > 0 ? (
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            <AlertTitle>Import complete</AlertTitle>
            <AlertDescription>
              <div className="space-y-1 mt-2 text-sm">
                <p>✓ Total rows: {importResult.stats.total_lines}</p>
                <p>✓ Processed rows: {importResult.stats.processed_lines}</p>
                {importResult.stats.failed_lines > 0 && (
                  <p className="text-yellow-600">⚠ Failed rows: {importResult.stats.failed_lines}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  IP addresses have been anonymized immediately (IP → Country → Deleted)
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Privacy Notice */}
        <div className="bg-primary/5 p-4 rounded-lg">
          <h4 className="font-semibold mb-2 text-sm">🔒 Privacy & GDPR</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>✓ IP addresses are anonymized <strong>immediately</strong> on import</li>
            <li>✓ Only country/region is stored — never IP addresses</li>
            <li>✓ Bot traffic is automatically excluded</li>
            <li>✓ Data is aggregated for cookie-free analytics</li>
            <li>✓ No device access, so no cookie consent needed for imported logs; legal basis is typically legitimate interest (GDPR Art. 6.1.f), your assessment</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
