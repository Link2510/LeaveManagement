import { useMemo, useState } from 'react';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  ClipboardCheck,
  Inbox,
  Search,
} from 'lucide-react';
import type { AppNotification, LeaveRequestItem } from '../types/leave';
import { formatDateTimeVN } from '../utils/dateUtils';
import { StatusLabel } from './StatusBadge';

interface NotificationsPageProps {
  notifications: AppNotification[];
  requests: LeaveRequestItem[];
  pendingCount: number;
  onOpenRequest: (notification: AppNotification) => void;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
  onGoApprovals: () => void;
}

type FilterMode = 'all' | 'unread';

export function NotificationsPage({
  notifications,
  requests,
  pendingCount,
  onOpenRequest,
  onMarkRead,
  onMarkAllRead,
  onGoApprovals,
}: NotificationsPageProps) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [keyword, setKeyword] = useState('');

  const requestById = useMemo(() => {
    const map = new Map<string, LeaveRequestItem>();
    for (const request of requests) map.set(request.id, request);
    return map;
  }, [requests]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const visible = useMemo(() => {
    const clean = keyword.trim().toLowerCase();
    const byFilter =
      filter === 'unread'
        ? notifications.filter((n) => !n.isRead)
        : notifications;
    if (!clean) return byFilter;
    return byFilter.filter((n) => {
      const request = requestById.get(n.requestId);
      return (
        n.title.toLowerCase().includes(clean) ||
        n.message.toLowerCase().includes(clean) ||
        (request ? request.employeeName.toLowerCase().includes(clean) : false)
      );
    });
  }, [notifications, filter, keyword, requestById]);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Hộp thông báo quản lý
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              <span className="font-mono-num">{unreadCount}</span> chưa đọc ·{' '}
              <span className="font-mono-num">{notifications.length}</span> thông báo ·{' '}
              <span className="font-mono-num">{pendingCount}</span> đơn đang chờ duyệt
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors disabled:text-slate-400 disabled:cursor-default disabled:bg-white whitespace-nowrap"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Đọc tất cả
          </button>
          <button
            type="button"
            onClick={onGoApprovals}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Mở hàng đợi duyệt
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === 'unread'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chưa đọc ({unreadCount})
            </button>
          </div>

          <div className="relative sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm theo tên hoặc nội dung..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="px-4 py-12 text-center space-y-1.5">
            <Inbox className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-sm font-medium text-slate-700">
              {filter === 'unread'
                ? 'Không có thông báo chưa đọc'
                : keyword.trim()
                  ? 'Không tìm thấy thông báo phù hợp'
                  : 'Chưa có thông báo nào'}
            </p>
            <p className="text-xs text-slate-500">
              {filter === 'unread'
                ? 'Bạn đã xem hết thông báo. Chuyển sang “Tất cả” để xem lại.'
                : 'Thông báo sẽ xuất hiện ở đây khi nhân viên tự gửi đơn nghỉ phép.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((notification) => {
              const request = requestById.get(notification.requestId);
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!notification.isRead) onMarkRead(notification.id);
                      onOpenRequest(notification);
                    }}
                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors ${
                      notification.isRead ? '' : 'bg-teal-50/40'
                    }`}
                  >
                    <span
                      className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                        notification.isRead ? 'bg-slate-300' : 'bg-teal-600'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={`text-sm truncate ${
                            notification.isRead
                              ? 'font-medium text-slate-700'
                              : 'font-semibold text-slate-900'
                          }`}
                        >
                          {notification.title}
                        </span>
                        {request && <StatusLabel status={request.status} compact />}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed mt-1">
                        {notification.message}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1.5 font-mono-num">
                        {formatDateTimeVN(notification.createdAtMs)}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500">
          Thông báo trong ứng dụng, chỉ hiển thị khi quản lý đang đăng nhập — hệ thống
          không gửi email hay push.
        </div>
      </div>
    </div>
  );
}
