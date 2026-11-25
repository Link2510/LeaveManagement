import { useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  CalendarDays,
  CalendarOff,
  FilePlus2,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  ShieldCheck,
  Smile,
  Users,
  X,
} from 'lucide-react';
import { ADMIN_EMAIL, auth, googleProvider } from './firebase';
import {
  seedInitialDataIfNeeded,
  subscribeDailyOffStatus,
  subscribeEmployeeQuotas,
  subscribeEmployees,
  subscribeHolidays,
  subscribeIsManager,
  subscribeLeaveContacts,
  subscribeLeaveRequests,
  subscribeManagers,
  syncAllDailyOffStatuses,
  syncMissingEmailLookups,
} from './services/firestoreService';
import {
  FIXED_PERSONAL_LEAVE_DAYS,
  type CompanyHoliday,
  type Employee,
  type EmployeeQuota,
  type EmployeeStats,
  type LeaveRequestContact,
  type LeaveRequestItem,
  type ManagerAccount,
} from './types/leave';
import { getTodayKey, isDateInRange, isWorkingDay } from './utils/dateUtils';
import { LeaveStatsTable } from './components/LeaveStatsTable';
import { MonthlyCalendar } from './components/MonthlyCalendar';
import { LeaveRequestForm } from './components/LeaveRequestForm';
import { EmployeeManager } from './components/EmployeeManager';
import { HolidayManager } from './components/HolidayManager';
import { ApprovalHistory } from './components/ApprovalHistory';
import { AttendanceToday } from './components/AttendanceToday';
import { EmployeeLeaveRequestForm } from './components/EmployeeLeaveRequestForm';

type NavTab =
  | 'attendance'
  | 'employee-request'
  | 'new-request'
  | 'holidays'
  | 'dashboard'
  | 'calendar'
  | 'employees'
  | 'history';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthorizedManager, setIsAuthorizedManager] = useState(false);
  const [managerCheckDone, setManagerCheckDone] = useState(false);
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [activeTab, setActiveTab] = useState<NavTab>('attendance');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [previewAsEmployee, setPreviewAsEmployee] = useState(false);
  const [statsYear, setStatsYear] = useState<number>(() => new Date().getFullYear());

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [quotas, setQuotas] = useState<Record<string, EmployeeQuota>>({});
  const [managers, setManagers] = useState<ManagerAccount[]>([]);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [contacts, setContacts] = useState<Record<string, LeaveRequestContact>>({});
  const [dailyOffEmployeeIds, setDailyOffEmployeeIds] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(true);


  const isSuperAdmin = Boolean(
    user &&
    user.emailVerified &&
    user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );
  const isManagerSignedIn = Boolean(user && isAuthorizedManager);
  const isManagerView = isManagerSignedIn && !previewAsEmployee;
  const showManagerWorkspace = isManagerSignedIn && !previewAsEmployee;
  const prevManagerWorkspaceRef = useRef<boolean>(false);
  const lastDailyOffSyncRef = useRef<string>('');

  useEffect(() => {
    console.log('[LOADING TRACE]', {
      dataLoading,
      employeesCount: employees.length,
      authReady,
      managerCheckDone,
      isManagerSignedIn,
    });
  }, [
    dataLoading,
    employees.length,
    authReady,
    managerCheckDone,
    isManagerSignedIn,
  ]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady) return;

    if (!user || user.isAnonymous) {
      setIsAuthorizedManager(false);
      setManagerCheckDone(true);
      setAuthError('');
      return;
    }

    setManagerCheckDone(false);

    const unsub = subscribeIsManager(
      user.uid,
      isSuperAdmin,
      (ok) => {
        setIsAuthorizedManager(ok);
        setManagerCheckDone(true);

        if (!ok) {
          setAuthError(
            'Tài khoản này chưa được cấp quyền Quản lý trong hệ thống.',
          );
        } else {
          setAuthError('');
        }
      },
    );

    return () => unsub();
  }, [authReady, user, isSuperAdmin]);

  useEffect(() => {
    if (!authReady || !managerCheckDone) return;

    let active = true;
    setDataLoading(true);
    const canReadManagerFirestore = isManagerSignedIn;

    const init = async () => {
      try {
        if (canReadManagerFirestore && user) {
          await seedInitialDataIfNeeded(true, user.uid);
        }
      } catch (error) {
        console.error('Không thể khởi tạo dữ liệu ban đầu:', error);
      } finally {
        if (active) {
          setDataLoading(false);
        }
      }
    }; void init();

    const todayKey = getTodayKey();
    const unsubEmployees = subscribeEmployees((list) => {
      if (active) setEmployees(list);
    });
    const unsubHolidays = subscribeHolidays((list) => {
      if (active) setHolidays(list);
    });
    const unsubDailyOff = subscribeDailyOffStatus(todayKey, (ids) => {
      if (active) setDailyOffEmployeeIds(ids);
    });
    const unsubRequests = subscribeLeaveRequests(canReadManagerFirestore, (list) => {
      if (active) setRequests(list);
    });
    const unsubContacts = subscribeLeaveContacts(canReadManagerFirestore, (map) => {
      if (active) setContacts(map);
    });
    const unsubManagers = subscribeManagers(canReadManagerFirestore, (list) => {
      if (active) setManagers(list);
    });

    let unsubQuotas: (() => void) | undefined;
    if (canReadManagerFirestore) {
      unsubQuotas = subscribeEmployeeQuotas((map) => {
        if (active) setQuotas(map);
      });
    } else {
      setQuotas({});
    }

    return () => {
      active = false;
      unsubEmployees();
      unsubHolidays();
      unsubDailyOff();
      unsubRequests();
      unsubContacts();
      unsubManagers();
      unsubQuotas?.();
    };
  }, [authReady, managerCheckDone, user, isManagerSignedIn]);

  useEffect(() => {
    if (
      isManagerSignedIn &&
      requests.length > 0 &&
      Object.keys(contacts).length > 0
    ) {
      void syncMissingEmailLookups(requests, contacts);
    }
  }, [isManagerSignedIn, requests, contacts]);

  useEffect(() => {
    if (!isManagerSignedIn || dataLoading) return;
    const todayKey = getTodayKey();
    const reqSig = requests
      .filter((r) => r.status === 'Đã duyệt')
      .map((r) => `${r.id}:${r.employeeId}:${r.startDate}:${r.endDate}`)
      .sort()
      .join('|');
    const holSig = holidays
      .map((h) => `${h.date}:${h.category}`)
      .sort()
      .join('|');
    const signature = `${todayKey}::${reqSig}::${holSig}`;

    if (signature !== lastDailyOffSyncRef.current) {
      lastDailyOffSyncRef.current = signature;
      void syncAllDailyOffStatuses(requests, holidays);
    }
  }, [isManagerSignedIn, dataLoading, requests, holidays]);

  useEffect(() => {
    const wasManager = prevManagerWorkspaceRef.current;
    prevManagerWorkspaceRef.current = showManagerWorkspace;

    if (!showManagerWorkspace) {
      if (
        activeTab !== 'attendance' &&
        activeTab !== 'holidays' &&
        activeTab !== 'employee-request'
      ) {
        setActiveTab('attendance');
      }
    }
  }, [showManagerWorkspace, activeTab]);

  const availableStatsYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearSet = new Set<number>([currentYear - 1, currentYear, currentYear + 1]);
    for (const req of requests) {
      const yr = Number(req.startDate.slice(0, 4));
      if (yr >= 2020 && yr <= 2100) yearSet.add(yr);
    }
    yearSet.add(statsYear);
    return Array.from(yearSet).sort((a, b) => a - b);
  }, [requests, statsYear]);

  const employeeStats: EmployeeStats[] = useMemo(() => {
    const approved = requests.filter(
      (r) => r.status === 'Đã duyệt' && Number(r.startDate.slice(0, 4)) === statsYear,
    );

    return employees.map((emp) => {
      let annualUsed = 0;
      let personalUsed = 0;
      let sick = 0;
      let maternity = 0;
      let paid = 0;
      let unpaid = 0;

      for (const req of approved) {
        if (req.employeeId !== emp.id) continue;
        for (const alloc of req.allocations) {
          if (alloc.type === 'Phép năm') annualUsed += alloc.days;
          else if (alloc.type === 'Nghỉ việc riêng') personalUsed += alloc.days;
          else if (alloc.type === 'Nghỉ ốm') sick += alloc.days;
          else if (alloc.type === 'Thai sản') maternity += alloc.days;
          else if (alloc.type === 'Nghỉ hưởng lương') paid += alloc.days;
          else if (alloc.type === 'Nghỉ không lương') unpaid += alloc.days;
        }
      }

      const quota = quotas[emp.id];
      const annualInitial = isManagerView && quota ? quota.annualLeaveInitial : null;
      const personalInitial = isManagerView ? FIXED_PERSONAL_LEAVE_DAYS : null;

      return {
        ...emp,
        annualLeaveInitial: annualInitial,
        personalLeaveInitial: personalInitial,
        annualLeaveUsed: annualUsed,
        personalLeaveUsed: personalUsed,
        annualLeaveRemaining:
          annualInitial !== null ? Math.max(0, annualInitial - annualUsed) : null,
        personalLeaveRemaining:
          personalInitial !== null ? Math.max(0, personalInitial - personalUsed) : null,
        sickLeaveDays: sick,
        maternityLeaveDays: maternity,
        paidLeaveDays: paid,
        unpaidLeaveDays: unpaid,
      };
    });
  }, [employees, quotas, requests, isManagerView, statsYear]);

  const kpis = useMemo(() => {
    const todayKey = getTodayKey();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const onLeaveTodaySet = new Set<string>();
    const todayIsWorking = isWorkingDay(todayKey, holidays);
    let approvedThisMonth = 0;

    for (const r of requests) {
      if (r.status !== 'Đã duyệt') continue;
      if (todayIsWorking && isDateInRange(todayKey, r.startDate, r.endDate)) {
        onLeaveTodaySet.add(r.employeeId);
      }
      if (r.processedAt) {
        const dt = new Date(r.processedAt);
        if (
          !Number.isNaN(dt.getTime()) &&
          dt.getFullYear() === currentYear &&
          dt.getMonth() === currentMonth
        ) {
          approvedThisMonth += 1;
        }
      }
    }

    return {
      totalEmployees: employees.length,
      onLeaveToday: onLeaveTodaySet.size,
      approvedThisMonth,
    };
  }, [employees, requests, holidays]);

  const handleManagerSignIn = async () => {
    setSigningIn(true);
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
      setPreviewAsEmployee(false);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('');
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          'Tên miền hiện tại chưa được thêm vào Authorized domains trong Firebase Authentication.',
        );
      } else {
        setAuthError(
          err instanceof Error
            ? err.message
            : 'Không thể đăng nhập Quản lý qua Firebase. Vui lòng thử lại.',
        );
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleEmailPasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const cleanUsername = loginUsername.trim().toLowerCase();

    if (!/^[a-z0-9._]{4,30}$/.test(cleanUsername)) {
      setAuthError(
        'Username phải có 4–30 ký tự, chỉ gồm chữ thường, số, dấu chấm và dấu gạch dưới.',
      );
      return;
    }

    if (!loginPassword) {
      setAuthError('Vui lòng nhập mật khẩu.');
      return;
    }

    setSigningIn(true);

    try {
      const loginEmail = `${cleanUsername}@accounts.leave-management.invalid`;

      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);

      setLoginUsername('');
      setLoginPassword('');
      setPreviewAsEmployee(false);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setAuthError('Username hoặc mật khẩu không chính xác.');
      } else if (code === 'auth/too-many-requests') {
        setAuthError('Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.');
      } else {
        setAuthError(
          err instanceof Error
            ? err.message
            : 'Không thể đăng nhập. Vui lòng thử lại.',
        );
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError('');
    setPreviewAsEmployee(false);
    if (user) {
      await signOut(auth).catch(() => { });
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Đang khởi tạo hệ thống...</div>
      </div>
    );
  }

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
    managerOnly?: boolean;
  }> = [
      { id: 'attendance', label: 'Hôm nay ai đi làm', icon: Smile },
      {
        id: 'employee-request',
        label: 'Đăng ký nghỉ phép',
        icon: FilePlus2,
      },
      { id: 'dashboard', label: 'Bảng thống kê', icon: LayoutDashboard, managerOnly: true },
      { id: 'calendar', label: 'Lịch nghỉ tháng', icon: CalendarDays, managerOnly: true },
      {
        id: 'new-request',
        label: 'Đăng ký & phân bổ nghỉ',
        icon: FilePlus2,
        managerOnly: true,
      },
      { id: 'employees', label: 'Quản lý nhân sự', icon: Users, managerOnly: true },
      { id: 'history', label: 'Lịch sử nghỉ phép', icon: History, managerOnly: true },
      { id: 'holidays', label: 'Ngày nghỉ công ty', icon: CalendarOff },
    ];

  const visibleNavItems = navItems.filter((item) => !item.managerOnly || showManagerWorkspace);

  const pageTitleMap: Record<NavTab, string> = {
    attendance: 'Hôm nay ai đi làm',
    'employee-request': 'Đăng ký nghỉ phép',
    dashboard: 'Tổng quan & Bảng thống kê nghỉ phép',
    calendar: 'Lịch nghỉ tháng toàn công ty',
    'new-request': 'Đăng ký & phân bổ ngày nghỉ cho nhân viên',
    employees: 'Quản lý nhân sự & tài khoản Quản lý',
    history: 'Lịch sử đăng ký & phân bổ nghỉ phép',
    holidays: 'Ngày nghỉ lễ & lịch OT công ty',
  };

  const renderSidebarContent = (variant: 'desktop' | 'mobile') => (
    <div className="flex flex-col h-full bg-[#25576b] text-white">
      <div className="px-6 h-16 border-b border-white/15 flex items-center justify-between shrink-0">
        <span className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap">
          LeaveManagement
        </span>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden p-1.5 text-white/75 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Đóng menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item, idx) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <motion.button
              key={item.id}
              type="button"
              initial={variant === 'mobile' ? { opacity: 0, x: -12 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={
                variant === 'mobile'
                  ? { delay: 0.05 + idx * 0.03, duration: 0.22, ease: [0.22, 1, 0.36, 1] }
                  : { duration: 0.15 }
              }
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => {
                setActiveTab(item.id);
                setMobileNavOpen(false);
              }}
              className={`relative w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${active
                ? 'text-[#25576b]'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
            >
              {active && (
                <motion.span
                  layoutId={`nav-active-bg-${variant}`}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 bg-white rounded-lg shadow-sm"
                />
              )}
              <span className="relative z-10 flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform duration-200 ${active ? 'text-[#25576b] scale-105' : 'text-white/65'
                    }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`relative z-10 text-xs font-mono-num tabular-nums font-semibold ${active ? 'text-[#25576b]' : 'text-sky-100'
                    }`}
                >
                  {item.badge}
                </span>
              )}
            </motion.button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/15 space-y-3 shrink-0">
        {authError && (
          <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-300/40 text-[11px] text-amber-100 leading-relaxed">
            {authError}
          </div>
        )}

        {isManagerSignedIn ? (
          <>
            <div className="p-2.5 rounded-lg bg-[#1c4454] border border-white/15 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-white/90">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-200 shrink-0" />
                <span>Chế độ hiển thị</span>
              </div>
              <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#153542] rounded-md">
                <button
                  type="button"
                  onClick={() => setPreviewAsEmployee(false)}
                  className={`relative py-1 text-xs font-medium rounded transition-colors ${!previewAsEmployee
                    ? 'text-[#25576b]'
                    : 'text-white/75 hover:text-white'
                    }`}
                >
                  {!previewAsEmployee && (
                    <motion.span
                      layoutId={`role-switch-${variant}`}
                      transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                      className="absolute inset-0 bg-white rounded shadow-sm"
                    />
                  )}
                  <span className="relative z-10">Quản lý</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAsEmployee(true)}
                  className={`relative py-1 text-xs font-medium rounded transition-colors ${previewAsEmployee
                    ? 'text-[#25576b]'
                    : 'text-white/75 hover:text-white'
                    }`}
                >
                  {previewAsEmployee && (
                    <motion.span
                      layoutId={`role-switch-${variant}`}
                      transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                      className="absolute inset-0 bg-white rounded shadow-sm"
                    />
                  )}
                  <span className="relative z-10">Nhân viên</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">
                  {user?.displayName || 'Quản lý'}
                </div>
                <div className="text-[11px] text-white/75 truncate">
                  {isSuperAdmin ? user?.email : 'Tài khoản Quản lý'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                title="Đăng xuất Quản lý"
                className="p-2 text-white/75 hover:text-red-200 hover:bg-red-500/20 rounded-lg transition-colors shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2.5">
            <div className="text-xs text-white/85 leading-relaxed">
              <div className="font-semibold text-white">Cổng Nhân viên nội bộ</div>
              <p className="text-[11px] text-white/70 mt-0.5">
                Xem đồng nghiệp đi làm hôm nay và lịch ngày nghỉ công ty.
              </p>
            </div>


            <button
              type="button"
              disabled={signingIn}
              onClick={() => void handleManagerSignIn()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-[#25576b] bg-white hover:bg-sky-50 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shadow-xs"
            >
              <LogIn className="w-3.5 h-3.5" />
              {signingIn
                ? 'Đang đăng nhập...'
                : user && managerCheckDone
                  ? 'Đổi tài khoản Quản lý'
                  : 'Đăng nhập bằng Google'}
            </button>

            {!isManagerSignedIn && (
              <form
                onSubmit={handleEmailPasswordSignIn}
                className="mt-3 space-y-2"
              >
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Username quản lý"
                  autoComplete="username"
                  minLength={4}
                  maxLength={30}
                  required
                  disabled={signingIn}
                  className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-60"
                />

                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Mật khẩu"
                  autoComplete="current-password"
                  required
                  disabled={signingIn}
                  className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-60"
                />

                <button
                  type="submit"
                  disabled={signingIn}
                  className="w-full px-3 py-2 text-xs font-semibold text-white bg-[#25576b] hover:bg-[#1d4657] disabled:opacity-60 rounded-lg transition-colors"
                >
                  {signingIn ? 'Đang đăng nhập...' : 'Đăng nhập bằng Username'}
                </button>
              </form>
            )}

            {user && managerCheckDone && (
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Đăng xuất ({isSuperAdmin ? user.email : 'Quản lý'})
              </button>
            )}

          </div>
        )}
      </div>
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-slate-50 text-slate-900 flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 bg-[#25576b] border-r border-[#1b4353] shrink-0 sticky top-0 h-screen">
          {renderSidebarContent('desktop')}
        </aside>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {mobileNavOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]"
                onClick={() => setMobileNavOpen(false)}
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 360, damping: 36, mass: 0.9 }}
                className="relative w-72 max-w-[85vw] bg-[#25576b] h-full border-r border-[#1b4353] z-10 shadow-xl"
              >
                {renderSidebarContent('mobile')}
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
            <div className="flex items-center gap-3 min-w-0">
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Mở menu"
              >
                <Menu className="w-5 h-5" />
              </motion.button>
              <AnimatePresence mode="wait">
                <motion.h1
                  key={activeTab}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="text-base sm:text-lg font-semibold text-slate-900 truncate"
                >
                  {pageTitleMap[activeTab]}
                </motion.h1>
              </AnimatePresence>
            </div>

            {isManagerView && (
              <div className="flex items-center gap-2 shrink-0">
                {activeTab === 'new-request' ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('dashboard')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Xem Bảng thống kê
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTab('new-request')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <FilePlus2 className="w-4 h-4" />
                    Đăng ký &amp; phân bổ nghỉ
                  </button>
                )}
              </div>
            )}
          </header>

          <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
            {!dataLoading && employees.length === 0 && !isManagerSignedIn && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span>
                  Hệ thống chưa có danh sách nhân viên. Quản lý cần đăng nhập một lần để khởi tạo dữ liệu nhân sự ban đầu.
                </span>
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={() => void handleManagerSignIn()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  {signingIn ? 'Đang đăng nhập...' : 'Đăng nhập Quản lý'}
                </button>
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeTab}-${isManagerView ? 'mgr' : 'emp'}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-6"
              >
                {isManagerView && activeTab === 'dashboard' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-white border border-slate-200 rounded-xl p-5">
                        <div className="text-xs font-medium text-slate-500">Tổng nhân viên</div>
                        <div className="text-2xl font-bold text-slate-900 font-mono-num tabular-nums mt-2">
                          {kpis.totalEmployees}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">Nhân sự · Quản lý</div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-5">
                        <div className="text-xs font-medium text-slate-500">Đang nghỉ hôm nay</div>
                        <div className="text-2xl font-bold text-teal-800 font-mono-num tabular-nums mt-2">
                          {kpis.onLeaveToday}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">Theo lịch nghỉ đã phân bổ</div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-5">
                        <div className="text-xs font-medium text-slate-500">Đã ghi nhận tháng này</div>
                        <div className="text-2xl font-bold text-emerald-700 font-mono-num tabular-nums mt-2">
                          {kpis.approvedThisMonth}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">Cập nhật tự động</div>
                      </div>
                    </div>

                    <LeaveStatsTable
                      stats={employeeStats}
                      isAdminView={isManagerView}
                      loading={dataLoading}
                      statsYear={statsYear}
                      availableYears={availableStatsYears}
                      onChangeYear={setStatsYear}
                      onNavigateEmployees={() => setActiveTab('employees')}
                    />

                    <MonthlyCalendar requests={requests} holidays={holidays} />
                  </>
                )}

                {activeTab === 'attendance' && (
                  <AttendanceToday
                    employees={employees}
                    holidays={holidays}
                    dailyOffEmployeeIds={dailyOffEmployeeIds}
                    managerRequests={requests}
                    isManagerView={isManagerView}
                    loading={dataLoading}
                  />
                )}

                {isManagerView && activeTab === 'calendar' && (
                  <MonthlyCalendar requests={requests} holidays={holidays} />
                )}

                {isManagerView && activeTab === 'new-request' && user && (
                  <LeaveRequestForm
                    employeeStats={employeeStats}
                    holidays={holidays}
                    currentUserUid={user.uid}
                    adminLabel={user.displayName || user.email || 'Quản lý'}
                    onNavigateDashboard={() => setActiveTab('dashboard')}
                    onNavigateCalendar={() => setActiveTab('calendar')}
                  />
                )}

                {activeTab === 'employee-request' && (
                  <EmployeeLeaveRequestForm
                    employees={employees}
                    holidays={holidays}
                    isManagerSession={isManagerSignedIn}
                  />
                )}

                {activeTab === 'employees' && isManagerView && (
                  <EmployeeManager
                    employees={employeeStats}
                    managers={managers}
                    isSuperAdmin={isSuperAdmin}
                    currentAdminEmail={user?.email || ADMIN_EMAIL}
                  />
                )}

                {activeTab === 'history' && isManagerView && (
                  <ApprovalHistory
                    requests={requests}
                    contacts={contacts}
                    adminLabel={user?.displayName || user?.email || 'Quản lý'}
                  />
                )}

                {activeTab === 'holidays' && (
                  <HolidayManager
                    holidays={holidays}
                    employees={employees}
                    managerRequests={isManagerView ? requests : undefined}
                    isAdminView={isManagerView}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
