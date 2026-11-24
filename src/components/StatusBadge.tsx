import { CheckCircle2, Clock, FilePlus2, XCircle } from 'lucide-react';
import type { LeaveStatus } from '../types/leave';

interface StatusLabelProps {
  status: LeaveStatus;
  compact?: boolean;
}

export function StatusLabel({ status, compact = false }: StatusLabelProps) {
  switch (status) {
    case 'Đã duyệt':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          {!compact ? 'Đã duyệt' : 'Duyệt'}
        </span>
      );
    case 'Đang chờ duyệt':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          {!compact ? 'Đang chờ duyệt' : 'Chờ duyệt'}
        </span>
      );
    case 'Mới tạo':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 whitespace-nowrap">
          <FilePlus2 className="w-3.5 h-3.5 shrink-0" />
          Mới tạo
        </span>
      );
    case 'Từ chối':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          Từ chối
        </span>
      );
  }
}
