import React from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { DATE_PRESETS, presetRange } from '@/lib/dashboard/filters';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  className?: string;
  /** Small full-width trigger for narrow columns; presets sit beside a one-month calendar. */
  compact?: boolean;
}

// presetRange works in UTC dates; callers read Date parts in local time.
const localDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function DateRangePicker({ dateRange, onDateRangeChange, className, compact = false }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const label = dateRange?.from
    ? dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime()
      ? `${format(dateRange.from, compact ? 'd MMM' : 'd MMM y')} – ${format(dateRange.to, 'd MMM y')}`
      : format(dateRange.from, 'd MMM y')
    : 'Select date range';

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            size={compact ? 'sm' : 'default'}
            aria-label={`Date range: ${label}`}
            className={cn('justify-start text-left font-normal', compact ? 'w-full' : 'w-[300px]')}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={compact ? 'end' : 'start'}>
          <div className="flex flex-col sm:flex-row">
            <div className="flex flex-wrap gap-1 border-b p-2 sm:w-36 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r">
              {DATE_PRESETS.map((p) => (
                <Button
                  key={p.id}
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    const r = presetRange(p.id, new Date());
                    onDateRangeChange({ from: localDate(r.from), to: localDate(r.to) });
                    setOpen(false);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={onDateRangeChange}
              numberOfMonths={compact ? 1 : 2}
              weekStartsOn={1}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
