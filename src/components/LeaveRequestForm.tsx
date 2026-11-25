import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import type {
  CompanyHoliday,
  EmployeeStats,
  HalfDaySession,
  LeaveAllocation,
  LeaveType,
} from '../types/leave';
import { ALL_LEAVE_TYPES } from '../types/leave';
import { createManagerAllocatedLeaveRequest } from '../services/firestoreService';
import {
  applyHalfDayToWorkingDays,
  calculateWorkingDays,
  formatDateVN,
  getFirstWorkingDate,
  getHalfDayTimeLabel,
  getTodayKey,
} from '../utils/dateUtils';
import { VietnameseDatePicker } from './VietnameseDatePicker';

interface LeaveRequestFormProps {
  employeeStats: EmployeeStats[];
  holidays: CompanyHoliday[];
  currentUserUid: string;
  adminLabel: string;
  onSubmitted?: () => void;
  onNavigateDashboard?: () => void;
  onNavigateCalendar?: () => void;
}

const ALLOCATION_LABELS: Record<LeaveType, string> = {
  'Phép năm': 'Ngày nghỉ phép năm',
  'Nghỉ việc riêng': 'Ngày nghỉ việc riêng (cố định 5 ngày/năm)',
  'Nghỉ ốm': 'Ngày nghỉ ốm đau',
  'Thai sản': 'Nghỉ thai sản',
  'Nghỉ hưởng lương': 'Nghỉ hưởng lương (hiếu, hỉ,...)',
  'Nghỉ không lương': 'Nghỉ không lương',
};

const DISPLAY_LEAVE_ORDER: LeaveType[] = [
  'Phép năm',
  'Nghỉ việc riêng',
  'Nghỉ ốm',
  'Thai sản',
  'Nghỉ hưởng lương',
  'Nghỉ không lương',
];

function createEmptyAllocMap(): Record<LeaveType, number> {
  return {
    'Phép năm': 0,
    'Nghỉ việc riêng': 0,
    'Nghỉ ốm': 0,
    'Thai sản': 0,
    'Nghỉ hưởng lương': 0,
    'Nghỉ không lương': 0,
  };
}

export function LeaveRequestForm({
  employeeStats,
  holidays,
  currentUserUid,
  adminLabel,
  onSubmitted,
  onNavigateDashboard,
  onNavigateCalendar,
}: LeaveRequestFormProps) {
  const today = getTodayKey();
  const [employeeId, setEmployeeId] = useState<string>(employeeStats[0]?.id || '');
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [halfDayEnabled, setHalfDayEnabled] = useState(false);
  const [halfDaySession, setHalfDaySession] = useState<HalfDaySession>('Sáng');

  const [allocMap, setAllocMap] = useState<Record<LeaveType, number>>(() => ({
    ...createEmptyAllocMap(),
    'Phép năm': 1,
  }));
  const [hasManualSplit, setHasManualSplit] = useState(false);

  const [hasHospitalCert, setHasHospitalCert] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successInfo, setSuccessInfo] = useState<{
    employeeName: string;
    workingDays: number;
    allocText: string;
  } | null>(null);

  const selectedEmployee = useMemo(
    () => employeeStats.find((e) => e.id === employeeId) || employeeStats[0],
    [employeeStats, employeeId],
  );

  const fullWorkingDays = useMemo(
    () => calculateWorkingDays(startDate, endDate, holidays),
    [startDate, endDate, holidays],
  );
  const workingDays = applyHalfDayToWorkingDays(fullWorkingDays.workingDays, halfDayEnabled);
  const halfDayDate = useMemo(
    () => getFirstWorkingDate(startDate, endDate, holidays),
    [startDate, endDate, holidays],
  );
  const { weekendDaysExcluded, excludedHolidays, makeupWorkdays } = fullWorkingDays;

  useEffect(() => {
    if (hasManualSplit) return;
    setAllocMap((prev) => {
      const activeTypes = ALL_LEAVE_TYPES.filter((t) => (Number(prev[t]) || 0) > 0);
      const targetType: LeaveType = activeTypes.length === 1 ? activeTypes[0] : 'Phép năm';
      return {
        ...createEmptyAllocMap(),
        [targetType]: workingDays,
      };
    });
  }, [workingDays, hasManualSplit]);

  const totalAllocated = useMemo(
    () => ALL_LEAVE_TYPES.reduce((sum, t) => sum + (Number(allocMap[t]) || 0), 0),
    [allocMap],
  );

  const isSickAllocated = (Number(allocMap['Nghỉ ốm']) || 0) > 0;

  const annualExceeds =
    selectedEmployee?.annualLeaveRemaining !== null &&
    selectedEmployee?.annualLeaveRemaining !== undefined &&
    (Number(allocMap['Phép năm']) || 0) > selectedEmployee.annualLeaveRemaining;

  const personalExceeds =
    selectedEmployee?.personalLeaveRemaining !== null &&
    selectedEmployee?.personalLeaveRemaining !== undefined &&
    (Number(allocMap['Nghỉ việc riêng']) || 0) > selectedEmployee.personalLeaveRemaining;

  const toggleLeaveType = (type: LeaveType, checked: boolean) => {
    setHasManualSplit(true);
    setAllocMap((prev) => {
      if (!checked) {
        if (type === 'Nghỉ ốm') {
          setHasHospitalCert(false);
        }
        return { ...prev, [type]: 0 };
      }
      const otherTotal = ALL_LEAVE_TYPES.reduce(
        (sum, t) => (t === type ? sum : sum + (Number(prev[t]) || 0)),
        0,
      );
      const remainingToAllocate = Math.max(0, workingDays - otherTotal);
      return {
        ...prev,
        [type]: prev[type] > 0 ? prev[type] : remainingToAllocate || (workingDays > 0 ? 1 : 0),
      };
    });
  };

  const handleAutoAllocateByBalance = () => {
    if (!selectedEmployee || workingDays <= 0) return;
    let remainingNeed = workingDays;
    const next = createEmptyAllocMap();

    const annualAvail = Math.max(0, selectedEmployee.annualLeaveRemaining ?? 0);
    if (annualAvail > 0 && remainingNeed > 0) {
      const take = Math.min(annualAvail, remainingNeed);
      next['Phép năm'] = take;
      remainingNeed -= take;
    }

    const personalAvail = Math.max(0, selectedEmployee.personalLeaveRemaining ?? 0);
    if (personalAvail > 0 && remainingNeed > 0) {
      const take = Math.min(personalAvail, remainingNeed);
      next['Nghỉ việc riêng'] = take;
      remainingNeed -= take;
    }

    if (remainingNeed > 0) {
      next['Nghỉ không lương'] = remainingNeed;
    }

    setHasManualSplit(true);
    setHasHospitalCert(false);
    setAllocMap(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessInfo(null);

    if (!selectedEmployee) {
      setErrorMsg('Chưa có danh sách nhân viên. Vui lòng thêm nhân sự trước.');
      return;
    }

    if (!startDate || !endDate || endDate < startDate) {
      setErrorMsg('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.');
      return;
    }

    if (workingDays <= 0) {
      setErrorMsg(
        'Khoảng thời gian đã chọn không có ngày làm việc nào (trùng cuối tuần hoặc ngày lễ).',
      );
      return;
    }

    if (Math.abs(totalAllocated - workingDays) > 0.001) {
      setErrorMsg(
        `Tổng số ngày phân bổ (${totalAllocated}) phải bằng đúng số ngày làm việc (${workingDays} ngày).`,
      );
      return;
    }

    if (reason.trim().length < 2) {
      setErrorMsg('Vui lòng nhập lý do nghỉ phép (tối thiểu 2 ký tự).');
      return;
    }

    const activeAllocations: LeaveAllocation[] = DISPLAY_LEAVE_ORDER.filter(
      (t) => (Number(allocMap[t]) || 0) > 0,
    ).map((t) => ({ type: t, days: Number(allocMap[t]) }));

    setSubmitting(true);
    try {
      await createManagerAllocatedLeaveRequest({
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        department: selectedEmployee.department,
        startDate,
        endDate,
        workingDays,
        halfDay:
          halfDayEnabled && halfDayDate
            ? { date: halfDayDate, session: halfDaySession }
            : undefined,
        reason: reason.trim(),
        note: note.trim(),
        allocations: activeAllocations,
        hasHospitalCert: isSickAllocated ? hasHospitalCert : false,
        hospitalCertPending: false,
        attachmentName: '',
        status: 'Đã duyệt',
        managerUid: currentUserUid,
        managerLabel: adminLabel,
      });

      const allocText = activeAllocations.map((a) => `${a.type}: ${a.days} ngày`).join(', ');

      setSuccessInfo({
        employeeName: selectedEmployee.name,
        workingDays,
        allocText,
      });

      setReason('');
      setNote('');
      setHasHospitalCert(false);
      setHasManualSplit(false);
      setHalfDayEnabled(false);
      setHalfDaySession('Sáng');
      setAllocMap({
        ...createEmptyAllocMap(),
        'Phép năm': workingDays,
      });
      onSubmitted?.();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể lưu đăng ký nghỉ phép. Vui lòng thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl bg-white border border-slate-200 rounded-xl">
      <div className="px-6 py-5 border-b border-slate-200 rounded-t-xl bg-white">
        <h2 className="text-base font-semibold text-slate-900">
          Quản lý đăng ký &amp; phân bổ ngày nghỉ cho nhân viên
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Quản lý trực tiếp chọn nhân viên, khoảng ngày nghỉ và phân bổ quỹ phép; số ngày phép sẽ được cập nhật ngay vào thống kê và lịch nghỉ.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successInfo && (
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 space-y-2.5">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                Đã đăng ký &amp; phân bổ nghỉ phép ({successInfo.workingDays} ngày) cho{' '}
                {successInfo.employeeName}.
              </span>
            </div>
            <div className="text-xs text-emerald-800">
              Phân bổ: <strong>{successInfo.allocText}</strong>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {onNavigateDashboard && (
                <button
                  type="button"
                  onClick={onNavigateDashboard}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap"
                >
                  Xem Bảng thống kê
                </button>
              )}
              {onNavigateCalendar && (
                <button
                  type="button"
                  onClick={onNavigateCalendar}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-100/60 rounded-md transition-colors whitespace-nowrap"
                >
                  Xem Lịch nghỉ tháng
                </button>
              )}
            </div>
          </div>
        )}

        {/* Nhân viên & Quỹ phép còn lại */}
        <div className="space-y-2">
          <label htmlFor="req-employee" className="block text-xs font-medium text-slate-700">
            Nhân viên được đăng ký nghỉ
          </label>
          <select
            id="req-employee"
            value={selectedEmployee?.id || ''}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
            className="w-full max-w-md px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          >
            {employeeStats.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.department})
              </option>
            ))}
          </select>

          {selectedEmployee && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600 font-mono-num tabular-nums">
              <span>
                Phép năm còn:{' '}
                <strong className="text-slate-900">
                  {selectedEmployee.annualLeaveRemaining ?? '—'}
                </strong>
                /{selectedEmployee.annualLeaveInitial ?? '—'} ngày
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span>
                Việc riêng còn:{' '}
                <strong className="text-slate-900">
                  {selectedEmployee.personalLeaveRemaining ?? '—'}
                </strong>
                /{selectedEmployee.personalLeaveInitial ?? '—'} ngày
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span>
                Nghỉ ốm năm nay:{' '}
                <strong className="text-slate-900">{selectedEmployee.sickLeaveDays}</strong> ngày
              </span>
            </div>
          )}
        </div>

        {/* Khoảng ngày nghỉ */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
            <VietnameseDatePicker
              id="req-start"
              label="Từ ngày"
              value={startDate}
              holidays={holidays}
              rangeStart={startDate}
              rangeEnd={endDate}
              onChange={(next) => {
                setStartDate(next);
                if (next > endDate) setEndDate(next);
              }}
            />

            <VietnameseDatePicker
              id="req-end"
              label="Đến hết ngày"
              value={endDate}
              min={startDate}
              holidays={holidays}
              rangeStart={startDate}
              rangeEnd={endDate}
              alignRightOnSm
              onChange={setEndDate}
            />

            <div className="px-3.5 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-600 flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 text-teal-700" />
                Số ngày làm việc
              </span>
              <span className="text-sm font-semibold text-slate-900 font-mono-num tabular-nums">
                {workingDays} ngày
              </span>
            </div>
          </div>

          {(weekendDaysExcluded > 0 ||
            excludedHolidays.length > 0 ||
            makeupWorkdays.length > 0 ||
            workingDays === 0) && (
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 space-y-1">
              {weekendDaysExcluded > 0 && (
                <div>
                  Không tính Thứ 7, Chủ nhật: đã tự động loại trừ{' '}
                  <strong className="font-mono-num">{weekendDaysExcluded}</strong> ngày cuối tuần.
                </div>
              )}
              {excludedHolidays.length > 0 && (
                <div>
                  Đã tự động loại trừ ngày nghỉ công ty:{' '}
                  {excludedHolidays.map((h) => `${formatDateVN(h.date)} (${h.title})`).join(', ')}
                </div>
              )}
              {makeupWorkdays.length > 0 && (
                <div className="text-indigo-700 font-medium">
                  Đã tính cộng ngày OT:{' '}
                  {makeupWorkdays.map((h) => `${formatDateVN(h.date)} (${h.title})`).join(', ')}
                </div>
              )}
              {workingDays === 0 && (
                <div className="text-amber-700 font-medium">
                  Khoảng ngày này rơi vào Thứ 7 / Chủ nhật hoặc ngày nghỉ công ty (không phải ngày OT), nên số ngày làm việc = 0.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-200 space-y-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={halfDayEnabled}
              disabled={fullWorkingDays.workingDays < 1}
              onChange={(e) => setHalfDayEnabled(e.target.checked)}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            Chỉ nghỉ nửa ngày (áp dụng cho ngày làm việc đầu tiên)
          </label>

          {halfDayEnabled && (
            <div className="space-y-2">
              {halfDayDate ? (
                <>
                  <p className="text-[11px] text-slate-600">
                    Ngày {formatDateVN(halfDayDate)} chỉ nghỉ nửa buổi · tổng nghỉ{' '}
                    <strong className="font-mono-num">{workingDays} ngày</strong>.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['Sáng', 'Chiều'] as const).map((session) => (
                      <button
                        key={session}
                        type="button"
                        onClick={() => setHalfDaySession(session)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          halfDaySession === session
                            ? 'bg-amber-700 text-white border-amber-700'
                            : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        {getHalfDayTimeLabel(session)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Giờ làm việc: 08:15–12:15 và 13:30–17:30 (nghỉ trưa 12:15–13:30).
                    Điểm danh sẽ ghi nhận nhân sự làm việc buổi còn lại.
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-amber-700">
                  Khoảng ngày này không có ngày làm việc để nghỉ nửa ngày.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Phân bổ ngày nghỉ trực tiếp */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-800">
                Phân bổ ngày nghỉ (tổng phải bằng {workingDays} ngày)
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Quản lý có thể chọn 1 loại hoặc chia nhiều loại phép cho cùng một kỳ nghỉ.
              </div>
            </div>

            <div className="flex items-center gap-3">
              {selectedEmployee && workingDays > 0 && (
                <button
                  type="button"
                  onClick={handleAutoAllocateByBalance}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Tự chia theo phép còn lại
                </button>
              )}

              <span
                className={`text-xs font-semibold font-mono-num tabular-nums whitespace-nowrap ${
                  Math.abs(totalAllocated - workingDays) <= 0.001
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                Đã phân bổ: {totalAllocated} / {workingDays} ngày
              </span>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
            {DISPLAY_LEAVE_ORDER.map((type) => {
              const val = Number(allocMap[type]) || 0;
              const checked = val > 0;
              return (
                <div
                  key={type}
                  className={`px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                    checked ? 'bg-teal-50/35' : ''
                  }`}
                >
                  <label className="flex items-center gap-2.5 text-xs text-slate-800 cursor-pointer select-none min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleLeaveType(type, e.target.checked)}
                      className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    <span className="truncate font-medium">{ALLOCATION_LABELS[type]}</span>
                  </label>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={365}
                      step={0.5}
                      value={val}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        const nextVal = Number.isNaN(raw) ? 0 : Math.max(0, raw);
                        setHasManualSplit(true);
                        setAllocMap((prev) => ({
                          ...prev,
                          [type]: nextVal,
                        }));
                        if (type === 'Nghỉ ốm' && nextVal === 0) {
                          setHasHospitalCert(false);
                        }
                      }}
                      className="w-20 px-2.5 py-1 text-xs text-right border border-slate-200 rounded-md bg-white font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    />
                    <span className="text-xs text-slate-500">ngày</span>
                  </div>
                </div>
              );
            })}
          </div>

          {(annualExceeds || personalExceeds) && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <div className="space-y-0.5">
                {annualExceeds && (
                  <div>
                    Lưu ý: Số ngày <strong>Phép năm</strong> phân bổ ({allocMap['Phép năm']}) đang vượt quá quỹ còn lại (
                    {selectedEmployee?.annualLeaveRemaining} ngày).
                  </div>
                )}
                {personalExceeds && (
                  <div>
                    Lưu ý: Số ngày <strong>Nghỉ việc riêng</strong> phân bổ ({allocMap['Nghỉ việc riêng']}) đang vượt quá quỹ còn lại (
                    {selectedEmployee?.personalLeaveRemaining} ngày).
                  </div>
                )}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {isSickAllocated && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
              >
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasHospitalCert}
                    onChange={(e) => setHasHospitalCert(e.target.checked)}
                    className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  Có giấy xác nhận
                </label>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Lý do & ghi chú */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="req-reason" className="block text-xs font-medium text-slate-700 mb-1.5">
              Lý do nghỉ phép
            </label>
            <textarea
              id="req-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              required
              placeholder="Ví dụ: Nghỉ phép năm về quê / Việc gia đình / Khám bệnh..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>

          <div>
            <label htmlFor="req-note" className="block text-xs font-medium text-slate-700 mb-1.5">
              Ghi chú bàn giao công việc (tùy chọn)
            </label>
            <textarea
              id="req-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Ví dụ: Đã bàn giao công việc cho đồng nghiệp phụ trách..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>
        </div>

        {/* Thao tác lưu */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={submitting || employeeStats.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <CheckCircle2 className="w-4 h-4" />
            {submitting ? 'Đang ghi nhận...' : 'Đăng ký & phân bổ ngày nghỉ'}
          </button>
        </div>
      </form>
    </div>
  );
}
