import { useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Info,
  Send,
  Stethoscope,
} from 'lucide-react';
import type {
  CompanyHoliday,
  Employee,
  HalfDaySession,
} from '../types/leave';
import { submitEmployeeLeaveRequest } from '../services/firestoreService';
import {
  applyHalfDayToWorkingDays,
  calculateWorkingDays,
  formatDateVN,
  getFirstWorkingDate,
  getHalfDayTimeLabel,
  getTodayKey,
} from '../utils/dateUtils';
import { validateGoogleDriveUrl } from '../utils/urlUtils';
import { VietnameseDatePicker } from './VietnameseDatePicker';

interface EmployeeLeaveRequestFormProps {
  employees: Employee[];
  holidays: CompanyHoliday[];
}

export function EmployeeLeaveRequestForm({
  employees,
  holidays,
}: EmployeeLeaveRequestFormProps) {
  const today = getTodayKey();
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [halfDayEnabled, setHalfDayEnabled] = useState(false);
  const [halfDaySession, setHalfDaySession] = useState<HalfDaySession>('Sáng');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [hasHospitalCert, setHasHospitalCert] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState<{
    requestId: string;
    employeeName: string;
    startDate: string;
    endDate: string;
    workingDays: number;
  } | null>(null);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId) || null,
    [employees, employeeId],
  );

  const fullWorkingDays = useMemo(
    () => calculateWorkingDays(startDate, endDate, holidays),
    [startDate, endDate, holidays],
  );
  const workingDays = applyHalfDayToWorkingDays(
    fullWorkingDays.workingDays,
    halfDayEnabled,
  );
  const halfDayDate = useMemo(
    () => getFirstWorkingDate(startDate, endDate, holidays),
    [startDate, endDate, holidays],
  );
  const { weekendDaysExcluded, excludedHolidays, makeupWorkdays } = fullWorkingDays;

  const resetForm = () => {
    setReason('');
    setNote('');
    setHasHospitalCert(false);
    setAttachmentUrl('');
    setStartDate(today);
    setEndDate(today);
    setHalfDayEnabled(false);
    setHalfDaySession('Sáng');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccess(null);

    if (!selectedEmployee) {
      setErrorMsg('Vui lòng chọn họ tên của bạn trong danh sách nhân sự.');
      return;
    }

    if (!startDate || !endDate || endDate < startDate) {
      setErrorMsg('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.');
      return;
    }

    if (workingDays <= 0) {
      setErrorMsg(
        'Khoảng thời gian đã chọn không có ngày làm việc nào (trùng cuối tuần hoặc ngày nghỉ công ty).',
      );
      return;
    }

    if (reason.trim().length < 2) {
      setErrorMsg('Vui lòng nhập lý do nghỉ phép (tối thiểu 2 ký tự).');
      return;
    }

    let cleanAttachmentUrl = '';
    if (attachmentUrl.trim()) {
      const check = validateGoogleDriveUrl(attachmentUrl);
      if (!check.valid) {
        setErrorMsg(check.error || 'Đường dẫn Google Drive không hợp lệ.');
        return;
      }
      cleanAttachmentUrl = check.url;
    }

    setSubmitting(true);
    try {
      const result = await submitEmployeeLeaveRequest({
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
        hasHospitalCert,
        attachmentUrl: cleanAttachmentUrl,
      });

      setSuccess({
        requestId: result.requestId,
        employeeName: selectedEmployee.name,
        startDate,
        endDate,
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
          <p className="font-semibold">Nhân viên gửi đơn không cần đăng nhập</p>
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
            Chọn đúng họ tên và khoảng ngày nghỉ. Quản lý sẽ chốt loại phép và phân
            bổ ngày khi duyệt đơn.
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
                    {formatDateVN(success.startDate)} →{' '}
                    {formatDateVN(success.endDate)} ({success.workingDays} ngày làm việc)
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
              <div className="text-xs font-medium text-slate-600">
                Phòng ban
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">
                {selectedEmployee?.department || '—'}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Hệ thống không thu thập email hay thông tin liên hệ cá nhân.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
              <VietnameseDatePicker
                id="emp-start"
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
                id="emp-end"
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
                    Đã tự động loại trừ{' '}
                    <strong className="font-mono-num">{weekendDaysExcluded}</strong>{' '}
                    ngày cuối tuần (Thứ 7, Chủ nhật).
                  </div>
                )}
                {excludedHolidays.length > 0 && (
                  <div>
                    Đã tự động loại trừ ngày nghỉ công ty:{' '}
                    {excludedHolidays
                      .map((h) => `${formatDateVN(h.date)} (${h.title})`)
                      .join(', ')}
                  </div>
                )}
                {makeupWorkdays.length > 0 && (
                  <div className="text-indigo-700 font-medium">
                    Đã tính cộng ngày OT:{' '}
                    {makeupWorkdays
                      .map((h) => `${formatDateVN(h.date)} (${h.title})`)
                      .join(', ')}
                  </div>
                )}
                {workingDays === 0 && (
                  <div className="text-amber-700 font-medium">
                    Khoảng ngày này không có ngày làm việc nào. Vui lòng chọn lại.
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
              <Clock3 className="w-4 h-4 text-amber-700" />
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
                      Điểm danh sẽ ghi nhận bạn làm việc buổi còn lại.
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

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Stethoscope className="w-4 h-4 text-teal-700" />
              Giấy xác nhận nghỉ ốm (tuỳ chọn)
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Chỉ điền khi bạn nghỉ ốm và đã có giấy xác nhận của bệnh viện / cơ sở
              y tế. Quản lý sẽ phân bổ loại phép khi duyệt đơn.
            </p>
            <label className="inline-flex items-center gap-2 text-xs text-slate-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasHospitalCert}
                onChange={(e) => setHasHospitalCert(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              Tôi đã có giấy xác nhận của bệnh viện / cơ sở y tế
            </label>
            <div>
              <label
                htmlFor="emp-cert-url"
                className="block text-xs text-slate-600 mb-1"
              >
                Liên kết Google Drive của giấy xác nhận (tuỳ chọn)
              </label>
              <input
                id="emp-cert-url"
                type="url"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                maxLength={500}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Hệ thống chỉ lưu liên kết, không tải tệp lên Firebase. Hãy bật
                quyền chia sẻ để quản lý mở được.
              </p>
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
            Khi gửi đơn, hệ thống lưu họ tên, phòng ban, khoảng ngày nghỉ, lý do,
            ghi chú và liên kết giấy xác nhận (nếu có) trong Firestore nội bộ của
            công ty để quản lý duyệt đơn. Không thu thập email, không gửi email
            thông báo và không có dữ liệu nào được gửi tới dịch vụ quảng cáo hay
            theo dõi người dùng.
          </p>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
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
