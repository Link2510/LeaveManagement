import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
} from 'firebase/auth';
import {
  ADMIN_EMAIL,
  db,
  ensureEmployeeAnonymousSession,
  handleFirestoreError,
  managerCreationAuth,
  OperationType,
} from '../firebase';
import {
  FIXED_PERSONAL_LEAVE_DAYS,
  INITIAL_EMPLOYEES,
  INITIAL_HOLIDAYS,
  INITIAL_REQUESTS,
  type AppNotification,
  type CompanyHoliday,
  type Department,
  type Employee,
  type EmployeeQuota,
  type HalfDayInfo,
  type HalfDayOffEntry,
  type HalfDaySession,
  type HolidayCategory,
  type LeaveAllocation,
  type LeaveRequestItem,
  type LeaveSummary,
  type ManagerAccount,
  type MonthlyOffEntry,
} from '../types/leave';
import {
  getRequestHalfDayMap,
  getTodayKey,
  isWorkingDay,
  parseDateKey,
  toDateKey,
} from '../utils/dateUtils';

function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

function timestampToMs(val: unknown): number {
  if (val instanceof Timestamp) {
    return val.toMillis();
  }
  if (typeof val === 'object' && val !== null && 'seconds' in val) {
    const sec = (val as { seconds?: number }).seconds;
    if (typeof sec === 'number') return sec * 1000;
  }
  return Date.now();
}

function parseHalfDay(value: unknown): HalfDayInfo | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const date = String((value as { date?: unknown }).date || '');
  const session = (value as { session?: unknown }).session;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  if (session !== 'Sáng' && session !== 'Chiều') return undefined;
  return { date, session };
}

function cleanHalfDay(value: HalfDayInfo | undefined): HalfDayInfo | undefined {
  const parsed = parseHalfDay(value);
  return parsed ? { date: parsed.date, session: parsed.session } : undefined;
}


const MANAGER_LOGIN_DOMAIN = 'accounts.leave-management.invalid';

function getManagerLoginEmail(username: string): string {
  const cleanUsername = username.trim().toLowerCase();

  if (!/^[a-z0-9._]{4,30}$/.test(cleanUsername)) {
    throw new Error(
      'Username phải có 4–30 ký tự, chỉ gồm chữ thường, số, dấu chấm và dấu gạch dưới.',
    );
  }

  return `${cleanUsername}@${MANAGER_LOGIN_DOMAIN}`;
}

export function subscribeIsManager(
  uid: string | null | undefined,
  isSuperAdmin: boolean,
  onResult: (isMgr: boolean) => void,
): Unsubscribe {
  if (isSuperAdmin) {
    onResult(true);
    return () => {};
  }

  if (!uid) {
    onResult(false);
    return () => {};
  }

  const mgrDocRef = doc(db, 'managers', uid);

  return onSnapshot(
    mgrDocRef,
    (snap) => onResult(snap.exists()),
    () => onResult(false),
  );
}

export function subscribeManagers(
  isMgr: boolean,
  onData: (managers: ManagerAccount[]) => void,
): Unsubscribe {
  if (!isMgr) {
    onData([]);
    return () => {};
  }

  const path = 'managers';
  const q = query(collection(db, path), where('role', '==', 'manager'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ManagerAccount[] = snapshot.docs.map((d) => {
        const data = d.data();

        return {
          id: d.id,
          username: String(data.username || ''),
          name: String(data.name || ''),
          role: 'manager',
          addedBy: String(data.addedBy || ''),
          createdAtMs: timestampToMs(data.createdAt),
        };
      });

      items.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function addManagerAccount(
  uid: string,
  username: string,
  name: string,
  addedBy: string,
): Promise<void> {
  const cleanUsername = username.trim().toLowerCase();
  const cleanName = clampString(name, 100);

  if (!/^[a-z0-9._]{4,30}$/.test(cleanUsername)) {
    throw new Error('Username không hợp lệ.');
  }

  try {
    await setDoc(doc(db, 'managers', uid), {
      username: cleanUsername,
      name: cleanName,
      role: 'manager',
      addedBy: addedBy.trim().toLowerCase().slice(0, 160),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `managers/${uid}`);
    throw error;
  }
}

export async function createManagerAccountWithPassword(
  username: string,
  name: string,
  password: string,
  addedBy: string,
): Promise<void> {
  const cleanUsername = username.trim().toLowerCase();
  const loginEmail = getManagerLoginEmail(cleanUsername);

  let createdUser: import('firebase/auth').User | null = null;

  try {
    if (managerCreationAuth.currentUser) {
      await signOut(managerCreationAuth);
    }

    const credential = await createUserWithEmailAndPassword(
      managerCreationAuth,
      loginEmail,
      password,
    );

    createdUser = credential.user;

    // Ghi quyền Admin bằng phiên Super Admin chính.
    await addManagerAccount(
      createdUser.uid,
      cleanUsername,
      name,
      addedBy,
    );
  } catch (error) {
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch (cleanupError) {
        console.error(
          'Không thể xóa tài khoản Authentication sau khi tạo thất bại:',
          cleanupError,
        );

        throw new Error(
          'Tạo quyền Admin thất bại và không thể tự động hoàn tác tài khoản Authentication. Vui lòng kiểm tra Firebase Console.',
        );
      }
    }

    throw error;
  } finally {
    if (managerCreationAuth.currentUser) {
      try {
        await signOut(managerCreationAuth);
      } catch (signOutError) {
        console.error(
          'Không thể đăng xuất phiên Auth phụ:',
          signOutError,
        );
      }
    }
  }
}

export async function removeManagerAccount(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'managers', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `managers/${uid}`);
    throw error;
  }
}

export async function seedInitialDataIfNeeded(
  isManager: boolean,
  managerUid: string
): Promise<void> {
  if (!isManager || !managerUid) return;

  let stage = 'Bắt đầu';

  try {
    // 1. Seed Employees + Manager Quotas if employees collection is empty
    stage = 'Đọc danh sách nhân viên';
    console.log('[SEED TRACE] Bắt đầu đọc nhân viên');
    const empSnap = await getDocs(
      query(
        collection(db, 'employees'),
        where('department', 'in', ['Quản lý', 'Nhân sự'])
      )
    );
    console.log('[SEED TRACE] Đọc nhân viên xong:', empSnap.size);

    if (empSnap.empty) {
      const batch = writeBatch(db);

      for (const emp of INITIAL_EMPLOYEES) {
        const empRef = doc(db, 'employees', emp.id);

        batch.set(empRef, {
          name: emp.name,
          department: emp.department,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const quotaRef = doc(db, 'employeeQuotas', emp.id);

        batch.set(quotaRef, {
          employeeId: emp.id,
          annualLeaveInitial: emp.annualLeaveInitial,
          personalLeaveInitial: FIXED_PERSONAL_LEAVE_DAYS,
          updatedAt: serverTimestamp(),
        });
      }

      stage = 'Ghi nhân viên và hạn mức phép';
      await batch.commit();
    }

    // 2. Seed Company Holidays if empty
    stage = 'Đọc ngày nghỉ công ty';
    console.log('[SEED TRACE] Bắt đầu đọc ngày nghỉ');
    const holSnap = await getDocs(
      query(
        collection(db, 'companyHolidays'),
        where('year', '>=', 2020)
      )
    );
    console.log('[SEED TRACE] Đọc ngày nghỉ xong:', holSnap.size);

    if (holSnap.empty) {
      const batch = writeBatch(db);

      for (const hol of INITIAL_HOLIDAYS) {
        const holRef = doc(db, 'companyHolidays', hol.id);

        batch.set(holRef, {
          date: hol.date,
          title: hol.title,
          category: hol.category,
          year: hol.year,
          note: hol.note,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      stage = 'Ghi ngày nghỉ công ty';
      await batch.commit();
    }

    // Không tạo đơn nghỉ phép mẫu.
    // Đơn nghỉ phép sẽ được tạo bởi người dùng trên ứng dụng.

  } catch (error) {
    console.error('[SEED DEBUG] Thất bại tại:', stage, error);
    handleFirestoreError(
      error,
      OperationType.WRITE,
      'seedInitialDataIfNeeded'
    );
  }
}


export function subscribeEmployees(onData: (employees: Employee[]) => void): Unsubscribe {
  const path = 'employees';
  const q = query(collection(db, path), where('department', 'in', ['Quản lý', 'Nhân sự']));
  return onSnapshot(
    q,
    (snapshot) => {
        console.log('[EMPLOYEE TRACE] Snapshot nhận được:', snapshot.size);
      const items: Employee[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name || ''),
          department: (data.department === 'Quản lý' ? 'Quản lý' : 'Nhân sự') as Department,
          avatarPreset:
            typeof data.avatarPreset === 'string' && data.avatarPreset.trim()
              ? data.avatarPreset.trim()
              : undefined,
          avatarPhoto:
            typeof data.avatarPhoto === 'string' && data.avatarPhoto.trim()
              ? data.avatarPhoto.trim()
              : undefined,
        };
      });
      items.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      onData(items);
    },
    (error) => {
      console.error('[EMPLOYEE TRACE] Lỗi listener:', error);
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export function subscribeEmployeeQuotas(onData: (quotas: Record<string, EmployeeQuota>) => void): Unsubscribe {
  const path = 'employeeQuotas';
  const q = query(collection(db, path), where('personalLeaveInitial', '==', FIXED_PERSONAL_LEAVE_DAYS));
  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, EmployeeQuota> = {};
      for (const d of snapshot.docs) {
        const data = d.data();
        map[d.id] = {
          employeeId: String(data.employeeId || d.id),
          annualLeaveInitial: Number(data.annualLeaveInitial ?? 0),
          personalLeaveInitial: Number(data.personalLeaveInitial ?? FIXED_PERSONAL_LEAVE_DAYS),
        };
      }
      onData(map);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function addEmployeeWithQuota(
  name: string,
  department: Department,
  annualLeaveInitial: number,
  avatarPreset?: string,
  avatarPhoto?: string,
): Promise<string> {
  const cleanName = clampString(name, 100);
  const clampedAnnual = Math.max(0, Math.min(60, Number(annualLeaveInitial) || 0));
  const cleanAvatar = avatarPreset ? clampString(avatarPreset, 32) : '';
  const cleanPhoto = avatarPhoto && avatarPhoto.length <= 35000 ? avatarPhoto.trim() : '';
  const empId = generateSafeId('emp');

  try {
    const batch = writeBatch(db);
    const empPayload: Record<string, unknown> = {
      name: cleanName,
      department,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanAvatar) {
      empPayload.avatarPreset = cleanAvatar;
    }
    if (cleanPhoto) {
      empPayload.avatarPhoto = cleanPhoto;
    }
    batch.set(doc(db, 'employees', empId), empPayload);
    batch.set(doc(db, 'employeeQuotas', empId), {
      employeeId: empId,
      annualLeaveInitial: clampedAnnual,
      personalLeaveInitial: FIXED_PERSONAL_LEAVE_DAYS,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return empId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `employees/${empId}`);
  }
}

export async function updateEmployeeWithQuota(
  employeeId: string,
  name: string,
  department: Department,
  annualLeaveInitial: number,
  avatarPreset?: string,
  avatarPhoto?: string,
): Promise<void> {
  const cleanName = clampString(name, 100);
  const clampedAnnual = Math.max(0, Math.min(60, Number(annualLeaveInitial) || 0));
  const cleanAvatar = avatarPreset !== undefined ? clampString(avatarPreset, 32) : undefined;
  const cleanPhoto =
    avatarPhoto !== undefined
      ? avatarPhoto.trim().slice(0, 35000)
      : undefined;

  try {
    const batch = writeBatch(db);
    const empUpdate: Record<string, unknown> = {
      name: cleanName,
      department,
      updatedAt: serverTimestamp(),
    };
    if (cleanAvatar !== undefined) {
      empUpdate.avatarPreset = cleanAvatar;
    }
    if (cleanPhoto !== undefined) {
      empUpdate.avatarPhoto = cleanPhoto;
    }
    batch.update(doc(db, 'employees', employeeId), empUpdate);
    batch.update(doc(db, 'employeeQuotas', employeeId), {
      annualLeaveInitial: clampedAnnual,
      personalLeaveInitial: FIXED_PERSONAL_LEAVE_DAYS,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `employees/${employeeId}`);
  }
}

export async function deleteEmployeeWithQuota(employeeId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'employees', employeeId));
    batch.delete(doc(db, 'employeeQuotas', employeeId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `employees/${employeeId}`);
  }
}

export function subscribeHolidays(onData: (holidays: CompanyHoliday[]) => void): Unsubscribe {
  const path = 'companyHolidays';
  const q = query(collection(db, path), where('year', '>=', 2020));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: CompanyHoliday[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          date: String(data.date || ''),
          title: String(data.title || ''),
          category: data.category as HolidayCategory,
          year: Number(data.year || 2026),
          note: String(data.note || ''),
        };
      });
      items.sort((a, b) => a.date.localeCompare(b.date));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function addHoliday(input: Omit<CompanyHoliday, 'id'>): Promise<string> {
  const holId = generateSafeId('hol');
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'companyHolidays', holId), {
      date: clampString(input.date, 10),
      title: clampString(input.title, 120),
      category: input.category,
      year: Number(input.year),
      note: clampString(input.note || '', 300),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return holId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `companyHolidays/${holId}`);
  }
}

export async function updateHoliday(holiday: CompanyHoliday): Promise<void> {
  try {
    await updateDoc(doc(db, 'companyHolidays', holiday.id), {
      date: clampString(holiday.date, 10),
      title: clampString(holiday.title, 120),
      category: holiday.category,
      year: Number(holiday.year),
      note: clampString(holiday.note || '', 300),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `companyHolidays/${holiday.id}`);
  }
}

export async function deleteHoliday(holidayId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'companyHolidays', holidayId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `companyHolidays/${holidayId}`);
  }
}

function mapRequestDoc(id: string, data: Record<string, unknown>): LeaveRequestItem {
  return {
    id,
    employeeId: String(data.employeeId || ''),
    employeeName: String(data.employeeName || ''),
    department: (data.department === 'Quản lý' ? 'Quản lý' : 'Nhân sự') as Department,
    startDate: String(data.startDate || ''),
    endDate: String(data.endDate || ''),
    workingDays: Number(data.workingDays || 0),
    reason: String(data.reason || ''),
    note: String(data.note || ''),
    status: data.status as LeaveRequestItem['status'],
    allocations: Array.isArray(data.allocations)
      ? (data.allocations as LeaveAllocation[]).map((a) => ({
          type: a.type,
          days: Number(a.days || 0),
        }))
      : [],
    halfDay: parseHalfDay(data.halfDay),
    dates: Array.isArray(data.dates)
      ? (data.dates as unknown[])
          .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
          .slice(0, 31)
      : undefined,
    halfDays: Array.isArray(data.halfDays)
      ? (data.halfDays as unknown[])
          .map((item) => parseHalfDay(item))
          .filter((item): item is HalfDayInfo => Boolean(item))
          .slice(0, 31)
      : undefined,
    hasHospitalCert: Boolean(data.hasHospitalCert),
    hospitalCertPending: Boolean(data.hospitalCertPending),
    attachmentName: String(data.attachmentName || ''),
    attachmentUrl: typeof data.attachmentUrl === 'string' && data.attachmentUrl ? data.attachmentUrl : undefined,
    rejectionReason: typeof data.rejectionReason === 'string' ? data.rejectionReason : undefined,
    processedBy: typeof data.processedBy === 'string' ? data.processedBy : undefined,
    processedAt: typeof data.processedAt === 'string' ? data.processedAt : undefined,
    submitterUid: String(data.submitterUid || ''),
    createdAtMs: timestampToMs(data.createdAt),
  };
}

export function getOrCreateLocalClientId(): string {
  const key = 'lm_employee_client_id';
  try {
    const existing = window.localStorage.getItem(key);
    if (existing && /^[a-zA-Z0-9_-]{4,64}$/.test(existing)) {
      return existing;
    }
    const created = `emp_client_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return 'emp_client_local';
  }
}

export function subscribeLeaveRequests(
  isManager: boolean,
  onData: (requests: LeaveRequestItem[]) => void,
  onAdded?: (added: LeaveRequestItem[], all: LeaveRequestItem[]) => void,
): Unsubscribe {
  if (!isManager) {
    onData([]);
    return () => {};
  }

  const path = 'leaveRequests';
  let firstSnapshot = true;
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs.map((d) => mapRequestDoc(d.id, d.data()));
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);

      if (!onAdded) return;
      // Bỏ qua snapshot đầu tiên (toàn bộ dữ liệu cũ) để không bắn thông báo hàng loạt.
      if (firstSnapshot) {
        firstSnapshot = false;
        return;
      }
      const addedIds = new Set(
        snapshot
          .docChanges()
          .filter((change) => change.type === 'added')
          .map((change) => change.doc.id),
      );
      if (addedIds.size === 0) return;
      const added = items.filter(
        (item) => addedIds.has(item.id) && item.status === 'Đang chờ duyệt',
      );
      if (added.length > 0) {
        onAdded(added, items);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function createManagerAllocatedLeaveRequest(input: {
  employeeId: string;
  employeeName: string;
  department: Department;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
  note: string;
  allocations: LeaveAllocation[];
  halfDay?: HalfDayInfo;
  hasHospitalCert: boolean;
  hospitalCertPending?: boolean;
  attachmentName: string;
  attachmentUrl?: string;
  status: 'Đã duyệt' | 'Đang chờ duyệt';
  managerUid: string;
  managerLabel: string;
}): Promise<string> {
  const reqId = generateSafeId('req');
  const notifId = generateSafeId('notif');
  const cleanName = clampString(input.employeeName, 100);
  const sanitizedAllocations = input.allocations
    .filter((a) => a.days > 0)
    .slice(0, 6)
    .map((a) => ({ type: a.type, days: Number(a.days) }));
  const cleanAttachmentUrl = input.attachmentUrl ? clampString(input.attachmentUrl, 500) : '';
  const cleanManager = clampString(input.managerLabel || 'Quản lý', 120);
  const nowIso = new Date().toISOString();

  try {
    const batch = writeBatch(db);
    const reqPayload: Record<string, unknown> = {
      employeeId: clampString(input.employeeId, 128),
      employeeName: cleanName,
      department: input.department,
      startDate: clampString(input.startDate, 10),
      endDate: clampString(input.endDate, 10),
      workingDays: Number(input.workingDays),
      reason: clampString(input.reason, 500),
      note: clampString(input.note || '', 500),
      status: input.status,
      allocations: sanitizedAllocations,
      ...(cleanHalfDay(input.halfDay) ? { halfDay: cleanHalfDay(input.halfDay) } : {}),
      hasHospitalCert: Boolean(input.hasHospitalCert),
      hospitalCertPending: Boolean(input.hospitalCertPending),
      attachmentName: clampString(input.attachmentName || '', 180),
      processedBy: cleanManager,
      processedAt: nowIso,
      submitterUid: clampString(input.managerUid, 128),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanAttachmentUrl) {
      reqPayload.attachmentUrl = cleanAttachmentUrl;
    }
    batch.set(doc(db, 'leaveRequests', reqId), reqPayload);

    if (input.status === 'Đang chờ duyệt') {
      batch.set(doc(db, 'notifications', notifId), {
        recipientType: 'admin',
        recipientUid: 'admin',
        requestId: reqId,
        title: `Đơn chờ duyệt mới: ${clampString(input.employeeName, 80)}`,
        message: `${cleanManager} đã tạo đơn nghỉ ${input.workingDays} ngày (${input.startDate} → ${input.endDate}) cho ${clampString(input.employeeName, 80)} ở trạng thái chờ duyệt.`,
        isRead: false,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return reqId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `leaveRequests/${reqId}`);
  }
}

export interface EmployeeLeaveSubmissionInput {
  employeeId: string;
  employeeName: string;
  department: Department;
  startDate: string;
  endDate: string;
  workingDays: number;
  dates: string[];
  halfDays?: HalfDayInfo[];
  reason: string;
  note: string;
  hasHospitalCert: boolean;
  attachmentUrl?: string;
}

/**
 * Nhân viên tự gửi đơn nghỉ phép mà không cần tài khoản Quản lý.
 * - Dùng Firebase Anonymous Auth để có `uid` gắn với đơn (bắt buộc theo firestore.rules).
 * - Chỉ ghi đơn chờ duyệt + thông báo trong app cho quản lý.
 * - Không thu thập email, không gửi email; loại phép do quản lý phân bổ khi duyệt.
 */
export async function submitEmployeeLeaveRequest(
  input: EmployeeLeaveSubmissionInput,
): Promise<{ requestId: string }> {
  const employeeName = clampString(input.employeeName, 100);
  const employeeId = clampString(input.employeeId, 128);
  if (!employeeId || employeeName.trim().length < 2) {
    throw new Error('Vui lòng chọn họ tên của bạn trong danh sách nhân sự.');
  }

  const workingDays = Math.max(0.5, Math.min(365, Number(input.workingDays) || 0));
  const cleanDates = Array.from(
    new Set(
      (input.dates || []).filter(
        (d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d),
      ),
    ),
  )
    .sort()
    .slice(0, 31);
  if (cleanDates.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một ngày nghỉ.');
  }
  const startDate = cleanDates[0];
  const endDate = cleanDates[cleanDates.length - 1];
  const cleanHalfDays: HalfDayInfo[] = (input.halfDays || [])
    .map((item) => cleanHalfDay(item))
    .filter((item): item is HalfDayInfo => Boolean(item) && cleanDates.includes(item!.date))
    .slice(0, 31);
  const cleanReason = clampString(input.reason, 500);
  if (cleanReason.length < 2) {
    throw new Error('Vui lòng nhập lý do nghỉ phép (tối thiểu 2 ký tự).');
  }

  let uid = '';
  try {
    const account = await ensureEmployeeAnonymousSession();
    uid = account.uid;
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'auth/operation-not-allowed') {
      throw new Error(
        'Chưa bật đăng nhập ẩn danh (Anonymous) trong Firebase Authentication. Quản trị viên cần bật để nhân viên gửi đơn không cần đăng nhập.',
      );
    }
    throw new Error(
      'Không thể tạo phiên gửi đơn. Vui lòng kiểm tra kết nối mạng và thử lại.',
    );
  }

  const reqId = generateSafeId('req');
  const notifId = generateSafeId('notif');
  const cleanAttachmentUrl = input.attachmentUrl
    ? clampString(input.attachmentUrl, 500)
    : '';
  const cleanNote = clampString(input.note || '', 500);
  const hasHospitalCert = Boolean(input.hasHospitalCert);

  try {
    const batch = writeBatch(db);
    const reqPayload: Record<string, unknown> = {
      employeeId,
      employeeName,
      department: input.department,
      startDate,
      endDate,
      dates: cleanDates,
      workingDays,
      reason: cleanReason,
      note: cleanNote,
      status: 'Đang chờ duyệt',
      allocations: [],
      ...(cleanHalfDays.length > 0 ? { halfDays: cleanHalfDays } : {}),
      hasHospitalCert,
      hospitalCertPending: false,
      attachmentName: '',
      submitterUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanAttachmentUrl) {
      reqPayload.attachmentUrl = cleanAttachmentUrl;
    }
    batch.set(doc(db, 'leaveRequests', reqId), reqPayload);

    batch.set(doc(db, 'notifications', notifId), {
      recipientType: 'admin',
      recipientUid: 'admin',
      requestId: reqId,
      title: `Đơn nghỉ mới chờ duyệt: ${employeeName}`,
      message: `${employeeName} (${input.department}) đã tự gửi đơn nghỉ ${workingDays} ngày vào ${cleanDates.length} ngày: ${cleanDates.join(', ')}.`,
      isRead: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return { requestId: reqId };
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    const rawMessage = error instanceof Error ? error.message : String(error);
    if (
      code === 'permission-denied' ||
      rawMessage.includes('Missing or insufficient permissions')
    ) {
      throw new Error(
        'Máy chủ chưa cho phép nhân viên tự gửi đơn. Quản trị viên cần deploy firestore.rules mới và bật đăng nhập ẩn danh (Anonymous).',
      );
    }
    handleFirestoreError(error, OperationType.CREATE, `leaveRequests/${reqId}`);
  }
}


export async function receiveLeaveRequest(
  request: LeaveRequestItem,
  managerLabel: string,
): Promise<void> {
  const notifId = generateSafeId('notif');
  const nowIso = new Date().toISOString();
  const cleanManager = clampString(managerLabel, 120);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'leaveRequests', request.id), {
      status: 'Đang chờ duyệt',
      processedBy: cleanManager,
      processedAt: nowIso,
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'notifications', notifId), {
      recipientType: 'employee',
      recipientUid: clampString(request.submitterUid, 128),
      requestId: request.id,
      title: `Quản lý đã tiếp nhận đơn của ${clampString(request.employeeName, 80)}`,
      message: `Đơn nghỉ từ ${request.startDate} đến ${request.endDate} đã được tiếp nhận và đang chờ duyệt.`,
      isRead: false,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `leaveRequests/${request.id}`);
  }
}

export async function approveLeaveRequest(
  request: LeaveRequestItem,
  allocations: LeaveAllocation[],
  hasHospitalCert: boolean,
  managerLabel: string,
  hospitalCertPending = false,
  halfDay?: HalfDayInfo,
  halfDays?: HalfDayInfo[],
): Promise<void> {
  const notifId = generateSafeId('notif');
  const nowIso = new Date().toISOString();
  const cleanManager = clampString(managerLabel, 120);
  const cleanAllocations = allocations
    .filter((a) => a.days > 0)
    .slice(0, 6)
    .map((a) => ({ type: a.type, days: Number(a.days) }));

  const allocSummary = cleanAllocations.map((a) => `${a.type}: ${a.days} ngày`).join(', ');

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'leaveRequests', request.id), {
      status: 'Đã duyệt',
      allocations: cleanAllocations,
      ...(cleanHalfDay(halfDay ?? request.halfDay)
        ? { halfDay: cleanHalfDay(halfDay ?? request.halfDay) }
        : {}),
      ...(halfDays
        ? {
            halfDays: halfDays
              .map((item) => cleanHalfDay(item))
              .filter((item): item is HalfDayInfo => Boolean(item))
              .slice(0, 31),
          }
        : {}),
      hasHospitalCert: Boolean(hasHospitalCert),
      hospitalCertPending: Boolean(hospitalCertPending),
      processedBy: cleanManager,
      processedAt: nowIso,
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'notifications', notifId), {
      recipientType: 'employee',
      recipientUid: clampString(request.submitterUid, 128),
      requestId: request.id,
      title: `Đơn nghỉ phép đã được duyệt: ${clampString(request.employeeName, 80)}`,
      message: `Đơn nghỉ ${request.workingDays} ngày (${request.startDate} → ${request.endDate}) đã được duyệt. Phân bổ: ${clampString(allocSummary, 240)}.`,
      isRead: false,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `leaveRequests/${request.id}`);
  }
}

export async function markHospitalCertReceived(
  request: LeaveRequestItem,
  managerLabel: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const cleanManager = clampString(managerLabel, 120);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'leaveRequests', request.id), {
      hasHospitalCert: true,
      hospitalCertPending: false,
      processedBy: cleanManager,
      processedAt: nowIso,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `leaveRequests/${request.id}`);
  }
}

export async function rejectLeaveRequest(
  request: LeaveRequestItem,
  rejectionReason: string,
  managerLabel: string,
): Promise<void> {
  const notifId = generateSafeId('notif');
  const nowIso = new Date().toISOString();
  const cleanReason = clampString(rejectionReason, 500);
  const cleanManager = clampString(managerLabel, 120);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'leaveRequests', request.id), {
      status: 'Từ chối',
      rejectionReason: cleanReason,
      processedBy: cleanManager,
      processedAt: nowIso,
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'notifications', notifId), {
      recipientType: 'employee',
      recipientUid: clampString(request.submitterUid, 128),
      requestId: request.id,
      title: `Đơn nghỉ phép bị từ chối: ${clampString(request.employeeName, 80)}`,
      message: `Đơn nghỉ (${request.startDate} → ${request.endDate}) không được duyệt. Lý do: ${clampString(cleanReason, 260)}`,
      isRead: false,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `leaveRequests/${request.id}`);
  }
}

export function subscribeNotifications(
  isManager: boolean,
  onData: (notifications: AppNotification[]) => void,
): Unsubscribe {
  if (!isManager) {
    onData([]);
    return () => {};
  }

  const path = 'notifications';
  const q = query(collection(db, path), where('recipientType', '==', 'admin'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: AppNotification[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          recipientType: data.recipientType === 'admin' ? 'admin' : 'employee',
          recipientUid: String(data.recipientUid || ''),
          requestId: String(data.requestId || ''),
          title: String(data.title || ''),
          message: String(data.message || ''),
          isRead: Boolean(data.isRead),
          createdAtMs: timestampToMs(data.createdAt),
        };
      });
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsRead(notifications: AppNotification[]): Promise<void> {
  const unread = notifications.filter((n) => !n.isRead);
  if (unread.length === 0) return;

  try {
    const batch = writeBatch(db);
    for (const n of unread.slice(0, 50)) {
      batch.update(doc(db, 'notifications', n.id), { isRead: true });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications/markAll');
  }
}

export function subscribeDailyOffStatus(
  dateKey: string,
  onData: (offEmployeeIds: string[], halfDayOff: HalfDayOffEntry[]) => void,
  onReady?: () => void,
): Unsubscribe {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    onData([], []);
    onReady?.();
    return () => {};
  }

  return onSnapshot(
    doc(db, 'dailyOffStatus', dateKey),
    (snap) => {
      if (!snap.exists()) {
        onData([], []);
        onReady?.();
        return;
      }
      const data = snap.data();
      const rawIds = Array.isArray(data.offEmployeeIds) ? data.offEmployeeIds : [];
      const cleanIds = rawIds
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, 100);
      const rawHalf = Array.isArray(data.halfDayOff) ? data.halfDayOff : [];
      const cleanHalf: HalfDayOffEntry[] = [];
      for (const item of rawHalf) {
        const parsed = parseHalfDay(item);
        const employeeId =
          typeof (item as { employeeId?: unknown })?.employeeId === 'string'
            ? String((item as { employeeId: string }).employeeId).trim()
            : '';
        if (parsed && employeeId) {
          cleanHalf.push({ employeeId, session: parsed.session });
        }
      }
      onData(cleanIds, cleanHalf.slice(0, 100));
      onReady?.();
    },
    () => {
      onData([], []);
      onReady?.();
    },
  );
}

export async function syncDailyOffStatusForDate(
  dateKey: string,
  offEmployeeIds: string[],
  halfDayOff: HalfDayOffEntry[] = [],
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
  const cleanIds = Array.from(
    new Set(
      offEmployeeIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id.length <= 128),
    ),
  )
    .sort()
    .slice(0, 100);

  const cleanHalf = halfDayOff
    .filter(
      (item) =>
        typeof item.employeeId === 'string' &&
        item.employeeId.trim().length > 0 &&
        item.employeeId.length <= 128 &&
        (item.session === 'Sáng' || item.session === 'Chiều') &&
        !cleanIds.includes(item.employeeId),
    )
    .slice(0, 100)
    .map((item) => ({ employeeId: item.employeeId.trim(), session: item.session }));

  try {
    await setDoc(doc(db, 'dailyOffStatus', dateKey), {
      date: dateKey,
      offEmployeeIds: cleanIds,
      halfDayOff: cleanHalf,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking background sync when manager updates leave data
  }
}

export function subscribeMonthlyOffStatus(
  monthKey: string,
  onData: (entries: MonthlyOffEntry[]) => void,
  onReady?: () => void,
): Unsubscribe {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    onData([]);
    onReady?.();
    return () => {};
  }

  return onSnapshot(
    doc(db, 'monthlyOffStatus', monthKey),
    (snap) => {
      if (!snap.exists()) {
        onData([]);
        onReady?.();
        return;
      }
      const data = snap.data();
      const rawEntries = Array.isArray(data.entries) ? data.entries : [];
      const cleanEntries: MonthlyOffEntry[] = [];
      for (const item of rawEntries) {
        if (typeof item !== 'object' || item === null) continue;
        const empId =
          typeof (item as { employeeId?: unknown }).employeeId === 'string'
            ? (item as { employeeId: string }).employeeId.trim()
            : '';
        const rawDates = Array.isArray((item as { dates?: unknown }).dates)
          ? ((item as { dates: unknown[] }).dates as unknown[])
          : [];
        const cleanDates = Array.from(
          new Set(
            rawDates.filter(
              (d): d is string =>
                typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d),
            ),
          ),
        )
          .sort()
          .slice(0, 31);
        if (empId && cleanDates.length > 0) {
          cleanEntries.push({ employeeId: empId, dates: cleanDates });
        }
      }
      onData(cleanEntries.slice(0, 100));
      onReady?.();
    },
    () => {
      onData([]);
      onReady?.();
    },
  );
}

export async function syncAllDailyOffStatuses(
  requests: LeaveRequestItem[],
  holidays: CompanyHoliday[],
): Promise<void> {
  const todayKey = getTodayKey();
  const todayMonthKey = todayKey.slice(0, 7);
  const holidayMap = new Map<string, CompanyHoliday>();
  for (const h of holidays) {
    holidayMap.set(h.date, h);
  }

  const desiredByDate = new Map<string, Set<string>>();
  desiredByDate.set(todayKey, new Set<string>());
  const desiredHalfByDate = new Map<string, Map<string, HalfDaySession>>();

  const desiredByMonth = new Map<string, Map<string, Set<string>>>();
  desiredByMonth.set(todayMonthKey, new Map<string, Set<string>>());

  for (const req of requests) {
    if (req.status !== 'Đã duyệt') continue;
    const empId = req.employeeId.trim();
    if (!empId || empId.length > 128) continue;

    const halfMapReq = getRequestHalfDayMap(req);
    const dateKeys: string[] = [];
    if (Array.isArray(req.dates) && req.dates.length > 0) {
      dateKeys.push(...Array.from(new Set(req.dates)).sort());
    } else {
      const start = parseDateKey(req.startDate);
      const end = parseDateKey(req.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) continue;
      const cursor = new Date(start);
      let safety = 0;
      while (cursor <= end && safety < 400) {
        safety += 1;
        dateKeys.push(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    for (const dateKey of dateKeys) {
      if (!isWorkingDay(dateKey, holidayMap)) continue;
      if (!desiredByDate.has(dateKey)) desiredByDate.set(dateKey, new Set<string>());
      const halfSession = halfMapReq[dateKey];
      if (halfSession) {
        let halfMap = desiredHalfByDate.get(dateKey);
        if (!halfMap) {
          halfMap = new Map<string, HalfDaySession>();
          desiredHalfByDate.set(dateKey, halfMap);
        }
        halfMap.set(empId, halfSession);
      } else {
        let daySet = desiredByDate.get(dateKey);
        if (!daySet) {
          daySet = new Set<string>();
          desiredByDate.set(dateKey, daySet);
        }
        daySet.add(empId);
      }

      const monthKey = dateKey.slice(0, 7);
      let monthMap = desiredByMonth.get(monthKey);
      if (!monthMap) {
        monthMap = new Map<string, Set<string>>();
        desiredByMonth.set(monthKey, monthMap);
      }
      let empDates = monthMap.get(empId);
      if (!empDates) {
        empDates = new Set<string>();
        monthMap.set(empId, empDates);
      }
      empDates.add(dateKey);
    }
  }

  // Nếu nhân viên có đơn nghỉ cả ngày trong cùng ngày, đơn nửa ngày không còn ý nghĩa.
  for (const [dateKey, halfMap] of desiredHalfByDate.entries()) {
    const fullIds = desiredByDate.get(dateKey);
    if (fullIds) {
      for (const empId of fullIds) halfMap.delete(empId);
    }
    if (halfMap.size === 0) desiredHalfByDate.delete(dateKey);
  }

  try {
    const [existingDailySnap, existingMonthlySnap] = await Promise.all([
      getDocs(collection(db, 'dailyOffStatus')),
      getDocs(collection(db, 'monthlyOffStatus')),
    ]);

    const existingByDate = new Map<string, { ids: string[]; halfJson: string }>();
    for (const d of existingDailySnap.docs) {
      const data = d.data();
      const rawIds = Array.isArray(data.offEmployeeIds) ? data.offEmployeeIds : [];
      const cleanIds = rawIds
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .sort()
        .slice(0, 100);
      const halfEntries: HalfDayOffEntry[] = [];
      if (Array.isArray(data.halfDayOff)) {
        for (const item of data.halfDayOff) {
          const parsed = parseHalfDay(item);
          const empId =
            typeof (item as { employeeId?: unknown })?.employeeId === 'string'
              ? String((item as { employeeId: string }).employeeId).trim()
              : '';
          if (parsed && empId) halfEntries.push({ employeeId: empId, session: parsed.session });
        }
      }
      halfEntries.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
      existingByDate.set(d.id, { ids: cleanIds, halfJson: JSON.stringify(halfEntries.slice(0, 100)) });
    }

    const existingByMonth = new Map<string, string>();
    for (const d of existingMonthlySnap.docs) {
      const data = d.data();
      const rawEntries = Array.isArray(data.entries) ? data.entries : [];
      const normalized = rawEntries
        .filter((e): e is MonthlyOffEntry => typeof e === 'object' && e !== null)
        .map((e) => ({
          employeeId: String(e.employeeId || '').trim(),
          dates: Array.isArray(e.dates)
            ? Array.from(new Set(e.dates.map(String))).sort()
            : [],
        }))
        .filter((e) => e.employeeId && e.dates.length > 0)
        .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
      existingByMonth.set(d.id, JSON.stringify(normalized));
    }

    const ops: Array<
      | { type: 'setDaily'; dateKey: string; ids: string[]; half: HalfDayOffEntry[] }
      | { type: 'deleteDaily'; dateKey: string }
      | { type: 'setMonthly'; monthKey: string; entries: MonthlyOffEntry[] }
      | { type: 'deleteMonthly'; monthKey: string }
    > = [];

    for (const [dateKey, idSet] of desiredByDate.entries()) {
      const desiredIds = Array.from(idSet).sort().slice(0, 100);
      const desiredHalf: HalfDayOffEntry[] = Array.from(
        desiredHalfByDate.get(dateKey)?.entries() || [],
      )
        .map(([employeeId, session]) => ({ employeeId, session }))
        .sort((a, b) => a.employeeId.localeCompare(b.employeeId))
        .slice(0, 100);
      const desiredHalfJson = JSON.stringify(desiredHalf);
      const existing = existingByDate.get(dateKey);
      const same =
        existing !== undefined &&
        existing.ids.length === desiredIds.length &&
        existing.ids.every((id, idx) => id === desiredIds[idx]) &&
        existing.halfJson === desiredHalfJson;

      if (!same) {
        ops.push({ type: 'setDaily', dateKey, ids: desiredIds, half: desiredHalf });
      }
    }

    for (const dateKey of existingByDate.keys()) {
      if (!desiredByDate.has(dateKey)) {
        if (dateKey === todayKey) {
          ops.push({ type: 'setDaily', dateKey, ids: [], half: [] });
        } else {
          ops.push({ type: 'deleteDaily', dateKey });
        }
      }
    }

    for (const [monthKey, empMap] of desiredByMonth.entries()) {
      const desiredEntries: MonthlyOffEntry[] = Array.from(empMap.entries())
        .map(([employeeId, dateSet]) => ({
          employeeId,
          dates: Array.from(dateSet).sort().slice(0, 31),
        }))
        .filter((e) => e.dates.length > 0)
        .sort((a, b) => a.employeeId.localeCompare(b.employeeId))
        .slice(0, 100);

      const desiredJson = JSON.stringify(desiredEntries);
      if (existingByMonth.get(monthKey) !== desiredJson) {
        ops.push({ type: 'setMonthly', monthKey, entries: desiredEntries });
      }
    }

    for (const monthKey of existingByMonth.keys()) {
      if (!desiredByMonth.has(monthKey)) {
        if (monthKey === todayMonthKey) {
          ops.push({ type: 'setMonthly', monthKey, entries: [] });
        } else {
          ops.push({ type: 'deleteMonthly', monthKey });
        }
      }
    }

    for (let i = 0; i < ops.length; i += 400) {
      const chunk = ops.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const op of chunk) {
        if (op.type === 'setDaily') {
          batch.set(doc(db, 'dailyOffStatus', op.dateKey), {
            date: op.dateKey,
            offEmployeeIds: op.ids,
            halfDayOff: op.half,
            updatedAt: serverTimestamp(),
          });
        } else if (op.type === 'deleteDaily') {
          batch.delete(doc(db, 'dailyOffStatus', op.dateKey));
        } else if (op.type === 'setMonthly') {
          batch.set(doc(db, 'monthlyOffStatus', op.monthKey), {
            month: op.monthKey,
            entries: op.entries,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.delete(doc(db, 'monthlyOffStatus', op.monthKey));
        }
      }
      await batch.commit();
    }
  } catch {
    // Non-blocking background sync when manager updates leave data
  }
}

/**
 * Bảng quỹ phép còn lại (chỉ số ngày, không có email/lý do) để mọi nhân viên
 * xem nhanh khi bấm vào thẻ đồng nghiệp ở tab "Hôm nay ai đi làm".
 */
export function subscribeLeaveSummaries(
  onData: (summaries: Record<string, LeaveSummary>) => void,
): Unsubscribe {
  const path = 'leaveSummaries';
  // firestore.rules require year >= 2020 for list queries; an unfiltered
  // collection snapshot is rejected with PERMISSION_DENIED.
  const q = query(collection(db, path), where('year', '>=', 2020));
  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, LeaveSummary> = {};
      for (const item of snapshot.docs) {
        const data = item.data();
        const employeeId =
          typeof data.employeeId === 'string' && data.employeeId
            ? data.employeeId
            : item.id;
        map[employeeId] = {
          employeeId,
          year: Number(data.year || 0),
          annualInitial: Number(data.annualInitial || 0),
          annualUsed: Number(data.annualUsed || 0),
          annualRemaining: Number(data.annualRemaining || 0),
          personalInitial: Number(data.personalInitial || FIXED_PERSONAL_LEAVE_DAYS),
          personalUsed: Number(data.personalUsed || 0),
          personalRemaining: Number(data.personalRemaining || 0),
          updatedAtMs: timestampToMs(data.updatedAt),
        };
      }
      onData(map);
    },
    (error) => {
      console.warn(
        '[leaveSummaries] Không đọc được quỹ phép:',
        error instanceof Error ? error.message : error,
      );
      onData({});
    },
  );
}

export async function syncLeaveSummaries(
  employees: Employee[],
  requests: LeaveRequestItem[],
  quotas: Record<string, EmployeeQuota>,
  year: number,
): Promise<void> {
  const approved = requests.filter(
    (r) => r.status === 'Đã duyệt' && Number(r.startDate.slice(0, 4)) === year,
  );

  const desired = new Map<string, LeaveSummary>();
  for (const emp of employees) {
    let annualUsed = 0;
    let personalUsed = 0;
    for (const req of approved) {
      if (req.employeeId !== emp.id) continue;
      for (const alloc of req.allocations) {
        if (alloc.type === 'Phép năm') annualUsed += alloc.days;
        else if (alloc.type === 'Nghỉ việc riêng') personalUsed += alloc.days;
      }
    }
    const annualInitial = Number(quotas[emp.id]?.annualLeaveInitial || 0);
    const personalInitial = FIXED_PERSONAL_LEAVE_DAYS;
    desired.set(emp.id, {
      employeeId: emp.id,
      year,
      annualInitial,
      annualUsed,
      annualRemaining: Math.max(0, annualInitial - annualUsed),
      personalInitial,
      personalUsed,
      personalRemaining: Math.max(0, personalInitial - personalUsed),
      updatedAtMs: 0,
    });
  }

  try {
    const snapshot = await getDocs(
      query(collection(db, 'leaveSummaries'), where('year', '>=', 2020)),
    );
    const ops: Array<
      | { type: 'set'; summary: LeaveSummary }
      | { type: 'delete'; employeeId: string }
    > = [];

    for (const [employeeId, summary] of desired.entries()) {
      const existing = snapshot.docs.find((d) => d.id === employeeId);
      if (!existing) {
        ops.push({ type: 'set', summary });
        continue;
      }
      const data = existing.data();
      const same =
        Number(data.year || 0) === summary.year &&
        Number(data.annualInitial || 0) === summary.annualInitial &&
        Number(data.annualUsed || 0) === summary.annualUsed &&
        Number(data.annualRemaining || 0) === summary.annualRemaining &&
        Number(data.personalInitial || 0) === summary.personalInitial &&
        Number(data.personalUsed || 0) === summary.personalUsed &&
        Number(data.personalRemaining || 0) === summary.personalRemaining;
      if (!same) {
        ops.push({ type: 'set', summary });
      }
    }

    for (const item of snapshot.docs) {
      if (!desired.has(item.id)) {
        ops.push({ type: 'delete', employeeId: item.id });
      }
    }

    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + 400)) {
        if (op.type === 'set') {
          batch.set(doc(db, 'leaveSummaries', op.summary.employeeId), {
            employeeId: op.summary.employeeId,
            year: op.summary.year,
            annualInitial: op.summary.annualInitial,
            annualUsed: op.summary.annualUsed,
            annualRemaining: op.summary.annualRemaining,
            personalInitial: op.summary.personalInitial,
            personalUsed: op.summary.personalUsed,
            personalRemaining: op.summary.personalRemaining,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.delete(doc(db, 'leaveSummaries', op.employeeId));
        }
      }
      await batch.commit();
    }
  } catch (error) {
    // Non-blocking background sync when manager updates leave data
    console.warn(
      '[leaveSummaries] Không đồng bộ được quỹ phép:',
      error instanceof Error ? error.message : error,
    );
  }
}

