# LeaveManagement – Nhật ký cập nhật và cải tiến dự án

**Cập nhật lần cuối:** 24/11/2026  
**Kiến trúc hiện tại:** React + TypeScript + Vite + Tailwind CSS + Firebase (Google Auth, Cloud Firestore & Firebase Hosting — chạy hoàn toàn phía client, không cần server Node.js)

> Tài liệu này ghi lại toàn bộ các hạng mục đã xây dựng, nâng cấp và kiểm thử từ nền tảng ban đầu của dự án **LeaveManagement** cho tới phiên bản hiện tại.

---

## 1. Tóm tắt kiến trúc & công nghệ

| Thành phần | Công nghệ / Cấu hình đang sử dụng |
|---|---|
| Giao diện | React 19, TypeScript, Tailwind CSS v4 |
| Hiệu ứng chuyển động | `motion` (`motion/react`) |
| Biểu tượng | `lucide-react` |
| Triển khai web tĩnh | Vite SPA (`dist/`) + Firebase Hosting (`mvtpdayoff.web.app`, cấu hình tại `firebase.json`) |
| Cơ sở dữ liệu | Firebase Cloud Firestore (cấu hình tại `firebase-applet-config.json`) |
| Xác thực | Firebase Authentication (Google Sign-In `signInWithPopup`) kiểm tra quyền Quản lý qua `ADMIN_EMAIL` & `/managers/{email}` |
| Kiểm tra & Build | `npm run lint` (`tsc --noEmit`), `npm run build` (`vite build`), `npx eslint firestore.rules` |

---

## 2. Danh sách các tính năng & cải tiến đã thực hiện

### 2.1 Phân quyền Quản lý và Bảo mật quyền riêng tư Nhân viên
- **Nhân viên không cần đăng nhập:** Chỉ xem **Hôm nay ai đi làm** và **Ngày nghỉ công ty**.
- **Bảo mật lịch nghỉ cá nhân:** Nhân viên chưa đăng nhập không thể tự tạo, đọc hoặc liệt kê collection `/leaveRequests` hay `/notifications` của đồng nghiệp khác (bị chặn từ tầng `firestore.rules`).
- **Tra cứu đơn theo email (`EmployeeLeaveLookup.tsx`):**
  - Khi tạo đơn, email nhận kết quả được băm SHA-256 ở phía client (`src/utils/hashUtils.ts`) để ghi đồng bộ bản tóm tắt trạng thái vào `/emailLookups/{emailHash}/requests/{requestId}` và giữ email gốc tách riêng trong `/leaveRequestContacts/{requestId}` (chỉ Quản lý đọc được).
  - Nhân viên nhập đúng địa chỉ email đã đăng ký để xem trạng thái đơn của riêng mình (`Mới tạo`, `Đang chờ duyệt`, `Đã duyệt`, `Từ chối`, phân bổ phép, lý do từ chối, trạng thái giấy xác nhận).
- **Quản lý đa tài khoản (`EmployeeManager.tsx`, `firestore.rules`):**
  - Super Admin mặc định: `mynamelink1998@gmail.com`.
  - Super Admin có thể thêm/gỡ quyền các tài khoản Quản lý khác trong collection `/managers/{managerEmail}` để cùng đăng nhập Google, xem Dashboard tổng quan, lịch nghỉ toàn công ty và phê duyệt đơn.

### 2.2 Quy tắc ngày làm việc Thứ 2 – Thứ 6 & Ngày làm việc bù
- Cập nhật logic tại `src/utils/dateUtils.ts` (`isWorkingDay`, `calculateWorkingDays`):
  - Mặc định làm việc từ **Thứ 2 đến Thứ 6**; **Thứ 7 và Chủ nhật** là ngày nghỉ cuối tuần và tự động được loại trừ khi tính số ngày nghỉ phép.
  - Ngày có phân loại `Lễ/Tết`, `Nghỉ bù`, `Nghỉ công ty` không tính vào ngày nghỉ phép cá nhân.
  - Nếu Quản lý cấu hình một ngày (kể cả Thứ 7 hoặc Chủ nhật) là **Ngày làm việc bù**, hệ thống mở lại ngày đó thành ngày làm việc bình thường khi tính số ngày phép và hiển thị rõ trên lịch.

### 2.3 Tự động chuyển năm mới (`2028+`)
- `MonthlyCalendar.tsx`: Điều hướng tháng/năm liên tục qua tháng 12 sang năm mới không giới hạn cứng.
- `HolidayManager.tsx`: Mặc định lấy `new Date().getFullYear()`, nút `<` / `>` và dải năm tự động mở rộng trong khoảng `2020–2100`.
- `LeaveStatsTable.tsx`: Lọc thống kê theo năm (`statsYear`), mặc định lấy năm hiện tại và tự bổ sung các năm phát sinh từ dữ liệu đơn nghỉ.

### 2.4 Phân trang bảng thống kê Dashboard
- Cập nhật `src/components/LeaveStatsTable.tsx`:
  - Giới hạn hiển thị **5 nhân viên mỗi trang** (`PAGE_SIZE = 5`) để bảng Dashboard gọn gàng khi số lượng nhân sự tăng lên.
  - Bổ sung thanh phân trang (Trang trước / Số trang / Trang sau), lọc theo phòng ban (`Tất cả`, `Quản lý`, `Nhân sự`), tìm kiếm theo tên và lọc theo năm.

### 2.5 Hệ thống gửi thông báo qua Email
- Xây dựng route `POST /api/notify-email` trong `server.ts` và client helper `src/services/emailService.ts`:
  - Khi nhân viên gửi đơn mới (`NEW_REQUEST`): áp dụng rate limit theo IP để chống spam và gửi email cảnh báo tới email Quản lý.
  - Khi Quản lý tiếp nhận (`RECEIVED`), duyệt (`APPROVED`) hoặc từ chối (`REJECTED`): bắt buộc xác thực `Authorization: Bearer <Firebase ID Token>` và kiểm tra quyền Quản lý qua Firestore trước khi gửi email trả kết quả cho nhân viên.
  - Sử dụng Resend API nếu có `RESEND_API_KEY` trong môi trường; nếu chưa cấu hình khóa API, hệ thống ghi nhận thông báo nội bộ trên Firestore (`/notifications`) và cung cấp liên kết `mailto:` dự phòng trên giao diện.

### 2.6 Cải tiến hiệu ứng chuyển động Menu & Giao diện
- Tích hợp `motion/react` trong `src/App.tsx`:
  - Bọc `MotionConfig reducedMotion="user"` tôn trọng cài đặt giảm chuyển động của hệ điều hành.
  - Hiệu ứng trượt/mờ mượt mà cho menu ngăn kéo trên màn hình nhỏ (`AnimatePresence`), chỉ báo tab đang chọn dùng `layoutId`, và chuyển cảnh mượt khi đổi giữa các mục chức năng.

### 2.7 Bộ chọn ngày & Tiêu đề thứ tiếng Việt đầy đủ (`Thứ 2` – `Chủ nhật`)
- Tạo mới `src/components/VietnameseDatePicker.tsx`:
  - Thay thế ô `<input type="date">` mặc định của trình duyệt (vốn hiển thị chữ cái đầu dễ nhầm lẫn).
  - Hiển thị đầy đủ tiêu đề cột: **Thứ 2, Thứ 3, Thứ 4, Thứ 5, Thứ 6, Thứ 7, Chủ nhật**.
  - Hiển thị ngày đã chọn kèm thứ cụ thể (ví dụ: `Thứ 2, 24/11/2026`), tô sáng khoảng ngày nghỉ đang chọn, đánh dấu **Thứ 7, CN nghỉ**, **Ngày lễ công ty** và **Làm bù**.
- Cập nhật tiêu đề cột của `MonthlyCalendar.tsx` thành: `Thứ 2`, `Thứ 3`, `Thứ 4`, `Thứ 5`, `Thứ 6`, `Thứ 7 (Nghỉ)`, `Chủ nhật (Nghỉ)`.

### 2.8 Bổ sung Lịch trực quan tại mục Ngày nghỉ công ty
- Nâng cấp `src/components/HolidayManager.tsx`:
  - Bổ sung lưới **Lịch ngày nghỉ công ty** theo tháng với tiêu đề tiếng Việt đầy đủ (`Thứ 2` – `Chủ nhật (Nghỉ)`), nút chuyển tháng, nút **Hôm nay** và đồng bộ trực tiếp với bộ lọc năm.
  - Bổ sung cột **Chi tiết ngày đang chọn & Sự kiện trong tháng**: nhấn vào bất kỳ ngày nào trên lịch hoặc một dòng trong bảng danh sách năm để xem chi tiết; Quản lý có thể nhấn nhanh **Thêm ngày nghỉ vào ngày này** hoặc **Đặt ngày này làm Ngày làm việc bù** để điền sẵn vào biểu mẫu (sử dụng `VietnameseDatePicker`).

### 2.9 Điều chỉnh mục "Giấy xác nhận" và nhãn "Loại nghỉ đề xuất"
- **Hiển thị có điều kiện (`LeaveRequestForm.tsx`):**
  - Mục **Giấy xác nhận (khi nghỉ ốm / nằm viện)** được ẩn mặc định và chỉ xuất hiện (với hiệu ứng chuyển động mượt) khi nhân viên chọn loại nghỉ đề xuất là **Nghỉ ốm**. Khi chuyển sang loại phép khác, trạng thái giấy xác nhận và tệp đính kèm tự động được đặt lại.
- **Thêm lựa chọn "Bổ sung sau":**
  - Bổ sung ô tích **Bổ sung sau** (`hospitalCertPending`) cạnh **Có giấy xác nhận nằm viện** và nút đính kèm tệp (hai ô tự động loại trừ chéo khi chọn).
  - Cho phép nhân viên gửi đơn nghỉ ốm và Quản lý phê duyệt đơn nghỉ ốm khi chọn **Bổ sung sau**; bổ sung nút **Xác nhận đã nộp giấy** trong `AdminLeaveQueue.tsx` để Quản lý chốt lại sau khi nhân viên nộp giấy, đồng thời hiển thị trạng thái bổ sung sau ở `EmployeeLeaveLookup.tsx` và nội dung email thông báo.
  - Cập nhật đồng bộ schema `firebase-blueprint.json`, `firestore.rules` (đã kiểm tra `npx eslint firestore.rules` và deploy lên Firebase) và `src/services/firestoreService.ts`.
- **Cập nhật câu chữ nhãn đề xuất (`LeaveRequestForm.tsx`):**
  - Đổi nhãn `Loại nghỉ đề xuất (Admin sẽ chốt phân bổ khi duyệt)` thành `Loại nghỉ đề xuất (Quản lý sẽ chốt phân bổ khi duyệt)`.

### 2.10 Đính kèm giấy xác nhận qua Google Drive (không lưu tệp lên Firebase miễn phí)
- Thay thế nút chọn tệp cục bộ bằng **liên kết Google Drive (`attachmentUrl`)** để tránh tốn dung lượng lưu trữ trên gói Firebase Spark miễn phí:
  - Nhân viên có nút **Mở Google Drive để tải tệp lên**, tự tải tệp lên Drive cá nhân, bật quyền chia sẻ và dán đường dẫn vào ô nhập (`https://drive.google.com/...` hoặc `https://docs.google.com/...`).
  - Kiểm tra định dạng và tên miền hợp lệ cả ở client (`src/utils/urlUtils.ts`) lẫn trong `firestore.rules` (chỉ chấp nhận HTTPS thuộc `drive.google.com` hoặc `docs.google.com`, độ dài tối đa 500 ký tự).
  - Quản lý bấm mở trực tiếp liên kết Google Drive trong màn hình duyệt đơn (`AdminLeaveQueue.tsx`) hoặc qua email thông báo; nhân viên cũng xem lại được liên kết đã đính kèm trong mục **Kiểm tra đơn của tôi** (`EmployeeLeaveLookup.tsx`).

### 2.11 Đăng nhập Quản lý trực tiếp bằng Firebase Authentication (loại bỏ `server.ts`)
- **Chạy 100% trên Firebase (`src/App.tsx`, `src/firebase.ts`, `firebase.json`):**
  - Loại bỏ hoàn toàn backend Node.js/Express (`server.ts`) và hộp thoại mật khẩu cục bộ để triển khai gọn nhẹ lên **Firebase Hosting** miễn phí (`mvtpdayoff.web.app`).
  - Nhấn **Đăng nhập Quản lý** gọi trực tiếp `signInWithPopup(auth, googleProvider)` của Firebase Authentication; chỉ những tài khoản Google đã xác minh email thuộc `ADMIN_EMAIL` hoặc nằm trong collection `/managers/{email}` mới mở được không gian Quản lý và đọc/ghi dữ liệu nhạy cảm theo `firestore.rules`.
  - Nếu đăng nhập bằng tài khoản Google chưa được cấp quyền Quản lý, giao diện hiển thị cảnh báo rõ ràng và cho phép **Đổi tài khoản Quản lý** hoặc **Đăng xuất**.

### 2.12 Tab "Hôm nay ai đi làm" với Avatar đầu lúc lắc
- **Mục mới trong thanh điều hướng (`src/components/AttendanceToday.tsx`, `src/components/BobbleAvatar.tsx`):**
  - Hiển thị cho cả nhân viên và Quản lý danh sách những đồng nghiệp đang làm việc trong ngày hôm nay (tự động tính theo ngày làm việc Thứ 2 – Thứ 6, Ngày nghỉ công ty, Ngày làm việc bù và trừ đi những người có đơn nghỉ phép **Đã duyệt** trong hôm nay).
  - Đồng bộ trạng thái nghỉ hôm nay qua document `/dailyOffStatus/{YYYY-MM-DD}` (chỉ chứa danh sách ID nhân viên nghỉ hôm nay, không lộ lý do hay thông tin cá nhân ra ngoài).
  - **UI Mô hình đầu lúc lắc gắn lò xo (`BobbleAvatar.tsx`):** Thiết kế theo phong cách standee mica viền trắng gắn đế lò xo với 12 mẫu thân chibi (xe tay ga vàng, Vespa, ván trượt, cốc cà phê, tên lửa...) và phần đầu ngoại cỡ gắn lò xo cổ lắc lư liên tục hoặc bật nảy mạnh khi chạm/di chuột vào từng nhân vật hay bấm nút **Lắc đầu chào cả team**.
  - **Ghép ảnh khuôn mặt thật (`src/utils/imageUtils.ts`):** Trong mục **Quản lý nhân sự**, Quản lý có thể chọn kiểu mô hình và tải lên ảnh khuôn mặt thật (tự động cắt vuông và nén nhẹ về JPEG dưới 35 KB) để ghép lên phần đầu lúc lắc của nhân viên.

### 2.13 Chuyển sang quy trình Quản lý tự đăng ký & phân bổ ngày nghỉ (tinh gọn hàng đợi & thông báo)
- **Loại bỏ tự đăng ký phía Nhân viên (`App.tsx`, `LeaveRequestForm.tsx`, `firestoreService.ts`, `firestore.rules`):**
  - Mục **Đăng ký & phân bổ nghỉ** dành riêng cho **Quản lý** (`managerOnly: true`); thanh tiêu đề ở chế độ Nhân viên không còn nút tạo đơn nghỉ mới.
  - Quản lý chọn trực tiếp nhân viên (xem ngay quỹ **Phép năm còn lại** và **Nghỉ việc riêng còn lại** tại chỗ), chọn khoảng ngày nghỉ tiếng Việt, chia linh hoạt nhiều loại phép trên cùng 1 đơn (hoặc bấm **Tự chia theo phép còn lại**) rồi bấm **Đăng ký & phân bổ ngày nghỉ** để trừ phép và cập nhật lịch ngay lập tức (không còn mục nhập email hay gửi thông báo).
  - Với phân bổ **Nghỉ ốm**, biểu mẫu tinh gọn chỉ giữ lại tùy chọn **Có giấy xác nhận** (bỏ ô gắn đường dẫn và lựa chọn bổ sung sau).
  - Loại bỏ các mục không còn cần thiết: thẻ KPI **Đơn chờ xử lý** trên Dashboard, tab **Duyệt đơn nghỉ**, tab **Thông báo** và tab **Kiểm tra đơn của tôi**.
  - Ở tab **Hôm nay ai đi làm**, giữ nguyên hiển thị trạng thái **Đang làm việc** (bỏ chữ "Chạm để lắc").
  - Ở tab **Ngày nghỉ công ty**, cả lưới lịch tháng lẫn cột bên phải (**Chi tiết tháng đang chọn** đối với nhân viên) đều hiển thị lịch **Nghỉ phép cá nhân** của các nhân sự trong tháng (tên nhân sự, phòng ban, liệt kê đầy đủ từng ngày nghỉ nếu nghỉ dài ngày) cùng **Lịch nghỉ của công ty** thông qua `/monthlyOffStatus/{YYYY-MM}`, tuyệt đối không hiển thị lý do nghỉ hay chi tiết phép riêng tư.
  - Đổi toàn bộ nhãn hiển thị **Làm bù (T7/CN)** / **Ngày làm việc bù** trên giao diện (lịch tháng, thiết lập ngày nghỉ công ty, bộ chọn ngày, đăng ký nghỉ, bảng chấm công hôm nay) sang **OT** (giữ nguyên giá trị lưu Firestore `'Ngày làm việc bù'` để tương thích dữ liệu cũ).
  - Giao diện thanh điều hướng bên trái (Sidebar) được đồng bộ màu thương hiệu xanh `#25576b`.
  - Siết chặt `firestore.rules`: chỉ `isManager()` mới được phép tạo mới tài liệu trong `/leaveRequests`, `/leaveRequestContacts`, `/emailLookups` và `/notifications`.

---

## 3. Cấu trúc Firestore & Bảo mật (`firestore.rules`)

| Collection / Đường dẫn | Mục đích | Quyền đọc | Quyền ghi |
|---|---|---|---|
| `/employees/{employeeId}` | Danh sách nhân viên (tên, phòng ban, `avatarPreset`, `avatarPhoto`) | Công khai (phục vụ bảng điểm danh hôm nay) | Chỉ Quản lý |
| `/employeeQuotas/{employeeId}` | Hạn mức phép năm & phép cá nhân (5 ngày) | Chỉ Quản lý | Chỉ Quản lý |
| `/managers/{managerEmail}` | Danh sách tài khoản Quản lý được cấp quyền | Quản lý / Chính chủ kiểm tra quyền | Chỉ Super Admin |
| `/companyHolidays/{holidayId}` | Lịch ngày nghỉ lễ, nghỉ bù, làm việc bù | Công khai | Chỉ Quản lý |
| `/dailyOffStatus/{dateKey}` | Danh sách ID nhân sự đang nghỉ phép đã duyệt theo ngày (không PII) | Nhân viên đọc đơn lẻ theo `YYYY-MM-DD`; Quản lý đồng bộ | Chỉ Quản lý |
| `/monthlyOffStatus/{monthKey}` | Danh sách nhân sự & các ngày nghỉ phép đã duyệt theo tháng (không PII) | Nhân viên đọc đơn lẻ theo `YYYY-MM`; Quản lý đồng bộ | Chỉ Quản lý |
| `/leaveRequests/{requestId}` | Hồ sơ đơn xin nghỉ phép đầy đủ | Chỉ Quản lý | Tạo & cập nhật chỉ Quản lý; Không cho xóa |
| `/leaveRequestContacts/{requestId}` | Email liên hệ của đơn nghỉ (tách riêng PII) | Chỉ Quản lý | Chỉ Quản lý (tùy chọn khi nhập email); Không sửa/xóa |
| `/emailLookups/{emailHash}/requests/{requestId}` | Bản tóm tắt trạng thái theo mã băm email | Quản lý hoặc đúng `emailHash` | Tạo & cập nhật chỉ Quản lý; Không xóa |
| `/notifications/{notificationId}` | Thông báo nội bộ cho Quản lý | Chỉ Quản lý | Chỉ Quản lý |

---

## 4. Các file chính trong dự án

| File | Vai trò |
|---|---|
| `src/App.tsx` | Khung ứng dụng, điều hướng 2 chế độ Nhân viên / Quản lý, hiệu ứng menu, KPI tổng quan |
| `src/firebase.ts` | Khởi tạo Firebase App, Auth (Google), Firestore và xử lý lỗi chuẩn hóa |
| `src/types/leave.ts` | Định nghĩa kiểu dữ liệu nhân viên, hạn mức phép, đơn nghỉ, tra cứu email, ngày nghỉ công ty |
| `src/services/firestoreService.ts` | Toàn bộ thao tác đọc/ghi realtime và batch Firestore |
| `src/utils/dateUtils.ts` | Tính ngày làm việc (Thứ 2–6, loại trừ lễ, cộng ngày OT), tạo ô lịch tháng, định dạng ngày/thứ VN |
| `src/utils/hashUtils.ts` | Hàm băm `sha256Email` phục vụ tra cứu đơn cá nhân an toàn |
| `src/utils/urlUtils.ts` | Kiểm tra và làm sạch liên kết Google Drive hợp lệ (`drive.google.com`, `docs.google.com`) |
| `src/components/LeaveRequestForm.tsx` | Biểu mẫu dành riêng cho Quản lý đăng ký, chia phân bổ nhiều loại phép, kiểm tra quỹ phép còn lại & trừ phép ngay |
| `src/components/VietnameseDatePicker.tsx` | Bộ chọn ngày tiếng Việt tùy chỉnh với tiêu đề Thứ 2 – Chủ nhật |
| `src/components/HolidayManager.tsx` | Lịch trực quan & quản lý ngày nghỉ lễ, nghỉ bù, OT theo năm |
| `src/components/MonthlyCalendar.tsx` | Lịch nghỉ toàn công ty theo tháng dành cho Quản lý |
| `src/components/LeaveStatsTable.tsx` | Bảng thống kê phép nhân viên (phân trang 5 người/trang, lọc năm/phòng ban) |
| `src/components/EmployeeManager.tsx` | Quản lý danh sách nhân viên, avatar, hạn mức phép và tài khoản Quản lý |
| `src/components/ApprovalHistory.tsx` | Lịch sử đăng ký, phân bổ nghỉ phép & xác nhận nộp bổ sung giấy nghỉ ốm |
| `src/components/AttendanceToday.tsx` | Tab Hôm nay ai đi làm (lọc phòng ban, tìm tên, trạng thái làm việc trong ngày) |
| `src/components/BobbleAvatar.tsx` | 12 mẫu avatar nhân vật SVG với phần đầu lúc lắc tương tác |
| `firebase.json` | Cấu hình Firebase Hosting (`mvtpdayoff.web.app`) và đường dẫn `firestore.rules` |
| `firestore.rules` & `firebase-blueprint.json` | Quy tắc bảo mật Firestore và schema dữ liệu đồng bộ |

---

## 5. Trạng thái kiểm thử gần nhất

- `npx eslint firestore.rules`: Đạt (0 lỗi) và đã deploy rules lên Firebase.
- `npm run lint` (`tsc --noEmit`): Đạt (0 lỗi TypeScript).
- `npm run build` (`vite build`): Đạt (build thành công, sẵn sàng deploy Firebase Hosting).
