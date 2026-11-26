/**
 * Thông báo hiện ngay trên màn hình (desktop notification) bằng Notification API
 * của trình duyệt. Không dùng dịch vụ push/FCM, không gửi nội dung ra ngoài.
 * Hoạt động khi trình duyệt đang mở (kể cả tab ẩn / đang làm việc app khác).
 */

export type DesktopPermission = 'default' | 'granted' | 'denied' | 'unsupported';

function getNotificationApi(): typeof Notification | null {
  if (typeof window === 'undefined') return null;
  return 'Notification' in window ? window.Notification : null;
}

export function getDesktopPermission(): DesktopPermission {
  const api = getNotificationApi();
  if (!api) return 'unsupported';
  return api.permission as DesktopPermission;
}

export async function requestDesktopPermission(): Promise<DesktopPermission> {
  const api = getNotificationApi();
  if (!api) return 'unsupported';
  if (api.permission === 'granted' || api.permission === 'denied') {
    return api.permission as DesktopPermission;
  }
  try {
    const result = await api.requestPermission();
    return result as DesktopPermission;
  } catch {
    return api.permission as DesktopPermission;
  }
}

export function showDesktopNotification(options: {
  title: string;
  body: string;
  onClick?: () => void;
}): void {
  if (getDesktopPermission() !== 'granted') return;
  try {
    const notificationOptions = {
      body: options.body,
      tag: 'lm-new-leave-request',
      renotify: true,
      silent: false,
    } as NotificationOptions;
    const notification = new Notification(options.title, notificationOptions);
    notification.onclick = () => {
      window.focus();
      options.onClick?.();
      notification.close();
    };
  } catch {
    // Một số trình duyệt chặn Notification; bỏ qua, toast trong app vẫn dùng được.
  }
}
