import React, { useMemo, useState } from 'react';
import { CalendarCheck2, Search, Sparkles, Users } from 'lucide-react';
import type { CompanyHoliday, Department, Employee, LeaveRequestItem } from '../types/leave';
import {
  formatDateVN,
  getTodayKey,
  getWeekdayLabelVN,
  isDateInRange,
  isWorkingDay,
} from '../utils/dateUtils';
import { BobbleAvatar, getEmployeeAvatarId } from './BobbleAvatar';

interface AttendanceTodayProps {
  employees: Employee[];
  holidays: CompanyHoliday[];
  dailyOffEmployeeIds: string[];
  managerRequests?: LeaveRequestItem[];
  isManagerView: boolean;
  loading: boolean;
}

export function AttendanceToday({
  employees,
  holidays,
  dailyOffEmployeeIds,
  managerRequests = [],
  isManagerView,
  loading,
}: AttendanceTodayProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState<'ALL' | Department>('ALL');
  const [globalWobblePulse, setGlobalWobblePulse] = useState(0);
  const [cardPulses, setCardPulses] = useState<Record<string, number>>({});

  const triggerCardPulse = (empId: string) => {
    setCardPulses((prev) => ({ ...prev, [empId]: (prev[empId] || 0) + 1 }));
  };

  const todayKey = getTodayKey();
  const todayHoliday = useMemo(
    () => holidays.find((h) => h.date === todayKey),
    [holidays, todayKey],
  );
  const todayWorking = useMemo(() => isWorkingDay(todayKey, holidays), [todayKey, holidays]);

  const todayFormatted = useMemo(
    () => `${getWeekdayLabelVN(todayKey)}, ngày ${formatDateVN(todayKey)}`,
    [todayKey],
  );

  const offIdSet = useMemo(() => {
    const set = new Set<string>(dailyOffEmployeeIds);
    if (isManagerView) {
      for (const req of managerRequests) {
        if (req.status === 'Đã duyệt' && isDateInRange(todayKey, req.startDate, req.endDate)) {
          set.add(req.employeeId);
        }
      }
    }
    return set;
  }, [dailyOffEmployeeIds, isManagerView, managerRequests, todayKey]);

  const workingEmployees = useMemo(() => {
    if (!todayWorking) return [];
    return employees.filter((emp) => !offIdSet.has(emp.id));
  }, [employees, offIdSet, todayWorking]);

  const filteredWorking = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return workingEmployees.filter((emp) => {
      if (deptFilter !== 'ALL' && emp.department !== deptFilter) return false;
      if (keyword && !emp.name.toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [workingEmployees, searchTerm, deptFilter]);

  const offTodayCount = todayWorking
    ? employees.filter((emp) => offIdSet.has(emp.id)).length
    : 0;

  let dayStatusLabel = 'Ngày làm việc bình thường';
  if (!todayWorking) {
    dayStatusLabel = todayHoliday
      ? `Nghỉ công ty: ${todayHoliday.title}`
      : 'Cuối tuần (Thứ 7 / Chủ nhật)';
  } else if (todayHoliday?.category === 'Ngày làm việc bù') {
    dayStatusLabel = `OT: ${todayHoliday.title}`;
  }

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-teal-800">
              <CalendarCheck2 className="w-4 h-4" />
              <span>{todayFormatted}</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              {todayWorking
                ? `Hôm nay có ${workingEmployees.length} / ${employees.length} nhân sự đi làm`
                : 'Hôm nay công ty không có lịch làm việc'}
            </h2>
            <p className="text-xs text-slate-500">
              Trạng thái lịch: <strong className="text-slate-700">{dayStatusLabel}</strong>
              {todayWorking && offTodayCount > 0 && (
                <>
                  {' · '}
                  <span className="font-mono-num tabular-nums">
                    {offTodayCount} nhân sự nghỉ phép đã duyệt
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {todayWorking && workingEmployees.length > 0 && (
              <button
                type="button"
                onClick={() => setGlobalWobblePulse((p) => p + 1)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                Lắc đầu chào cả team
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        {todayWorking && employees.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm đồng nghiệp theo tên..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
              {(['ALL', 'Nhân sự', 'Quản lý'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setDeptFilter(opt)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    deptFilter === opt
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt === 'ALL' ? 'Tất cả phòng ban' : opt}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Working Grid */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Đang tải danh sách nhân sự hôm nay...
        </div>
      ) : !todayWorking ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-700">{dayStatusLabel}</p>
          <p className="text-xs text-slate-500">
            Danh sách đi làm tự động hiển thị vào các ngày làm việc từ Thứ 2 – Thứ 6 (hoặc ngày OT).
          </p>
        </div>
      ) : employees.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Chưa có dữ liệu nhân sự trong hệ thống.
        </div>
      ) : filteredWorking.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Không tìm thấy nhân sự nào đang làm việc khớp với bộ lọc hiện tại.
        </div>
      ) : (
        <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredWorking.map((emp, index) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => triggerCardPulse(emp.id)}
              onMouseEnter={() => triggerCardPulse(emp.id)}
              className="bg-white border border-slate-200 hover:border-teal-300 active:scale-[0.98] rounded-xl overflow-hidden flex flex-col items-center text-center transition-all group cursor-pointer"
            >
              <div className="w-full pt-4 pb-2 px-4 bg-gradient-to-b from-sky-50/80 via-slate-50/40 to-slate-100/70 border-b border-slate-100 flex flex-col items-center justify-end">
                <BobbleAvatar
                  presetId={getEmployeeAvatarId(emp)}
                  photoUrl={emp.avatarPhoto}
                  size="lg"
                  bobbleIndex={index}
                  wobblePulse={globalWobblePulse + (cardPulses[emp.id] || 0)}
                  interactive={false}
                />
              </div>
              <div className="p-3.5 w-full">
                <div className="text-sm font-semibold text-slate-900 truncate" title={emp.name}>
                  {emp.name}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{emp.department}</div>
                <div className="mt-2 text-[11px] font-medium text-emerald-700">
                  Đang làm việc
                </div>
              </div>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
