# LeaveManagement – Quản lý nghỉ phép nội bộ

Ứng dụng web (React + Vite + Firebase) để nhân viên **tự đăng ký nghỉ phép không cần đăng nhập**, quản lý duyệt/từ chối đơn, và nhân viên **tra cứu lại đơn của mình** bằng email hoặc họ tên.

- Hosting: `https://mvtpdayoff.web.app` (site `mvtpdayoff`, project `leave-management-vn`)
- Dữ liệu: Cloud Firestore
- Đăng nhập Quản lý: Google hoặc username nội bộ; nhân viên gửi đơn dùng **Anonymous Auth** (không bắt người dùng thao tác gì)

> **Không gửi email.** Ứng dụng không gửi email thông báo cho nhân viên (không có Cloud Functions, không dùng dịch vụ email bên thứ ba). Nhân viên tự xem kết quả trong tab **Tra cứu đơn của tôi**.

---

## 1. Tính năng

### Dành cho Nhân viên (không cần đăng nhập)

| Mục | Mô tả |
|---|---|
| **Đăng ký nghỉ phép** | Chọn họ tên trong danh sách nhân sự, nhập email dùng để tra cứu, chọn khoảng ngày (tự trừ Thứ 7/Chủ nhật, ngày lễ, cộng ngày OT), nhập lý do/ghi chú, đề xuất loại phép. Với **Nghỉ ốm** có thể đánh dấu đã có giấy xác nhận và dán liên kết Google Drive. |
| **Tra cứu đơn của tôi** | Tra cứu theo **email đã dùng khi đăng ký** hoặc theo **họ tên đầy đủ** (tự chuẩn hoá dấu tiếng Việt: `Nguyen Minh Anh` = `Nguyễn Minh Anh`). Kết quả hiển thị trạng thái, khoảng ngày, số ngày, phân bổ được duyệt, lý do từ chối và người xử lý. |
| **Hôm nay ai đi làm** | Xem đồng nghiệp đang làm việc / nghỉ phép trong ngày. |
| **Ngày nghỉ công ty** | Xem lịch lễ, nghỉ bù, OT của công ty. |

Đơn gửi xong có trạng thái **Đang chờ duyệt**; quản lý chốt loại phép và phân bổ ngày khi duyệt.

### Dành cho Quản lý (đăng nhập)

- **Duyệt đơn chờ**: hàng đợi đơn nhân viên tự gửi, sửa phân bổ (tổng phải bằng số ngày làm việc), duyệt hoặc từ chối kèm lý do bắt buộc, đánh dấu đã có giấy xác nhận nghỉ ốm.
- **Thông báo trong app**: chuông ở góc phải header với số chưa đọc, danh sách thông báo, đánh dấu đã đọc / đọc tất cả. Khi đang mở app mà có đơn mới, hiện **toast** góc dưới phải kèm nút “Xem đơn”. Ngoài ra có hẳn tab **Thông báo** trong menu quản lý: lọc Tất cả / Chưa đọc, tìm theo tên hoặc nội dung, xem trạng thái hiện tại của đơn liên quan.
- **Phân bổ nghỉ cho nhân viên**: quản lý tạo đơn trực tiếp (trừ quỹ phép ngay).
- **Bảng thống kê**, **Lịch nghỉ tháng**, **Quản lý nhân sự**, **Lịch sử nghỉ phép**, **Ngày nghỉ công ty**.

> Thông báo chỉ hoạt động **trong app khi quản lý đang đăng nhập**. Không có email, không có push khi app đóng.

---

## 2. Chạy thử trên máy

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # tsc --noEmit
npm run build    # vite build -> dist/
```

Cấu hình Firebase phía client nằm trong `firebase-applet-config.json` (không phải khoá bí mật; Firebase web API key vốn công khai, bảo vệ dữ liệu nằm ở `firestore.rules`).

---

## 3. Cấu hình Firebase bắt buộc

### 3.1 Bật đăng nhập ẩn danh (Anonymous) — **bắt buộc**

Firebase Console → **Authentication** → **Sign-in method** → bật **Anonymous**.

Vì sao cần: khi nhân viên bấm gửi đơn, app tạo một phiên ẩn danh (`signInAnonymously`) để có `uid`. Nhờ đó `firestore.rules` mới xác thực được "đơn này do chính người vừa gửi tạo ra", thay vì mở quyền ghi vô điều kiện cho bất kỳ ai. Người dùng **không** thấy màn hình đăng nhập, không cần tài khoản.

Nếu chưa bật, form sẽ báo: *"Chưa bật đăng nhập ẩn danh (Anonymous) trong Firebase Authentication…"*.

### 3.2 Deploy Firestore Rules — **bắt buộc**

```bash
firebase deploy --only firestore:rules
```

Rules hiện tại cho phép:

- Nhân viên (kể cả ẩn danh) **chỉ được tạo** đơn `Đang chờ duyệt` với `submitterUid` = uid của chính họ, không được tự ghi `processedBy` / `processedAt` / `rejectionReason`.
- Nhân viên chỉ `get` được đơn do chính uid của họ gửi (không `list` toàn bộ).
- Quản lý giữ toàn quyền đọc/ghi như trước.
- Bản tra cứu `emailLookups` / `nameLookups` được tạo trong cùng batch với đơn, khoá theo SHA-256.

### 3.3 Deploy Hosting

```bash
npm run build
firebase deploy --only hosting
```

---

## 4. Cấu trúc dữ liệu (Firestore)

| Đường dẫn | Mục đích | Đọc | Ghi |
|---|---|---|---|
| `/employees/{id}` | Danh sách nhân sự (tên, phòng ban, avatar) | Công khai (có filter phòng ban) | Quản lý |
| `/employeeQuotas/{id}` | Quỹ phép năm / phép cá nhân | Quản lý | Quản lý |
| `/managers/{uid}` | Tài khoản được cấp quyền Quản lý | Quản lý / chính chủ | Super Admin |
| `/companyHolidays/{id}` | Lễ, nghỉ bù, OT | Công khai | Quản lý |
| `/leaveRequests/{id}` | Đơn nghỉ phép đầy đủ | Quản lý; nhân viên chỉ đọc đơn của mình | Quản lý; nhân viên chỉ tạo đơn chờ duyệt của mình |
| `/leaveRequestContacts/{id}` | Email liên hệ của người gửi (PII tách riêng) | Quản lý | Người gửi đơn (tạo) / Quản lý |
| `/emailLookups/{emailHash}/requests/{id}` | Bản tóm tắt tra cứu theo email | Quản lý hoặc đúng `emailHash` | Quản lý; người gửi (tạo) |
| `/nameLookups/{nameHash}/requests/{id}` | Bản tóm tắt tra cứu theo họ tên | Quản lý hoặc đúng `nameHash` | Quản lý; người gửi (tạo) |
| `/notifications/{id}` | Thông báo trong app (chuông + toast) | Quản lý | Quản lý; nhân viên chỉ tạo thông báo "đơn mới" cho Quản lý |
| `/dailyOffStatus`, `/monthlyOffStatus` | Chỉ số nghỉ phép không PII cho lịch/điểm danh | Công khai theo ngày/tháng | Quản lý |

`emailHash` = SHA-256 của email (lowercase, trim). `nameHash` = SHA-256 của họ tên đã chuẩn hoá: bỏ dấu tiếng Việt (`đ → d`), lowercase, gộp khoảng trắng.

---

## 5. Giới hạn & đánh đổi cần biết

1. **Không có đăng nhập ⇒ không xác thực được danh tính.** Nhân viên chọn tên mình trong danh sách, nên về lý thuyết một người có thể gửi đơn dưới tên người khác. Đây là đánh đổi có chủ ý để không phải cấp tài khoản cho toàn bộ nhân viên. Nếu cần chặt hơn: bật đăng nhập email/Google cho nhân viên và đổi rules sang so khớp `token.email`.
2. **Tra cứu theo họ tên là "bí mật bằng họ tên".** Ai biết đúng họ tên đầy đủ đều xem được đơn của người đó (kể cả lý do từ chối). Firestore rules không thể vừa cho list theo khoá bí mật vừa chặn người biết khoá. Muốn tắt: bỏ khối `nameLookups` trong `firestore.rules`, bỏ ghi `nameLookups` trong `firestoreService.ts`, và ẩn tab "Theo họ tên".
3. **Trùng họ tên** sẽ cho kết quả gộp của tất cả nhân sự cùng tên.
4. Đơn cũ (trước khi bật tính năng) chỉ có bản tra cứu sau khi quản lý đăng nhập một lần (hàm `syncMissingLookups` backfill tối đa 20 đơn mỗi lượt).
5. File đính kèm chỉ là **liên kết Google Drive**; app không upload tệp lên Firebase.
6. **Không có email thông báo.** Muốn có email tự động phải thêm Cloud Functions (gói Blaze) + dịch vụ gửi mail; hiện tại chủ động không dùng. Thông báo trong app (chuông + toast) chỉ đến khi quản lý đang mở app và đã đăng nhập; không có push khi app đóng.

---

## 6. Quyền riêng tư

**App gửi gì ra ngoài máy?**

- Chỉ dữ liệu tới **Cloud Firestore** của project `leave-management-vn` (Google Firebase): họ tên, phòng ban, email, khoảng ngày nghỉ, số ngày, lý do, ghi chú, liên kết Drive (nếu có), trạng thái duyệt, người xử lý.
- **Không** gửi email, không gọi dịch vụ bên thứ ba nào. Không có Google Analytics, không telemetry, không tracking pixel, không quảng cáo, không đọc clipboard, không chụp màn hình, không đọc file trên máy.

**Thông báo trong app** (chuông + toast) chỉ là document trong `/notifications` của Firestore, đọc realtime khi quản lý đăng nhập. Không có push notification, không đăng ký service worker, không lấy token thiết bị.

**App ghi gì, ở đâu?**

- Toàn bộ dữ liệu nằm trong Firestore (cloud) — không ghi file lên ổ đĩa người dùng.
- Trình duyệt chỉ lưu: phiên đăng nhập Firebase (IndexedDB/localStorage do SDK quản lý) và một `lm_employee_client_id` ngẫu nhiên trong `localStorage` (dùng nội bộ, không gửi đi đâu).

**Ai đọc được?**

- Quản lý đọc được đơn đầy đủ + email liên hệ.
- Nhân viên chỉ đọc được đơn của chính uid ẩn danh đã tạo.
- Bất kỳ ai biết đúng **email** hoặc **họ tên đầy đủ** đều tra cứu được bản tóm tắt (trạng thái, ngày, lý do, lý do từ chối) — xem mục 5.
- `dailyOffStatus` / `monthlyOffStatus` chỉ chứa ID nhân sự + ngày nghỉ, không có lý do.

**Cách tự kiểm chứng:**

```bash
# Không có mã theo dõi / analytics trong mã nguồn
rg -n "gtag|analytics|googletagmanager|sentry|mixpanel|posthog|amplitude" src

# Không có endpoint mạng ngoài Firebase
rg -n "https?://" src

# Xem toàn bộ quy tắc truy cập dữ liệu
cat firestore.rules
```

---

## 7. Cấu trúc mã nguồn (phần mới)

| File | Vai trò |
|---|---|
| `src/components/EmployeeLeaveRequestForm.tsx` | Form nhân viên tự gửi đơn (không đăng nhập) |
| `src/components/EmployeeLeaveLookup.tsx` | Tra cứu theo email / họ tên |
| `src/components/LeaveApprovalQueue.tsx` | Hàng đợi duyệt đơn của quản lý |
| `src/services/firestoreService.ts` | `submitEmployeeLeaveRequest`, `lookupLeaveRequestsByEmail`, `lookupLeaveRequestsByName`, `syncMissingLookups`, cập nhật lookup khi duyệt/từ chối |
| `src/utils/hashUtils.ts` | `sha256Email`, `normalizePersonName`, `sha256PersonName` |
| `firestore.rules` | Quy tắc cho self-service + tra cứu |
