import { useMemo, useState } from 'react';
import { Check, History } from 'lucide-react';
import type { LeaveRequestItem, ManagerAccount } from '../types/leave';
import { markHospitalCertReceived } from '../services/firestoreService';
import { formatDateTimeVN, formatDateVN } from '../utils/dateUtils';
import { resolveManagerName } from '../utils/managerUtils';
import { StatusLabel } from './StatusBadge';

interface ApprovalHistoryProps {
  requests: LeaveRequestItem[];
  managers?: ManagerAccount[];
  adminLabel?: string;
}

export function ApprovalHistory({
  requests,
  managers = [],
  adminLabel = 'Quản lý',
}: ApprovalHistoryProps) {
  const [filter, setFilter] = useState<
    'Tất cả' | 'Đã duyệt' | 'Chờ bổ sung giấy ốm' | 'Từ chối'
  >('Tất cả');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const processedList = useMemo(() => {
    return requests.filter((r) => {
      if (filter === 'Tất cả') {
        return r.status === 'Đã duyệt' || r.status === 'Từ chối';
      }
      if (filter === 'Chờ bổ sung giấy ốm') {
        return r.status === 'Đã duyệt' && Boolean(r.hospitalCertPending);
      }
      return r.status === filter;
    });
  }, [requests, filter]);

  const handleConfirmCert = async (req: LeaveRequestItem) => {
    if (confirmingId) return;
    setActionError('');
    setConfirmingId(req.id);
    try {
      await markHospitalCertReceived(req, adminLabel);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Không thể xác nhận giấy xác nhận nằm viện.',
      );
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-teal-700" />
          <h2 className="text-base font-semibold text-slate-900">
            Lịch sử đăng ký &amp; phân bổ nghỉ phép
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(['Tất cả', 'Đã duyệt', 'Chờ bổ sung giấy ốm', 'Từ chối'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filter === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="px-6 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-700">
          {actionError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600">
              <th className="py-3 px-6">Nhân viên</th>
              <th className="py-3 px-4 whitespace-nowrap">Thời gian nghỉ</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Số ngày</th>
              <th className="py-3 px-4">Trạng thái</th>
              <th className="py-3 px-4">Phân bổ &amp; giấy xác nhận</th>
              <th className="py-3 px-6 whitespace-nowrap">Người &amp; thời điểm ghi nhận</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {processedList.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  Chưa có dữ liệu nghỉ phép phù hợp trong mục này.
                </td>
              </tr>
            ) : (
              processedList.map((req) => {
                return (
                  <tr key={req.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-6">
                      <div className="font-medium text-slate-900">{req.employeeName}</div>
                      <div className="text-xs text-slate-500">{req.department}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono-num text-xs text-slate-700 whitespace-nowrap">
                      {formatDateVN(req.startDate)} → {formatDateVN(req.endDate)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-num tabular-nums font-medium text-slate-900">
                      {req.workingDays}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusLabel status={req.status} />
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700 max-w-sm space-y-1.5">
                      {req.status === 'Từ chối' ? (
                        <span className="text-red-700">{req.rejectionReason || '—'}</span>
                      ) : req.allocations.length > 0 ? (
                        <div>
                          {req.allocations.map((a) => `${a.type}: ${a.days} ngày`).join(' · ')}
                        </div>
                      ) : (
                        '—'
                      )}

                      {req.hasHospitalCert && (
                        <div className="text-emerald-700 font-medium">
                          Có giấy xác nhận
                        </div>
                      )}

                      {req.hospitalCertPending && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-amber-700 font-medium">Chờ bổ sung giấy ốm</span>
                          <button
                            type="button"
                            disabled={confirmingId === req.id}
                            onClick={() => void handleConfirmCert(req)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded transition-colors disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                            {confirmingId === req.id ? 'Đang lưu...' : 'Xác nhận đã nộp'}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-xs text-slate-600 whitespace-nowrap">
                      <div>{resolveManagerName(req.processedBy, managers)}</div>
                      <div className="text-slate-400 font-mono-num">
                        {formatDateTimeVN(req.processedAt)}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
