import type {
  CompanyHoliday,
  HalfDaySession,
  LeaveAllocation,
  LeaveRequestItem,
  LeaveType,
} from '../types/leave';
import {
  formatDateTimeVN,
  getWeekdayLabelVN,
  isWorkingDay,
  toDateKey,
} from './dateUtils';

/**
 * Xuất file .xlsx thuần client (không thêm dependency, không gửi dữ liệu ra ngoài).
 * Dùng ZIP ở chế độ "stored" (không nén) + inline strings nên vẫn mở được trong Excel.
 */

export interface MonthlyLeaveExportInput {
  requests: LeaveRequestItem[];
  holidays: CompanyHoliday[];
  year: number;
  monthIndex: number; // 0-based
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
  const { requests, holidays, year, monthIndex } = input;
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const monthStart = `${monthKey}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const monthEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
  const holidayMap = new Map<string, CompanyHoliday>();
  for (const h of holidays) holidayMap.set(h.date, h);

  const rows: DetailRow[] = [];
  for (const req of requests) {
    if (req.status !== 'Đã duyệt') continue;
    if (!req.startDate || !req.endDate) continue;
    if (req.endDate < monthStart || req.startDate > monthEnd) continue;

    const from = req.startDate > monthStart ? req.startDate : monthStart;
    const to = req.endDate < monthEnd ? req.endDate : monthEnd;
    const dates: string[] = [];
    const dayLoads: number[] = [];
    const sessions: Array<HalfDaySession | null> = [];

    let cursor = new Date(year, monthIndex, Number(from.slice(8, 10)));
    let safety = 0;
    while (toDateKey(cursor) <= to && safety < 40) {
      safety += 1;
      const dateKey = toDateKey(cursor);
      if (isWorkingDay(dateKey, holidayMap)) {
        const isHalf = req.halfDay?.date === dateKey;
        dates.push(dateKey);
        dayLoads.push(isHalf ? 0.5 : 1);
        sessions.push(isHalf ? req.halfDay?.session || 'Sáng' : null);
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }

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

function sheetXml(rows: XlsxRow[], widths: number[]): string {
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => {
          const ref = `${columnName(colIndex)}${rowIndex + 1}`;
          const style = rowIndex === 0 ? ' s="1"' : '';
          if (typeof value === 'number') {
            return `<c r="${ref}"${style}><v>${value}</v></c>`;
          }
          if (value === '') return `<c r="${ref}"${style}/>`;
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
            value,
          )}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Chi tiet ngay nghi" sheetId="1" r:id="rId1"/><sheet name="Tong hop nhan vien" sheetId="2" r:id="rId2"/><sheet name="Thong tin" sheetId="3" r:id="rId3"/></sheets></workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

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
  const rows = buildDetailRows(input);
  const monthKey = `${input.year}-${String(input.monthIndex + 1).padStart(2, '0')}`;

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
    ['Tháng đối chiếu', monthKey],
    ['Số ngày ghi nhận', rows.length],
    ['Tổng số ngày nghỉ', Number(rows.reduce((sum, r) => sum + r.days, 0).toFixed(2))],
    ['Giờ làm việc', '08:15–12:15; nghỉ trưa 12:15–13:30; 13:30–17:30'],
    ['Phạm vi', 'Chỉ đơn đã duyệt có ngày làm việc trong tháng được chọn'],
    ['Nguồn', 'LeaveManagement – Firestore nội bộ (project leave-management-vn)'],
    ['Xuất lúc', new Date().toLocaleString('vi-VN')],
    ['Quyền riêng tư', 'Không chứa email; không gửi dữ liệu ra dịch vụ bên ngoài'],
  ];

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
  ];

  const blob = new Blob([buildZip(files) as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `NghiPhep_${monthKey}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return rows.length;
}
