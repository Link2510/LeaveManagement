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
  - Sử dụng Resend API nếu có `RESEND_API_KEY` trong môi trường; nếu chưa cấu hình khóa API, hệ thống ghi nhận thông báo nội bộ trên Firestore (`/notifications`) và cung cấp liên kết `mailto:` dự phòng trên giao diện. *(Phần gửi email đã được bỏ hoàn toàn ở mục 2.14.)*

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

### 2.14 Nhân viên tự đăng ký nghỉ phép không cần đăng nhập + email kết quả + tra cứu theo họ tên

- **Form nhân viên (`src/components/EmployeeLeaveRequestForm.tsx`):** chọn họ tên từ danh sách nhân sự, nhập email dùng để tra cứu, chọn khoảng ngày bằng bộ chọn tiếng Việt (tự trừ T7/CN + ngày lễ, cộng ngày OT), nhập lý do/ghi chú, đề xuất loại phép; nghỉ ốm có thể đánh dấu đã có giấy xác nhận và dán liên kết Google Drive. Đơn gửi xong hiển thị mã đơn + nút chuyển sang tra cứu.
- **Phiên ẩn danh (`src/firebase.ts` – `ensureEmployeeAnonymousSession`):** mỗi lần gửi đơn, app đăng nhập ẩn danh để có `uid`, nhờ đó rules xác thực được đơn do chính người gửi tạo mà người dùng không phải đăng nhập. Phiên ẩn danh không hiện cảnh báo "chưa được cấp quyền Quản lý" (đã sửa trong `App.tsx`).
- **Ghi dữ liệu nguyên tử (`submitEmployeeLeaveRequest`):** một batch gồm đơn `Đang chờ duyệt` + `leaveRequestContacts` + `emailLookups` + `nameLookups` + thông báo cho Quản lý.
- **Tra cứu (`src/components/EmployeeLeaveLookup.tsx`):** hai chế độ **Theo email** và **Theo họ tên**; họ tên được chuẩn hoá dấu tiếng Việt (`normalizePersonName`, `sha256PersonName` trong `hashUtils.ts`) nên `Nguyen Minh Anh` và `Nguyễn Minh Anh` cho cùng kết quả. Kết quả hiển thị trạng thái, khoảng ngày, số ngày, phân bổ được duyệt, lý do từ chối, người xử lý và liên kết giấy xác nhận.
- **Hàng đợi duyệt (`src/components/LeaveApprovalQueue.tsx`):** tab **Duyệt đơn chờ** (kèm badge số đơn) cho Quản lý; sửa phân bổ với ràng buộc tổng ngày = số ngày làm việc; từ chối bắt buộc nhập lý do; hiển thị email liên hệ của nhân viên.
- **Đồng bộ tra cứu (`syncMissingLookups`):** thay `syncMissingEmailLookups`, backfill cả `emailHash` và `nameHash` cho đơn cũ (tối đa 20 đơn/lượt, không chặn UI). Các luồng `receiveLeaveRequest`, `approveLeaveRequest`, `rejectLeaveRequest`, `markHospitalCertReceived` đều cập nhật cả 2 bản tra cứu.
- **Không gửi email:** theo yêu cầu mới, đã bỏ toàn bộ backend email (thư mục `functions/`, cấu hình `functions` trong `firebase.json`, secret Resend). Nhân viên tự tra cứu kết quả trong app. Email nhân viên nhập chỉ dùng làm khoá tra cứu (`emailLookups`) và để quản lý liên hệ khi cần (`leaveRequestContacts`).
- **Rules:** nhân viên (kể cả ẩn danh) chỉ được **tạo** đơn `Đang chờ duyệt` gắn đúng `submitterUid`, không được ghi `processedBy`/`processedAt`/`rejectionReason`; chỉ được `get` đơn của chính mình; thêm khối `/nameLookups/{nameHash}/requests`; cho phép tạo contact/emailLookup/nameLookup/thông báo admin trong cùng batch với kiểm tra `getAfter()`.
- **Đánh đổi đã ghi rõ trong `README.md`:** không đăng nhập nên không chống mạo danh tuyệt đối; tra cứu theo họ tên là "bí mật bằng họ tên" và có thể tắt bằng cách bỏ khối `nameLookups`.

### 2.15 Thông báo đơn mới cho Quản lý: chuông + toast + trang thông báo

- **Chuông trên header (chỉ khi đã đăng nhập Quản lý):** badge số thông báo chưa đọc, mở panel danh sách 30 thông báo gần nhất, bấm một thông báo để nhảy sang **Duyệt đơn chờ** và đánh dấu đã đọc; có nút **Đọc tất cả** và liên kết **Xem tất cả**.
- **Toast góc dưới phải:** `subscribeLeaveRequests` nhận thêm callback `onAdded` (lọc `docChanges()` type `added` + `status === 'Đang chờ duyệt'`), bỏ qua snapshot đầu tiên và đơn do chính Quản lý tạo hộ; toast hiện tên nhân sự, phòng ban, khoảng ngày, số ngày, nút **Xem đơn** / **Để sau**, tự ẩn sau 12 giây.
- **Trang Thông báo (`src/components/NotificationsPage.tsx`, tab `notifications`, `managerOnly`):** thống kê chưa đọc/tổng/số đơn chờ, bộ lọc **Tất cả / Chưa đọc**, tìm theo tên hoặc nội dung, hiển thị trạng thái hiện tại của đơn liên quan (`StatusLabel`), nút **Đọc tất cả** và **Mở hàng đợi duyệt**.
- **Dữ liệu:** dùng lại `/notifications` (`recipientType == 'admin'`) do `submitEmployeeLeaveRequest` ghi trong cùng batch; `subscribeNotifications` / `markNotificationRead` / `markAllNotificationsRead` trước đây là code chết nay đã nối vào App.
- **Giới hạn:** chỉ hoạt động khi Quản lý đang mở app và đã đăng nhập; không push notification, không service worker, không email. Super admin dùng chung cơ chế `isManager()` nên thấy giống hệt Quản lý.

### 2.16 Gọn luồng nhân viên + tên quản lý thật + quỹ phép trên thẻ đi làm

- **Bỏ toàn bộ tra cứu đơn (`EmployeeLeaveLookup.tsx`, `emailLookups`, `nameLookups`, `syncMissingLookups`, `hashUtils.ts`):** đơn đã duyệt đã hiện trên **Lịch nghỉ tháng**, nên nhân viên không cần tra cứu trạng thái riêng. Rules cũng bỏ hai khối lookup; dữ liệu cũ trong Firestore giữ nguyên nhưng không còn được ghi/đọc.
- **Form nhân viên gọn hơn (`EmployeeLeaveRequestForm.tsx`):** bỏ ô **email** và mục **Loại nghỉ đề xuất**; đơn gửi đi có `allocations: []` để Quản lý tự phân bổ khi duyệt. Giấy xác nhận nghỉ ốm vẫn giữ dưới dạng tuỳ chọn (checkbox + liên kết Drive), không còn phụ thuộc việc chọn loại phép.
- **Không thu thập email:** `submitEmployeeLeaveRequest` không ghi `leaveRequestContacts`, `emailHash`, `nameHash` nữa; đơn cũ vẫn đọc được contact nếu đã có.
- **Tên quản lý thật (`src/utils/managerUtils.ts`):** `managerNameForUid` lấy `name` trong `/managers/{uid}` thay vì `displayName`/email; `resolveManagerName` quy đổi cả username và pseudo-email `<username>@accounts.leave-management.invalid` của dữ liệu cũ sang tên thật khi hiển thị ở **Lịch sử nghỉ phép** (cột "Người & thời điểm ghi nhận").
- **Quỹ phép công khai (`/leaveSummaries/{employeeId}`):** Quản lý tự đồng bộ khi mở app (`syncLeaveSummaries`) từ đơn đã duyệt + hạn mức; mọi người đọc được **chỉ số ngày**. Bấm thẻ đồng nghiệp ở **Hôm nay ai đi làm** mở popup hiển thị phép năm và nghỉ việc riêng còn lại, không có lý do hay email.
- **Dashboard:** ba thẻ KPI (tổng nhân viên, đang nghỉ hôm nay, đã ghi nhận tháng này) → **Lịch nghỉ tháng full chiều rộng** ngay dưới → bảng thống kê. Panel "Chi tiết ngày chọn" chuyển xuống dưới lịch thay vì cột phải.
- **Kiểm thử:** `npm run lint` và `npm run build` đều đạt; cần deploy `firestore.rules` mới (thêm `/leaveSummaries`, bỏ lookup) trước khi dùng tính năng quỹ phép trên production.

### 2.17 Sửa lỗi "Chưa có dữ liệu quỹ phép" trên thẻ đồng nghiệp

- **Nguyên nhân:** rules có `allow list: if resource.data.year >= 2020` cho `/leaveSummaries`, nhưng `subscribeLeaveSummaries` và `syncLeaveSummaries` lại gọi truy vấn **không có điều kiện** `collection(...)`. Theo nguyên tắc "rules are not filters", Firestore từ chối toàn bộ truy vấn (PERMISSION_DENIED); hàm đồng bộ nuốt lỗi nên không bao giờ ghi document nào, còn popup nhân viên luôn nhận `{}`.
- **Cách sửa:** thêm `where('year', '>=', 2020)` vào cả `onSnapshot` lẫn `getDocs` của `/leaveSummaries` (giống cách `subscribeHolidays` đã làm). Đồng thời `console.warn` để lỗi truy vấn/quỹ phép không còn bị im lặng khi chẩn đoán.
- **Sau khi cập nhật:** chỉ cần Quản lý mở app một lần (để `syncLeaveSummaries` chạy), các thẻ quỹ phép sẽ có số liệu realtime cho mọi nhân viên.

### 2.18 Nghỉ nửa ngày (0,5) và điểm danh theo buổi sáng / chiều

- **Giờ công ty (chốt):** 08:15–12:15 (sáng), nghỉ trưa 12:15–13:30, 13:30–17:30 (chiều) — khai báo hằng số `COMPANY_WORK_TIME` trong `dateUtils.ts`.
- **Luồng gửi đơn:** cả form nhân viên (`EmployeeLeaveRequestForm.tsx`) và form Quản lý (`LeaveRequestForm.tsx`) có checkbox **"Chỉ nghỉ nửa ngày"** + chọn buổi **Sáng / Chiều**. Nửa ngày được **trừ vào ngày làm việc đầu tiên** của khoảng (`getFirstWorkingDate` + `applyHalfDayToWorkingDays`): 1 ngày → 0,5; 3 ngày → 2,5. Các ô phân bổ loại phép vốn đã bước `step=0.5`, nên tổng phân bổ khớp `workingDays` thập phân.
- **Dữ liệu đơn:** `LeaveRequestItem.halfDay = { date, session }` (optional) được ghi ở `submitEmployeeLeaveRequest` / `createManagerAllocatedLeaveRequest`; Quản lý có thể đổi buổi ngay trong hàng đợi duyệt (`approveLeaveRequest` nhận override). `mapRequestDoc` đọc lại trường này; rules cho phép `halfDay` trong create/update.
- **Điểm danh:** `syncAllDailyOffStatuses` chỉ đưa nhân sự vào `offEmployeeIds` khi nghỉ **cả ngày**; ngày có `halfDay` được ghi vào mảng mới `dailyOffStatus.halfDayOff = [{ employeeId, session }]`. `subscribeDailyOffStatus` trả thêm mảng này. `AttendanceToday` giữ người nghỉ nửa buổi trong danh sách đi làm, hiện nhãn `Nghỉ: Sáng 08:15–12:15` / `Nghỉ: Chiều 13:30–17:30` và "Làm việc buổi còn lại" (quyền đọc công khai, không lý do / email). Lịch tháng + chi tiết ngày cũng hiện nhãn nửa ngày.
- **Rules & blueprint:** `isValidDailyOffStatus` chấp nhận `halfDayOff`, `affectedKeys` cho phép cập nhật; `isValidLeaveRequest` chấp nhận `halfDay`; `firebase-blueprint.json` cập nhật theo. Cần deploy rules (GitHub Actions tự làm khi push `main`).
- **Kiểm thử:** `npm run lint` + `npm run build` đạt ở cả repo nguồn và production.

### 2.19 Xuất Excel danh sách ngày nghỉ theo tháng

- Nút **"Xuất Excel tháng này"** nằm trên đầu trang **Lịch nghỉ tháng** (`MonthlyCalendar.tsx`), dùng đúng tháng đang xem (có chuyển tháng bằng mũi tên). Hiện dòng thông báo số bản ghi đã xuất.
- `src/utils/excelExport.ts` tạo file `.xlsx` **hoàn toàn ở client**, **không thêm dependency**: viết ZIP chế độ stored (có CRC-32) gồm các part XML của OOXML, dùng inline string nên không cần shared strings.
- Dữ liệu: chỉ đơn **Đã duyệt** có ít nhất một ngày làm việc trong tháng. Mỗi ngày làm việc của đơn thành một dòng (ngày nghỉ nửa buổi ghi `0.5` + buổi Sáng/Chiều). Phân bổ loại phép được chia tuần tự theo từng ngày (`splitAllocationsByDays`) để tổng khớp exact.
- Ba sheet: **Chi tiet ngay nghi** (12 cột, có lý do/ghi chú/mã đơn/người duyệt), **Tong hop nhan vien** (số ngày theo 6 loại phép), **Thong tin** (tháng, giờ công ty, nguồn Firestore nội bộ, thời điểm xuất, ghi chú quyền riêng tư).
- **Kiểm chứng:** tạo file mẫu bằng `tsx`, mở bằng `zipfile` + `ElementTree` của Python: CRC/ZIP hợp lệ, XML hợp lệ, dòng dữ liệu đúng (ngày 02/11 nửa ngày `0.5`, ngày 03/11 chia `Phép năm 0.5 + Nghỉ việc riêng 0.5`). Đã xoá file test. `npm run lint` + `npm run build` đạt.

### 2.20 Giấy xác nhận y tế gọn còn một tick

- Form nhân viên (`EmployeeLeaveRequestForm.tsx`) bỏ hoàn toàn ô **liên kết Google Drive** và kiểm tra `validateGoogleDriveUrl`; chỉ giữ checkbox **"Tôi đã có giấy xác nhận của bệnh viện / cơ sở y tế"**. Submit không còn ghi `attachmentUrl`.
- Hàng đợi duyệt (`LeaveApprovalQueue.tsx`) và Lịch sử (`ApprovalHistory.tsx`) bỏ liên kết "Xem giấy xác nhận (Drive)"; thay bằng nhãn **Có giấy xác nhận** / **Chờ bổ sung giấy ốm** như hiện trạng.
- Xoá `src/utils/urlUtils.ts` (không còn nơi dùng). Giữ các trường `attachmentUrl` / `attachmentName` trong type + rules để đọc đơn cũ, nhưng giao diện không hiển thị.
- Cập nhật README (tính năng, giới hạn, quyền riêng tư). Không đổi `firestore.rules`, không cần deploy rules.

### 2.21 Bỏ mục tự đăng ký nghỉ của Quản lý

- Theo yêu cầu "Admin không cần đăng ký nghỉ phép, chỉ cần cho nhân viên": xoá tab/đường dẫn `new-request` ("Phân bổ nghỉ cho nhân viên") và nút **Đăng ký &amp; phân bổ nghỉ** trên header của `App.tsx`, cùng mục tương ứng trong `NavTab` và `pageTitleMap`.
- Xoá component `src/components/LeaveRequestForm.tsx` và hàm `createManagerAllocatedLeaveRequest` trong `firestoreService.ts` (không còn nơi gọi). Quản lý giờ chỉ có luồng: nhân viên gửi đơn → **Duyệt đơn chờ** → phân bổ loại phép/nửa ngày → duyệt.
- Giữ nguyên rules (Quản lý vẫn có quyền tạo đơn qua API nếu cần sau này), nhưng giao diện không còn tính năng này. Cập nhật README phần dành cho Quản lý.

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
| `/leaveRequests/{requestId}` | Hồ sơ đơn xin nghỉ phép đầy đủ | Quản lý; nhân viên chỉ `get` đơn do chính uid ẩn danh của mình tạo | Quản lý; nhân viên chỉ được **tạo** đơn `Đang chờ duyệt` gắn đúng `submitterUid`; Không cho xóa |
| `/leaveSummaries/{employeeId}` | Số ngày phép năm / nghỉ việc riêng đã dùng và còn lại (chỉ số, không PII) | Công khai | Chỉ Quản lý (app tự đồng bộ) |
| `/leaveRequestContacts/{requestId}` | Email liên hệ của **đơn cũ** (không còn ghi mới) | Chỉ Quản lý | Người gửi đơn tạo trong cùng batch (khớp `getAfter`); Quản lý đọc; Không sửa/xóa |
| `/notifications/{notificationId}` | Thông báo nội bộ cho Quản lý | Chỉ Quản lý | Quản lý; nhân viên chỉ được tạo thông báo `admin` cho đơn do chính mình gửi |

---

## 4. Các file chính trong dự án

| File | Vai trò |
|---|---|
| `src/App.tsx` | Khung ứng dụng, điều hướng 2 chế độ Nhân viên / Quản lý, hiệu ứng menu, KPI tổng quan |
| `src/firebase.ts` | Khởi tạo Firebase App, Auth (Google), Firestore và xử lý lỗi chuẩn hóa |
| `src/types/leave.ts` | Định nghĩa kiểu dữ liệu nhân viên, hạn mức phép, đơn nghỉ, quỹ phép tóm tắt, ngày nghỉ công ty |
| `src/services/firestoreService.ts` | Toàn bộ thao tác đọc/ghi realtime và batch Firestore |
| `src/utils/dateUtils.ts` | Tính ngày làm việc (Thứ 2–6, loại trừ lễ, cộng ngày OT), tạo ô lịch tháng, định dạng ngày/thứ VN |
| `src/utils/managerUtils.ts` | Quy đổi uid / username / pseudo-email cũ sang tên quản lý thật khi hiển thị |
| `src/utils/urlUtils.ts` | Kiểm tra và làm sạch liên kết Google Drive hợp lệ (`drive.google.com`, `docs.google.com`) |
| `src/components/LeaveRequestForm.tsx` | Biểu mẫu dành riêng cho Quản lý đăng ký, chia phân bổ nhiều loại phép, kiểm tra quỹ phép còn lại & trừ phép ngay |
| `src/components/VietnameseDatePicker.tsx` | Bộ chọn ngày tiếng Việt tùy chỉnh với tiêu đề Thứ 2 – Chủ nhật |
| `src/components/HolidayManager.tsx` | Lịch trực quan & quản lý ngày nghỉ lễ, nghỉ bù, OT theo năm |
| `src/components/MonthlyCalendar.tsx` | Lịch nghỉ toàn công ty theo tháng dành cho Quản lý |
| `src/components/LeaveStatsTable.tsx` | Bảng thống kê phép nhân viên (phân trang 5 người/trang, lọc năm/phòng ban) |
| `src/components/EmployeeManager.tsx` | Quản lý danh sách nhân viên, avatar, hạn mức phép và tài khoản Quản lý |
| `src/components/ApprovalHistory.tsx` | Lịch sử đăng ký, phân bổ nghỉ phép & xác nhận nộp bổ sung giấy nghỉ ốm; hiển thị tên quản lý thật |
| `src/components/AttendanceToday.tsx` | Tab Hôm nay ai đi làm (lọc phòng ban, tìm tên, trạng thái làm việc) + popup quỹ phép còn lại khi bấm thẻ |
| `src/components/EmployeeLeaveRequestForm.tsx` | Form nhân viên tự gửi đơn nghỉ phép (không email, không chọn loại phép) |
| `src/components/LeaveApprovalQueue.tsx` | Hàng đợi duyệt đơn chờ dành cho Quản lý |
| `src/components/NotificationsPage.tsx` | Trang thông báo của Quản lý (lọc chưa đọc, tìm kiếm, đánh dấu đã đọc) |
| `README.md` | Hướng dẫn cài đặt, bật Anonymous Auth, deploy rules và mục **Quyền riêng tư** |
| `src/components/BobbleAvatar.tsx` | 12 mẫu avatar nhân vật SVG với phần đầu lúc lắc tương tác |
| `firebase.json` | Cấu hình Firebase Hosting (`mvtpdayoff.web.app`) và đường dẫn `firestore.rules` |
| `firestore.rules` & `firebase-blueprint.json` | Quy tắc bảo mật Firestore và schema dữ liệu đồng bộ |

---

## 5. Trạng thái kiểm thử gần nhất

- `npm run lint` (`tsc --noEmit`): Đạt (0 lỗi TypeScript) sau khi thêm luồng nhân viên tự đăng ký + tra cứu.
- `npm run build` (`vite build`): Đạt (build thành công, sẵn sàng deploy Firebase Hosting).
- `node -e "JSON.parse(...)"` cho `firebase.json` và `firebase-blueprint.json`: Đạt.
- `npx eslint firestore.rules`: Đạt (0 lỗi) — **rules mới chưa deploy**, cần chạy `firebase deploy --only firestore:rules`.
- Chưa chạy kiểm thử ghi dữ liệu thật lên Firestore production (tránh tạo đơn rác); cần bật **Anonymous Auth** và deploy rules trước khi dùng thật.
- Email: **không dùng** — đã bỏ `functions/` và cấu hình liên quan; không còn endpoint ngoài Firebase.
- Đã thử mở app ở `localhost:3000`: giao diện render bình thường; khi bấm gửi đơn trên máy chưa bật Anonymous/deploy rules thì hiện đúng thông báo hướng dẫn quản trị viên.
