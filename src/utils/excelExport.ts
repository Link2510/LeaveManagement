import type {
  CompanyHoliday,
  HalfDaySession,
  LeaveAllocation,
  LeaveRequestItem,
  LeaveType,
} from '../types/leave';
import {
  formatDateTimeVN,
  getRequestHalfDayMap,
  getWeekdayLabelVN,
  isWorkingDay,
  parseDateKey,
  resolveSelectedLeaveDays,
  toDateKey,
} from './dateUtils';

/**
 * Xuất file .xlsx thuần client (không thêm dependency, không gửi dữ liệu ra ngoài).
 * Dùng ZIP ở chế độ "stored" (không nén) + inline strings nên vẫn mở được trong Excel.
 */

export interface MonthlyLeaveExportInput {
  requests: LeaveRequestItem[];
  holidays: CompanyHoliday[];
  /** Khoảng xuất tuỳ ý (YYYY-MM-DD), có thể trải qua nhiều tháng. */
  startDate: string;
  endDate: string;
}

interface DetailRow {
  date: string;
  employeeId: string;
  employeeName: string;
  department: string;
  session: HalfDaySession | null;
  days: number;
  allocations: Array<{ type: LeaveType; days: number }>;
  reason: string;
  note: string;
  requestId: string;
  processedBy: string;
  processedAt: string;
}

const ALL_TYPES: LeaveType[] = [
  'Phép năm',
  'Nghỉ việc riêng',
  'Nghỉ ốm',
  'Thai sản',
  'Nghỉ hưởng lương',
  'Nghỉ không lương',
];

function sessionLabel(session: HalfDaySession | null): string {
  if (session === 'Sáng') return 'Sáng 08:15–12:15';
  if (session === 'Chiều') return 'Chiều 13:30–17:30';
  return 'Cả ngày';
}

function splitAllocationsByDays(
  dayLoads: number[],
  allocations: LeaveAllocation[],
): Array<Array<{ type: LeaveType; days: number }>> {
  const remaining = allocations
    .filter((a) => a.days > 0)
    .map((a) => ({ type: a.type, days: Number(a.days) }));
  const totalDays = dayLoads.reduce((sum, d) => sum + d, 0);
  const totalAlloc = remaining.reduce((sum, a) => sum + a.days, 0);
  if (Math.abs(totalDays - totalAlloc) > 0.001) {
    remaining.length = 0;
    remaining.push({ type: 'Phép năm', days: totalDays });
  }

  return dayLoads.map((load) => {
    const out: Array<{ type: LeaveType; days: number }> = [];
    let need = load;
    while (need > 0.0001 && remaining.length > 0) {
      const first = remaining[0];
      const take = Math.min(first.days, need);
      out.push({ type: first.type, days: take });
      first.days -= take;
      need -= take;
      if (first.days <= 0.0001) remaining.shift();
    }
    return out;
  });
}

function buildDetailRows(input: MonthlyLeaveExportInput): DetailRow[] {
  const { requests, holidays, startDate, endDate } = input;
  const rows: DetailRow[] = [];
  for (const req of requests) {
    if (req.status !== 'Đã duyệt') continue;
    if (!req.startDate || !req.endDate) continue;
    if (req.endDate < startDate || req.startDate > endDate) continue;

    const sourceDates: string[] = [];
    if (Array.isArray(req.dates) && req.dates.length > 0) {
      sourceDates.push(...req.dates);
    } else {
      const from = req.startDate > startDate ? req.startDate : startDate;
      const to = req.endDate < endDate ? req.endDate : endDate;
      const cursor = parseDateKey(from);
      let safety = 0;
      while (toDateKey(cursor) <= to && safety < 400) {
        safety += 1;
        sourceDates.push(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const selectedDays = resolveSelectedLeaveDays(
      sourceDates,
      holidays,
      getRequestHalfDayMap(req),
    ).filter((d) => d.date >= startDate && d.date <= endDate);
    const dayLoads = selectedDays.map((d) => d.days);
    const sessions = selectedDays.map((d) => d.session);
    const dates = selectedDays.map((d) => d.date);

    const perDay = splitAllocationsByDays(dayLoads, req.allocations);
    dayLoads.forEach((days, idx) => {
      rows.push({
        date: dates[idx],
        employeeId: req.employeeId,
        employeeName: req.employeeName,
        department: req.department,
        session: sessions[idx],
        days,
        allocations: perDay[idx],
        reason: req.reason,
        note: req.note,
        requestId: req.id,
        processedBy: req.processedBy || 'Quản lý',
        processedAt: formatDateTimeVN(req.processedAt),
      });
    });
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName, 'vi'),
  );
  return rows;
}

/* ---------- Calendar sheet ---------- */

interface CalendarCellData {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayTitle: string;
  isMakeupWorkday: boolean;
  leaveText: string;
  mark: string;
}

/** Lưới Thứ 2–Chủ nhật phủ toàn bộ khoảng xuất (có thể qua nhiều tháng). */
function getRangeCalendarCells(
  startDate: string,
  endDate: string,
): Array<{ dateKey: string; dayNumber: number; isCurrentMonth: boolean; isWeekend: boolean }> {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const gridEnd = new Date(end);
  gridEnd.setDate(gridEnd.getDate() + (6 - ((gridEnd.getDay() + 6) % 7)));

  const cells: Array<{
    dateKey: string;
    dayNumber: number;
    isCurrentMonth: boolean;
    isWeekend: boolean;
  }> = [];
  const cursor = new Date(gridStart);
  let safety = 0;
  while (cursor <= gridEnd && safety < 400) {
    safety += 1;
    const dateKey = toDateKey(cursor);
    cells.push({
      dateKey,
      dayNumber: cursor.getDate(),
      isCurrentMonth: dateKey >= startDate && dateKey <= endDate,
      isWeekend: cursor.getDay() === 0 || cursor.getDay() === 6,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function buildCalendarCells(
  rows: DetailRow[],
  holidays: CompanyHoliday[],
  startDate: string,
  endDate: string,
): CalendarCellData[] {
  const holidayMap = new Map<string, CompanyHoliday>();
  for (const h of holidays) holidayMap.set(h.date, h);

  const byDate = new Map<string, DetailRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.date) || [];
    list.push(row);
    byDate.set(row.date, list);
  }

  return getRangeCalendarCells(startDate, endDate).map((cell) => {
    const holiday = holidayMap.get(cell.dateKey);
    const isHoliday = Boolean(holiday && holiday.category !== 'Ngày làm việc bù');
    const isMakeupWorkday = holiday?.category === 'Ngày làm việc bù';
    const dayRows = cell.isCurrentMonth ? byDate.get(cell.dateKey) || [] : [];
    const leaveText = dayRows
      .map((row) => {
        const parts = row.allocations.map((a) => `${a.type} (${a.days} ngày)`).join(', ');
        return `${row.employeeName}${row.session ? ` [${sessionLabel(row.session)}]` : ''}: ${parts}`;
      })
      .join('\n');

    let mark = '';
    if (isHoliday) {
      mark = 'Nghỉ công ty';
    } else if (isMakeupWorkday) {
      mark = 'OT';
    } else if (cell.isWeekend) {
      mark = 'Cuối tuần';
    } else if (dayRows.length > 0) {
      mark = dayRows.length === 1 ? '1 người nghỉ' : `${dayRows.length} người nghỉ`;
    }

    return {
      date: cell.dateKey,
      dayNumber: cell.dayNumber,
      isCurrentMonth: cell.isCurrentMonth,
      isWeekend: cell.isWeekend,
      isHoliday,
      holidayTitle: holiday?.title || '',
      isMakeupWorkday,
      leaveText,
      mark,
    };
  });
}

/* ---------- XLSX writer ---------- */

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

type XlsxValue = string | number;
type XlsxRow = XlsxValue[];
type CellStyleFn = (row: number, col: number) => number | undefined;

function sheetXml(
  rows: XlsxRow[],
  widths: number[],
  styleFn?: CellStyleFn,
  rowHeight?: number,
): string {
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => {
          const ref = `${columnName(colIndex)}${rowIndex + 1}`;
          const explicitStyle = styleFn?.(rowIndex, colIndex);
          const styleIndex = explicitStyle ?? (rowIndex === 0 ? 1 : 0);
          const style = ` s="${styleIndex}"`;
          if (typeof value === 'number') {
            return `<c r="${ref}"${style}><v>${value}</v></c>`;
          }
          if (value === '') return `<c r="${ref}"${style}/>`;
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
            value,
          ).replace(/\n/g, '&#10;')}</t></is></c>`;
        })
        .join('');
      const heightAttr =
        rowHeight && rowIndex > 0 ? ` ht="${rowHeight}" customHeight="1"` : '';
      return `<row r="${rowIndex + 1}"${heightAttr}>${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Chi tiet ngay nghi" sheetId="1" r:id="rId1"/><sheet name="Tong hop nhan vien" sheetId="2" r:id="rId2"/><sheet name="Thong tin" sheetId="3" r:id="rId3"/><sheet name="Lich nghi thang" sheetId="4" r:id="rId4"/></sheets></workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="6"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FF9F1239"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FF3730A3"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FF065F46"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FF64748B"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCE7F3"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD6DEE5"/></left><right style="thin"><color rgb="FFD6DEE5"/></right><top style="thin"><color rgb="FFD6DEE5"/></top><bottom style="thin"><color rgb="FFD6DEE5"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="5" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`;

/** Style index dùng cho ô lịch: 0 mặc định, 1 header, 2 cuối tuần/ngoài tháng, 3 lễ, 4 OT, 5 có nghỉ phép. */
function calendarStyle(cell: CalendarCellData): number {
  if (!cell.isCurrentMonth) return 2;
  if (cell.isHoliday) return 3;
  if (cell.isMakeupWorkday) return 4;
  if (cell.isWeekend) return 2;
  if (cell.leaveText) return 5;
  return 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + nameBytes.length + file.data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filenames
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, file.data.length, true);
    lv.setUint32(22, file.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(file.data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, file.data.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const all = [...locals, ...centrals, end];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const part of all) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}

function xmlFile(name: string, xml: string): { name: string; data: Uint8Array } {
  return { name, data: new TextEncoder().encode(xml) };
}

/* ---------- Public API ---------- */

export function exportMonthlyLeaveExcel(input: MonthlyLeaveExportInput): number {
  const { startDate, endDate } = input;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(startDate) || !datePattern.test(endDate) || startDate > endDate) {
    throw new Error('Khoảng xuất không hợp lệ: ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  }
  const rows = buildDetailRows(input);

  const detailRows: XlsxRow[] = [
    [
      'Ngày',
      'Thứ',
      'Nhân viên',
      'Phòng ban',
      'Buổi nghỉ',
      'Số ngày',
      'Loại phép phân bổ',
      'Lý do',
      'Bàn giao / ghi chú',
      'Mã đơn',
      'Người duyệt',
      'Thời điểm duyệt',
    ],
    ...rows.map((row) => [
      row.date,
      getWeekdayLabelVN(row.date),
      row.employeeName,
      row.department,
      sessionLabel(row.session),
      row.days,
      row.allocations.map((a) => `${a.type} (${a.days} ngày)`).join(' · '),
      row.reason,
      row.note,
      row.requestId,
      row.processedBy,
      row.processedAt,
    ]),
  ];

  const byEmployee = new Map<
    string,
    { name: string; department: string; types: Record<string, number>; days: number; entries: number }
  >();
  for (const row of rows) {
    const key = row.employeeId || row.employeeName;
    let item = byEmployee.get(key);
    if (!item) {
      item = {
        name: row.employeeName,
        department: row.department,
        types: {},
        days: 0,
        entries: 0,
      };
      byEmployee.set(key, item);
    }
    item.days += row.days;
    item.entries += 1;
    for (const alloc of row.allocations) {
      item.types[alloc.type] = (item.types[alloc.type] || 0) + alloc.days;
    }
  }
  const summaryRows: XlsxRow[] = [
    ['Nhân viên', 'Phòng ban', ...ALL_TYPES, 'Tổng ngày', 'Số ngày ghi nhận'],
    ...Array.from(byEmployee.values())
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
      .map((item) => [
        item.name,
        item.department,
        ...ALL_TYPES.map((type) => Number((item.types[type] || 0).toFixed(2))),
        Number(item.days.toFixed(2)),
        item.entries,
      ]),
  ];

  const infoRows: XlsxRow[] = [
    ['Mục', 'Giá trị'],
    ['Khoảng đối chiếu', `${startDate} → ${endDate}`],
    ['Số ngày ghi nhận', rows.length],
    ['Tổng số ngày nghỉ', Number(rows.reduce((sum, r) => sum + r.days, 0).toFixed(2))],
    ['Giờ làm việc', '08:15–12:15; nghỉ trưa 12:15–13:30; 13:30–17:30'],
    ['Phạm vi', 'Chỉ đơn đã duyệt có ngày làm việc trong khoảng đã chọn'],
    [
      'Sheet lịch',
      'Sheet "Lich nghi thang" là lưới ngày Thứ 2–Chủ nhật giống giao diện web: ô có nghỉ phép (xanh lá), lễ (hồng), OT (xanh dương), cuối tuần (xám); trong ô có tên nhân sự và loại phép.',
    ],
    ['Nguồn', 'LeaveManagement – Firestore nội bộ (project leave-management-vn)'],
    ['Xuất lúc', new Date().toLocaleString('vi-VN')],
    ['Quyền riêng tư', 'Không chứa email; không gửi dữ liệu ra dịch vụ bên ngoài'],
  ];

  const calendarCells = buildCalendarCells(rows, input.holidays, startDate, endDate);
  const calendarRows: XlsxRow[] = [
    ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7 (Nghỉ)', 'Chủ nhật (Nghỉ)'],
  ];
  for (let i = 0; i < calendarCells.length; i += 7) {
    calendarRows.push(
      calendarCells.slice(i, i + 7).map((cell) => {
        if (!cell.isCurrentMonth) return '';
        const parts = [`${cell.dayNumber}/${cell.date.slice(5, 7)}`];
        if (cell.mark) parts.push(cell.mark);
        if (cell.holidayTitle) parts.push(cell.holidayTitle);
        if (cell.leaveText) parts.push(cell.leaveText);
        return parts.join('\n');
      }),
    );
  }

  const files = [
    xmlFile('[Content_Types].xml', CONTENT_TYPES),
    xmlFile('_rels/.rels', ROOT_RELS),
    xmlFile('xl/workbook.xml', WORKBOOK),
    xmlFile('xl/_rels/workbook.xml.rels', WORKBOOK_RELS),
    xmlFile('xl/styles.xml', STYLES),
    xmlFile(
      'xl/worksheets/sheet1.xml',
      sheetXml(detailRows, [13, 13, 22, 12, 22, 10, 38, 34, 30, 22, 18, 20]),
    ),
    xmlFile(
      'xl/worksheets/sheet2.xml',
      sheetXml(summaryRows, [22, 12, 12, 16, 12, 14, 18, 12, 14]),
    ),
    xmlFile('xl/worksheets/sheet3.xml', sheetXml(infoRows, [24, 70])),
    xmlFile(
      'xl/worksheets/sheet4.xml',
      sheetXml(
        calendarRows,
        [22, 22, 22, 22, 22, 22, 22],
        (row, col) => (row === 0 ? 1 : calendarStyle(calendarCells[(row - 1) * 7 + col])),
        96,
      ),
    ),
  ];

  const blob = new Blob([buildZip(files) as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `BaoCaoNghiPhep_${startDate}_den_${endDate}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return rows.length;
}
