import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  UserX,
} from 'lucide-react';
import type {
  CompanyHoliday,
  Employee,
  HolidayCategory,
  LeaveRequestItem,
  MonthlyOffEntry,
} from '../types/leave';
import {
  addHoliday,
  deleteHoliday,
  subscribeDailyOffStatus,
  subscribeMonthlyOffStatus,
} from '../services/firestoreService';
import {
  formatDateVN,
  getHolidayCategoryLabel,
  getMonthCalendarCells,
  getTodayKey,
  getWeekdayLabelVN,
  leaveRequestCoversDate,
  isWorkingDay,
  parseDateKey,
  toDateKey,
} from '../utils/dateUtils';
import { VietnameseDatePicker } from './VietnameseDatePicker';

interface HolidayManagerProps {
  holidays: CompanyHoliday[];
  employees?: Employee[];
  managerRequests?: LeaveRequestItem[];
  isAdminView: boolean;
}

const CATEGORIES: HolidayCategory[] = [
  'Lễ/Tết',
  'Nghỉ bù',
  'Ngày làm việc bù',
  'Nghỉ công ty',
];

const WEEKDAYS = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7 (Nghỉ)',
  'Chủ nhật (Nghỉ)',
];

export function HolidayManager({
  holidays,
  employees = [],
  managerRequests,
  isAdminView,
}: HolidayManagerProps) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const todayKey = getTodayKey();

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [viewYear, setViewYear] = useState<number>(currentYear);
  const [viewMonth, setViewMonth] = useState<number>(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);

  const [date, setDate] = useState<string>(todayKey);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<HolidayCategory>('Lễ/Tết');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  const holidayByDate = useMemo(() => {
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

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>([
      currentYear - 1,
      currentYear,
      currentYear + 1,
      currentYear + 2,
    ]);
    for (const h of holidays) {
      if (h.year >= 2020 && h.year <= 2100) {
        yearSet.add(h.year);
      }
    }
    yearSet.add(selectedYear);
    return Array.from(yearSet).sort((a, b) => a - b);
  }, [holidays, currentYear, selectedYear]);

  const filteredHolidays = useMemo(
    () => holidays.filter((h) => h.year === selectedYear),
    [holidays, selectedYear],
  );

  const monthHolidays = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-`;
    return holidays
      .filter((h) => h.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, viewYear, viewMonth]);

  const selectedHoliday = holidayByDate.get(selectedDay);
  const selectedDayIsWorking = useMemo(
    () => isWorkingDay(selectedDay, holidayByDate),
    [selectedDay, holidayByDate],
  );
  const selectedDayIsWeekend = useMemo(() => {
    const dow = parseDateKey(selectedDay).getDay();
    return dow === 0 || dow === 6;
  }, [selectedDay]);

  const viewedMonthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;

  const [publicDayOffIds, setPublicDayOffIds] = useState<string[]>([]);
  const [loadingDayOff, setLoadingDayOff] = useState(false);

  const [publicMonthOffEntries, setPublicMonthOffEntries] = useState<MonthlyOffEntry[]>([]);
  const [loadingMonthOff, setLoadingMonthOff] = useState(false);

  useEffect(() => {
    if (!isAdminView || !managerRequests) {
      setLoadingDayOff(false);
      return;
    }
    setLoadingDayOff(false);
  }, [isAdminView, managerRequests]);

  useEffect(() => {
    if (isAdminView && managerRequests) {
      setLoadingDayOff(false);
      return;
    }
    if (!isAdminView) {
      setPublicDayOffIds([]);
      setLoadingDayOff(false);
      return;
    }
    if (!selectedDayIsWorking) {
      setPublicDayOffIds([]);
      setLoadingDayOff(false);
      return;
    }

    setLoadingDayOff(true);
    const unsub = subscribeDailyOffStatus(
      selectedDay,
      (ids) => {
        setPublicDayOffIds(ids);
      },
      () => {
        setLoadingDayOff(false);
      },
    );
    return () => unsub();
  }, [isAdminView, managerRequests, selectedDay, selectedDayIsWorking]);

  useEffect(() => {
    if (isAdminView && managerRequests) {
      setLoadingMonthOff(false);
      return;
    }

    setLoadingMonthOff(true);
    const unsub = subscribeMonthlyOffStatus(
      viewedMonthKey,
      (entries) => {
        setPublicMonthOffEntries(entries);
      },
      () => {
        setLoadingMonthOff(false);
      },
    );
    return () => unsub();
  }, [isAdminView, managerRequests, viewedMonthKey]);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) {
      map.set(emp.id, emp);
    }
    return map;
  }, [employees]);

  const offEmployeesOnSelectedDay = useMemo(() => {
    if (!selectedDayIsWorking) return [];

    const idSet = new Set<string>();
    if (isAdminView && managerRequests) {
      for (const req of managerRequests) {
        if (
          req.status === 'Đã duyệt' &&
          leaveRequestCoversDate(req, selectedDay) &&
          req.halfDay?.date !== selectedDay
        ) {
          idSet.add(req.employeeId);
        }
      }
    } else {
      for (const id of publicDayOffIds) {
        idSet.add(id);
      }
    }

    const result: Employee[] = [];
    for (const id of idSet) {
      const emp = employeeById.get(id);
      if (emp) result.push(emp);
    }
    result.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return result;
  }, [
    selectedDayIsWorking,
    isAdminView,
    managerRequests,
    selectedDay,
    publicDayOffIds,
    employeeById,
  ]);

  const monthlyOffEntriesResolved = useMemo(() => {
    const datesByEmp = new Map<string, Set<string>>();

    if (isAdminView && managerRequests) {
      const monthPrefix = `${viewedMonthKey}-`;
      for (const req of managerRequests) {
        if (req.status !== 'Đã duyệt') continue;
        const start = parseDateKey(req.startDate);
        const end = parseDateKey(req.endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) continue;

        const cursor = new Date(start);
        let safety = 0;
        while (cursor <= end && safety < 400) {
          safety += 1;
          const dateKey = toDateKey(cursor);
          if (dateKey.startsWith(monthPrefix) && isWorkingDay(dateKey, holidayByDate)) {
            let set = datesByEmp.get(req.employeeId);
            if (!set) {
              set = new Set<string>();
              datesByEmp.set(req.employeeId, set);
            }
            set.add(dateKey);
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    } else {
      for (const entry of publicMonthOffEntries) {
        let set = datesByEmp.get(entry.employeeId);
        if (!set) {
          set = new Set<string>();
          datesByEmp.set(entry.employeeId, set);
        }
        for (const d of entry.dates) {
          if (d.startsWith(`${viewedMonthKey}-`) && isWorkingDay(d, holidayByDate)) {
            set.add(d);
          }
        }
      }
    }

    const items: Array<{ employee: Employee; dates: string[] }> = [];
    for (const [empId, dateSet] of datesByEmp.entries()) {
      const emp = employeeById.get(empId);
      if (!emp) continue;
      const sortedDates = Array.from(dateSet).sort();
      if (sortedDates.length > 0) {
        items.push({ employee: emp, dates: sortedDates });
      }
    }
    items.sort((a, b) => a.employee.name.localeCompare(b.employee.name, 'vi'));
    return items;
  }, [
    isAdminView,
    managerRequests,
    viewedMonthKey,
    holidayByDate,
    publicMonthOffEntries,
    employeeById,
  ]);

  const offEmployeesByDate = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const item of monthlyOffEntriesResolved) {
      for (const d of item.dates) {
        const list = map.get(d);
        if (list) {
          list.push(item.employee);
        } else {
          map.set(d, [item.employee]);
        }
      }
    }
    return map;
  }, [monthlyOffEntriesResolved]);

  const handleDatePickerChange = (next: string) => {
    setDate(next);
    if (next) {
      const d = parseDateKey(next);
      if (!Number.isNaN(d.getTime())) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) {
          setCategory('Ngày làm việc bù');
        }
      }
    }
  };

  const selectYearAll = (yr: number) => {
    const clamped = Math.min(2100, Math.max(2020, yr));
    setSelectedYear(clamped);
    setViewYear(clamped);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      const nextYr = Math.max(2020, viewYear - 1);
      setViewYear(nextYr);
      setSelectedYear(nextYr);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      const nextYr = Math.min(2100, viewYear + 1);
      setViewYear(nextYr);
      setSelectedYear(nextYr);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const d = new Date();
    setViewYear(d.getFullYear());
    setSelectedYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDay(getTodayKey());
  };

  const focusHolidayDate = (dateKey: string) => {
    const d = parseDateKey(dateKey);
    if (!Number.isNaN(d.getTime())) {
      setViewYear(d.getFullYear());
      setSelectedYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    setSelectedDay(dateKey);
  };

  const prefillFormFromDay = (dateKey: string) => {
    handleDatePickerChange(dateKey);
    const d = parseDateKey(dateKey);
    if (!Number.isNaN(d.getTime())) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) {
        setCategory('Lễ/Tết');
      }
    }
    titleInputRef.current?.focus();
    titleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || title.trim().length < 2) return;
    setSaving(true);
    try {
      const d = parseDateKey(date);
      const year = Number(date.split('-')[0]) || selectedYear;
      const month = !Number.isNaN(d.getTime()) ? d.getMonth() : viewMonth;
      await addHoliday({
        date,
        title: title.trim(),
        category,
        year,
        note: note.trim(),
      });
      setTitle('');
      setNote('');
      setSelectedYear(year);
      setViewYear(year);
      setViewMonth(month);
      setSelectedDay(date);
    } finally {
      setSaving(false);
    }
  };

  const monthLabel = `Tháng ${String(viewMonth + 1).padStart(2, '0')} / ${viewYear}`;

  return (
    <div className="space-y-6">
      {isAdminView && (
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Thiết lập ngày nghỉ lễ, nghỉ bù &amp; ngày OT
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Mặc định Thứ 7 &amp; Chủ nhật là ngày nghỉ. Ngày Lễ/Tết, Nghỉ bù, Nghỉ công ty sẽ được loại trừ khi tính phép. Nếu chọn <strong>OT</strong> vào Thứ 7/CN, hệ thống sẽ mở lại ngày đó thành ngày làm việc bình thường.
            </p>
          </div>

          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3">
              <VietnameseDatePicker
                id="holiday-date"
                label="Chọn ngày"
                value={date}
                holidays={holidays}
                onChange={handleDatePickerChange}
              />
            </div>

            <div className="md:col-span-3">
              <label htmlFor="holiday-title" className="block text-xs font-medium text-slate-700 mb-1.5">
                Tên sự kiện
              </label>
              <input
                ref={titleInputRef}
                id="holiday-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ví dụ: Nghỉ Tết Nguyên Đán"
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="holiday-category" className="block text-xs font-medium text-slate-700 mb-1.5">
                Phân loại
              </label>
              <select
                id="holiday-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as HolidayCategory)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {getHolidayCategoryLabel(c)}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="holiday-note" className="block text-xs font-medium text-slate-700 mb-1.5">
                Ghi chú
              </label>
              <input
                id="holiday-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Tùy chọn"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Thêm ngày
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Visual Calendar + Selected Day Detail */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-slate-900 whitespace-nowrap">
                Lịch ngày nghỉ công ty
              </h2>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-sm font-medium text-teal-800 font-mono-num whitespace-nowrap">
                {monthLabel}
              </span>
            </div>

            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden self-start sm:self-auto">
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
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 border-x border-slate-200 whitespace-nowrap shrink-0"
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
          </div>

          {/* Legend */}
          <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-5 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
              <span>Ngày lễ / Nghỉ công ty</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
              <span>Nghỉ phép cá nhân</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block" />
              <span>OT</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" />
              <span>Thứ 7, Chủ nhật (Nghỉ)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-teal-700 inline-block" />
              <span>Hôm nay</span>
            </div>
          </div>

          {/* Weekday Headers */}
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
              const isOffHoliday = Boolean(hol && !isMakeup);
              const isNonWorkingWeekend = cell.isWeekend && !isMakeup;
              const isSelected = cell.dateKey === selectedDay;
              const isToday = cell.dateKey === todayKey;
              const cellOffEmployees = cell.isCurrentMonth
                ? offEmployeesByDate.get(cell.dateKey) || []
                : [];

              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  onClick={() => setSelectedDay(cell.dateKey)}
                  className={`min-h-[96px] sm:min-h-[104px] p-2 text-left flex flex-col justify-start gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600 ${
                    !cell.isCurrentMonth
                      ? 'bg-slate-50/70 text-slate-400'
                      : isSelected
                        ? 'bg-teal-50/70 ring-1 ring-inset ring-teal-500/40'
                        : isMakeup
                          ? 'bg-indigo-50/60 hover:bg-indigo-50'
                          : isOffHoliday
                            ? 'bg-rose-50/70 hover:bg-rose-50'
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
                            : isOffHoliday
                              ? 'text-rose-700 font-semibold'
                              : isMakeup
                                ? 'text-indigo-700 font-semibold'
                                : isNonWorkingWeekend
                                  ? 'text-slate-400 font-medium'
                                  : 'text-slate-700 font-medium'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {isNonWorkingWeekend && !hol && cell.isCurrentMonth ? (
                      <span className="text-[10px] text-slate-400 hidden sm:inline">Nghỉ</span>
                    ) : cellOffEmployees.length > 0 && !isOffHoliday ? (
                      <span className="text-[10px] font-medium text-amber-700 font-mono-num tabular-nums">
                        {cellOffEmployees.length} nghỉ
                      </span>
                    ) : null}
                  </div>

                  {hol && (
                    <div
                      className={`w-full px-1.5 py-1 rounded border text-[11px] leading-tight ${
                        isMakeup
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                          : 'bg-rose-50 border-rose-200 text-rose-900'
                      }`}
                      title={`${hol.title} (${getHolidayCategoryLabel(hol.category)})`}
                    >
                      <div className="font-medium truncate">{hol.title}</div>
                      <div className="text-[10px] opacity-80 truncate hidden sm:block">
                        {getHolidayCategoryLabel(hol.category)}
                      </div>
                    </div>
                  )}

                  {cellOffEmployees.length > 0 && !isOffHoliday && (
                    <div className="flex flex-col gap-1 w-full">
                      {cellOffEmployees.slice(0, 2).map((emp) => (
                        <div
                          key={emp.id}
                          className="px-1.5 py-0.5 text-[11px] rounded border bg-amber-50 text-amber-900 border-amber-200 truncate font-medium"
                          title={`${emp.name} — Nghỉ phép cá nhân`}
                        >
                          {emp.name}
                        </div>
                      ))}
                      {cellOffEmployees.length > 2 && (
                        <span className="text-[10px] text-slate-500 pl-1 font-medium">
                          +{cellOffEmployees.length - 2} người khác
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Right Sidebar: Selected Month Detail for Employees / Selected Day Detail for Managers */}
        <aside className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          {!isAdminView ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs text-slate-500">Chi tiết tháng đang chọn</p>
                  <h3 className="text-base font-semibold text-slate-900 font-mono-num mt-0.5">
                    {monthLabel}
                  </h3>
                </div>
                <CalendarIcon className="w-5 h-5 text-teal-700 shrink-0" />
              </div>

              {/* Nhân sự nghỉ trong tháng */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <UserX className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                    <span>Nhân sự nghỉ trong tháng</span>
                  </div>
                  {!loadingMonthOff && (
                    <span className="text-xs font-mono-num tabular-nums text-slate-500">
                      {monthlyOffEntriesResolved.length} người
                    </span>
                  )}
                </div>

                {loadingMonthOff ? (
                  <p className="text-xs text-slate-500 py-1">
                    Đang tải danh sách nghỉ phép trong tháng...
                  </p>
                ) : monthlyOffEntriesResolved.length === 0 ? (
                  <p className="text-xs text-slate-500 py-1">
                    Tháng này chưa có nhân sự nào nghỉ phép.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/40">
                    {monthlyOffEntriesResolved.map(({ employee: emp, dates }) => {
                      const initials = emp.name
                        .trim()
                        .split(/\s+/)
                        .slice(-2)
                        .map((p) => p[0]?.toUpperCase() || '')
                        .join('');
                      return (
                        <li key={emp.id} className="p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {emp.avatarPhoto ? (
                                <img
                                  src={emp.avatarPhoto}
                                  alt={emp.name}
                                  className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0 bg-white"
                                />
                              ) : (
                                <span className="w-7 h-7 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-semibold inline-flex items-center justify-center shrink-0">
                                  {initials || '?'}
                                </span>
                              )}
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 truncate">
                                  {emp.name}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {emp.department}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[11px] font-semibold text-amber-700 font-mono-num tabular-nums">
                                {dates.length} ngày
                              </div>
                              <div className="text-[10px] text-slate-500">Nghỉ phép cá nhân</div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5 pl-9">
                            {dates.map((dateKey) => {
                              const isActiveDate = dateKey === selectedDay;
                              return (
                                <button
                                  key={dateKey}
                                  type="button"
                                  onClick={() => setSelectedDay(dateKey)}
                                  className={`px-2 py-0.5 rounded border text-[11px] font-mono-num tabular-nums transition-colors ${
                                    isActiveDate
                                      ? 'bg-teal-700 border-teal-700 text-white font-medium'
                                      : 'bg-white border-slate-200 text-slate-700 hover:border-teal-300 hover:bg-teal-50/50'
                                  }`}
                                >
                                  {getWeekdayLabelVN(dateKey)}, {formatDateVN(dateKey)}
                                </button>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Lịch nghỉ của công ty trong tháng */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-slate-700">
                    Lịch nghỉ của công ty ({monthLabel})
                  </h4>
                  <span className="text-xs font-mono-num tabular-nums text-slate-500">
                    {monthHolidays.length} ngày
                  </span>
                </div>

                {monthHolidays.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    Tháng này chưa có ngày nghỉ lễ hay OT nào được thiết lập.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {monthHolidays.map((h) => {
                      const isMakeup = h.category === 'Ngày làm việc bù';
                      const isActive = h.date === selectedDay;
                      return (
                        <li key={h.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedDay(h.date)}
                            className={`w-full py-2.5 px-2 -mx-2 rounded-lg text-left flex items-start justify-between gap-2 transition-colors ${
                              isActive ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {h.title}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                                <span className="font-mono-num tabular-nums">
                                  {formatDateVN(h.date)}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{getWeekdayLabelVN(h.date)}</span>
                              </div>
                              {h.note && (
                                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                  {h.note}
                                </div>
                              )}
                            </div>
                            <span
                              className={`text-[11px] font-medium shrink-0 ${
                                isMakeup ? 'text-indigo-700' : 'text-rose-700'
                              }`}
                            >
                              {getHolidayCategoryLabel(h.category)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs text-slate-500">Chi tiết ngày đang chọn</p>
                  <h3 className="text-base font-semibold text-slate-900 font-mono-num mt-0.5">
                    {getWeekdayLabelVN(selectedDay)}, {formatDateVN(selectedDay)}
                  </h3>
                </div>
                <CalendarIcon className="w-5 h-5 text-teal-700 shrink-0" />
              </div>

              {selectedHoliday ? (
                <div
                  className={`p-4 rounded-lg border text-sm space-y-2 ${
                    selectedHoliday.category === 'Ngày làm việc bù'
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-950'
                      : 'bg-rose-50 border-rose-200 text-rose-950'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{selectedHoliday.title}</div>
                    <button
                      type="button"
                      onClick={() => deleteHoliday(selectedHoliday.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 hover:bg-white/70 rounded transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Xóa
                    </button>
                  </div>
                  <div className="text-xs opacity-85">
                    Phân loại: <strong>{getHolidayCategoryLabel(selectedHoliday.category)}</strong>
                  </div>
                  {selectedHoliday.note && (
                    <div className="text-xs opacity-80">Ghi chú: {selectedHoliday.note}</div>
                  )}
                  <div className="text-xs pt-1 border-t border-black/10 opacity-85">
                    {selectedHoliday.category === 'Ngày làm việc bù'
                      ? 'Ngày này được tính là ngày làm việc bình thường.'
                      : 'Ngày nghỉ công ty — không tính vào ngày phép cá nhân.'}
                  </div>
                </div>
              ) : !selectedDayIsWorking && selectedDayIsWeekend ? (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600 space-y-1.5">
                  <div className="font-medium text-slate-800">
                    Ngày nghỉ cuối tuần ({getWeekdayLabelVN(selectedDay)})
                  </div>
                  <p className="text-xs text-slate-500">
                    Công ty không làm việc cuối tuần trừ khi Quản lý cấu hình là ngày OT.
                  </p>
                  <button
                    type="button"
                    onClick={() => prefillFormFromDay(selectedDay)}
                    className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Đặt ngày này làm ngày OT
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600 space-y-1.5">
                  <div className="font-medium text-slate-800">Ngày làm việc bình thường</div>
                  <p className="text-xs text-slate-500">
                    Chưa có lịch nghỉ lễ hoặc sự kiện đặc biệt nào được cấu hình cho ngày này.
                  </p>
                  <button
                    type="button"
                    onClick={() => prefillFormFromDay(selectedDay)}
                    className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-900"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm ngày nghỉ vào ngày này
                  </button>
                </div>
              )}

              {/* Nhân sự nghỉ phép vào ngày đang chọn */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <UserX className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                    <span>Nhân sự nghỉ phép ngày này</span>
                  </div>
                  {selectedDayIsWorking && !loadingDayOff && (
                    <span className="text-xs font-mono-num tabular-nums text-slate-500">
                      {offEmployeesOnSelectedDay.length} người
                    </span>
                  )}
                </div>

                {!selectedDayIsWorking ? (
                  <p className="text-xs text-slate-500">
                    Ngày nghỉ chung toàn công ty — không phát sinh lịch nghỉ phép cá nhân.
                  </p>
                ) : loadingDayOff ? (
                  <p className="text-xs text-slate-500 py-1">Đang kiểm tra danh sách nghỉ phép...</p>
                ) : offEmployeesOnSelectedDay.length === 0 ? (
                  <p className="text-xs text-slate-500 py-1">
                    Không có nhân sự nào nghỉ phép trong ngày này.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/50">
                    {offEmployeesOnSelectedDay.map((emp) => {
                      const initials = emp.name
                        .trim()
                        .split(/\s+/)
                        .slice(-2)
                        .map((p) => p[0]?.toUpperCase() || '')
                        .join('');
                      return (
                        <li
                          key={emp.id}
                          className="px-3 py-2 flex items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {emp.avatarPhoto ? (
                              <img
                                src={emp.avatarPhoto}
                                alt={emp.name}
                                className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0 bg-white"
                              />
                            ) : (
                              <span className="w-7 h-7 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-semibold inline-flex items-center justify-center shrink-0">
                                {initials || '?'}
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {emp.name}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {emp.department}
                              </div>
                            </div>
                          </div>
                          <span className="text-[11px] font-medium text-amber-700 shrink-0">
                            Nghỉ phép cá nhân
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Events in current viewed month */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-slate-700">
                    Sự kiện trong {monthLabel}
                  </h4>
                  <span className="text-xs font-mono-num tabular-nums text-slate-500">
                    {monthHolidays.length} ngày
                  </span>
                </div>

                {monthHolidays.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">
                    Tháng này chưa có ngày nghỉ lễ hay OT nào được thiết lập.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {monthHolidays.map((h) => {
                      const isMakeup = h.category === 'Ngày làm việc bù';
                      const isActive = h.date === selectedDay;
                      return (
                        <li key={h.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedDay(h.date)}
                            className={`w-full py-2.5 px-2 -mx-2 rounded-lg text-left flex items-start justify-between gap-2 transition-colors ${
                              isActive ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {h.title}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                                <span className="font-mono-num tabular-nums">
                                  {formatDateVN(h.date)}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{getWeekdayLabelVN(h.date)}</span>
                              </div>
                            </div>
                            <span
                              className={`text-[11px] font-medium shrink-0 ${
                                isMakeup ? 'text-indigo-700' : 'text-rose-700'
                              }`}
                            >
                              {getHolidayCategoryLabel(h.category)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Yearly Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CalendarOff className="w-4 h-4 text-teal-700" />
            <h3 className="text-base font-semibold text-slate-900">
              Danh sách ngày nghỉ công ty năm {selectedYear}
            </h3>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => selectYearAll(selectedYear - 1)}
              aria-label="Năm trước"
              className="p-1 text-slate-600 hover:text-slate-900 rounded-md transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {availableYears.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => selectYearAll(yr)}
                className={`px-3 py-1 text-xs font-mono-num font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedYear === yr
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {yr}
              </button>
            ))}
            <button
              type="button"
              onClick={() => selectYearAll(selectedYear + 1)}
              aria-label="Năm sau"
              className="p-1 text-slate-600 hover:text-slate-900 rounded-md transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600">
                <th className="py-3 px-6">Ngày</th>
                <th className="py-3 px-4">Tên ngày lễ / sự kiện</th>
                <th className="py-3 px-4">Phân loại</th>
                <th className="py-3 px-4">Ghi chú</th>
                {isAdminView && <th className="py-3 px-6 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredHolidays.length === 0 ? (
                <tr>
                  <td colSpan={isAdminView ? 5 : 4} className="py-10 text-center text-slate-500">
                    Chưa có ngày nghỉ nào được cấu hình cho năm {selectedYear}.
                  </td>
                </tr>
              ) : (
                filteredHolidays.map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => focusHolidayDate(h.date)}
                    className={`cursor-pointer transition-colors ${
                      h.date === selectedDay ? 'bg-teal-50/50' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-3 px-6 font-mono-num tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      <span>{formatDateVN(h.date)}</span>
                      <span className="ml-2 text-xs font-sans font-normal text-slate-500">
                        ({getWeekdayLabelVN(h.date)})
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{h.title}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`text-xs font-medium ${
                          h.category === 'Ngày làm việc bù'
                            ? 'text-indigo-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {getHolidayCategoryLabel(h.category)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{h.note || '—'}</td>
                    {isAdminView && (
                      <td className="py-3 px-6 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHoliday(h.id);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Xóa
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

