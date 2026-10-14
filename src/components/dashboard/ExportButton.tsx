/**
 * Universal Export Button Component
 * Task #6: Dataexport (CSV/Excel/JSON)
 *
 * Provides export functionality for all dashboard reports
 * Supports CSV, JSON, and Excel formats
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, FileJson, FileSpreadsheet, FileText, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { toCsv } from '@/lib/csv';

export type ExportFormat = 'csv' | 'json' | 'xlsx';

export interface ExportConfig {
  /** Report type/name */
  reportType: string;
  /** Data to export */
  data: any[];
  /** Optional filters applied to the data */
  filters?: Record<string, any>;
  /** Site ID */
  siteId?: string;
  /** Date range */
  dateRange?: {
    from: string;
    to: string;
  };
  /** Custom filename (without extension) */
  filename?: string;
}

interface ExportButtonProps {
  config: ExportConfig;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
}

export function ExportButton({
  config,
  size = 'default',
  variant = 'outline',
  className
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [showLargeExportDialog, setShowLargeExportDialog] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');

  const LARGE_DATASET_THRESHOLD = 10000;
  const isLargeDataset = config.data.length > LARGE_DATASET_THRESHOLD;

  /**
   * Convert data to CSV format
   */
  function convertToCSV(data: any[]): string {
    if (!data || data.length === 0) return '';
    // Shared helper: quotes every cell, neutralises spreadsheet formulas, adds a BOM.
    const headers = Object.keys(data[0]);
    return toCsv(headers, data.map(row => headers.map(header => row[header])));
  }

  /**
   * Convert data to JSON format
   */
  function convertToJSON(data: any[]): string {
    return JSON.stringify(data, null, 2);
  }

  async function convertToExcel(data: any[]): Promise<Blob> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data');

    if (data.length > 0) {
      worksheet.columns = Object.keys(data[0]).map(key => ({ header: key, key }));
      data.forEach(row => worksheet.addRow(row));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /**
   * Get filename with appropriate extension
   */
  function getFilename(format: ExportFormat): string {
    const baseFilename = config.filename ||
      `cortiq-${config.reportType}-${new Date().toISOString().split('T')[0]}`;
    return `${baseFilename}.${format}`;
  }

  /**
   * Download file to user's computer
   */
  function downloadFile(content: string | Blob, filename: string, mimeType: string) {
    const blob = typeof content === 'string'
      ? new Blob([content], { type: mimeType })
      : content;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Export small dataset (< 10k rows) - instant download
   */
  async function exportSmallDataset(format: ExportFormat) {
    setIsExporting(true);

    try {
      let content: string | Blob;
      let mimeType: string;

      switch (format) {
        case 'csv':
          content = convertToCSV(config.data);
          mimeType = 'text/csv';
          break;

        case 'json':
          content = convertToJSON(config.data);
          mimeType = 'application/json';
          break;

        case 'xlsx':
          content = await convertToExcel(config.data);
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;

        default:
          throw new Error('Unsupported format');
      }

      downloadFile(content, getFilename(format), mimeType);
      toast.success(`Exported ${config.data.length} rows as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    } finally {
      setIsExporting(false);
    }
  }

  /**
   * Export large dataset (> 10k rows) - async with email notification
   */
  async function exportLargeDataset(format: ExportFormat) {
    setIsExporting(true);
    setShowLargeExportDialog(false);

    try {
      // Convert data based on format
      let content: string | Blob;
      let mimeType: string;
      let extension: string;

      switch (format) {
        case 'csv':
          content = convertToCSV(config.data);
          mimeType = 'text/csv';
          extension = 'csv';
          break;

        case 'json':
          content = convertToJSON(config.data);
          mimeType = 'application/json';
          extension = 'json';
          break;

        case 'xlsx':
          content = await convertToExcel(config.data);
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          extension = 'xlsx';
          break;

        default:
          throw new Error('Unsupported format');
      }

      // Upload to Supabase Storage
      const filename = `exports/${config.reportType}/${Date.now()}.${extension}`;
      const blob = typeof content === 'string'
        ? new Blob([content], { type: mimeType })
        : content;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('exports')
        .upload(filename, blob, {
          contentType: mimeType,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL (temporary, expires in 1 hour)
      const { data: urlData } = await supabase.storage
        .from('exports')
        .createSignedUrl(filename, 3600);

      if (!urlData) throw new Error('Failed to create download URL');

      // Send email notification via Edge Function
      const { data: { user } } = await supabase.auth.getUser();

      if (user?.email) {
        await supabase.functions.invoke('send-export-email', {
          body: {
            email: user.email,
            reportType: config.reportType,
            format: format,
            downloadUrl: urlData.signedUrl,
            rowCount: config.data.length,
            expiresIn: 3600
          }
        });
      }

      toast.success(
        `Export started! Download link sent to ${user?.email || 'your email'}`,
        { duration: 5000 }
      );
    } catch (error) {
      console.error('Large export error:', error);
      toast.error('Failed to export large dataset');
    } finally {
      setIsExporting(false);
    }
  }

  /**
   * Handle export click
   */
  async function handleExport(format: ExportFormat) {
    if (config.data.length === 0) {
      toast.error('No data to export');
      return;
    }

    if (isLargeDataset) {
      setSelectedFormat(format);
      setShowLargeExportDialog(true);
    } else {
      await exportSmallDataset(format);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            disabled={isExporting || config.data.length === 0}
            className={className}
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>
            Export Format
            {isLargeDataset && (
              <span className="text-xs text-muted-foreground block mt-1">
                {config.data.length.toLocaleString()} rows - will be emailed
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport('csv')}>
            <FileText className="h-4 w-4 mr-2" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('json')}>
            <FileJson className="h-4 w-4 mr-2" />
            JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel (XLSX)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Large Export Confirmation Dialog */}
      <Dialog open={showLargeExportDialog} onOpenChange={setShowLargeExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Large Export</DialogTitle>
            <DialogDescription>
              This export contains {config.data.length.toLocaleString()} rows, which may take a few minutes to process.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
              <Mail className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium mb-1">Email Delivery</p>
                <p className="text-sm text-muted-foreground">
                  Your export will be processed in the background. We'll send you an email
                  with a download link when it's ready (usually within a few minutes).
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowLargeExportDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => exportLargeDataset(selectedFormat)}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send to Email
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Simplified export function for quick use
 */
export async function exportData(
  data: any[],
  filename: string,
  format: ExportFormat = 'csv'
) {
  const button = new ExportButton({
    config: {
      reportType: 'custom',
      data,
      filename
    }
  });

  // This is a utility function for programmatic exports
  // The actual button component should be used in the UI
}
