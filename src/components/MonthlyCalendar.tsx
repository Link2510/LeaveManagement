import { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
} from 'lucide-react';
import type { CompanyHoliday, LeaveRequestItem } from '../types/leave';
import {
  formatDateVN,
  getHalfDayTimeLabel,
  getHolidayCategoryLabel,
  getMonthCalendarCells,
  getTodayKey,
  getWeekdayLabelVN,
  isDateInRange,
  isWorkingDay,
  parseDateKey,
} from '../utils/dateUtils';
import { exportMonthlyLeaveExcel } from '../utils/excelExport';
import { StatusLabel } from './StatusBadge';

interface MonthlyCalendarProps {
  requests: LeaveRequestItem[];
  holidays: CompanyHoliday[];
}

const WEEKDAYS = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7 (Nghỉ)',
  'Chủ nhật (Nghỉ)',
];

export function MonthlyCalendar({ requests, holidays }: MonthlyCalendarProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string>(getTodayKey());
  const [exportNotice, setExportNotice] = useState('');

  const todayKey = getTodayKey();
  const cells = useMemo(() => getMonthCalendarCells(viewYear, viewMonth), [viewYear, viewMonth]);

  const holidayByDate = useMemo(() => {
    const map = new Map<string, CompanyHoliday>();
    for (const h of holidays) {
      map.set(h.date, h);
    }
    return map;
  }, [holidays]);

  const visibleRequests = useMemo(() => {
    return requests.filter((req) => req.status === 'Đã duyệt');
  }, [requests]);

  const requestsForDate = (dateKey: string): LeaveRequestItem[] => {
    if (!isWorkingDay(dateKey, holidayByDate)) {
      return [];
    }
    return visibleRequests.filter((r) => isDateInRange(dateKey, r.startDate, r.endDate));
  };

  const selectedDayIsWorking = useMemo(
    () => isWorkingDay(selectedDay, holidayByDate),
    [selectedDay, holidayByDate],
  );

  const selectedDayIsWeekend = useMemo(() => {
    const dow = parseDateKey(selectedDay).getDay();
    return dow === 0 || dow === 6;
  }, [selectedDay]);

  const selectedDayRequests = useMemo(() => {
    if (!isWorkingDay(selectedDay, holidayByDate)) {
      return [];
    }
    return visibleRequests.filter((r) => isDateInRange(selectedDay, r.startDate, r.endDate));
  }, [visibleRequests, selectedDay, holidayByDate]);

  const selectedHoliday = holidayByDate.get(selectedDay);

  const prevMonth = () => {
    setExportNotice('');
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    setExportNotice('');
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    setExportNotice('');
    const d = new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDay(getTodayKey());
  };

  const monthLabel = `Tháng ${String(viewMonth + 1).padStart(2, '0')} / ${viewYear}`;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 whitespace-nowrap">
              Lịch nghỉ tháng
            </h2>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="text-sm font-medium text-teal-800 font-mono-num whitespace-nowrap">
              {monthLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={prevMonth}
                aria-label="Tháng trước"
                className="p-2 hover:bg-slate-50 text-slate-600 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 border-x border-slate-200 whitespace-nowrap"
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={nextMonth}
                aria-label="Tháng sau"
                className="p-2 hover:bg-slate-50 text-slate-600 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                try {
                  const count = exportMonthlyLeaveExcel({
                    requests,
                    holidays,
                    year: viewYear,
                    monthIndex: viewMonth,
                  });
                  setExportNotice(
                    count > 0
                      ? `Đã xuất ${count} ngày nghỉ của ${monthLabel}.`
                      : `Tháng ${monthLabel} không có ngày nghỉ đã duyệt để xuất.`,
                  );
                } catch {
                  setExportNotice('Không thể tạo file Excel. Vui lòng thử lại.');
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Xuất Excel tháng này
            </button>
          </div>
        </div>

        {exportNotice && (
          <div className="px-6 py-2 text-[11px] text-slate-600 bg-slate-50 border-b border-slate-200">
            {exportNotice}
          </div>
        )}

        {/* Status Legend */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-5 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
            <span>Đã ghi nhận nghỉ phép</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
            <span>Ngày lễ / Nghỉ công ty</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block" />
            <span>OT</span>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/50 text-[11px] sm:text-xs font-medium text-slate-600">
          {WEEKDAYS.map((day, idx) => (
            <div
              key={day}
              className={`py-2.5 px-1 text-center leading-tight ${
                idx >= 5 ? 'text-slate-400 bg-slate-100/50' : ''
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
          {cells.map((cell) => {
            const hol = holidayByDate.get(cell.dateKey);
            const isMakeup = hol?.category === 'Ngày làm việc bù';
            const dayLeaves = requestsForDate(cell.dateKey);
            const isSelected = cell.dateKey === selectedDay;
            const isToday = cell.dateKey === todayKey;
            const isNonWorkingWeekend = cell.isWeekend && !isMakeup;

            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => setSelectedDay(cell.dateKey)}
                className={`min-h-[104px] p-2 text-left flex flex-col gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600 ${
                  !cell.isCurrentMonth
                    ? 'bg-slate-50/70 text-slate-400'
                    : isSelected
                      ? 'bg-teal-50/60'
                      : isNonWorkingWeekend
                        ? 'bg-slate-100/70 hover:bg-slate-100'
                        : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs font-mono-num tabular-nums w-6 h-6 inline-flex items-center justify-center rounded-md ${
                      isToday
                        ? 'bg-teal-700 text-white font-semibold'
                        : isSelected
                          ? 'bg-teal-100 text-teal-900 font-semibold'
                          : isNonWorkingWeekend
                            ? 'text-slate-400 font-medium'
                            : 'text-slate-700 font-medium'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>

                  {hol ? (
                    <span
                      className={`text-[10px] font-medium truncate max-w-[78px] ${
                        isMakeup ? 'text-indigo-700' : 'text-rose-700'
                      }`}
                      title={hol.title}
                    >
                      {isMakeup ? 'OT' : hol.title}
                    </span>
                  ) : isNonWorkingWeekend && cell.isCurrentMonth ? (
                    <span className="text-[10px] text-slate-400">Nghỉ</span>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1 w-full mt-0.5">
                  {dayLeaves.slice(0, 3).map((leave) => {
                    const tone =
                      leave.status === 'Đã duyệt'
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : leave.status === 'Đang chờ duyệt'
                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                          : 'bg-sky-50 text-sky-900 border-sky-200';
                    const shortStatus =
                      leave.status === 'Đã duyệt'
                        ? 'Duyệt'
                        : leave.status === 'Đang chờ duyệt'
                          ? 'Chờ'
                          : 'Mới';

                    return (
                      <div
                        key={leave.id}
                        className={`px-1.5 py-0.5 text-[11px] rounded border truncate flex items-center justify-between gap-1 ${tone}`}
                        title={`${leave.employeeName} (${leave.status}) — ${leave.reason}`}
                      >
                        <span className="truncate font-medium">{leave.employeeName}</span>
                        <span className="text-[10px] opacity-80 shrink-0">{shortStatus}</span>
                      </div>
                    );
                  })}
                  {dayLeaves.length > 3 && (
                    <span className="text-[10px] text-slate-500 pl-1 font-medium">
                      +{dayLeaves.length - 3} người khác
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Detail Panel */}
      <aside className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <p className="text-xs text-slate-500">Chi tiết ngày chọn</p>
            <h3 className="text-base font-semibold text-slate-900 font-mono-num mt-0.5">
              {getWeekdayLabelVN(selectedDay)}, {formatDateVN(selectedDay)}
            </h3>
          </div>
          <CalendarIcon className="w-5 h-5 text-teal-700" />
        </div>

        {selectedHoliday && (
          <div
            className={`mb-4 p-3.5 rounded-lg border text-sm ${
              selectedHoliday.category === 'Ngày làm việc bù'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}
          >
            <div className="font-semibold">{selectedHoliday.title}</div>
            <div className="text-xs mt-1 opacity-85">
              Phân loại: {getHolidayCategoryLabel(selectedHoliday.category)}
              {selectedHoliday.note ? ` · ${selectedHoliday.note}` : ''}
            </div>
          </div>
        )}

        {!selectedDayIsWorking && !selectedHoliday && selectedDayIsWeekend ? (
          <div className="py-10 text-center text-sm text-slate-500 space-y-1">
            <div className="font-medium text-slate-700">Ngày nghỉ cuối tuần (Thứ 7 / Chủ nhật)</div>
            <p className="text-xs text-slate-500">
              Công ty không làm việc ngày này (trừ khi Quản lý cấu hình là ngày OT).
            </p>
          </div>
        ) : !selectedDayIsWorking ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Ngày nghỉ công ty — không tính ngày nghỉ phép cá nhân.
          </div>
        ) : selectedDayRequests.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Không có nhân sự đăng ký nghỉ vào ngày làm việc này.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {selectedDayRequests.map((req) => (
              <div
                key={req.id}
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {req.employeeName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {req.department} · {formatDateVN(req.startDate)} → {formatDateVN(req.endDate)} ({req.workingDays} ngày)
                    </div>
                  </div>
                  <StatusLabel status={req.status} />
                </div>

                <div className="text-xs text-slate-700 leading-relaxed flex items-start gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{req.reason}</span>
                </div>

                {req.halfDay?.date === selectedDay && (
                  <div className="text-[11px] text-amber-700">
                    Nghỉ nửa ngày: {getHalfDayTimeLabel(req.halfDay.session)}
                  </div>
                )}
                {req.allocations.length > 0 && (
                  <div className="text-xs text-slate-600 pt-1 border-t border-slate-200/70">
                    Phân bổ:{' '}
                    {req.allocations.map((a) => `${a.type} (${a.days} ngày)`).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
