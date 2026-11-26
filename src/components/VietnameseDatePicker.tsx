import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CompanyHoliday } from '../types/leave';
import {
  formatDateVN,
  getHolidayCategoryLabel,
  getMonthCalendarCells,
  getTodayKey,
  parseFlexibleDateInput,
  parseDateKey,
} from '../utils/dateUtils';

interface VietnameseDatePickerProps {
  id?: string;
  label: string;
  value: string;
  min?: string;
  holidays?: CompanyHoliday[];
  rangeStart?: string;
  rangeEnd?: string;
  alignRightOnSm?: boolean;
  onChange: (dateKey: string) => void;
}

const WEEKDAY_HEADERS = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
  'Chủ nhật',
];

export function VietnameseDatePicker({
  id,
  label,
  value,
  min,
  holidays = [],
  rangeStart,
  rangeEnd,
  alignRightOnSm = false,
  onChange,
}: VietnameseDatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? formatDateVN(value) : '');

  useEffect(() => {
    setText(value ? formatDateVN(value) : '');
  }, [value]);

  const handleTextChange = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') {
      onChange('');
      return;
    }
    const parsed = parseFlexibleDateInput(raw);
    if (parsed && (!min || parsed >= min)) onChange(parsed);
  };

  const handleTextBlur = () => {
    const parsed = parseFlexibleDateInput(text);
    if (parsed) setText(formatDateVN(parsed));
    else setText(value ? formatDateVN(value) : '');
  };

  const initialDate = useMemo(() => {
    const parsed = value ? parseDateKey(value) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [value]);

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  useEffect(() => {
    if (open && value) {
      const d = parseDateKey(value);
      if (!Number.isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const holidayMap = useMemo(() => {
    const map = new Map<string, CompanyHoliday>();
    for (const h of holidays) {
      map.set(h.date, h);
    }
    return map;
  }, [holidays]);

  const cells = useMemo(
    () => getMonthCalendarCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  );
  const todayKey = getTodayKey();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDate = (dateKey: string) => {
    if (min && dateKey < min) return;
    onChange(dateKey);
    setOpen(false);
  };

  const jumpToday = () => {
    const d = new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    if (!min || todayKey >= min) {
      onChange(todayKey);
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className="block text-xs font-medium text-slate-700 mb-1.5">
        {label}
      </label>
      <div className="w-full flex items-center border border-slate-200 rounded-lg bg-white hover:border-slate-300 focus-within:ring-2 focus-within:ring-teal-600/20 focus-within:border-teal-600 transition-colors">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={handleTextBlur}
          aria-expanded={open}
          placeholder="dd/mm/yyyy — Chọn ngày..."
          className="min-w-0 flex-1 px-3 py-2 text-sm bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none font-mono-num tabular-nums"
        />
        <button
          type="button"
          aria-label="Mở lịch chọn ngày"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((prev) => !prev)}
          className="p-2 mr-0.5 rounded-md text-slate-400 hover:text-teal-700 hover:bg-slate-50 shrink-0"
        >
          <CalendarDays className="w-4 h-4" />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute top-full mt-2 z-40 w-[340px] sm:w-[380px] max-w-[92vw] bg-white border border-slate-200 rounded-xl shadow-lg p-3.5 ${
              alignRightOnSm ? 'left-0 md:left-auto md:right-0' : 'left-0'
            }`}
          >
            {/* Month Header */}
            <div className="flex items-center justify-between gap-2 pb-2.5 mb-2 border-b border-slate-100">
              <button
                type="button"
                onClick={prevMonth}
                aria-label="Tháng trước"
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 font-mono-num">
                  Tháng {String(viewMonth + 1).padStart(2, '0')} / {viewYear}
                </span>
                <button
                  type="button"
                  onClick={jumpToday}
                  className="text-[11px] font-medium text-teal-700 hover:text-teal-900 px-1.5 py-0.5 rounded hover:bg-teal-50 transition-colors"
                >
                  Hôm nay
                </button>
              </div>

              <button
                type="button"
                onClick={nextMonth}
                aria-label="Tháng sau"
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Full Vietnamese Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_HEADERS.map((day, idx) => (
                <div
                  key={day}
                  className={`py-1 text-center text-[10px] sm:text-[11px] font-semibold whitespace-nowrap ${
                    idx >= 5 ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell) => {
                const disabled = Boolean(min && cell.dateKey < min);
                const isSelected = cell.dateKey === value;
                const isToday = cell.dateKey === todayKey;
                const inRange = Boolean(
                  rangeStart &&
                    rangeEnd &&
                    cell.dateKey >= rangeStart &&
                    cell.dateKey <= rangeEnd,
                );
                const hol = holidayMap.get(cell.dateKey);
                const isMakeup = hol?.category === 'Ngày làm việc bù';
                const isOffHoliday = Boolean(hol && !isMakeup);
                const isWeekendOff = cell.isWeekend && !isMakeup;

                let cellClass = 'text-slate-800 hover:bg-slate-100';
                if (!cell.isCurrentMonth) {
                  cellClass = 'text-slate-300 hover:bg-slate-50';
                } else if (isSelected) {
                  cellClass = 'bg-teal-700 text-white font-semibold hover:bg-teal-800';
                } else if (inRange) {
                  cellClass = 'bg-teal-50 text-teal-900 font-medium hover:bg-teal-100';
                } else if (isMakeup) {
                  cellClass =
                    'bg-indigo-50 text-indigo-800 font-medium ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100';
                } else if (isOffHoliday) {
                  cellClass = 'bg-rose-50 text-rose-700 hover:bg-rose-100';
                } else if (isWeekendOff) {
                  cellClass = 'bg-slate-100/80 text-slate-400 hover:bg-slate-100';
                }

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSelectDate(cell.dateKey)}
                    title={
                      hol
                        ? `${hol.title} (${getHolidayCategoryLabel(hol.category)})`
                        : isWeekendOff
                          ? 'Cuối tuần (Nghỉ)'
                          : undefined
                    }
                    className={`h-8 rounded-lg text-xs font-mono-num tabular-nums flex items-center justify-center relative transition-colors disabled:opacity-30 disabled:pointer-events-none ${cellClass}`}
                  >
                    <span>{cell.dayNumber}</span>
                    {isToday && !isSelected && (
                      <span className="absolute bottom-1 w-1 h-1 rounded-full bg-teal-700" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Compact Legend */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-slate-200 inline-block" />
                Thứ 7, CN nghỉ
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-rose-200 inline-block" />
                Ngày lễ công ty
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-indigo-200 inline-block" />
                OT
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
