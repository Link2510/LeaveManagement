# Security Specification — LeaveManagement

## 1. Data Invariants
1. **Manager-Only Leave Visibility**: Employees do NOT sign in and MUST NOT be able to read or list `/leaveRequests`, `/employeeQuotas`, `/leaveRequestContacts`, or `/notifications` of other employees. Only verified Managers (`mynamelink1998@gmail.com` or accounts registered in `/managers/{managerEmail}`) may read/list those collections.
2. **Email-Hash-Scoped Self-Lookup**: An unauthenticated employee can check the approval status of their own leave requests ONLY by supplying the exact registered email address, which maps deterministically via SHA-256 to `/emailLookups/{emailHash}/requests/{requestId}`. Listing `/emailLookups` top-level is forbidden to non-managers.
3. **Immutable Audit & State Integrity**: Unauthenticated employees can only create `/leaveRequests` and `/emailLookups/{emailHash}/requests/{requestId}` atomically in `'Mới tạo'` status for an existing `employeeId`. Only verified Managers can transition status (`'Đang chờ duyệt'`, `'Đã duyệt'`, `'Từ chối'`), and deletion of leave requests is permanently denied.
4. **Manager Role Delegation**: Only the primary Super Admin (`mynamelink1998@gmail.com`) can add or remove authorized Manager accounts in `/managers/{managerEmail}`.
5. **Server Timestamps**: `createdAt` and `updatedAt` are strictly validated against `request.time`.

## 2. Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Cross-Employee Leave Scraping**: Unauthenticated user attempting `list` or `get` on `/leaveRequests` to view colleagues' schedules.
2. **Notification Scraping**: Unauthenticated user attempting `list` on `/notifications`.
3. **Unverified Email Spoof**: Request with `email_verified: false` claiming Super Admin or Manager email.
4. **Self-Approve on Create or Lookup**: Non-manager creating `/leaveRequests` or `/emailLookups/{emailHash}/requests/{id}` with `status: 'Đã duyệt'`.
5. **Lookup Tampering**: Non-manager attempting to `update` `/emailLookups/{emailHash}/requests/{id}` to fake approval.
6. **Quota Read/Write Leak**: Non-manager attempting `get`/`list`/`write` on `/employeeQuotas/{id}`.
7. **Privilege Escalation**: Non-super-admin attempting to add themselves to `/managers/{email}`.
8. **Shadow Field Injection**: Sending extra unknown field `isVerified: true` in `/leaveRequests` or `/emailLookups`.
9. **ID Poisoning**: Writing to `/leaveRequests/` with a 1500-char ID or `/emailLookups/` with a non-64-hex `emailHash`.
10. **Orphaned Employee Ref**: Creating `/leaveRequests` referencing a non-existent `employeeId`.
11. **Timestamp Forgery**: Sending a client-forged `createdAt` timestamp instead of `request.time`.
12. **PII Scrape**: Non-manager reading `/leaveRequestContacts` or listing `/emailLookups`.
