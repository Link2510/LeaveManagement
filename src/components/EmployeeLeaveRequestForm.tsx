
import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  FilePlus2,
  Search,
  UserRound,
} from 'lucide-react';

import type { CompanyHoliday, Employee } from '../types/leave';
import { createEmployeeLeaveRequest } from '../services/firestoreService';
import {
  calculateWorkingDays,
  formatDateVN,
  getTodayKey,
} from '../utils/dateUtils';
import { VietnameseDatePicker } from './VietnameseDatePicker';

interface EmployeeLeaveRequestFormProps {
  employees: Employee[];
  holidays: CompanyHoliday[];
  isManagerSession: boolean;
}

function normalizeVietnamese(value: string): string {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

export function EmployeeLeaveRequestForm({
  employees,
  holidays,
  isManagerSession,
}: EmployeeLeaveRequestFormProps) {
  const today = getTodayKey();

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [email, setEmail] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [hasHospitalCert, setHasHospitalCert] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const suggestions = useMemo(() => {
    const keyword = normalizeVietnamese(employeeSearch);

    if (!keyword || selectedEmployee) return [];

    return employees
      .filter((employee) =>
        normalizeVietnamese(employee.name).includes(keyword),
      )
      .slice(0, 10);
  }, [employeeSearch, employees, selectedEmployee]);

  const {
    workingDays,
    weekendDaysExcluded,
    excludedHolidays,
    makeupWorkdays,
  } = useMemo(
    () => calculateWorkingDays(startDate, endDate, holidays),
    [startDate, endDate, holidays],
  );

  const selectEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setEmployeeSearch(employee.name);
    setError('');
  };

  const handleEmployeeSearch = (value: string) => {
    setEmployeeSearch(value);
    setSelectedEmployee(null);
    setError('');
    setSuccess(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess(false);

    if (isManagerSession) {
      setError(
        'Bạn đang đăng nhập tài khoản Quản lý. Vui lòng đăng xuất trước khi gửi đơn theo tư cách nhân viên.',
      );
      return;
    }

    if (!selectedEmployee) {
      setError('Vui lòng chọn nhân viên từ danh sách gợi ý.');
      return;
    }

    if (!email.trim()) {
      setError('Vui lòng nhập email liên hệ.');
      return;
    }

    if (!startDate || !endDate || endDate < startDate) {
      setError('Khoảng thời gian nghỉ phép không hợp lệ.');
      return;
    }

    if (workingDays <= 0) {
      setError('Khoảng thời gian đã chọn không có ngày làm việc hợp lệ.');
      return;
    }

    if (reason.trim().length < 2) {
      setError('Vui lòng nhập lý do nghỉ phép.');
      return;
    }

    setSubmitting(true);

    try {
      await createEmployeeLeaveRequest({
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        department: selectedEmployee.department,
        email: email.trim(),
        startDate,
        endDate,
        workingDays,
        reason: reason.trim(),
        note: note.trim(),
        hasHospitalCert,
        attachmentName: '',
      });

      setSuccess(true);
      setEmployeeSearch('');
      setSelectedEmployee(null);
      setEmail('');
      setStartDate(today);
      setEndDate(today);
      setReason('');
      setNote('');
      setHasHospitalCert(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Không thể gửi đơn nghỉ phép. Vui lòng thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-teal-800 mb-2">
          <FilePlus2 className="w-5 h-5" />
          <span className="text-sm font-semibold">Cổng đăng ký nghỉ phép</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          Gửi yêu cầu nghỉ phép
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Điền thông tin bên dưới. Yêu cầu sẽ được chuyển đến Quản lý để xem xét.
        </p>
      </div>

      {isManagerSession && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Đang đăng nhập tài khoản Quản lý</p>
            <p className="mt-1">
              Bạn có thể xem trước biểu mẫu nhưng cần đăng xuất tài khoản Quản lý
              trước khi gửi đơn theo tư cách nhân viên.
            </p>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-7 space-y-6"
      >
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <UserRound className="w-4 h-4 text-teal-700" />
            Thông tin nhân viên
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Họ và tên nhân viên <span className="text-red-500">*</span>
            </label>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={employeeSearch}
                onChange={(event) => handleEmployeeSearch(event.target.value)}
                placeholder="Nhập họ tên để tìm nhân viên..."
                autoComplete="off"
                required
                className="w-full pl-10 pr-3 py-3 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />

              {suggestions.length > 0 && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                  {suggestions.map((employee) => (
                    <button
                      key={employee.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectEmployee(employee)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-teal-50 border-b border-slate-100 last:border-0"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800">
                          {employee.name}
                        </span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {employee.department} · {employee.id}
                        </span>
                      </span>
                      <span className="text-xs text-teal-700 shrink-0">
                        Chọn
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {employeeSearch.trim() &&
              !selectedEmployee &&
              suggestions.length === 0 && (
                <p className="text-xs text-amber-700">
                  Không tìm thấy nhân viên phù hợp. Vui lòng kiểm tra lại họ tên.
                </p>
              )}

            {selectedEmployee && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-teal-50 border border-teal-200">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-teal-900">
                    {selectedEmployee.name}
                  </p>
                  <p className="text-xs text-teal-700 mt-0.5">
                    {selectedEmployee.department} · Mã nhân viên:{' '}
                    {selectedEmployee.id}
                  </p>
                </div>
                <CheckCircle2 className="w-5 h-5 text-teal-700 shrink-0" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Email liên hệ <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="example@email.com"
              autoComplete="email"
              maxLength={160}
              required
              className="w-full px-3 py-3 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
            <p className="text-xs text-slate-500">
              Email này được dùng để tra cứu tình trạng đơn nghỉ phép của bạn.
            </p>
          </div>
        </section>

        <div className="border-t border-slate-100" />

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <CalendarDays className="w-4 h-4 text-teal-700" />
            Thời gian nghỉ phép
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <VietnameseDatePicker
              id="employee-req-start"
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
              id="employee-req-end"
              label="Đến hết ngày"
              value={endDate}
              min={startDate}
              holidays={holidays}
              rangeStart={startDate}
              rangeEnd={endDate}
              alignRightOnSm
              onChange={setEndDate}
            />
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">Số ngày làm việc</span>
              <span className="text-lg font-bold text-teal-800 tabular-nums">
                {workingDays} ngày
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {formatDateVN(startDate)} – {formatDateVN(endDate)}
            </p>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>Cuối tuần không tính: {weekendDaysExcluded} ngày</span>
              <span>Ngày lễ/nghỉ: {excludedHolidays.length} ngày</span>
              <span>Ngày làm bù: {makeupWorkdays.length} ngày</span>
            </div>

            {workingDays === 0 && (
              <p className="text-xs text-amber-700">
                Khoảng thời gian này không có ngày làm việc được tính phép.
              </p>
            )}
          </div>
        </section>

        <div className="border-t border-slate-100" />

        <section className="space-y-4">
          <div className="text-sm font-semibold text-slate-800">
            Nội dung yêu cầu
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Lý do nghỉ phép <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Nhập lý do xin nghỉ..."
              rows={3}
              maxLength={500}
              required
              className="w-full px-3 py-3 text-sm border border-slate-300 rounded-xl outline-none resize-y focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
            <p className="text-right text-xs text-slate-400">
              {reason.length}/500
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Ghi chú thêm
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Thông tin bàn giao công việc hoặc ghi chú khác (nếu có)..."
              rows={2}
              maxLength={500}
              className="w-full px-3 py-3 text-sm border border-slate-300 rounded-xl outline-none resize-y focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={hasHospitalCert}
              onChange={(event) => setHasHospitalCert(event.target.checked)}
              className="mt-0.5 w-4 h-4 accent-teal-700"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700">
                Có giấy xác nhận của bệnh viện
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Đánh dấu nếu yêu cầu nghỉ có giấy tờ y tế liên quan.
              </span>
            </span>
          </label>
        </section>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800"
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Gửi đơn thành công!</p>
                <p className="mt-0.5">
                  Yêu cầu đã được chuyển đến Quản lý để xem xét và phê duyệt.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-2">
          <button
            type="submit"
            disabled={
              submitting ||
              isManagerSession ||
              !selectedEmployee ||
              workingDays <= 0
            }
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm"
          >
            <FilePlus2 className="w-4 h-4" />
            {submitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu nghỉ phép'}
          </button>
          <p className="text-center text-xs text-slate-500 mt-3">
            Loại phép và số ngày phân bổ sẽ do Quản lý xem xét khi xử lý đơn.
          </p>
        </div>
      </form>
    </div>
  );
}
