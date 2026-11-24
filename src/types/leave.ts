export type Department = 'Quản lý' | 'Nhân sự';

export type LeaveStatus = 'Mới tạo' | 'Đang chờ duyệt' | 'Đã duyệt' | 'Từ chối';

export type LeaveType =
  | 'Phép năm'
  | 'Nghỉ việc riêng'
  | 'Nghỉ ốm'
  | 'Thai sản'
  | 'Nghỉ hưởng lương'
  | 'Nghỉ không lương';

export type HolidayCategory =
  | 'Lễ/Tết'
  | 'Nghỉ bù'
  | 'Ngày làm việc bù'
  | 'Nghỉ công ty';

export interface LeaveAllocation {
  type: LeaveType;
  days: number;
}

export interface Employee {
  id: string;
  name: string;
  department: Department;
  avatarPreset?: string;
  avatarPhoto?: string;
}

export interface EmployeeQuota {
  employeeId: string;
  annualLeaveInitial: number;
  personalLeaveInitial: number; // Cố định 5 ngày/người
}

export interface ManagerAccount {
  id: string;
  email: string;
  name: string;
  role: 'manager';
  addedBy: string;
  createdAtMs: number;
}

export interface EmployeeStats extends Employee {
  annualLeaveInitial: number | null;
  personalLeaveInitial: number | null;
  annualLeaveUsed: number;
  personalLeaveUsed: number;
  annualLeaveRemaining: number | null;
  personalLeaveRemaining: number | null;
  sickLeaveDays: number;
  maternityLeaveDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
}

export interface CompanyHoliday {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  category: HolidayCategory;
  year: number;
  note: string;
}

export interface MonthlyOffEntry {
  employeeId: string;
  dates: string[]; // Sorted YYYY-MM-DD working dates off in that month
}

export interface LeaveRequestItem {
  id: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  workingDays: number;
  reason: string;
  note: string;
  status: LeaveStatus;
  allocations: LeaveAllocation[];
  hasHospitalCert: boolean;
  hospitalCertPending?: boolean;
  attachmentName: string;
  attachmentUrl?: string;
  rejectionReason?: string;
  processedBy?: string;
  processedAt?: string;
  emailHash?: string;
  submitterUid: string;
  createdAtMs: number;
}

export interface EmailLookupRequestItem {
  requestId: string;
  emailHash: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
  status: LeaveStatus;
  allocations: LeaveAllocation[];
  hospitalCertPending?: boolean;
  attachmentUrl?: string;
  rejectionReason?: string;
  processedBy?: string;
  processedAt?: string;
  createdAtMs: number;
}

export interface LeaveRequestContact {
  requestId: string;
  email: string;
  submitterUid: string;
}

export interface AppNotification {
  id: string;
  recipientType: 'admin' | 'employee';
  recipientUid: string;
  requestId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAtMs: number;
}

export const ALL_LEAVE_TYPES: LeaveType[] = [
  'Phép năm',
  'Nghỉ việc riêng',
  'Nghỉ ốm',
  'Thai sản',
  'Nghỉ hưởng lương',
  'Nghỉ không lương',
];

export const FIXED_PERSONAL_LEAVE_DAYS = 5;

export const INITIAL_EMPLOYEES: Array<{
  id: string;
  name: string;
  department: Department;
  annualLeaveInitial: number;
}> = [
  { id: 'emp_minh_anh', name: 'Nguyễn Minh Anh', department: 'Nhân sự', annualLeaveInitial: 12 },
  { id: 'emp_hoang_nam', name: 'Trần Hoàng Nam', department: 'Quản lý', annualLeaveInitial: 8 },
  { id: 'emp_thu_ha', name: 'Lê Thu Hà', department: 'Nhân sự', annualLeaveInitial: 15 },
  { id: 'emp_quoc_bao', name: 'Phạm Quốc Bảo', department: 'Quản lý', annualLeaveInitial: 6 },
  { id: 'emp_ngoc_linh', name: 'Vũ Ngọc Linh', department: 'Nhân sự', annualLeaveInitial: 10 },
];

export const INITIAL_HOLIDAYS: Array<Omit<CompanyHoliday, 'id'> & { id: string }> = [
  {
    id: 'hol_2026_01_01',
    date: '2026-01-01',
    title: 'Tết Dương lịch 2026',
    category: 'Lễ/Tết',
    year: 2026,
    note: 'Nghỉ lễ theo quy định Nhà nước',
  },
  {
    id: 'hol_2026_04_30',
    date: '2026-04-30',
    title: 'Ngày Giải phóng miền Nam',
    category: 'Lễ/Tết',
    year: 2026,
    note: 'Nghỉ lễ 30/4',
  },
  {
    id: 'hol_2026_05_01',
    date: '2026-05-01',
    title: 'Ngày Quốc tế Lao động',
    category: 'Lễ/Tết',
    year: 2026,
    note: 'Nghỉ lễ 1/5',
  },
  {
    id: 'hol_2026_09_02',
    date: '2026-09-02',
    title: 'Ngày Quốc khánh 2/9',
    category: 'Lễ/Tết',
    year: 2026,
    note: 'Nghỉ lễ Quốc khánh',
  },
];

export const INITIAL_REQUESTS: Array<{
  id: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
  note: string;
  status: LeaveStatus;
  allocations: LeaveAllocation[];
  hasHospitalCert: boolean;
  attachmentName: string;
  rejectionReason?: string;
  processedBy?: string;
  processedAt?: string;
}> = [
  {
    id: 'req_seed_1',
    employeeId: 'emp_minh_anh',
    employeeName: 'Nguyễn Minh Anh',
    department: 'Nhân sự',
    startDate: '2026-11-25',
    endDate: '2026-11-27',
    workingDays: 3,
    reason: 'Nghỉ phép gia đình về quê',
    note: 'Đã bàn giao lịch tuyển dụng tuần này',
    status: 'Đang chờ duyệt',
    allocations: [{ type: 'Phép năm', days: 3 }],
    hasHospitalCert: false,
    attachmentName: '',
    processedBy: 'Quản lý',
    processedAt: '2026-11-23T09:15:00.000Z',
  },
  {
    id: 'req_seed_2',
    employeeId: 'emp_hoang_nam',
    employeeName: 'Trần Hoàng Nam',
    department: 'Quản lý',
    startDate: '2026-11-26',
    endDate: '2026-11-26',
    workingDays: 1,
    reason: 'Giải quyết công việc cá nhân',
    note: '',
    status: 'Mới tạo',
    allocations: [{ type: 'Nghỉ việc riêng', days: 1 }],
    hasHospitalCert: false,
    attachmentName: '',
  },
  {
    id: 'req_seed_3',
    employeeId: 'emp_thu_ha',
    employeeName: 'Lê Thu Hà',
    department: 'Nhân sự',
    startDate: '2026-11-18',
    endDate: '2026-11-19',
    workingDays: 2,
    reason: 'Khám sức khỏe định kỳ và điều trị ngoại trú',
    note: 'Có giấy xác nhận của bệnh viện',
    status: 'Đã duyệt',
    allocations: [{ type: 'Nghỉ ốm', days: 2 }],
    hasHospitalCert: true,
    attachmentName: 'giay-xac-nhan-benh-vien.pdf',
    processedBy: 'Quản lý',
    processedAt: '2026-11-17T10:30:00.000Z',
  },
  {
    id: 'req_seed_4',
    employeeId: 'emp_quoc_bao',
    employeeName: 'Phạm Quốc Bảo',
    department: 'Quản lý',
    startDate: '2026-11-28',
    endDate: '2026-11-30',
    workingDays: 1,
    reason: 'Nghỉ việc riêng cuối tháng',
    note: '',
    status: 'Từ chối',
    allocations: [],
    hasHospitalCert: false,
    attachmentName: '',
    rejectionReason: 'Trùng lịch họp tổng kết tháng của phòng Quản lý',
    processedBy: 'Quản lý',
    processedAt: '2026-11-22T15:00:00.000Z',
  },
  {
    id: 'req_seed_5',
    employeeId: 'emp_ngoc_linh',
    employeeName: 'Vũ Ngọc Linh',
    department: 'Nhân sự',
    startDate: '2026-12-02',
    endDate: '2026-12-04',
    workingDays: 3,
    reason: 'Nghỉ cưới người thân trong gia đình',
    note: 'Xin phân bổ theo chế độ hiếu hỉ hoặc phép năm',
    status: 'Đang chờ duyệt',
    allocations: [{ type: 'Nghỉ hưởng lương', days: 3 }],
    hasHospitalCert: false,
    attachmentName: '',
    processedBy: 'Quản lý',
    processedAt: '2026-11-23T14:20:00.000Z',
  },
];
