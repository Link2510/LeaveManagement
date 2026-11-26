import type {
  CompanyHoliday,
  HalfDaySession,
  HolidayCategory,
} from '../types/leave';

/** Giờ làm việc của công ty: 08:15–12:15 và 13:30–17:30 (nghỉ trưa 12:15–13:30). */
export const COMPANY_WORK_TIME = {
  morningStart: '08:15',
  morningEnd: '12:15',
  afternoonStart: '13:30',
  afternoonEnd: '17:30',
} as const;

export function getHalfDayTimeLabel(session: HalfDaySession): string {
  return session === 'Sáng'
    ? `Sáng ${COMPANY_WORK_TIME.morningStart}–${COMPANY_WORK_TIME.morningEnd}`
    : `Chiều ${COMPANY_WORK_TIME.afternoonStart}–${COMPANY_WORK_TIME.afternoonEnd}`;
}

/** Ngày làm việc đầu tiên của khoảng nghỉ — là ngày bị giảm còn nửa ngày. */
export interface SelectedLeaveDay {
  date: string;
  days: number;
  session: HalfDaySession | null;
}

/** Chuẩn hoá danh sách ngày rời rạc do nhân viên chọn (bỏ trùng, bỏ ngày không làm việc). */
export function resolveSelectedLeaveDays(
  dates: string[],
  holidays: CompanyHoliday[],
  halfSessionByDate: Record<string, HalfDaySession>,
): SelectedLeaveDay[] {
  const unique = Array.from(
    new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))),
  ).sort();
  const result: SelectedLeaveDay[] = [];
  for (const date of unique) {
    if (!isWorkingDay(date, holidays)) continue;
    const session = halfSessionByDate[date];
    result.push({
      date,
      days: session === 'Sáng' || session === 'Chiều' ? 0.5 : 1,
      session: session === 'Sáng' || session === 'Chiều' ? session : null,
    });
  }
  return result;
}

/** Gộp `halfDay` (cũ) và `halfDays` (mới) thành một map date -> buổi nghỉ. */
export function getRequestHalfDayMap(request: {
  halfDay?: { date: string; session: HalfDaySession };
  halfDays?: Array<{ date: string; session: HalfDaySession }>;
}): Record<string, HalfDaySession> {
  const map: Record<string, HalfDaySession> = {};
  if (request.halfDay?.date && request.halfDay.session) {
    map[request.halfDay.date] = request.halfDay.session;
  }
  for (const item of request.halfDays || []) {
    if (item?.date && (item.session === 'Sáng' || item.session === 'Chiều')) {
      map[item.date] = item.session;
    }
  }
  return map;
}

/** Đơn có phủ ngày này không — ưu tiên `dates` nếu là đơn chọn rời rạc. */
export function leaveRequestCoversDate(
  request: { startDate: string; endDate: string; dates?: string[] },
  dateKey: string,
): boolean {
  if (Array.isArray(request.dates) && request.dates.length > 0) {
    return request.dates.includes(dateKey);
  }
  return isDateInRange(dateKey, request.startDate, request.endDate);
}

export function getFirstWorkingDate(
  startDate: string,
  endDate: string,
  holidays: CompanyHoliday[],
): string {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '';
  const cursor = new Date(start);
  let safety = 0;
  while (cursor <= end && safety < 400) {
    safety += 1;
    const key = toDateKey(cursor);
    if (isWorkingDay(key, holidays)) return key;
    cursor.setDate(cursor.getDate() + 1);
  }
  return '';
}

/** Nửa ngày trừ vào ngày làm việc đầu tiên, không phải cộng thêm 0,5 ngày. */
export function applyHalfDayToWorkingDays(
  fullWorkingDays: number,
  halfDayEnabled: boolean,
): number {
  return halfDayEnabled && fullWorkingDays >= 1 ? fullWorkingDays - 0.5 : fullWorkingDays;
}

export function getHolidayCategoryLabel(category: HolidayCategory): string {
  return category === 'Ngày làm việc bù' ? 'OT' : category;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDateVN(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const WEEKDAY_NAMES_VN = [
  'Chủ nhật',
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
];

export function getWeekdayLabelVN(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const d = parseDateKey(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return WEEKDAY_NAMES_VN[d.getDay()] || '';
}

export function formatDateTimeVN(value?: string | number): string {
  if (!value) return '—';
  const d = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Quy tắc ngày làm việc:
 * - Mặc định Thứ 2 -> Thứ 6 là ngày làm việc; Thứ 7 và Chủ nhật KHÔNG làm việc.
 * - Ngày có cấu hình 'Ngày làm việc bù' (kể cả Thứ 7 / Chủ nhật) được tính là ngày làm việc.
 * - Ngày có cấu hình 'Lễ/Tết', 'Nghỉ bù', 'Nghỉ công ty' được tính là ngày nghỉ (không tính ngày làm việc).
 */
export function isWorkingDay(
  dateKey: string,
  holidaysOrMap: CompanyHoliday[] | Map<string, CompanyHoliday>,
): boolean {
  const holiday =
    holidaysOrMap instanceof Map
      ? holidaysOrMap.get(dateKey)
      : holidaysOrMap.find((h) => h.date === dateKey);

  if (holiday) {
    return holiday.category === 'Ngày làm việc bù';
  }

  const d = parseDateKey(dateKey);
  const dow = d.getDay(); // 0 = CN, 6 = T7
  return dow !== 0 && dow !== 6;
}

export function calculateWorkingDays(
  startDate: string,
  endDate: string,
  holidays: CompanyHoliday[],
): {
  workingDays: number;
  weekendDaysExcluded: number;
  excludedHolidays: CompanyHoliday[];
  makeupWorkdays: CompanyHoliday[];
} {
  if (!startDate || !endDate) {
    return {
      workingDays: 0,
      weekendDaysExcluded: 0,
      excludedHolidays: [],
      makeupWorkdays: [],
    };
  }
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return {
      workingDays: 0,
      weekendDaysExcluded: 0,
      excludedHolidays: [],
      makeupWorkdays: [],
    };
  }

  const holidayMap = new Map<string, CompanyHoliday>();
  for (const h of holidays) {
    holidayMap.set(h.date, h);
  }

  let workingDays = 0;
  let weekendDaysExcluded = 0;
  const excludedHolidays: CompanyHoliday[] = [];
  const makeupWorkdays: CompanyHoliday[] = [];

  const cursor = new Date(start);
  let safety = 0;
  while (cursor <= end && safety < 400) {
    safety += 1;
    const key = toDateKey(cursor);
    const dayOfWeek = cursor.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const holiday = holidayMap.get(key);

    if (holiday) {
      if (holiday.category === 'Ngày làm việc bù') {
        workingDays += 1;
        makeupWorkdays.push(holiday);
      } else {
        excludedHolidays.push(holiday);
      }
    } else if (!isWeekend) {
      workingDays += 1;
    } else {
      weekendDaysExcluded += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return { workingDays, weekendDaysExcluded, excludedHolidays, makeupWorkdays };
}

export function isDateInRange(dayKey: string, startDate: string, endDate: string): boolean {
  return dayKey >= startDate && dayKey <= endDate;
}

export function getMonthCalendarCells(year: number, monthIndex: number): Array<{
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isWeekend: boolean;
}> {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();

  const cells: Array<{
    dateKey: string;
    dayNumber: number;
    isCurrentMonth: boolean;
    isWeekend: boolean;
  }> = [];

  const gridStart = new Date(year, monthIndex, 1 - startOffset);
  const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

  for (let i = 0; i < totalCells; i += 1) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const dow = d.getDay();
    cells.push({
      dateKey: toDateKey(d),
      dayNumber: d.getDate(),
      isCurrentMonth: d.getMonth() === monthIndex,
      isWeekend: dow === 0 || dow === 6,
    });
  }

  return cells;
}

export function getTodayKey(): string {
  return toDateKey(new Date());
}
