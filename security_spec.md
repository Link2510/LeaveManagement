# Security Specification — LeaveManagement

## 1. Data Invariants
1. **Manager-Only Leave Visibility**: Employees (including anonymous sessions) MUST NOT be able to `list` `/leaveRequests`, `/employeeQuotas`, `/leaveRequestContacts`, or `/notifications`. An employee may `get` only a leave request whose `submitterUid` equals their own Firebase uid. Only verified Managers (`mynamelink1998@gmail.com` or accounts registered in `/managers/{managerEmail}`) may read/list those collections.
2. **No Self-Lookup Index**: The legacy `/emailLookups` and `/nameLookups` collections are no longer written or read. There is no way for an employee to look up another person's request by email or name.
3. **Immutable Audit & State Integrity**: Employees can only create `/leaveRequests` in `'Đang chờ duyệt'` status for an existing `employeeId`, with their own `submitterUid`. Only verified Managers can transition status (`'Đang chờ duyệt'`, `'Đã duyệt'`, `'Từ chối'`). Deletion is denied for everyone except the primary Super Admin (`mynamelink1998@gmail.com`), who may permanently delete a request to clean up test data through a confirmed UI action.
4. **Numeric Leave Balances Are Public**: `/leaveSummaries/{employeeId}` is readable by anyone. It contains only `employeeId`, year and day counts (annual/personal initial, used, remaining) — never reasons, notes, emails or contact details. Only Managers may write it.
5. **Half-Day Attendance Is Public But Non-PII**: `/dailyOffStatus/{dateKey}.halfDayOff` contains only `employeeId` + session (`Sáng`/`Chiều`) so the attendance board can show which half of the day an employee works. It never contains reasons or contact details, and only Managers may write it.
6. **Manager Role Delegation**: Only the primary Super Admin (`mynamelink1998@gmail.com`) can add or remove authorized Manager accounts in `/managers/{managerEmail}`.
7. **Server Timestamps**: `createdAt` and `updatedAt` are strictly validated against `request.time`.

## 2. Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Cross-Employee Leave Scraping**: Unauthenticated or anonymous user attempting `list` on `/leaveRequests`, or `get` on a request with a different `submitterUid`.
2. **Notification Scraping**: Non-manager attempting `list` on `/notifications`.
3. **Unverified Email Spoof**: Request with `email_verified: false` claiming Super Admin or Manager email.
4. **Self-Approve on Create**: Non-manager creating `/leaveRequests` with `status: 'Đã duyệt'` or with a forged `processedBy` / `processedAt`.
5. **Balance Tampering**: Non-manager attempting `create`/`update`/`delete` on `/leaveSummaries/{employeeId}` to inflate remaining days.
6. **Quota Read/Write Leak**: Non-manager attempting `get`/`list`/`write` on `/employeeQuotas/{id}`.
7. **Privilege Escalation**: Non-super-admin attempting to add themselves to `/managers/{email}`.
8. **Shadow Field Injection**: Sending extra unknown field `isVerified: true` in `/leaveRequests` or `/leaveSummaries`.
9. **ID Poisoning**: Writing to `/leaveRequests/` with a 1500-char ID or to `/leaveSummaries/` with a malformed employee ID.
10. **Orphaned Employee Ref**: Creating `/leaveRequests` or `/leaveSummaries` referencing a non-existent `employeeId`.
11. **Timestamp Forgery**: Sending a client-forged `createdAt` / `updatedAt` timestamp instead of `request.time`.
12. **PII Scrape**: Non-manager reading `/leaveRequestContacts` or listing `/leaveRequests` to harvest reasons and notes.
