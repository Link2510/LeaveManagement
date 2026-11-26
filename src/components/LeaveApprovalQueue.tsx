import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Check,
  ClipboardCheck,
  Clock,
  Inbox,
  Search,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import type {
  HalfDaySession,
  LeaveAllocation,
  LeaveRequestItem,
  LeaveType,
} from '../types/leave';
import { ALL_LEAVE_TYPES } from '../types/leave';
import {
  approveLeaveRequest,
  deleteLeaveRequest,
  rejectLeaveRequest,
} from '../services/firestoreService';
import {
  formatDateTimeVN,
  formatDateVN,
  getHalfDayTimeLabel,
} from '../utils/dateUtils';
import { StatusLabel } from './StatusBadge';

interface LeaveApprovalQueueProps {
  requests: LeaveRequestItem[];
  adminLabel?: string;
  isSuperAdmin?: boolean;
}

function emptyAllocations(): Record<LeaveType, number> {
  return {
    'Phép năm': 0,
    'Nghỉ việc riêng': 0,
    'Nghỉ ốm': 0,
    'Thai sản': 0,
    'Nghỉ hưởng lương': 0,
    'Nghỉ không lương': 0,
  };
}

function initialHalfSessions(request: LeaveRequestItem): Record<string, HalfDaySession> {
  const entries = Array.isArray(request.halfDays) && request.halfDays.length > 0
    ? request.halfDays
    : request.halfDay
      ? [request.halfDay]
      : [];
  const map: Record<string, HalfDaySession> = {};
  for (const item of entries) {
    if (item?.date && (item.session === 'Sáng' || item.session === 'Chiều')) {
      map[item.date] = item.session;
    }
  }
  return map;
}

function initialAllocations(request: LeaveRequestItem): Record<LeaveType, number> {
  const map = emptyAllocations();
  const valid = request.allocations.filter((a) => a.days > 0);
  if (valid.length > 0) {
    for (const a of valid) {
      map[a.type] = a.days;
    }
    return map;
  }
  map['Phép năm'] = request.workingDays;
  return map;
}

export function LeaveApprovalQueue({
  requests,
  adminLabel = 'Quản lý',
  isSuperAdmin = false,
}: LeaveApprovalQueueProps) {
  const [keyword, setKeyword] = useState('');

  const pending = useMemo(() => {
    const list = requests.filter((r) => r.status === 'Đang chờ duyệt');
    const clean = keyword.trim().toLowerCase();
    if (!clean) return list;
    return list.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(clean) ||
        r.department.toLowerCase().includes(clean),
    );
  }, [requests, keyword]);

  const totalPending = useMemo(
    () => requests.filter((r) => r.status === 'Đang chờ duyệt').length,
    [requests],
  );

  return (
    <section className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-teal-700" />
            Đơn chờ quản lý duyệt
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Duyệt hoặc từ chối đơn do nhân viên tự gửi. Kết quả được ghi vào lịch
            nghỉ và phần tra cứu đơn của nhân viên (hệ thống không gửi email).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm theo tên / phòng ban"
              className="w-56 pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 whitespace-nowrap font-mono-num tabular-nums">
            {totalPending} chờ duyệt
          </span>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-12 text-center space-y-2">
          <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-800">
            {totalPending === 0
              ? 'Không có đơn nào đang chờ duyệt'
              : 'Không có đơn khớp từ khoá tìm kiếm'}
          </p>
          <p className="text-xs text-slate-500">
            Đơn do nhân viên gửi từ mục “Đăng ký nghỉ phép” sẽ xuất hiện tại đây.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((request) => (
            <PendingRequestCard
              key={request.id}
              request={request}
              adminLabel={adminLabel}
              isSuperAdmin={isSuperAdmin}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PendingRequestCard({
  request,
  adminLabel,
  isSuperAdmin,
}: {
  request: LeaveRequestItem;
  adminLabel: string;
  isSuperAdmin: boolean;
}) {
  const [allocMap, setAllocMap] = useState<Record<LeaveType, number>>(() =>
    initialAllocations(request),
  );
  const [hasHospitalCert, setHasHospitalCert] = useState(
    Boolean(request.hasHospitalCert),
  );
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [halfSessions, setHalfSessions] = useState<Record<string, HalfDaySession>>(
    () => initialHalfSessions(request),
  );
  const [busy, setBusy] = useState<'approve' | 'reject' | 'delete' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const halfEntries =
    Array.isArray(request.halfDays) && request.halfDays.length > 0
      ? request.halfDays
      : request.halfDay
        ? [request.halfDay]
        : [];
  const requestDates =
    Array.isArray(request.dates) && request.dates.length > 0 ? request.dates : [];

  const totalAllocated = ALL_LEAVE_TYPES.reduce(
    (sum, type) => sum + (Number(allocMap[type]) || 0),
    0,
  );
  const isSick = (Number(allocMap['Nghỉ ốm']) || 0) > 0;
  const totalMatches = Math.abs(totalAllocated - request.workingDays) <= 0.001;

  const handleApprove = async () => {
    setErrorMsg('');
    if (!totalMatches) {
      setErrorMsg(
        `Tổng số ngày phân bổ (${totalAllocated}) phải bằng đúng số ngày làm việc (${request.workingDays} ngày).`,
      );
      return;
    }

    const allocations: LeaveAllocation[] = ALL_LEAVE_TYPES.filter(
      (type) => (Number(allocMap[type]) || 0) > 0,
    ).map((type) => ({ type, days: Number(allocMap[type]) }));

    setBusy('approve');
    try {
      await approveLeaveRequest(
        request,
        allocations,
        isSick ? hasHospitalCert : false,
        adminLabel,
        isSick && !hasHospitalCert,
        request.halfDay
          ? {
              date: request.halfDay.date,
              session: halfSessions[request.halfDay.date] || request.halfDay.session,
            }
          : undefined,
        Object.entries(halfSessions).map(([date, session]) => ({ date, session })),
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể duyệt đơn. Vui lòng thử lại.',
      );
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!isSuperAdmin) return;
    const ok = window.confirm(
      `XOÁ VĨNH VIỄN đơn ${request.id} của ${request.employeeName} khỏi Firestore? Hành động này không thể hoàn tác.`,
    );
    if (!ok) return;
    setErrorMsg('');
    setBusy('delete');
    try {
      await deleteLeaveRequest(request.id);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể xoá đơn. Vui lòng thử lại.',
      );
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    setErrorMsg('');
    if (rejectionReason.trim().length < 2) {
      setErrorMsg('Vui lòng nhập lý do từ chối (tối thiểu 2 ký tự) để gửi cho nhân viên.');
      return;
    }

    setBusy('reject');
    try {
      await rejectLeaveRequest(
        request,
        rejectionReason.trim(),
        adminLabel,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể từ chối đơn. Vui lòng thử lại.',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">
            {request.employeeName}{' '}
            <span className="text-xs font-normal text-slate-500">
              · {request.department}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono-num mt-0.5">
            Mã đơn: {request.id}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusLabel status={request.status} />
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Clock className="w-3 h-3" />
            {formatDateTimeVN(request.createdAtMs)}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <div className="text-[11px] text-slate-500">
              Thời gian nghỉ {requestDates.length > 1 ? `(${requestDates.length} ngày)` : ''}
            </div>
            <div className="font-mono-num text-slate-900 mt-0.5">
              {requestDates.length > 0
                ? requestDates.map((date) => formatDateVN(date)).join(', ')
                : `${formatDateVN(request.startDate)} → ${formatDateVN(request.endDate)}`}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <div className="text-[11px] text-slate-500">Số ngày làm việc</div>
            <div className="font-mono-num text-slate-900 mt-0.5">
              {request.workingDays} ngày
            </div>
          </div>
        </div>

        {halfEntries.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-900 space-y-2">
            <div className="font-medium">
              Nghỉ nửa ngày vào{' '}
              {halfEntries.map((item) => formatDateVN(item.date)).join(', ')} — tổng{' '}
              {request.workingDays} ngày
            </div>
            {halfEntries.map((item) => (
              <div key={item.date} className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-amber-800 font-mono-num">
                  {formatDateVN(item.date)}:
                </span>
                {(['Sáng', 'Chiều'] as const).map((session) => (
                  <button
                    key={`${item.date}-${session}`}
                    type="button"
                    onClick={() =>
                      setHalfSessions((prev) => ({ ...prev, [item.date]: session }))
                    }
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                      halfSessions[item.date] === session
                        ? 'bg-amber-700 text-white border-amber-700'
                        : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    {getHalfDayTimeLabel(session)}
                  </button>
                ))}
              </div>
            ))}
            <p className="text-[11px] text-amber-800">
              Điểm danh sẽ ghi nhận nhân sự làm việc buổi còn lại (08:15–12:15 / 13:30–17:30,
              nghỉ trưa 12:15–13:30).
            </p>
          </div>
        )}

        <div className="text-xs text-slate-700 space-y-1">
          <div>
            <span className="text-slate-500">Lý do: </span>
            {request.reason}
          </div>
          {request.note && (
            <div>
              <span className="text-slate-500">Bàn giao: </span>
              {request.note}
            </div>
          )}
          {request.allocations.length > 0 && (
            <div className="text-slate-500">
              Loại phép nhân viên đề xuất:{' '}
              <span className="text-slate-700">
                {request.allocations
                  .map((a) => `${a.type} (${a.days} ngày)`)
                  .join(' · ')}
              </span>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-800">
              Phân bổ ngày nghỉ khi duyệt
            </div>
            <span
              className={`text-xs font-semibold font-mono-num tabular-nums whitespace-nowrap ${
                totalMatches ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              Đã phân bổ: {totalAllocated} / {request.workingDays} ngày
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_LEAVE_TYPES.map((type) => (
              <label
                key={type}
                className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700"
              >
                <span className="truncate">{type}</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  step={0.5}
                  value={allocMap[type]}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const next = Number.isNaN(raw) ? 0 : Math.max(0, raw);
                    setAllocMap((prev) => ({ ...prev, [type]: next }));
                  }}
                  className="w-20 px-2 py-1 text-right border border-slate-200 rounded-md bg-white font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </label>
            ))}
          </div>

          {isSick && (
            <div className="flex flex-wrap items-center gap-4 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Stethoscope className="w-3.5 h-3.5 text-teal-700" />
                Nghỉ ốm
              </span>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasHospitalCert}
                  onChange={(e) => setHasHospitalCert(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                Đã có giấy xác nhận
              </label>
              {!hasHospitalCert && (
                <span className="text-amber-700">
                  Sẽ ghi nhận “chờ bổ sung giấy xác nhận”.
                </span>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {rejecting && (
            <div className="space-y-2">
              <label
                htmlFor={`reject-${request.id}`}
                className="block text-xs font-medium text-slate-700"
              >
                Lý do từ chối (sẽ gửi cho nhân viên)
              </label>
              <textarea
                id={`reject-${request.id}`}
                rows={2}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                maxLength={500}
                placeholder="Ví dụ: Trùng lịch họp tổng kết, vui lòng chọn ngày khác..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {rejecting ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRejecting(false);
                    setErrorMsg('');
                  }}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void handleReject()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" />
                  {busy === 'reject' ? 'Đang gửi...' : 'Xác nhận từ chối'}
                </button>
              </>
            ) : (
              <>
                {isSuperAdmin && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void handleDelete()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap mr-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {busy === 'delete' ? 'Đang xoá...' : 'Xoá đơn (test)'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setRejecting(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" />
                  Từ chối
                </button>
                <button
                  type="button"
                  disabled={busy !== null || !totalMatches}
                  onClick={() => void handleApprove()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5" />
                  {busy === 'approve' ? 'Đang duyệt...' : 'Duyệt đơn'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
