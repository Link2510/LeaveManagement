# LeaveManagement – Nhật ký tổng hợp dự án

**Cập nhật lần cuối:** 24/11/2026  
**Thư mục dự án:** `G:\AI\web\LeaveManagement`  
**Trạng thái:** Đang phát triển – phần giao diện chính và tích hợp Firestore cho quản lý đơn/ngày nghỉ đã hoạt động.

> Tài liệu này tổng hợp những gì đã được trao đổi, xây dựng, cấu hình và kiểm thử trong các phiên làm việc của dự án LeaveManagement. Những nội dung chưa được xác nhận hoàn thành được ghi rõ là “chưa triển khai” hoặc “cần kiểm tra”, tránh nhầm lẫn với chức năng đã chạy thực tế.

---

## 1. Mục tiêu dự án

Xây dựng một ứng dụng web quản lý nghỉ phép nội bộ bằng tiếng Việt, gồm hai nhóm sử dụng:

- **Nhân viên:** xem thông tin và gửi yêu cầu nghỉ phép qua biểu mẫu, không cần tài khoản đăng nhập.
- **Admin:** đăng nhập để quản lý nhân viên, đơn nghỉ phép, phê duyệt/từ chối, lịch nghỉ và ngày nghỉ lễ/nghỉ Tết chung của công ty.

Các mục tiêu kỹ thuật và nghiệp vụ:

- Dữ liệu quan trọng phải được lưu trên dịch vụ đám mây, không mất khi tải lại trang.
- Chỉ Admin được phép thay đổi dữ liệu quản trị.
- Tính số ngày nghỉ theo ngày làm việc, loại trừ cuối tuần và ngày nghỉ công ty; hỗ trợ ngày làm việc bù.
- Lưu thông tin phân bổ các loại phép, lý do từ chối, người xử lý và thời điểm xử lý.
- Giao diện và hướng dẫn sử dụng bằng tiếng Việt.

## 2. Công nghệ và môi trường

| Thành phần | Công nghệ / cấu hình |
|---|---|
| Giao diện | React |
| Ngôn ngữ | TypeScript |
| Công cụ phát triển | Vite |
| CSS | Tailwind CSS |
| Icon | lucide-react |
| Cơ sở dữ liệu | Firebase Firestore |
| Xác thực Admin | Firebase Authentication – Email/Password |
| Gói Firebase | Spark (miễn phí) |
| Khu vực Firestore | Singapore |
| Hệ điều hành phát triển | Windows 11 |
| Thư mục dự án | `G:\AI\web\LeaveManagement` |

Lệnh build được sử dụng trên PowerShell:

```powershell
npm.cmd run build
```

Dùng `npm.cmd` thay vì `npm` vì môi trường PowerShell có thể chặn script `npm.ps1` theo Execution Policy.

## 3. Các quyết định kiến trúc quan trọng

### 3.1 Firebase Spark

Đã chọn tiếp tục sử dụng Firebase Spark, chưa nâng cấp Blaze và chưa chủ động bật các dịch vụ có thể phát sinh chi phí.

Firebase hiện được dùng cho:

- Authentication dành cho Admin.
- Firestore để lưu dữ liệu ngày nghỉ công ty và đơn nghỉ phép.

### 3.2 Nhân viên không đăng nhập

Nhân viên không có tài khoản Firebase Authentication. Admin là người đăng nhập và quản trị hệ thống.

Vì vậy, không được mở quyền ghi Firestore công khai chỉ để cho phép nhân viên gửi đơn. Khi triển khai gửi đơn công khai, cần một backend trung gian có kiểm tra dữ liệu và chống spam.

### 3.3 Phương án dịch vụ ngoài đã thống nhất cho giai đoạn gửi đơn công khai

Đã thảo luận và chọn hướng kiến trúc sử dụng các dịch vụ có gói miễn phí:

- **Cloudflare Workers:** backend trung gian nhận và kiểm tra yêu cầu.
- **Cloudflare R2:** lưu tài liệu đính kèm.
- **Resend:** gửi email thông báo.
- **Cloudflare Turnstile:** chống bot/spam.

Đây là phương án đã chọn về kiến trúc, **chưa được xác nhận là đã triển khai**.

Biểu mẫu dự kiến có trường **Email nhận kết quả** do nhân viên tự nhập; email bắt buộc và cần kiểm tra định dạng. Địa chỉ này sẽ được dùng cho thông báo tiếp nhận, duyệt hoặc từ chối đơn.

## 4. Những phần giao diện và nghiệp vụ đã xây dựng

### 4.1 Khung ứng dụng và điều hướng

Ứng dụng đã có các khu vực/chức năng chính được phát triển trong quá trình làm dự án:

- Trang tổng quan.
- Tạo đơn nghỉ phép.
- Quản lý đơn nghỉ phép.
- Lịch nghỉ.
- Quản lý nhân viên.
- Lịch sử phê duyệt.
- Quản lý ngày nghỉ lễ/nghỉ công ty.
- Khu vực thông tin/đăng nhập Admin.

Các trang và component được tích hợp dần vào `src/App.tsx`.

### 4.2 Biểu mẫu tạo đơn nghỉ phép – `src/LeaveRequest.tsx`

Đã tạo và kiểm tra giao diện biểu mẫu với các thông tin:

- Họ tên nhân viên.
- Phòng ban.
- Ngày bắt đầu và ngày kết thúc.
- Số ngày làm việc.
- Lý do nghỉ.
- Ghi chú.
- Tài liệu đính kèm.
- Phân bổ số ngày theo loại phép.

Các loại nghỉ được định nghĩa trong dự án:

- Phép năm.
- Nghỉ việc riêng.
- Nghỉ ốm.
- Thai sản.
- Nghỉ hưởng lương.
- Nghỉ không lương.

Các kiểm tra nghiệp vụ đã làm ở giao diện:

- Tính ngày làm việc, ban đầu loại trừ thứ Bảy và Chủ nhật.
- Tổng số ngày phân bổ phải khớp với số ngày nghỉ.
- Nghỉ ốm yêu cầu giấy tờ xác nhận.
- Hiển thị trạng thái hợp lệ/lỗi của biểu mẫu.
- Có thể chọn tệp đính kèm.

**Kết quả đã xác nhận:** biểu mẫu được kiểm tra về nhập liệu, tính hợp lệ và chọn tệp.  
**Chưa xác nhận:** gửi đơn từ nhân viên lên hệ thống qua backend công khai; tải tệp lên Cloudflare R2; gửi email tự động.

### 4.3 Quản lý đơn nghỉ phép – `src/LeaveManagement.tsx`

Đã xây dựng giao diện quản lý danh sách đơn và xem chi tiết đơn. Có các trạng thái:

- Mới tạo.
- Đang chờ duyệt.
- Đã duyệt.
- Từ chối.

Admin có thể thao tác:

1. Xem đơn và thông tin nhân viên.
2. Phân bổ số ngày nghỉ theo loại phép.
3. Lưu phân bổ.
4. Duyệt đơn.
5. Từ chối đơn và nhập lý do.

Thông tin xử lý được lưu kèm đơn:

- `processedBy`: người xử lý (hiện đang dùng giá trị `Admin`).
- `processedAt`: thời điểm xử lý.
- `rejectionReason`: lý do từ chối.
- `allocations`: danh sách phân bổ các loại phép.

**Không có giao diện nút xóa đơn.** Đã thống nhất không tự ý thêm chức năng xóa ở thời điểm hiện tại; dữ liệu đơn nên được giữ để tra cứu và đối chiếu.

### 4.4 Lịch nghỉ

Lịch đã được phát triển để:

- Hiển thị đơn nghỉ đã được duyệt.
- Hiển thị tên nhân viên nghỉ trên ngày tương ứng.
- Hiển thị lý do nghỉ cùng tên nhân viên.
- Không hiển thị các đơn mới tạo, đang chờ duyệt hoặc bị từ chối như sự kiện nghỉ đã xác nhận.
- Có phần xem chi tiết ngày được chọn.

Nguồn dữ liệu lịch đang được chuyển từ dữ liệu mẫu `leaveEvents` sang danh sách `leaveRequests`, chỉ lấy đơn có trạng thái `Đã duyệt`.

Quy tắc ngày làm việc cần áp dụng:

- Loại trừ thứ Bảy và Chủ nhật.
- Loại trừ ngày nghỉ lễ/nghỉ công ty.
- Nếu có ngày làm việc bù, ngày đó phải được tính là ngày làm việc.

**Lưu ý:** phần chuyển nguồn dữ liệu và lọc ngày đã được triển khai trong quá trình làm; cần tiếp tục kiểm tra giao diện chi tiết lịch sau khi hoàn tất các luồng dữ liệu.

### 4.5 Quản lý ngày nghỉ lễ/nghỉ Tết – `CompanyHolidays`

Đã xây dựng chức năng Admin quản lý ngày nghỉ chung cho công ty:

- Thêm ngày nghỉ.
- Sửa ngày nghỉ.
- Xóa ngày nghỉ.
- Phân loại ngày nghỉ.
- Ghi chú.
- Cấu hình theo từng năm.

Nghiệp vụ cần hỗ trợ:

- Ngày nghỉ lễ/Tết theo lịch Nhà nước công bố.
- Ngày nghỉ bù.
- Ngày đổi lịch/ngày làm việc bù.
- Ngày nghỉ riêng của công ty.

Mục đích là để các ngày nghỉ này được loại khỏi phép tính số ngày làm việc; ngày làm việc bù được tính trở lại là ngày làm việc.

Đã kết nối dữ liệu ngày nghỉ với Firestore và người dùng đã kiểm tra thêm ngày nghỉ, tải lại trang và xác nhận dữ liệu vẫn còn.

### 4.6 Quản lý nhân viên

Đã có khu vực/component quản lý nhân viên trong ứng dụng. Các thông tin chi tiết về toàn bộ trường dữ liệu và trạng thái kết nối Firestore của phần này chưa được xác nhận trong bản tổng hợp hiện tại; cần kiểm tra lại trước khi đánh dấu hoàn tất.

### 4.7 Lịch sử phê duyệt – `ApprovalHistory`

Đã có component/khu vực Lịch sử phê duyệt trong ứng dụng. Danh sách đơn được đưa lên `App.tsx` làm nguồn dữ liệu dùng chung để các trang có thể nhận cùng dữ liệu.

Cần kiểm tra tiếp rằng trang lịch sử đang lấy đầy đủ dữ liệu từ Firestore và hiển thị đúng người xử lý, thời điểm xử lý, trạng thái và lý do từ chối sau khi tải lại trang.

## 5. Kiểu dữ liệu đơn nghỉ phép

Trong `src/leaveTypes.ts`, các kiểu dữ liệu đã được định nghĩa:

```tsx
export type LeaveStatus =
    | 'Mới tạo'
    | 'Đang chờ duyệt'
    | 'Đã duyệt'
    | 'Từ chối'

export type LeaveType =
    | 'Phép năm'
    | 'Nghỉ việc riêng'
    | 'Nghỉ ốm'
    | 'Thai sản'
    | 'Nghỉ hưởng lương'
    | 'Nghỉ không lương'

export type LeaveAllocation = {
    type: LeaveType
    days: number
}

export type LeaveRequestItem = {
    id: number
    employeeName: string
    department: string
    email: string
    startDate: string
    endDate: string
    workingDays: number
    submittedAt: string
    reason: string
    note: string
    status: LeaveStatus
    allocations?: LeaveAllocation[]
    rejectionReason?: string
    processedBy?: string
    processedAt?: string
}
```

Ngoài ra, file có `initialRequests` gồm 5 đơn mẫu để khởi tạo dữ liệu ban đầu:

| ID | Nhân viên | Phòng ban | Thời gian nghỉ | Số ngày | Trạng thái ban đầu |
|---:|---|---|---|---:|---|
| 1 | Nguyễn Minh Anh | Nhân sự | 25–27/11/2026 | 3 | Đang chờ duyệt |
| 2 | Trần Hoàng Nam | Quản lý | 26/11/2026 | 1 | Mới tạo |
| 3 | Lê Thu Hà | Nhân sự | 18–19/11/2026 | 2 | Đã duyệt |
| 4 | Phạm Quốc Bảo | Quản lý | 28–30/11/2026 | 1 | Từ chối |
| 5 | Đỗ Ngọc Linh | Nhân sự | 02–04/12/2026 | 3 | Đang chờ duyệt |

Dữ liệu mẫu chỉ được dùng để khởi tạo khi collection Firestore còn trống; không ghi đè dữ liệu đã tồn tại.

## 6. Firebase: cấu hình và bảo mật

### 6.1 Authentication

- Đã tạo Firebase project: `leave-management-vn`.
- Đã bật phương thức đăng nhập Email/Password.
- Đã tạo tài khoản Admin và kiểm tra đăng nhập.
- Các trang quản trị được bảo vệ theo trạng thái đăng nhập Admin.

UID Admin hiện được dùng trong Firestore Rules:

```text
WldLaXuJdVUzxj1HcBqAsEnwgeI2
```

### 6.2 Firestore

- Đã tạo Firestore Database.
- Khu vực dữ liệu: Singapore.
- Đã kết nối Firebase SDK vào ứng dụng.
- Đã cài Firebase SDK bằng:

```powershell
npm install firebase
```

Lần cài đặt được ghi nhận có thêm 109 packages; npm báo 4 lỗ hổng mức high và 2 install-scripts chưa được approve. Đây là cảnh báo từ thời điểm cài đặt, cần chạy kiểm tra dependency lại khi chuẩn bị phát hành.

### 6.3 Firestore Security Rules hiện tại

Rules đang được dùng:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null
        && request.auth.uid == 'WldLaXuJdVUzxj1HcBqAsEnwgeI2';
    }

    match /companyHolidays/{holidayId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /{document=**} {
      allow read, write: if isAdmin();
    }
  }
}
```

Ý nghĩa:

- Collection `companyHolidays`: cho phép đọc công khai; chỉ Admin được ghi/sửa/xóa.
- Các document/collection khác: chỉ Admin được đọc và ghi.
- Không mở quyền ghi công khai cho nhân viên.

**Cảnh báo kiến trúc:** quy tắc hiện tại phù hợp với luồng Admin đã đăng nhập, nhưng chưa cho phép nhân viên gửi đơn trực tiếp từ trình duyệt. Không được nới lỏng rules thành `allow write: if true` để xử lý việc này. Cần triển khai backend trung gian có xác thực/chống spam.

## 7. Các collection Firestore và service

### 7.1 `companyHolidays`

File service: `src/holidayService.ts`

Đã có các thao tác:

- `subscribeToHolidays`: theo dõi dữ liệu bằng `onSnapshot`.
- `addHoliday`: thêm ngày nghỉ.
- `updateHoliday`: cập nhật ngày nghỉ.
- `deleteHoliday`: xóa ngày nghỉ.

Đã kiểm tra thao tác thêm và dữ liệu tồn tại sau khi tải lại trang.

### 7.2 `leaveRequests`

File service: `src/leaveService.ts`

Các thao tác đã có:

- `subscribeToLeaveRequests`: theo dõi danh sách đơn bằng `onSnapshot`, sắp xếp ID giảm dần.
- `seedInitialLeaveRequests`: chỉ đưa 5 đơn mẫu lên Firestore khi collection còn trống.
- `addLeaveRequest`: thêm đơn.
- `updateLeaveRequest`: cập nhật đơn.
- `deleteLeaveRequest`: xóa document theo ID.

Năm document mẫu đã được seed vào collection `leaveRequests` và người dùng đã kiểm tra thấy trong Firebase Console.

### 7.3 Tải và đồng bộ đơn trong `App.tsx`

`App.tsx` theo dõi đăng nhập Admin. Khi Admin đăng nhập:

1. Gọi `seedInitialLeaveRequests(initialRequests)`.
2. Đăng ký listener `subscribeToLeaveRequests`.
3. Cập nhật state danh sách đơn khi Firestore thay đổi.
4. Có trạng thái tải dữ liệu để tránh hiển thị trang trước khi dữ liệu đơn được nạp.
5. Hủy listener khi component/effect cleanup.

Danh sách đơn được đưa lên state chung trong `App.tsx` và truyền xuống component quản lý bằng `requests` và `setRequests`.

## 8. Tích hợp Firestore cho thao tác quản lý đơn – hoàn thành ngày 24/11/2026

Trong phiên làm việc gần nhất, đã kết nối ba thao tác trong `src/LeaveManagement.tsx` với Firestore.

### 8.1 Import service

Đã thêm:

```tsx
import { updateLeaveRequest } from './leaveService'
```

### 8.2 Trạng thái đang lưu

Đã thêm state:

```tsx
const [isSaving, setIsSaving] = useState(false)
```

### 8.3 Lưu phân bổ loại phép

Hàm `saveAllocation` đã được chuyển thành hàm async:

- Kiểm tra đơn được chọn.
- Kiểm tra tổng phân bổ hợp lệ.
- Không cho thực hiện thêm khi đang lưu.
- Gọi `await updateLeaveRequest(updatedRequest)`.
- Cập nhật state giao diện sau khi Firestore ghi thành công.
- Có `try/catch/finally` để xử lý lỗi và kết thúc trạng thái đang lưu.

**Đã kiểm thử thực tế:** người dùng xác nhận phân bổ được lưu trên Firebase.

### 8.4 Duyệt đơn

Hàm `approveRequest` đã được chuyển thành async:

- Không xử lý nếu không có đơn hoặc đang lưu.
- Không duyệt lại đơn đã duyệt/từ chối.
- Kiểm tra phân bổ hợp lệ.
- Cập nhật trạng thái `Đã duyệt`.
- Lưu `allocations`, `processedBy`, `processedAt`.
- Ghi Firestore bằng `updateLeaveRequest`.
- Cập nhật state giao diện sau khi ghi thành công.
- Có xử lý lỗi bằng `try/catch/finally`.

**Đã kiểm thử thực tế:** người dùng xác nhận chức năng duyệt hoạt động tốt.

### 8.5 Từ chối đơn

Hàm `rejectRequest` đã được chuyển thành async:

- Không xử lý nếu không có đơn hoặc đang lưu.
- Không từ chối lại đơn đã duyệt/từ chối.
- Yêu cầu lý do từ chối không được để trống.
- Cập nhật trạng thái `Từ chối`.
- Lưu `rejectionReason`, `processedBy`, `processedAt`.
- Ghi Firestore bằng `updateLeaveRequest`.
- Cập nhật state giao diện và đóng biểu mẫu từ chối sau khi ghi thành công.
- Có xử lý lỗi bằng `try/catch/finally`.

**Đã kiểm thử thực tế:** người dùng xác nhận chức năng từ chối hoạt động tốt.

### 8.6 Kết quả build

Sau khi cập nhật ba handler, người dùng chạy:

```powershell
npm.cmd run build
```

Build thành công, có thông báo:

```text
✓ 2156 modules transformed.
dist/index.html                   0.46 kB │ gzip:   0.30 kB
dist/assets/index-D7AS4I5T.css   34.61 kB │ gzip:   7.01 kB
dist/assets/index-B7zdC_CQ.js   882.90 kB │ gzip: 261.07 kB
```

Vite đưa ra cảnh báo chunk JavaScript lớn hơn 500 kB sau minification. Đây là cảnh báo tối ưu hiệu năng, không phải lỗi build. Có thể xem xét code-splitting/dynamic import sau khi hoàn tất chức năng chính.

## 9. Kết quả đã kiểm thử và xác nhận

| Hạng mục | Kết quả |
|---|---|
| Build ứng dụng sau các thay đổi mới nhất | Thành công |
| Đăng nhập Admin | Đã hoạt động |
| Bảo vệ trang quản trị | Đã hoạt động |
| Kết nối Firestore | Đã hoạt động |
| Seed 5 đơn mẫu | Đã thực hiện và kiểm tra trong Firebase Console |
| Thêm ngày nghỉ công ty | Đã kiểm tra lưu và tồn tại sau reload |
| Lưu phân bổ loại phép | Đã kiểm tra lưu trên Firebase |
| Duyệt đơn | Đã kiểm tra, hoạt động tốt |
| Từ chối đơn | Đã kiểm tra, hoạt động tốt |
| Nút xóa đơn trên giao diện | Không có; chưa triển khai |
| Nhân viên gửi đơn công khai qua backend | Chưa triển khai |
| Upload tệp đính kèm lên R2 | Chưa triển khai |
| Email tự động qua Resend | Chưa triển khai |
| Turnstile chống bot | Chưa triển khai |
| Kiểm thử toàn bộ Lịch sử phê duyệt sau reload | Cần kiểm tra |
| Hoàn tất triển khai production/Hosting | Chưa xác nhận trong nhật ký này |

## 10. Những vấn đề và quyết định cần giữ nguyên

1. **Không thay đổi Firebase Spark sang Blaze** nếu chưa có quyết định mới từ người dùng.
2. **Không mở quyền ghi Firestore công khai.** Nhân viên gửi đơn sẽ đi qua backend trung gian.
3. **Không tự ý thêm nút xóa đơn.** Giao diện hiện không có nút này và đã thống nhất giữ lại dữ liệu đơn để tra cứu.
4. Dữ liệu mẫu không được ghi đè dữ liệu Firestore đã tồn tại.
5. Ngày nghỉ lễ, nghỉ bù và ngày làm việc bù phải tham gia chính xác vào phép tính số ngày làm việc.
6. Chỉ đơn `Đã duyệt` mới được thể hiện là ngày nghỉ đã xác nhận trên lịch.
7. Khi chỉnh sửa code, làm từng bước nhỏ, chỉ rõ file và vị trí cần sửa; chờ người dùng xác nhận trước khi chuyển bước.
8. Sau các thay đổi có ảnh hưởng TypeScript/React, chạy `npm.cmd run build` để kiểm tra.

## 11. Các file quan trọng đã được đề cập

| File | Vai trò |
|---|---|
| `src/App.tsx` | Khung ứng dụng, đăng nhập Admin, state chung, nạp và theo dõi đơn từ Firestore |
| `src/leaveTypes.ts` | Kiểu dữ liệu đơn, trạng thái, loại phép, phân bổ và dữ liệu mẫu |
| `src/leaveService.ts` | Các thao tác Firestore cho collection `leaveRequests` |
| `src/holidayService.ts` | Các thao tác Firestore cho collection `companyHolidays` |
| `src/LeaveRequest.tsx` | Biểu mẫu tạo đơn nghỉ phép |
| `src/LeaveManagement.tsx` | Danh sách/chi tiết đơn, phân bổ, duyệt và từ chối |
| `src/ApprovalHistory.tsx` | Khu vực lịch sử phê duyệt |
| `src/CompanyHolidays.tsx` | Giao diện quản lý ngày nghỉ công ty |
| `src/holidayTypes.ts` | Kiểu dữ liệu ngày nghỉ |
| `src/firebase.ts` | Khởi tạo Firebase SDK và Firestore/Auth |

Tên file được liệt kê theo những gì đã xuất hiện trong quá trình trao đổi; nên đối chiếu với cây thư mục thực tế trước khi chỉnh sửa.

## 12. Việc tiếp theo – thứ tự đề xuất

### Ưu tiên 1: Kiểm tra Lịch sử phê duyệt

- Xác nhận danh sách lịch sử lấy từ nguồn `leaveRequests` đã đồng bộ.
- Kiểm tra đơn đã duyệt và bị từ chối.
- Kiểm tra người xử lý, thời điểm xử lý và lý do từ chối.
- Tải lại trang và xác nhận dữ liệu vẫn hiển thị.

### Ưu tiên 2: Hoàn thiện luồng ngày nghỉ và phép tính ngày làm việc

- Kiểm tra ngày lễ/Tết được loại khỏi số ngày nghỉ.
- Kiểm tra ngày nghỉ bù.
- Kiểm tra ngày làm việc bù được tính trở lại.
- Đảm bảo biểu mẫu tạo đơn và lịch dùng cùng quy tắc tính ngày.

### Ưu tiên 3: Hoàn thiện dữ liệu nhân viên và hạn mức phép

- Kiểm tra CRUD nhân viên và trạng thái lưu trữ.
- Làm rõ cách quản lý phép năm theo từng nhân viên.
- Kiểm tra các loại phép có hạn mức cố định/chính sách riêng.

### Ưu tiên 4: Xây dựng backend nhận đơn công khai

Theo kiến trúc đã chọn:

1. Cloudflare Worker nhận yêu cầu.
2. Turnstile xác minh người gửi.
3. Kiểm tra dữ liệu và quy tắc nghiệp vụ phía server.
4. Lưu tệp vào R2.
5. Ghi đơn vào Firestore bằng thông tin xác thực server phù hợp.
6. Gửi email qua Resend.
7. Không đưa bí mật server/API key vào mã frontend.

Cần thiết kế quyền truy cập và xác thực cẩn thận trước khi đưa chức năng này ra Internet.

### Ưu tiên 5: Kiểm thử và phát hành

- Kiểm thử luồng từ tạo đơn đến duyệt/từ chối.
- Kiểm thử dữ liệu sau reload trên các trang.
- Kiểm tra Firestore Rules bằng tài khoản Admin và người chưa đăng nhập.
- Xử lý cảnh báo dependency sau khi rà soát.
- Tối ưu bundle JavaScript bằng code-splitting khi phù hợp.
- Xác nhận cấu hình Hosting/domain và quy trình deploy trước khi phát hành.

---

## 13. Trạng thái tổng kết tại ngày 24/11/2026

LeaveManagement đã có nền tảng React + TypeScript, các màn hình nghiệp vụ chính, Firebase Authentication cho Admin và Firestore cho ngày nghỉ/đơn nghỉ phép. Đặc biệt, ba thao tác quan trọng trong Quản lý đơn — **lưu phân bổ, duyệt và từ chối** — đã được kết nối Firestore, build thành công và người dùng xác nhận hoạt động thực tế.

Phần cần tiếp tục tập trung là kiểm tra đồng bộ Lịch sử phê duyệt, hoàn thiện quy tắc ngày làm việc/ngày nghỉ bù, sau đó mới triển khai backend công khai cho nhân viên gửi đơn, upload tài liệu và email tự động.

**Nguyên tắc làm việc:** tiếp tục từ trạng thái hiện tại, không cài đặt lại hoặc xây dựng lại những phần đã hoạt động; hướng dẫn từng bước và xác nhận sau mỗi thay đổi.

## 14. Hoàn thiện kết nối Firestore cho Quản lý nhân viên – 24/11/2026

<badge>HOÀN THÀNH VÀ ĐÃ KIỂM THỬ</badge>

### 14.1. Mục tiêu

Hoàn thiện chức năng Quản lý nhân viên, chuyển từ dữ liệu mẫu lưu trong React state sang Firestore để dữ liệu được lưu trữ lâu dài và đồng bộ theo thời gian thực.

Giữ nguyên giao diện hiện có, bao gồm:
- Danh sách nhân viên.
- Tìm kiếm theo tên hoặc phòng ban.
- Thêm nhân viên.
- Chỉnh sửa nhân viên.
- Xóa nhân viên.
- Thiết lập số ngày phép năm và phép cá nhân.

### 14.2. Quyết định về ID nhân viên

Văn phòng hiện tại không sử dụng mã nhân viên.

Đã thống nhất:
- Không yêu cầu nhân viên nhập mã số.
- Không hiển thị mã nhân viên trên giao diện.
- Firestore tự sinh ID kỹ thuật cho từng nhân viên.
- ID kỹ thuật chỉ được sử dụng nội bộ để nhận diện document khi cập nhật hoặc xóa nhân viên.

### 14.3. Cơ cấu phòng ban

Chỉ sử dụng hai phòng ban:

- Quản lý.
- Nhân sự.

Đã thống nhất phân loại 5 nhân viên mẫu:

| Nhân viên | Phòng ban | Phép năm | Phép cá nhân |
|---|---|---:|---:|
| Nguyễn Minh Anh | Nhân sự | 12 | 5 |
| Trần Hoàng Nam | Quản lý | 8 | 5 |
| Lê Thu Hà | Nhân sự | 15 | 5 |
| Phạm Quốc Bảo | Quản lý | 6 | 5 |
| Vũ Ngọc Linh | Nhân sự | 10 | 5 |

### 14.4. File `src/employeeTypes.ts`

Đã tạo file mới để quản lý kiểu dữ liệu nhân viên.

Các kiểu dữ liệu:

- `Employee`: thông tin nhân viên, trong đó `id` là kiểu `string`.
- `NewEmployee`: kiểu dữ liệu dành cho nhân viên mới, không yêu cầu truyền ID.
- `initialEmployees`: danh sách 5 nhân viên mẫu,

### 15.3. Hoàn thiện 4 thẻ thống kê Dashboard

<badge>HOÀN THÀNH VÀ ĐÃ KIỂM THỬ</badge>

Đã kết nối 4 thẻ thống kê với dữ liệu Firestore:

1. **Tổng nhân viên:** Đếm từ collection `employees`.
2. **Đơn chờ duyệt:** Đếm cả trạng thái `Mới tạo` và `Đang chờ duyệt`.
3. **Đang nghỉ hôm nay:** Đếm số nhân viên có đơn nghỉ đã duyệt trong ngày hiện tại, không tính trùng nhân viên.
4. **Đơn đã duyệt tháng này:** Đếm đơn có trạng thái `Đã duyệt`, dựa trên thời điểm Admin xử lý (`processedAt`).

Các thay đổi bổ sung:
- Chuẩn hóa `processedAt` của các đơn xử lý mới sang ISO 8601.
- Hỗ trợ đọc cả định dạng `processedAt` cũ và mới.
- Thay số liệu cố định trong 4 thẻ bằng dữ liệu thực tế.
- Giữ nguyên thiết kế giao diện hiện tại.

**Kiểm thử:** `npm.cmd run build` thành công. Người dùng xác nhận giao diện hiển thị số liệu theo dữ liệu thực tế.

### 15.4. Công việc tiếp theo

Hoàn thiện bảng **Tổng hợp phép nhân viên**:
- Lấy danh sách nhân viên từ Firestore.
- Tính số ngày phép đã sử dụng từ các đơn đã duyệt.
- Hiển thị phép năm, phép cá nhân và số ngày đã nghỉ.
- Hoàn thiện chức năng xem danh sách nhân viên.