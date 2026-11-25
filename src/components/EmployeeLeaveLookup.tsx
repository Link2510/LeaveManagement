import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSearch,
  Mail,
  Search,
  UserRound,
  XCircle,
} from 'lucide-react';
import type { LeaveLookupRequestItem } from '../types/leave';
import {
  lookupLeaveRequestsByEmail,
  lookupLeaveRequestsByName,
} from '../services/firestoreService';
import { formatDateTimeVN, formatDateVN } from '../utils/dateUtils';
import { getSafeGoogleDriveHref } from '../utils/urlUtils';
import { StatusLabel } from './StatusBadge';

type LookupMode = 'email' | 'name';

interface EmployeeLeaveLookupProps {
  initialEmail?: string;
}

export function EmployeeLeaveLookup({ initialEmail = '' }: EmployeeLeaveLookupProps) {
  const [mode, setMode] = useState<LookupMode>('email');
  const [keyword, setKeyword] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<LeaveLookupRequestItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const autoSearchedRef = useRef('');

  const runLookup = async (nextMode: LookupMode, value: string) => {
    const clean = value.trim();
    setSearched(true);
    setErrorMsg('');
    setResults([]);

    if (!clean) {
      setErrorMsg(
        nextMode === 'email'
          ? 'Vui lòng nhập email bạn đã dùng khi đăng ký nghỉ phép.'
          : 'Vui lòng nhập họ tên đầy đủ đã dùng khi đăng ký nghỉ phép.',
      );
      return;
    }

    if (nextMode === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setErrorMsg('Email không hợp lệ. Vui lòng kiểm tra lại.');
      return;
    }

    setLoading(true);
    try {
      const items =
        nextMode === 'email'
          ? await lookupLeaveRequestsByEmail(clean)
          : await lookupLeaveRequestsByName(clean);
      setResults(items);
    } catch {
      setErrorMsg(
        'Không thể tra cứu đơn lúc này. Vui lòng kiểm tra kết nối mạng và thử lại.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runLookup(mode, keyword);
  };

  const switchMode = (next: LookupMode) => {
    setMode(next);
    setResults([]);
    setSearched(false);
    setErrorMsg('');
  };

  // Khi vừa gửi đơn xong và được chuyển sang tab tra cứu, tự động tìm theo email.
  useEffect(() => {
    const clean = initialEmail.trim();
    if (!clean || autoSearchedRef.current === clean) return;
    autoSearchedRef.current = clean;
    setMode('email');
    setKeyword(clean);
    void runLookup('email', clean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEmail]);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="px-6 py-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-teal-700" />
            Tra cứu đơn nghỉ phép của tôi
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Không cần đăng nhập. Tra cứu bằng email đã dùng khi đăng ký hoặc bằng
            họ tên đầy đủ.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => switchMode('email')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'email'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Theo email
            </button>
            <button
              type="button"
              onClick={() => switchMode('name')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'name'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserRound className="w-3.5 h-3.5" />
              Theo họ tên
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              {mode === 'email' ? (
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              ) : (
                <UserRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              )}
              <input
                type={mode === 'email' ? 'email' : 'text'}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={
                  mode === 'email'
                    ? 'Email đã dùng khi đăng ký, ví dụ: ten.ban@congty.com'
                    : 'Họ tên đầy đủ, ví dụ: Nguyễn Minh Anh'
                }
                maxLength={160}
                autoComplete={mode === 'email' ? 'email' : 'name'}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Search className="w-4 h-4" />
              {loading ? 'Đang tra cứu...' : 'Tra cứu'}
            </button>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            {mode === 'email'
              ? 'Nhập đúng email đã điền khi gửi đơn. Kết quả chỉ hiển thị đơn gắn với email đó.'
              : 'Họ tên được chuẩn hoá dấu tiếng Việt và khoảng trắng, nên "Nguyen Minh Anh" và "Nguyễn Minh Anh" cho cùng kết quả. Kết quả hiển thị đơn của tất cả nhân sự trùng họ tên — chỉ dùng trong nội bộ công ty.'}
          </p>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </form>
      </div>

      {searched && !loading && !errorMsg && (
        <div className="space-y-3">
          <div className="text-xs text-slate-600">
            {results.length > 0 ? (
              <>
                Tìm thấy <strong className="text-slate-900">{results.length}</strong>{' '}
                đơn nghỉ phép.
              </>
            ) : (
              'Không tìm thấy đơn nghỉ phép phù hợp.'
            )}
          </div>

          {results.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl px-6 py-10 text-center space-y-2">
              <FileSearch className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-700 font-medium">
                Chưa có đơn nào khớp thông tin tra cứu
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {mode === 'email'
                  ? 'Hãy kiểm tra đúng email đã điền lúc gửi đơn. Nếu bạn vừa gửi đơn bằng email khác, thử tra cứu theo họ tên.'
                  : 'Hãy nhập đúng họ tên đầy đủ như trong danh sách nhân sự. Bạn cũng có thể tra cứu theo email đã đăng ký.'}{' '}
                Đơn cũ trước khi bật tính năng này có thể chưa có mã tra cứu; quản
                lý cần đăng nhập một lần để đồng bộ.
              </p>
            </div>
          ) : (
            results.map((item) => (
              <LookupResultCard key={item.requestId} item={item} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LookupResultCard({ item }: { item: LeaveLookupRequestItem }) {
  const driveHref = getSafeGoogleDriveHref(item.attachmentUrl);

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      <div className="px-5 py-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 truncate">
            {item.employeeName}{' '}
            <span className="text-xs font-normal text-slate-500">
              · {item.department}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono-num mt-0.5">
            Mã đơn: {item.requestId}
          </div>
        </div>
        <StatusLabel status={item.status} />
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono-num">
              {formatDateVN(item.startDate)} → {formatDateVN(item.endDate)}
            </span>
          </span>
          <span className="font-mono-num tabular-nums">
            <strong className="text-slate-900">{item.workingDays}</strong> ngày làm việc
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            Gửi lúc {formatDateTimeVN(item.createdAtMs)}
          </span>
        </div>

        <div className="text-xs text-slate-700">
          <span className="text-slate-500">Lý do: </span>
          {item.reason}
        </div>

        {item.status === 'Đã duyệt' && item.allocations.length > 0 && (
          <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Phân bổ được duyệt:{' '}
              <strong>
                {item.allocations
                  .map((a) => `${a.type}: ${a.days} ngày`)
                  .join(' · ')}
              </strong>
            </span>
          </div>
        )}

        {item.status === 'Từ chối' && (
          <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold">Đơn bị từ chối</div>
              <div>
                Lý do: {item.rejectionReason?.trim() || 'Quản lý không ghi lý do.'}
              </div>
            </div>
          </div>
        )}

        {item.status === 'Đang chờ duyệt' && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Đơn đang chờ quản lý duyệt. Kết quả sẽ được cập nhật tại đây.</span>
          </div>
        )}

        {item.hospitalCertPending && (
          <div className="text-xs text-amber-700">
            Đơn nghỉ ốm đang chờ bổ sung giấy xác nhận của bệnh viện.
          </div>
        )}

        {driveHref && (
          <a
            href={driveHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Xem giấy xác nhận đã đính kèm
          </a>
        )}
      </div>

      {(item.processedBy || item.processedAt) && (
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
          Xử lý bởi {item.processedBy || 'Quản lý'}
          {item.processedAt ? ` · ${formatDateTimeVN(item.processedAt)}` : ''}
        </div>
      )}
    </motion.article>
  );
}
