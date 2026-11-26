# LeaveManagement – Quản lý nghỉ phép nội bộ

Ứng dụng web (React + Vite + Firebase) để nhân viên **tự đăng ký nghỉ phép không cần đăng nhập**, quản lý duyệt/từ chối đơn, và mọi người xem lịch nghỉ chung. Đơn đã duyệt xuất hiện ngay trên **Lịch nghỉ tháng**, nên không cần mục tra cứu riêng.

- Hosting: `https://mvtpdayoff.web.app` (site `mvtpdayoff`, project `leave-management-vn`)
- Dữ liệu: Cloud Firestore
- Đăng nhập Quản lý: Google hoặc username nội bộ; nhân viên gửi đơn dùng **Anonymous Auth** (không bắt người dùng thao tác gì)

> **Không gửi email, không thu thập email.** Ứng dụng không gửi email thông báo (không có Cloud Functions, không dùng dịch vụ email bên thứ ba) và form nhân viên không hỏi email. Kết quả duyệt hiển thị trên lịch nghỉ và danh sách đi làm.

---

## 1. Tính năng

### Dành cho Nhân viên (không cần đăng nhập)

| Mục | Mô tả |
|---|---|
| **Đăng ký nghỉ phép** | Chọn họ tên, sau đó **chọn từng ngày nghỉ một** (có thể rời rạc, không cần liên tiếp), tối đa 31 ngày/đơn. Dùng **một ô duy nhất** vừa gõ được ngày từ bàn phím (`dd/mm/yyyy` hoặc `yyyy-mm-dd`) vừa bấm biểu tượng lịch để chọn; form mở ra ô ngày **hiện sẵn hôm nay để gõ/chọn tiếp**, nhưng **chưa đưa ngày nào vào đơn** (phải bấm "Thêm ngày"). Ngày cuối tuần/nghỉ công ty bị loại; mỗi ngày chọn **Cả ngày / Sáng 08:15–12:15 / Chiều 13:30–17:30**. Nhập lý do/ghi chú. Không chọn loại phép — quản lý phân bổ khi duyệt. Form nhân viên **không hỏi giấy xác nhận y tế**. |
| **Hôm nay ai đi làm** | Xem đồng nghiệp đang làm việc / nghỉ phép trong ngày. Người nghỉ nửa buổi vẫn hiện trong danh sách với nhãn buổi nghỉ. **Bấm vào thẻ một người** để xem số ngày phép năm và nghỉ việc riêng còn lại của người đó. |
| **Ngày nghỉ công ty** | Xem lịch lễ, nghỉ bù, OT của công ty. |

Đơn gửi xong có trạng thái **Đang chờ duyệt**; quản lý chốt loại phép và phân bổ ngày khi duyệt. Đơn đã duyệt hiện trên lịch nghỉ tháng.

#### Nghỉ nửa ngày & giờ làm việc

- Giờ công ty: **08:15–12:15** (buổi sáng), nghỉ trưa **12:15–13:30**, **13:30–17:30** (buổi chiều).
- Ở form nhân viên, nửa ngày được chọn **riêng cho từng ngày** (select "Cả ngày / Sáng / Chiều"). Tổng `workingDays` = số ngày chọn × 1 + số ngày nửa buổi × 0,5. Ở form Phân bổ của Quản lý (khoảng ngày), nửa ngày vẫn áp dụng cho ngày làm việc đầu tiên. Các ô phân bổ loại phép bước **0,5 ngày**.
- Điểm danh ("Hôm nay ai đi làm") ghi nhận người đó làm việc **buổi còn lại**. Thẻ hiển thị `Nghỉ: Sáng 08:15–12:15` hoặc `Nghỉ: Chiều 13:30–17:30`; lịch nghỉ tháng và chi tiết ngày cũng hiện nhãn nửa ngày.
- Dữ liệu điểm danh nửa ngày là collection `/dailyOffStatus/{ngày}` (`halfDayOff`: chỉ mã nhân sự + buổi nghỉ), không có lý do hay thông tin cá nhân.

### Dành cho Quản lý (đăng nhập)

- **Duyệt đơn chờ**: hàng đợi đơn nhân viên tự gửi, sửa phân bổ (tổng phải bằng số ngày làm việc, bước 0,5 ngày), đổi buổi nghỉ nửa ngày (Sáng/Chiều), duyệt hoặc từ chối kèm lý do bắt buộc, đánh dấu đã có giấy xác nhận nghỉ ốm.
- **Thông báo trong app**: chuông ở góc phải header với số chưa đọc, danh sách thông báo, đánh dấu đã đọc / đọc tất cả. Khi đang mở app mà có đơn mới, hiện **toast** góc dưới phải kèm nút “Xem đơn”, phát **tiếng chuông ba nốt to hơn** (dễ nghe khi đang làm việc app khác) và (nếu đã cấp quyền) hiện **thông báo nổi trên màn hình** kiểu Messenger — vẫn thấy khi đang làm việc app khác, click vào thông báo sẽ mở thẳng tab **Duyệt đơn chờ**. Trong panel chuông có nút **Tiếng báo khi có đơn mới → Đang bật / Đã tắt** và nút **Thông báo trên màn hình → Bật thông báo / Đang bật / Đã chặn**. Ngoài ra có hẳn tab **Thông báo** trong menu quản lý: lọc Tất cả / Chưa đọc, tìm theo tên hoặc nội dung, xem trạng thái hiện tại của đơn liên quan.
- **Phân bổ nghỉ cho nhân viên**: quản lý tạo đơn trực tiếp (trừ quỹ phép ngay).
- Tab **"Đăng ký nghỉ phép"** chỉ hiện ở chế độ **Nhân viên**; khi đăng nhập Quản lý thì ẩn đi (muốn xem lại dùng ô "Chế độ hiển thị" → "Nhân viên"). Quản lý dùng tab riêng **"Phân bổ nghỉ cho nhân viên"** và **"Duyệt đơn chờ"**.
- **Bảng thống kê**, **Lịch nghỉ tháng**, **Quản lý nhân sự**, **Lịch sử nghỉ phép**, **Ngày nghỉ công ty**.
- **Tài khoản & mật khẩu**: tab chỉ cho Quản lý, đổi mật khẩu đăng nhập bằng username (nhập mật khẩu hiện tại → mật khẩu mới ≥ 8 ký tự → xác nhận). App gọi Firebase `reauthenticateWithCredential` + `updatePassword`; không lưu mật khẩu vào Firestore. Tài khoản đăng nhập Google không có mật khẩu nội bộ nên tab chỉ hiển thị thông báo, không cho đổi ở đây.
- **Xuất Excel theo tháng**: trong **Lịch nghỉ tháng**, bấm **"Xuất Excel tháng này"** để tải file `NghiPhep_YYYY-MM.xlsx` phục vụ lưu trữ/đối chiếu. File có 4 sheet: **Chi tiết ngày nghỉ** (mỗi ngày làm việc một dòng: ngày, thứ, nhân viên, phòng ban, buổi nghỉ, số ngày, loại phép phân bổ, lý do, bàn giao, mã đơn, người duyệt, thời điểm duyệt), **Tổng hợp theo nhân viên** (số ngày từng loại phép), **Thông tin** (tháng, giờ làm việc, nguồn dữ liệu, thời điểm xuất) và **Lịch nghỉ tháng** — lưới Thứ 2–Chủ nhật giống hệt trên web: ô có nghỉ phép (xanh lá, kèm tên nhân sự + loại phép), ngày lễ (hồng), OT (xanh dương), cuối tuần (xám). Chỉ gồm đơn **đã duyệt** có ngày làm việc trong tháng đang xem.

> Thông báo (kể cả tiếng chuông và thông báo màn hình) chỉ hoạt động khi quản lý đang đăng nhập và **trình duyệt vẫn mở** (tab có thể đang ẩn, bạn có thể đang dùng app khác). Không có email, không có push khi tắt trình duyệt — muốn push thật khi app đóng cần thêm dịch vụ FCM + máy chủ, hiện chủ động không dùng. Tiếng chuông tạo bằng Web Audio API; thông báo màn hình dùng Notification API của trình duyệt — đều chạy tại máy bạn, không gửi dữ liệu đi đâu. Nếu bị chặn, mở biểu tượng khoá trên thanh địa chỉ để cho phép lại.

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
- Quản lý được đọc/sửa/duyệt đơn; **chỉ Super Admin** (`mynamelink1998@gmail.com`) mới được **xoá vĩnh viễn** đơn (`allow delete: if isSuperAdmin()`) để dọn đơn test. Nút "Xoá đơn" chỉ hiện trong giao diện Super Admin, có hộp xác nhận trước khi xoá. Khi xoá đơn, các thông báo liên quan (chuông + tab Thông báo) cũng bị xoá trong cùng batch Firestore.
- `/leaveSummaries` cho phép mọi người đọc **chỉ số ngày còn lại** (không có lý do, email hay thông tin liên hệ).

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
| `/leaveSummaries/{employeeId}` | Số ngày phép năm / nghỉ việc riêng còn lại (chỉ số, không PII) | Công khai | Quản lý (tự đồng bộ) |
| `/leaveRequestContacts/{id}` | Email liên hệ của **đơn cũ** — rules giữ để tương thích, app không còn ghi/đọc/hiển thị | Quản lý (theo rules) | Không còn dùng |
| `/notifications/{id}` | Thông báo trong app (chuông + toast) | Quản lý | Quản lý; nhân viên chỉ tạo thông báo "đơn mới" cho Quản lý |
| `/dailyOffStatus`, `/monthlyOffStatus` | Chỉ số nghỉ phép không PII cho lịch/điểm danh; `dailyOffStatus.halfDayOff` chứa buổi nghỉ nửa ngày | Công khai theo ngày/tháng | Quản lý |

`/leaveSummaries` do app quản lý tự tính lại khi danh sách đơn đã duyệt thay đổi; chỉ chứa `employeeId`, năm và các con số ngày. `/dailyOffStatus` và `monthlyOffStatus` cũng do quản lý tự đồng bộ; nếu chưa có quản lý mở app, điểm danh có thể chậm cập nhật.

---

## 5. Giới hạn & đánh đổi cần biết

1. **Không có đăng nhập ⇒ không xác thực được danh tính.** Nhân viên chọn tên mình trong danh sách, nên về lý thuyết một người có thể gửi đơn dưới tên người khác. Đây là đánh đổi có chủ ý để không phải cấp tài khoản cho toàn bộ nhân viên. Nếu cần chặt hơn: bật đăng nhập email/Google cho nhân viên và đổi rules sang so khớp `token.email`.
2. **Không có tra cứu trạng thái đơn.** Đơn chờ duyệt/từ chối không hiển thị công khai; chỉ đơn **đã duyệt** mới lên lịch nghỉ tháng. Muốn xem trạng thái, nhân viên hỏi quản lý.
3. **Số ngày còn lại là dữ liệu tổng hợp.** `/leaveSummaries` do quản lý đồng bộ khi mở app; nếu chưa có quản lý nào mở app sau khi duyệt đơn, thẻ quỹ phép có thể chậm cập nhật.
4. Giấy xác nhận y tế chỉ là **một tick xác nhận** ("đã có giấy / chờ bổ sung"); app không nhập link, không upload tệp lên Firebase. Giấy vẫn do nhân viên giữ và đối chiếu trực tiếp với quản lý. Đơn cũ có link Drive vẫn còn trong Firestore nhưng không còn hiển thị trên giao diện.
5. **Không có email thông báo.** Muốn có email tự động phải thêm Cloud Functions (gói Blaze) + dịch vụ gửi mail; hiện tại chủ động không dùng. Thông báo trong app (chuông + toast) chỉ đến khi quản lý đang mở app và đã đăng nhập; không có push khi app đóng.

---

## 6. Quyền riêng tư

**App gửi gì ra ngoài máy?**

- Chỉ dữ liệu tới **Cloud Firestore** của project `leave-management-vn` (Google Firebase): họ tên, phòng ban, các ngày nghỉ đã chọn (có thể rời rạc) kèm buổi nửa ngày, số ngày, lý do, ghi chú, trạng thái duyệt, người xử lý, và số ngày phép còn lại. Form nhân viên không gửi trạng thái giấy xác nhận; Quản lý tự đánh dấu khi duyệt đơn nghỉ ốm.
- **Không** gửi email, không gọi dịch vụ bên thứ ba nào. Không có Google Analytics, không telemetry, không tracking pixel, không quảng cáo, không đọc clipboard, không chụp màn hình, không đọc file trên máy.
- File Excel được **tạo ngay trong trình duyệt** (`src/utils/excelExport.ts`, ZIP + XML thuần, không thư viện Excel), tải xuống máy bạn; app không upload file đi đâu. Nội dung có lý do/ghi chú của đơn nên chỉ nên lưu ở máy/workspace được phép của công ty.
- Mật khẩu Quản lý chỉ nằm trong **Firebase Authentication**; app không gửi mật khẩu vào Firestore hay bất kỳ dịch vụ nào khác. Tab "Tài khoản & mật khẩu" chỉ gọi thẳng Firebase Auth.
- Tiếng báo (`src/utils/notificationSound.ts`) cũng được tổng hợp tại máy bằng Web Audio API; cài đặt Bật/Tắt chỉ lưu trong `localStorage` của trình duyệt (`lm_notification_sound_enabled`). Không microphone, không ghi âm, không phát lại nội dung thông báo.
- Thông báo màn hình (`src/utils/desktopNotifications.ts`) chỉ dùng quyền `Notification` của trình duyệt, nội dung gồm tên nhân sự/phòng ban/số ngày/khoảng ngày (không email, không lý do), không đăng ký service worker, không gọi dịch vụ push bên ngoài.

**Thông báo trong app** (chuông + toast) chỉ là document trong `/notifications` của Firestore, đọc realtime khi quản lý đăng nhập. Không có push notification, không đăng ký service worker, không lấy token thiết bị.

**App ghi gì, ở đâu?**

- Toàn bộ dữ liệu nằm trong Firestore (cloud) — không ghi file lên ổ đĩa người dùng.
- Trình duyệt chỉ lưu: phiên đăng nhập Firebase (IndexedDB/localStorage do SDK quản lý) và một `lm_employee_client_id` ngẫu nhiên trong `localStorage` (dùng nội bộ, không gửi đi đâu).

**Ai đọc được?**

- Quản lý đọc được đơn đầy đủ; giao diện **không còn mục "Liên hệ"** và app không đọc collection email liên hệ cũ.
- Nhân viên chỉ đọc được đơn của chính uid ẩn danh đã tạo.
- Mọi người đọc được `/leaveSummaries`: **chỉ** mã nhân sự, năm và số ngày đã dùng / còn lại. Không có lý do nghỉ, email hay thông tin liên hệ.
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
| `src/components/EmployeeLeaveRequestForm.tsx` | Form nhân viên tự gửi đơn (không đăng nhập, không email, không chọn loại phép) |
| `src/components/AttendanceToday.tsx` | Danh sách đi làm hôm nay + popup quỹ phép còn lại |
| `src/components/LeaveApprovalQueue.tsx` | Hàng đợi duyệt đơn của quản lý |
| `src/components/ApprovalHistory.tsx` | Lịch sử duyệt; hiển thị tên quản lý thật thay cho username/email |
| `src/services/firestoreService.ts` | `submitEmployeeLeaveRequest`, duyệt/từ chối, `syncLeaveSummaries`, đồng bộ trạng thái ngày/tháng |
| `src/utils/managerUtils.ts` | `managerNameForUid`, `resolveManagerName` — quy đổi uid/username cũ sang tên quản lý |
| `firestore.rules` | Quy tắc cho self-service + `/leaveSummaries` công khai |
