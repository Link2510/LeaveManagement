import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
  type HolidayCategory,
  type LeaveAllocation,
  type LeaveLookupRequestItem,
  type LeaveRequestContact,
  type LeaveRequestItem,
  type LeaveStatus,
  type LeaveType,
  type ManagerAccount,
  type MonthlyOffEntry,
} from '../types/leave';
import { getTodayKey, isWorkingDay, parseDateKey, toDateKey } from '../utils/dateUtils';
import { sha256Email, sha256PersonName } from '../utils/hashUtils';

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
    hasHospitalCert: Boolean(data.hasHospitalCert),
    hospitalCertPending: Boolean(data.hospitalCertPending),
    attachmentName: String(data.attachmentName || ''),
    attachmentUrl: typeof data.attachmentUrl === 'string' && data.attachmentUrl ? data.attachmentUrl : undefined,
    rejectionReason: typeof data.rejectionReason === 'string' ? data.rejectionReason : undefined,
    processedBy: typeof data.processedBy === 'string' ? data.processedBy : undefined,
    processedAt: typeof data.processedAt === 'string' ? data.processedAt : undefined,
    emailHash: typeof data.emailHash === 'string' ? data.emailHash : undefined,
    nameHash: typeof data.nameHash === 'string' ? data.nameHash : undefined,
    submitterUid: String(data.submitterUid || ''),
    createdAtMs: timestampToMs(data.createdAt),
  };
}

function mapLookupDoc(id: string, data: Record<string, unknown>): LeaveLookupRequestItem {
  return {
    requestId: String(data.requestId || id),
    emailHash: typeof data.emailHash === 'string' ? data.emailHash : undefined,
    nameHash: typeof data.nameHash === 'string' ? data.nameHash : undefined,
    employeeId: String(data.employeeId || ''),
    employeeName: String(data.employeeName || ''),
    department: (data.department === 'Quản lý' ? 'Quản lý' : 'Nhân sự') as Department,
    startDate: String(data.startDate || ''),
    endDate: String(data.endDate || ''),
    workingDays: Number(data.workingDays || 0),
    reason: String(data.reason || ''),
    status: data.status as LeaveStatus,
    allocations: Array.isArray(data.allocations)
      ? (data.allocations as LeaveAllocation[]).map((a) => ({
          type: a.type,
          days: Number(a.days || 0),
        }))
      : [],
    hospitalCertPending: Boolean(data.hospitalCertPending),
    attachmentUrl: typeof data.attachmentUrl === 'string' && data.attachmentUrl ? data.attachmentUrl : undefined,
    rejectionReason: typeof data.rejectionReason === 'string' ? data.rejectionReason : undefined,
    processedBy: typeof data.processedBy === 'string' ? data.processedBy : undefined,
    processedAt: typeof data.processedAt === 'string' ? data.processedAt : undefined,
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

export function subscribeLeaveContacts(
  isManager: boolean,
  onData: (contacts: Record<string, LeaveRequestContact>) => void,
): Unsubscribe {
  if (!isManager) {
    onData({});
    return () => {};
  }
  const path = 'leaveRequestContacts';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const map: Record<string, LeaveRequestContact> = {};
      for (const d of snapshot.docs) {
        const data = d.data();
        map[d.id] = {
          requestId: String(data.requestId || d.id),
          email: String(data.email || ''),
          submitterUid: String(data.submitterUid || ''),
        };
      }
      onData(map);
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
  email?: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
  note: string;
  allocations: LeaveAllocation[];
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
  const cleanEmail = (input.email || '').trim();
  const hasEmail = cleanEmail.length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const emailHash = hasEmail ? await sha256Email(cleanEmail) : '';
  const cleanName = clampString(input.employeeName, 100);
  const nameHash =
    cleanName.trim().length >= 2 ? await sha256PersonName(cleanName) : '';
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
      hasHospitalCert: Boolean(input.hasHospitalCert),
      hospitalCertPending: Boolean(input.hospitalCertPending),
      attachmentName: clampString(input.attachmentName || '', 180),
      processedBy: cleanManager,
      processedAt: nowIso,
      submitterUid: clampString(input.managerUid, 128),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (emailHash) {
      reqPayload.emailHash = emailHash;
    }
    if (nameHash) {
      reqPayload.nameHash = nameHash;
    }
    if (cleanAttachmentUrl) {
      reqPayload.attachmentUrl = cleanAttachmentUrl;
    }
    batch.set(doc(db, 'leaveRequests', reqId), reqPayload);

    const lookupBase: Record<string, unknown> = {
      requestId: reqId,
      employeeId: clampString(input.employeeId, 128),
      employeeName: cleanName,
      department: input.department,
      startDate: clampString(input.startDate, 10),
      endDate: clampString(input.endDate, 10),
      workingDays: Number(input.workingDays),
      reason: clampString(input.reason, 500),
      status: input.status,
      allocations: sanitizedAllocations,
      hospitalCertPending: Boolean(input.hospitalCertPending),
      processedBy: cleanManager,
      processedAt: nowIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanAttachmentUrl) {
      lookupBase.attachmentUrl = cleanAttachmentUrl;
    }

    if (hasEmail && emailHash) {
      batch.set(doc(db, 'leaveRequestContacts', reqId), {
        requestId: reqId,
        email: clampString(cleanEmail, 160),
        submitterUid: clampString(input.managerUid, 128),
        createdAt: serverTimestamp(),
      });

      batch.set(doc(db, 'emailLookups', emailHash, 'requests', reqId), {
        ...lookupBase,
        emailHash,
      });
    }

    if (nameHash) {
      batch.set(doc(db, 'nameLookups', nameHash, 'requests', reqId), {
        ...lookupBase,
        nameHash,
      });
    }

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
  email: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  proposedType: LeaveType;
  reason: string;
  note: string;
  hasHospitalCert: boolean;
  attachmentUrl?: string;
}

/**
 * Nhân viên tự gửi đơn nghỉ phép mà không cần tài khoản Quản lý.
 * - Dùng Firebase Anonymous Auth để có `uid` gắn với đơn (bắt buộc theo firestore.rules).
 * - Ghi đồng thời: đơn chờ duyệt, email liên hệ, khóa tra cứu theo email và theo họ tên.
 * - Không gửi email thông báo; nhân viên tự tra cứu trạng thái trong ứng dụng.
 */
export async function submitEmployeeLeaveRequest(
  input: EmployeeLeaveSubmissionInput,
): Promise<{ requestId: string }> {
  const cleanEmail = input.email.trim();
  if (cleanEmail.length > 160) {
    throw new Error('Email quá dài (tối đa 160 ký tự).');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    throw new Error('Email không hợp lệ. Vui lòng nhập email bạn dùng để tra cứu đơn.');
  }

  const employeeName = clampString(input.employeeName, 100);
  const employeeId = clampString(input.employeeId, 128);
  if (!employeeId || employeeName.trim().length < 2) {
    throw new Error('Vui lòng chọn họ tên của bạn trong danh sách nhân sự.');
  }

  const workingDays = Math.max(0.5, Math.min(365, Number(input.workingDays) || 0));
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
  const emailHash = await sha256Email(cleanEmail);
  const nameHash = await sha256PersonName(employeeName);
  const cleanAttachmentUrl = input.attachmentUrl
    ? clampString(input.attachmentUrl, 500)
    : '';
  const proposedAllocations: LeaveAllocation[] = [
    { type: input.proposedType, days: workingDays },
  ];
  const cleanNote = clampString(input.note || '', 500);
  const hasHospitalCert = Boolean(input.hasHospitalCert);

  try {
    const batch = writeBatch(db);
    const reqPayload: Record<string, unknown> = {
      employeeId,
      employeeName,
      department: input.department,
      startDate: clampString(input.startDate, 10),
      endDate: clampString(input.endDate, 10),
      workingDays,
      reason: cleanReason,
      note: cleanNote,
      status: 'Đang chờ duyệt',
      allocations: proposedAllocations,
      hasHospitalCert,
      hospitalCertPending: false,
      attachmentName: '',
      emailHash,
      nameHash,
      submitterUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanAttachmentUrl) {
      reqPayload.attachmentUrl = cleanAttachmentUrl;
    }
    batch.set(doc(db, 'leaveRequests', reqId), reqPayload);

    batch.set(doc(db, 'leaveRequestContacts', reqId), {
      requestId: reqId,
      email: clampString(cleanEmail, 160),
      submitterUid: uid,
      createdAt: serverTimestamp(),
    });

    const lookupBase: Record<string, unknown> = {
      requestId: reqId,
      employeeId,
      employeeName,
      department: input.department,
      startDate: clampString(input.startDate, 10),
      endDate: clampString(input.endDate, 10),
      workingDays,
      reason: cleanReason,
      status: 'Đang chờ duyệt',
      allocations: proposedAllocations,
      hospitalCertPending: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanAttachmentUrl) {
      lookupBase.attachmentUrl = cleanAttachmentUrl;
    }

    batch.set(doc(db, 'emailLookups', emailHash, 'requests', reqId), {
      ...lookupBase,
      emailHash,
    });
    batch.set(doc(db, 'nameLookups', nameHash, 'requests', reqId), {
      ...lookupBase,
      nameHash,
    });

    batch.set(doc(db, 'notifications', notifId), {
      recipientType: 'admin',
      recipientUid: 'admin',
      requestId: reqId,
      title: `Đơn nghỉ mới chờ duyệt: ${employeeName}`,
      message: `${employeeName} (${input.department}) đã tự gửi đơn nghỉ ${workingDays} ngày (${input.startDate} → ${input.endDate}).`,
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


async function resolveEmailHash(
  request: LeaveRequestItem,
  contactEmail?: string,
): Promise<string | null> {
  if (request.emailHash && /^[a-f0-9]{64}$/.test(request.emailHash)) {
    return request.emailHash;
  }
  if (contactEmail && contactEmail.trim().length >= 3) {
    return sha256Email(contactEmail);
  }
  return null;
}

async function resolveNameHash(request: LeaveRequestItem): Promise<string | null> {
  if (request.nameHash && /^[a-f0-9]{64}$/.test(request.nameHash)) {
    return request.nameHash;
  }
  if (request.employeeName.trim().length < 2) {
    return null;
  }
  return sha256PersonName(request.employeeName);
}

interface LookupPatch {
  status: LeaveStatus;
  allocations: LeaveAllocation[];
  hospitalCertPending?: boolean;
  rejectionReason?: string;
  processedBy: string;
  processedAt: string;
}

function buildLookupCreatePayload(
  request: LeaveRequestItem,
  patch: LookupPatch,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const createPayload: Record<string, unknown> = {
    requestId: request.id,
    ...extra,
    employeeId: request.employeeId,
    employeeName: clampString(request.employeeName, 100),
    department: request.department,
    startDate: request.startDate,
    endDate: request.endDate,
    workingDays: Number(request.workingDays),
    reason: clampString(request.reason, 500),
    status: patch.status,
    allocations: patch.allocations,
    hospitalCertPending: Boolean(
      patch.hospitalCertPending ?? request.hospitalCertPending,
    ),
    processedBy: patch.processedBy,
    processedAt: patch.processedAt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (request.attachmentUrl) {
    createPayload.attachmentUrl = clampString(request.attachmentUrl, 500);
  }
  if (patch.rejectionReason !== undefined) {
    createPayload.rejectionReason = patch.rejectionReason;
  }
  return createPayload;
}

function buildLookupUpdatePayload(patch: LookupPatch): Record<string, unknown> {
  const updatePayload: Record<string, unknown> = {
    status: patch.status,
    allocations: patch.allocations,
    processedBy: patch.processedBy,
    processedAt: patch.processedAt,
    updatedAt: serverTimestamp(),
  };
  if (patch.hospitalCertPending !== undefined) {
    updatePayload.hospitalCertPending = Boolean(patch.hospitalCertPending);
  }
  if (patch.rejectionReason !== undefined) {
    updatePayload.rejectionReason = patch.rejectionReason;
  }
  return updatePayload;
}

async function upsertLookupInBatch(
  batch: ReturnType<typeof writeBatch>,
  emailHash: string,
  request: LeaveRequestItem,
  patch: LookupPatch,
): Promise<void> {
  const lookupRef = doc(db, 'emailLookups', emailHash, 'requests', request.id);
  const existingSnap = await getDoc(lookupRef);

  if (existingSnap.exists()) {
    batch.update(lookupRef, buildLookupUpdatePayload(patch));
  } else {
    batch.set(
      lookupRef,
      buildLookupCreatePayload(request, patch, { emailHash }),
    );
  }
}

async function upsertNameLookupInBatch(
  batch: ReturnType<typeof writeBatch>,
  nameHash: string,
  request: LeaveRequestItem,
  patch: LookupPatch,
): Promise<void> {
  const lookupRef = doc(db, 'nameLookups', nameHash, 'requests', request.id);
  const existingSnap = await getDoc(lookupRef);

  if (existingSnap.exists()) {
    batch.update(lookupRef, buildLookupUpdatePayload(patch));
  } else {
    batch.set(
      lookupRef,
      buildLookupCreatePayload(request, patch, { nameHash }),
    );
  }
}

export async function receiveLeaveRequest(
  request: LeaveRequestItem,
  managerLabel: string,
  contactEmail?: string,
): Promise<void> {
  const notifId = generateSafeId('notif');
  const nowIso = new Date().toISOString();
  const cleanManager = clampString(managerLabel, 120);

  try {
    const emailHash = await resolveEmailHash(request, contactEmail);
    const nameHash = await resolveNameHash(request);
    const batch = writeBatch(db);
    const reqUpdate: Record<string, unknown> = {
      status: 'Đang chờ duyệt',
      processedBy: cleanManager,
      processedAt: nowIso,
      updatedAt: serverTimestamp(),
    };
    if (emailHash && !request.emailHash) {
      reqUpdate.emailHash = emailHash;
    }
    if (nameHash && !request.nameHash) {
      reqUpdate.nameHash = nameHash;
    }
    batch.update(doc(db, 'leaveRequests', request.id), reqUpdate);

    if (emailHash) {
      await upsertLookupInBatch(batch, emailHash, request, {
        status: 'Đang chờ duyệt',
        allocations: request.allocations,
        processedBy: cleanManager,
        processedAt: nowIso,
      });
    }
    if (nameHash) {
      await upsertNameLookupInBatch(batch, nameHash, request, {
        status: 'Đang chờ duyệt',
        allocations: request.allocations,
        processedBy: cleanManager,
        processedAt: nowIso,
      });
    }

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
  contactEmail?: string,
  hospitalCertPending = false,
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
    const emailHash = await resolveEmailHash(request, contactEmail);
    const nameHash = await resolveNameHash(request);
    const batch = writeBatch(db);
    const reqUpdate: Record<string, unknown> = {
      status: 'Đã duyệt',
      allocations: cleanAllocations,
      hasHospitalCert: Boolean(hasHospitalCert),
      hospitalCertPending: Boolean(hospitalCertPending),
      processedBy: cleanManager,
      processedAt: nowIso,
      updatedAt: serverTimestamp(),
    };
    if (emailHash && !request.emailHash) {
      reqUpdate.emailHash = emailHash;
    }
    if (nameHash && !request.nameHash) {
      reqUpdate.nameHash = nameHash;
    }
    batch.update(doc(db, 'leaveRequests', request.id), reqUpdate);

    if (emailHash) {
      await upsertLookupInBatch(batch, emailHash, request, {
        status: 'Đã duyệt',
        allocations: cleanAllocations,
        hospitalCertPending: Boolean(hospitalCertPending),
        processedBy: cleanManager,
        processedAt: nowIso,
      });
    }
    if (nameHash) {
      await upsertNameLookupInBatch(batch, nameHash, request, {
        status: 'Đã duyệt',
        allocations: cleanAllocations,
        hospitalCertPending: Boolean(hospitalCertPending),
        processedBy: cleanManager,
        processedAt: nowIso,
      });
    }

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
  contactEmail?: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const cleanManager = clampString(managerLabel, 120);

  try {
    const emailHash = await resolveEmailHash(request, contactEmail);
    const nameHash = await resolveNameHash(request);
    const batch = writeBatch(db);
    const reqUpdate: Record<string, unknown> = {
      hasHospitalCert: true,
      hospitalCertPending: false,
      processedBy: cleanManager,
      processedAt: nowIso,
      updatedAt: serverTimestamp(),
    };
    if (emailHash && !request.emailHash) {
      reqUpdate.emailHash = emailHash;
    }
    if (nameHash && !request.nameHash) {
      reqUpdate.nameHash = nameHash;
    }
    batch.update(doc(db, 'leaveRequests', request.id), reqUpdate);

    if (emailHash) {
      await upsertLookupInBatch(batch, emailHash, request, {
        status: request.status,
        allocations: request.allocations,
        hospitalCertPending: false,
        processedBy: cleanManager,
        processedAt: nowIso,
      });
    }
    if (nameHash) {
      await upsertNameLookupInBatch(batch, nameHash, request, {
        status: request.status,
        allocations: request.allocations,
        hospitalCertPending: false,
        processedBy: cleanManager,
        processedAt: nowIso,
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `leaveRequests/${request.id}`);
  }
}

export async function rejectLeaveRequest(
  request: LeaveRequestItem,
  rejectionReason: string,
  managerLabel: string,
  contactEmail?: string,
): Promise<void> {
  const notifId = generateSafeId('notif');
  const nowIso = new Date().toISOString();
  const cleanReason = clampString(rejectionReason, 500);
  const cleanManager = clampString(managerLabel, 120);

  try {
    const emailHash = await resolveEmailHash(request, contactEmail);
    const nameHash = await resolveNameHash(request);
    const batch = writeBatch(db);
    const reqUpdate: Record<string, unknown> = {
      status: 'Từ chối',
      rejectionReason: cleanReason,
      processedBy: cleanManager,
      processedAt: nowIso,
      updatedAt: serverTimestamp(),
    };
    if (emailHash && !request.emailHash) {
      reqUpdate.emailHash = emailHash;
    }
    if (nameHash && !request.nameHash) {
      reqUpdate.nameHash = nameHash;
    }
    batch.update(doc(db, 'leaveRequests', request.id), reqUpdate);

    if (emailHash) {
      await upsertLookupInBatch(batch, emailHash, request, {
        status: 'Từ chối',
        allocations: request.allocations,
        rejectionReason: cleanReason,
        processedBy: cleanManager,
        processedAt: nowIso,
      });
    }
    if (nameHash) {
      await upsertNameLookupInBatch(batch, nameHash, request, {
        status: 'Từ chối',
        allocations: request.allocations,
        rejectionReason: cleanReason,
        processedBy: cleanManager,
        processedAt: nowIso,
      });
    }

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

export async function syncMissingLookups(
  requests: LeaveRequestItem[],
  contacts: Record<string, LeaveRequestContact>,
): Promise<void> {
  const pending = requests.filter(
    (r) => !r.emailHash || !r.nameHash,
  );
  if (pending.length === 0) return;

  try {
    const batch = writeBatch(db);
    let count = 0;
    for (const req of pending.slice(0, 20)) {
      const email = contacts[req.id]?.email;
      const reqUpdate: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      let changed = false;

      let emailHash: string | null = null;
      if (!req.emailHash && email) {
        emailHash = await sha256Email(email);
        reqUpdate.emailHash = emailHash;
        changed = true;
      }

      let nameHash: string | null = null;
      if (!req.nameHash) {
        nameHash = await resolveNameHash(req);
        if (nameHash) {
          reqUpdate.nameHash = nameHash;
          changed = true;
        }
      }

      if (!changed) continue;
      batch.update(doc(db, 'leaveRequests', req.id), reqUpdate);

      const patch = {
        status: req.status,
        allocations: req.allocations,
        rejectionReason: req.rejectionReason,
        processedBy: req.processedBy || 'Quản lý',
        processedAt: req.processedAt || new Date().toISOString(),
      };

      if (emailHash) {
        await upsertLookupInBatch(batch, emailHash, req, patch);
      }
      if (nameHash) {
        await upsertNameLookupInBatch(batch, nameHash, req, patch);
      }
      count += 1;
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch {
    // Non-blocking background sync for legacy records
  }
}

export async function lookupLeaveRequestsByEmail(
  email: string,
): Promise<LeaveLookupRequestItem[]> {
  const emailHash = await sha256Email(email);
  const path = `emailLookups/${emailHash}/requests`;
  try {
    const q = query(collection(db, path), where('emailHash', '==', emailHash));
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((d) => mapLookupDoc(d.id, d.data()));
    items.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function lookupLeaveRequestsByName(
  fullName: string,
): Promise<LeaveLookupRequestItem[]> {
  const normalized = fullName.replace(/\s+/g, ' ').trim();
  if (normalized.length < 2) {
    return [];
  }
  const nameHash = await sha256PersonName(normalized);
  const path = `nameLookups/${nameHash}/requests`;
  try {
    const q = query(collection(db, path), where('nameHash', '==', nameHash));
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((d) => mapLookupDoc(d.id, d.data()));
    items.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
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
  onData: (offEmployeeIds: string[]) => void,
  onReady?: () => void,
): Unsubscribe {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    onData([]);
    onReady?.();
    return () => {};
  }

  return onSnapshot(
    doc(db, 'dailyOffStatus', dateKey),
    (snap) => {
      if (!snap.exists()) {
        onData([]);
        onReady?.();
        return;
      }
      const data = snap.data();
      const rawIds = Array.isArray(data.offEmployeeIds) ? data.offEmployeeIds : [];
      const cleanIds = rawIds
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, 100);
      onData(cleanIds);
      onReady?.();
    },
    () => {
      onData([]);
      onReady?.();
    },
  );
}

export async function syncDailyOffStatusForDate(
  dateKey: string,
  offEmployeeIds: string[],
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

  try {
    await setDoc(doc(db, 'dailyOffStatus', dateKey), {
      date: dateKey,
      offEmployeeIds: cleanIds,
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

  const desiredByMonth = new Map<string, Map<string, Set<string>>>();
  desiredByMonth.set(todayMonthKey, new Map<string, Set<string>>());

  for (const req of requests) {
    if (req.status !== 'Đã duyệt') continue;
    const empId = req.employeeId.trim();
    if (!empId || empId.length > 128) continue;

    const start = parseDateKey(req.startDate);
    const end = parseDateKey(req.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) continue;

    const cursor = new Date(start);
    let safety = 0;
    while (cursor <= end && safety < 400) {
      safety += 1;
      const dateKey = toDateKey(cursor);
      if (isWorkingDay(dateKey, holidayMap)) {
        let daySet = desiredByDate.get(dateKey);
        if (!daySet) {
          daySet = new Set<string>();
          desiredByDate.set(dateKey, daySet);
        }
        daySet.add(empId);

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
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  try {
    const [existingDailySnap, existingMonthlySnap] = await Promise.all([
      getDocs(collection(db, 'dailyOffStatus')),
      getDocs(collection(db, 'monthlyOffStatus')),
    ]);

    const existingByDate = new Map<string, string[]>();
    for (const d of existingDailySnap.docs) {
      const data = d.data();
      const rawIds = Array.isArray(data.offEmployeeIds) ? data.offEmployeeIds : [];
      const cleanIds = rawIds
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .sort()
        .slice(0, 100);
      existingByDate.set(d.id, cleanIds);
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
      | { type: 'setDaily'; dateKey: string; ids: string[] }
      | { type: 'deleteDaily'; dateKey: string }
      | { type: 'setMonthly'; monthKey: string; entries: MonthlyOffEntry[] }
      | { type: 'deleteMonthly'; monthKey: string }
    > = [];

    for (const [dateKey, idSet] of desiredByDate.entries()) {
      const desiredIds = Array.from(idSet).sort().slice(0, 100);
      const existingIds = existingByDate.get(dateKey);
      const same =
        existingIds !== undefined &&
        existingIds.length === desiredIds.length &&
        existingIds.every((id, idx) => id === desiredIds[idx]);

      if (!same) {
        ops.push({ type: 'setDaily', dateKey, ids: desiredIds });
      }
    }

    for (const dateKey of existingByDate.keys()) {
      if (!desiredByDate.has(dateKey)) {
        if (dateKey === todayKey) {
          ops.push({ type: 'setDaily', dateKey, ids: [] });
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

