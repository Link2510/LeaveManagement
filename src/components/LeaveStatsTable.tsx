import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Search, Users } from 'lucide-react';
import type { Department, EmployeeStats } from '../types/leave';

const PAGE_SIZE = 5;

interface LeaveStatsTableProps {
  stats: EmployeeStats[];
  isAdminView: boolean;
  loading: boolean;
  statsYear: number;
  availableYears: number[];
  onChangeYear: (year: number) => void;
  onNavigateEmployees?: () => void;
}

export function LeaveStatsTable({
  stats,
  isAdminView,
  loading,
  statsYear,
  availableYears,
  onChangeYear,
  onNavigateEmployees,
}: LeaveStatsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState<'Tất cả' | Department>('Tất cả');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredStats = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return stats.filter((item) => {
      const matchesDept = deptFilter === 'Tất cả' || item.department === deptFilter;
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q);
      return matchesDept && matchesQuery;
    });
  }, [stats, searchTerm, deptFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, deptFilter, statsYear]);

  const totalPages = Math.max(1, Math.ceil(filteredStats.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;

  const paginatedStats = useMemo(
    () => filteredStats.slice(startIndex, startIndex + PAGE_SIZE),
    [filteredStats, startIndex],
  );

  const totals = useMemo(() => {
    return filteredStats.reduce(
      (acc, row) => ({
        annualRemaining: acc.annualRemaining + (row.annualLeaveRemaining ?? 0),
        personalRemaining: acc.personalRemaining + (row.personalLeaveRemaining ?? 0),
        sick: acc.sick + row.sickLeaveDays,
        maternity: acc.maternity + row.maternityLeaveDays,
        paid: acc.paid + row.paidLeaveDays,
        unpaid: acc.unpaid + row.unpaidLeaveDays,
      }),
      {
        annualRemaining: 0,
        personalRemaining: 0,
        sick: 0,
        maternity: 0,
        paid: 0,
        unpaid: 0,
      },
    );
  }, [filteredStats]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Bảng thống kê ngày nghỉ nhân viên ({statsYear})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tự động chuyển theo năm hiện tại và trừ phép ngay khi Quản lý ghi nhận lịch nghỉ năm {statsYear}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Chọn năm thống kê"
            value={statsYear}
            onChange={(e) => onChangeYear(Number(e.target.value))}
            className="px-3 py-1.5 text-xs font-mono-num font-medium border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                Năm {yr}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tên nhân viên..."
              className="pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 w-52"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['Tất cả', 'Quản lý', 'Nhân sự'] as const).map((dept) => (
              <button
                key={dept}
                type="button"
                onClick={() => setDeptFilter(dept)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  deptFilter === dept
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>

          {isAdminView && onNavigateEmployees && (
            <button
              type="button"
              onClick={onNavigateEmployees}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Users className="w-3.5 h-3.5" />
              Chỉnh sửa nhân viên
            </button>
          )}
        </div>
      </div>

      {!isAdminView && (
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 text-xs text-slate-600">
          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>
            Mục <strong>Phép năm còn lại</strong> và <strong>Nghỉ cá nhân còn lại (5 ngày)</strong> chỉ hiển thị đối với tài khoản Quản lý.
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600">
              <th className="py-3 px-6 whitespace-nowrap">Tên nhân viên</th>
              {isAdminView && (
                <>
                  <th className="py-3 px-4 text-right whitespace-nowrap">
                    Phép năm còn lại
                  </th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">
                    Nghỉ cá nhân còn lại (5 ngày)
                  </th>
                </>
              )}
              <th className="py-3 px-4 text-right whitespace-nowrap">Nghỉ ốm đau</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Nghỉ thai sản</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">
                Nghỉ có lương (hiếu hỉ,...)
              </th>
              <th className="py-3 px-6 text-right whitespace-nowrap">Nghỉ không lương</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-sm">
            {loading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <tr key={idx}>
                  <td colSpan={isAdminView ? 7 : 5} className="py-3.5 px-6">
                    <div className="h-5 bg-slate-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : filteredStats.length === 0 ? (
              <tr>
                <td colSpan={isAdminView ? 7 : 5} className="py-12 px-6 text-center text-slate-500">
                  Không tìm thấy nhân viên phù hợp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              paginatedStats.map((emp) => {
                const annualLow =
                  emp.annualLeaveRemaining !== null && emp.annualLeaveRemaining <= 2;
                const personalLow =
                  emp.personalLeaveRemaining !== null && emp.personalLeaveRemaining <= 1;

                return (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-medium text-slate-900">{emp.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{emp.department}</div>
                    </td>

                    {isAdminView && (
                      <>
                        <td className="py-3.5 px-4 text-right font-mono-num tabular-nums">
                          {emp.annualLeaveRemaining !== null && emp.annualLeaveInitial !== null ? (
                            <span
                              className={
                                annualLow
                                  ? 'font-semibold text-amber-700'
                                  : 'font-semibold text-slate-900'
                              }
                            >
                              {emp.annualLeaveRemaining}
                              <span className="text-slate-400 font-normal">
                                {' '}
                                / {emp.annualLeaveInitial}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-num tabular-nums">
                          {emp.personalLeaveRemaining !== null && emp.personalLeaveInitial !== null ? (
                            <span
                              className={
                                personalLow
                                  ? 'font-semibold text-amber-700'
                                  : 'font-semibold text-teal-700'
                              }
                            >
                              {emp.personalLeaveRemaining}
                              <span className="text-slate-400 font-normal">
                                {' '}
                                / {emp.personalLeaveInitial}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </>
                    )}

                    <td className="py-3.5 px-4 text-right font-mono-num tabular-nums text-slate-700">
                      {emp.sickLeaveDays}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-num tabular-nums text-slate-700">
                      {emp.maternityLeaveDays}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-num tabular-nums text-slate-700">
                      {emp.paidLeaveDays}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono-num tabular-nums text-slate-700">
                      {emp.unpaidLeaveDays}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {!loading && filteredStats.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                <td className="py-3 px-6">
                  Tổng cộng ({filteredStats.length} nhân sự)
                </td>
                {isAdminView && (
                  <>
                    <td className="py-3 px-4 text-right font-mono-num tabular-nums text-slate-900">
                      {totals.annualRemaining} ngày
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num tabular-nums text-teal-800">
                      {totals.personalRemaining} ngày
                    </td>
                  </>
                )}
                <td className="py-3 px-4 text-right font-mono-num tabular-nums">{totals.sick}</td>
                <td className="py-3 px-4 text-right font-mono-num tabular-nums">{totals.maternity}</td>
                <td className="py-3 px-4 text-right font-mono-num tabular-nums">{totals.paid}</td>
                <td className="py-3 px-6 text-right font-mono-num tabular-nums">{totals.unpaid}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!loading && filteredStats.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-slate-500 font-mono-num tabular-nums">
            Hiển thị {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, filteredStats.length)} /{' '}
            {filteredStats.length} nhân sự
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              aria-label="Trang trước"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Trước
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`min-w-[30px] h-[30px] px-2 text-xs font-mono-num tabular-nums font-medium rounded-lg border transition-colors ${
                    safePage === page
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Trang sau"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
            >
              Sau
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
