import { useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Info,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { CompanyHoliday, Employee, HalfDaySession } from '../types/leave';
import { submitEmployeeLeaveRequest } from '../services/firestoreService';
import {
  formatDateVN,
  getHalfDayTimeLabel,
  getWeekdayLabelVN,
  isWorkingDay,
  resolveSelectedLeaveDays,
} from '../utils/dateUtils';
import { VietnameseDatePicker } from './VietnameseDatePicker';

interface EmployeeLeaveRequestFormProps {
  employees: Employee[];
  holidays: CompanyHoliday[];
}

type PickedSession = 'Cả ngày' | HalfDaySession;
interface PickedDay {
  date: string;
  session: PickedSession;
}

const SESSION_OPTIONS: Array<{ value: PickedSession; label: string }> = [
  { value: 'Cả ngày', label: 'Cả ngày' },
  { value: 'Sáng', label: getHalfDayTimeLabel('Sáng') },
  { value: 'Chiều', label: getHalfDayTimeLabel('Chiều') },
];

export function EmployeeLeaveRequestForm({
  employees,
  holidays,
}: EmployeeLeaveRequestFormProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [pickedDays, setPickedDays] = useState<PickedDay[]>([]);
  const [pickerError, setPickerError] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState<{
    requestId: string;
    employeeName: string;
    dates: string[];
    workingDays: number;
  } | null>(null);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId) || null,
    [employees, employeeId],
  );

  const halfSessionByDate = useMemo(() => {
    const map: Record<string, HalfDaySession> = {};
    for (const day of pickedDays) {
      if (day.session !== 'Cả ngày') map[day.date] = day.session;
    }
    return map;
  }, [pickedDays]);

  const resolvedDays = useMemo(
    () =>
      resolveSelectedLeaveDays(
        pickedDays.map((day) => day.date),
        holidays,
        halfSessionByDate,
      ),
    [pickedDays, holidays, halfSessionByDate],
  );
  const workingDays = resolvedDays.reduce((sum, day) => sum + day.days, 0);
  const dates = resolvedDays.map((day) => day.date);
  const startDate = dates[0] || '';
  const endDate = dates[dates.length - 1] || '';
  const halfDays = resolvedDays
    .filter((day) => day.session)
    .map((day) => ({ date: day.date, session: day.session as HalfDaySession }));
  const skippedDates = pickedDays
    .map((day) => day.date)
    .filter((date) => !isWorkingDay(date, holidays));

  const addDate = () => {
    setPickerError('');
    const target = draftDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
      setPickerError('Nhập ngày hợp lệ theo định dạng dd/mm/yyyy hoặc yyyy-mm-dd.');
      return;
    }
    if (!isWorkingDay(target, holidays)) {
      setPickerError('Ngày này là cuối tuần / ngày nghỉ công ty. Vui lòng chọn ngày làm việc.');
      return;
    }
    if (pickedDays.some((day) => day.date === target)) {
      setPickerError('Ngày này đã có trong danh sách nghỉ.');
      return;
    }
    if (pickedDays.length >= 31) {
      setPickerError('Một đơn chỉ có thể chọn tối đa 31 ngày.');
      return;
    }
    setPickedDays((prev) =>
      [...prev, { date: target, session: 'Cả ngày' as PickedSession }].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    );
    setDraftDate('');
  };

  const removeDate = (date: string) => {
    setPickerError('');
    setPickedDays((prev) => prev.filter((day) => day.date !== date));
  };

  const setDaySession = (date: string, session: PickedSession) => {
    setPickerError('');
    setPickedDays((prev) =>
      prev.map((day) => (day.date === date ? { ...day, session } : day)),
    );
  };

  const resetForm = () => {
    setReason('');
    setNote('');
    setDraftDate('');
    setPickedDays([]);
    setPickerError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccess(null);

    if (!selectedEmployee) {
      setErrorMsg('Vui lòng chọn họ tên của bạn trong danh sách nhân sự.');
      return;
    }
    if (dates.length === 0 || workingDays <= 0) {
      setErrorMsg('Vui lòng chọn ít nhất một ngày làm việc để nghỉ.');
      return;
    }
    if (reason.trim().length < 2) {
      setErrorMsg('Vui lòng nhập lý do nghỉ phép (tối thiểu 2 ký tự).');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitEmployeeLeaveRequest({
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        department: selectedEmployee.department,
        startDate,
        endDate,
        dates,
        workingDays,
        halfDays,
        reason: reason.trim(),
        note: note.trim(),
        hasHospitalCert: false,
      });

      setSuccess({
        requestId: result.requestId,
        employeeName: selectedEmployee.name,
        dates,
        workingDays,
      });

      resetForm();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể gửi đơn nghỉ phép. Vui lòng thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900 flex items-start gap-2.5">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-700" />
        <div className="space-y-1 leading-relaxed">
          <p className="font-semibold">Gửi đơn nghỉ phép</p>
          <p>
            Đơn sẽ được gửi tới quản lý để duyệt. Hệ thống <strong>không gửi email</strong>{' '}
            thông báo và <strong>không thu thập email</strong> của bạn. Khi đơn được
            duyệt, lịch nghỉ sẽ xuất hiện ở mục <strong>Lịch nghỉ tháng</strong> và
            danh sách <strong>Hôm nay ai đi làm</strong>.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="px-6 py-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Send className="w-4 h-4 text-teal-700" />
            Đăng ký nghỉ phép
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Chọn từng ngày nghỉ (không nhất thiết liên tiếp). Với mỗi ngày bạn có thể
            chọn nghỉ cả ngày hoặc nửa buổi; quản lý sẽ chốt loại phép khi duyệt.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <AnimatePresence initial={false}>
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 space-y-2.5"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Đã nộp đơn nghỉ phép thành công</span>
                </div>
                <div className="text-xs text-emerald-800 leading-relaxed">
                  <div>
                    <strong>{success.employeeName}</strong> ·{' '}
                    {success.dates.map((date) => formatDateVN(date)).join(', ')} (
                    {success.workingDays} ngày làm việc)
                  </div>
                  <div className="mt-1">
                    Mã đơn: <span className="font-mono-num">{success.requestId}</span>
                  </div>
                  <div className="mt-1">
                    Quản lý sẽ duyệt đơn trong ứng dụng. Khi được duyệt, lịch nghỉ
                    xuất hiện ở mục <strong>Lịch nghỉ tháng</strong>.
                  </div>
                </div>
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSuccess(null)}
                    className="px-3 py-1.5 text-xs font-medium text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-100/60 rounded-md transition-colors whitespace-nowrap"
                  >
                    Gửi đơn khác
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="emp-name"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Họ tên của bạn
              </label>
              <select
                id="emp-name"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              >
                <option value="">— Chọn họ tên —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.department})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                {employees.length === 0
                  ? 'Chưa có danh sách nhân sự. Vui lòng liên hệ quản lý để thêm bạn vào hệ thống.'
                  : 'Chưa có tên bạn? Liên hệ quản lý để bổ sung nhân sự trước khi gửi đơn.'}
              </p>
            </div>

            <div className="px-3.5 py-2 rounded-lg bg-slate-50 border border-slate-200 self-start">
              <div className="text-xs font-medium text-slate-600">Phòng ban</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">
                {selectedEmployee?.department || '—'}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Hệ thống không thu thập email hay thông tin liên hệ cá nhân.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
              <VietnameseDatePicker
                id="emp-pick-date"
                label="Chọn hoặc nhập ngày nghỉ"
                value={draftDate}
                holidays={holidays}
                onChange={setDraftDate}
              />

              <button
                type="button"
                onClick={addDate}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm ngày
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              Gõ trực tiếp <strong>dd/mm/yyyy</strong> hoặc <strong>yyyy-mm-dd</strong>,
              hoặc bấm biểu tượng lịch để chọn.
            </p>

            {pickerError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {pickerError}
              </p>
            )}

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-teal-700" />
                  Các ngày nghỉ đã chọn ({pickedDays.length})
                </div>
                <div className="text-xs font-semibold text-slate-900 font-mono-num tabular-nums">
                  Tổng: {workingDays} ngày làm việc
                </div>
              </div>

              {pickedDays.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">
                  Chưa có ngày nào. Chọn ngày ở trên rồi bấm "Thêm ngày".
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pickedDays.map((day) => {
                    const skipped = !isWorkingDay(day.date, holidays);
                    return (
                      <div
                        key={day.date}
                        className="px-3.5 py-2.5 flex flex-wrap items-center gap-2 justify-between"
                      >
                        <div className="min-w-0">
                          <div
                            className={`text-sm font-medium ${
                              skipped ? 'text-red-700 line-through' : 'text-slate-900'
                            }`}
                          >
                            {formatDateVN(day.date)}{' '}
                            <span className="text-xs font-normal text-slate-500">
                              ({getWeekdayLabelVN(day.date)})
                            </span>
                          </div>
                          {skipped && (
                            <div className="text-[11px] text-red-700">
                              Cuối tuần / ngày nghỉ công ty — sẽ không được tính.
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <select
                            aria-label={`Buổi nghỉ ngày ${formatDateVN(day.date)}`}
                            value={day.session}
                            onChange={(e) =>
                              setDaySession(day.date, e.target.value as PickedSession)
                            }
                            className="px-2 py-1 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                          >
                            {SESSION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeDate(day.date)}
                            aria-label={`Bỏ ngày ${formatDateVN(day.date)}`}
                            className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed flex items-start gap-2">
              <Clock3 className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <div>
                Giờ làm việc: <strong>08:15–12:15</strong> (sáng), nghỉ trưa{' '}
                <strong>12:15–13:30</strong>, <strong>13:30–17:30</strong> (chiều). Chọn
                "Sáng"/"Chiều" để đăng ký nửa ngày; điểm danh sẽ ghi nhận bạn làm việc
                buổi còn lại. Có thể chọn nhiều ngày rời rạc trong cùng một đơn.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="emp-reason"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Lý do nghỉ phép
              </label>
              <textarea
                id="emp-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                required
                placeholder="Ví dụ: Về quê giải quyết việc gia đình / Khám bệnh..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>

            <div>
              <label
                htmlFor="emp-note"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Ghi chú bàn giao công việc (tuỳ chọn)
              </label>
              <textarea
                id="emp-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="Ví dụ: Đã bàn giao việc cho đồng nghiệp..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Khi gửi đơn, hệ thống lưu họ tên, phòng ban, các ngày nghỉ (có thể rời rạc),
            số ngày, buổi nghỉ nửa ngày, lý do và ghi chú trong Firestore nội bộ của
            công ty để quản lý duyệt đơn. Không thu thập email, không gửi email thông
            báo và không có dữ liệu nào được gửi tới dịch vụ quảng cáo hay theo dõi
            người dùng.
          </p>

          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            {pickedDays.length > 1 && (
              <button
                type="button"
                onClick={() => setPickedDays([])}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Xoá tất cả ngày
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || employees.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Đang gửi đơn...' : 'Gửi đơn nghỉ phép'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
