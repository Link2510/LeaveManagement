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
import { ADMIN_EMAIL, db, handleFirestoreError, OperationType } from '../firebase';
import {
  FIXED_PERSONAL_LEAVE_DAYS,
  INITIAL_EMPLOYEES,
  INITIAL_HOLIDAYS,
  INITIAL_REQUESTS,
  type AppNotification,
  type CompanyHoliday,
  type Department,
  type EmailLookupRequestItem,
  type Employee,
  type EmployeeQuota,
  type HolidayCategory,
  type LeaveAllocation,
  type LeaveRequestContact,
  type LeaveRequestItem,
  type ManagerAccount,
  type MonthlyOffEntry,
} from '../types/leave';
import { getTodayKey, isWorkingDay, parseDateKey, toDateKey } from '../utils/dateUtils';
import { sha256Email } from '../utils/hashUtils';

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

export function subscribeIsManager(
  email: string | null | undefined,
  emailVerified: boolean | undefined,
  onResult: (isMgr: boolean) => void,
): Unsubscribe {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !emailVerified) {
    onResult(false);
    return () => {};
  }
  if (cleanEmail === ADMIN_EMAIL.toLowerCase()) {
    onResult(true);
    return () => {};
  }

  const mgrDocRef = doc(db, 'managers', cleanEmail);
  return onSnapshot(
    mgrDocRef,
    (snap) => {
      onResult(snap.exists());
    },
    () => {
      onResult(false);
    },
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
          email: String(data.email || d.id),
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
  email: string,
  name: string,
  addedBy: string,
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase().slice(0, 160);
  const cleanName = clampString(name, 100);
  try {
    await setDoc(doc(db, 'managers', cleanEmail), {
      email: cleanEmail,
      name: cleanName,
      role: 'manager',
      addedBy: addedBy.trim().toLowerCase().slice(0, 160),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `managers/${cleanEmail}`);
  }
}

export async function removeManagerAccount(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    await deleteDoc(doc(db, 'managers', cleanEmail));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `managers/${cleanEmail}`);
  }
}

export async function seedInitialDataIfNeeded(isManager: boolean, managerUid: string): Promise<void> {
  if (!isManager || !managerUid) return;

  try {
    // 1. Seed Employees + Manager Quotas if employees collection is empty
    const empSnap = await getDocs(
      query(collection(db, 'employees'), where('department', 'in', ['Quản lý', 'Nhân sự'])),
    );
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
      await batch.commit();
    }

    // 2. Seed Company Holidays if empty
    const holSnap = await getDocs(
      query(collection(db, 'companyHolidays'), where('year', '>=', 2020)),
    );
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
      await batch.commit();
    }

    // 3. Seed Initial Leave Requests if empty
    const reqSnap = await getDocs(collection(db, 'leaveRequests'));
    if (reqSnap.empty) {
      const adminEmailHash = await sha256Email(ADMIN_EMAIL);
      const batch = writeBatch(db);
      for (const req of INITIAL_REQUESTS) {
        const reqRef = doc(db, 'leaveRequests', req.id);
        const payload: Record<string, unknown> = {
          employeeId: req.employeeId,
          employeeName: req.employeeName,
          department: req.department,
          startDate: req.startDate,
          endDate: req.endDate,
          workingDays: req.workingDays,
          reason: req.reason,
          note: req.note,
          status: req.status,
          allocations: req.allocations,
          hasHospitalCert: req.hasHospitalCert,
          attachmentName: req.attachmentName,
          emailHash: adminEmailHash,
          submitterUid: managerUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (req.rejectionReason) payload.rejectionReason = req.rejectionReason;
        if (req.processedBy) payload.processedBy = req.processedBy;
        if (req.processedAt) payload.processedAt = req.processedAt;
        batch.set(reqRef, payload);

        const contactRef = doc(db, 'leaveRequestContacts', req.id);
        batch.set(contactRef, {
          requestId: req.id,
          email: ADMIN_EMAIL,
          submitterUid: managerUid,
          createdAt: serverTimestamp(),
        });

        const lookupRef = doc(db, 'emailLookups', adminEmailHash, 'requests', req.id);
        const lookupPayload: Record<string, unknown> = {
          requestId: req.id,
          emailHash: adminEmailHash,
          employeeId: req.employeeId,
          employeeName: req.employeeName,
          department: req.department,
          startDate: req.startDate,
          endDate: req.endDate,
          workingDays: req.workingDays,
          reason: req.reason,
          status: req.status,
          allocations: req.allocations,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (req.rejectionReason) lookupPayload.rejectionReason = req.rejectionReason;
        if (req.processedBy) lookupPayload.processedBy = req.processedBy;
        if (req.processedAt) lookupPayload.processedAt = req.processedAt;
        batch.set(lookupRef, lookupPayload);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seedInitialDataIfNeeded');
  }
}

export function subscribeEmployees(onData: (employees: Employee[]) => void): Unsubscribe {
  const path = 'employees';
  const q = query(collection(db, path), where('department', 'in', ['Quản lý', 'Nhân sự']));
  return onSnapshot(
    q,
    (snapshot) => {
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
    submitterUid: String(data.submitterUid || ''),
    createdAtMs: timestampToMs(data.createdAt),
  };
}

function mapLookupDoc(id: string, data: Record<string, unknown>): EmailLookupRequestItem {
  return {
    requestId: String(data.requestId || id),
    emailHash: String(data.emailHash || ''),
    employeeId: String(data.employeeId || ''),
    employeeName: String(data.employeeName || ''),
    department: (data.department === 'Quản lý' ? 'Quản lý' : 'Nhân sự') as Department,
    startDate: String(data.startDate || ''),
    endDate: String(data.endDate || ''),
    workingDays: Number(data.workingDays || 0),
    reason: String(data.reason || ''),
    status: data.status as EmailLookupRequestItem['status'],
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
): Unsubscribe {
  if (!isManager) {
    onData([]);
    return () => {};
  }

  const path = 'leaveRequests';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs.map((d) => mapRequestDoc(d.id, d.data()));
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
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
      employeeName: clampString(input.employeeName, 100),
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
    if (cleanAttachmentUrl) {
      reqPayload.attachmentUrl = cleanAttachmentUrl;
    }
    batch.set(doc(db, 'leaveRequests', reqId), reqPayload);

    if (hasEmail && emailHash) {
      batch.set(doc(db, 'leaveRequestContacts', reqId), {
        requestId: reqId,
        email: clampString(cleanEmail, 160),
        submitterUid: clampString(input.managerUid, 128),
        createdAt: serverTimestamp(),
      });

      const lookupPayload: Record<string, unknown> = {
        requestId: reqId,
        emailHash,
        employeeId: clampString(input.employeeId, 128),
        employeeName: clampString(input.employeeName, 100),
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
        lookupPayload.attachmentUrl = cleanAttachmentUrl;
      }
      batch.set(doc(db, 'emailLookups', emailHash, 'requests', reqId), lookupPayload);
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

async function upsertLookupInBatch(
  batch: ReturnType<typeof writeBatch>,
  emailHash: string,
  request: LeaveRequestItem,
  patch: {
    status: LeaveRequestItem['status'];
    allocations: LeaveAllocation[];
    hospitalCertPending?: boolean;
    rejectionReason?: string;
    processedBy: string;
    processedAt: string;
  },
): Promise<void> {
  const lookupRef = doc(db, 'emailLookups', emailHash, 'requests', request.id);
  const existingSnap = await getDoc(lookupRef);

  if (existingSnap.exists()) {
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
    batch.update(lookupRef, updatePayload);
  } else {
    const createPayload: Record<string, unknown> = {
      requestId: request.id,
      emailHash,
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
    batch.set(lookupRef, createPayload);
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
    batch.update(doc(db, 'leaveRequests', request.id), reqUpdate);

    if (emailHash) {
      await upsertLookupInBatch(batch, emailHash, request, {
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

export async function syncMissingEmailLookups(
  requests: LeaveRequestItem[],
  contacts: Record<string, LeaveRequestContact>,
): Promise<void> {
  const missing = requests.filter((r) => !r.emailHash && contacts[r.id]?.email);
  if (missing.length === 0) return;

  try {
    const batch = writeBatch(db);
    let count = 0;
    for (const req of missing.slice(0, 20)) {
      const email = contacts[req.id]?.email;
      if (!email) continue;
      const emailHash = await sha256Email(email);
      batch.update(doc(db, 'leaveRequests', req.id), {
        emailHash,
        updatedAt: serverTimestamp(),
      });
      await upsertLookupInBatch(batch, emailHash, req, {
        status: req.status,
        allocations: req.allocations,
        rejectionReason: req.rejectionReason,
        processedBy: req.processedBy || 'Quản lý',
        processedAt: req.processedAt || new Date().toISOString(),
      });
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
): Promise<EmailLookupRequestItem[]> {
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

