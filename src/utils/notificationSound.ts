/**
 * Âm báo "đơn nghỉ mới" cho Quản lý — tạo bằng Web Audio API ngay trên máy,
 * không tải file âm thanh, không gửi dữ liệu ra ngoài.
 */

const STORAGE_KEY = 'lm_notification_sound_enabled';
let audioContext: AudioContext | null = null;

export function isNotificationSoundEnabled(): boolean {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === null ? true : value === '1';
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Browsers with storage disabled still work for the current session.
  }
}

/** Gọi trong một sự kiện click/submit của người dùng để mở_audio_context. */
export function unlockNotificationSound(): void {
  try {
    const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext || audioWindow.webkitAudioContext;
    if (!Ctor) return;
    if (!audioContext) audioContext = new Ctor();
    if (audioContext.state === 'suspended') void audioContext.resume();
  } catch {
    // Không có Web Audio hoặc bị chính sách autoplay chặn: bỏ qua âm thanh.
  }
}

/** Chuông hai nốt ngắn, phát khi có đơn mới (chỉ khi đã mở audio context). */
export function playNewRequestSound(): void {
  if (!isNotificationSoundEnabled()) return;
  const ctx = audioContext;
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    [880, 1174.66].forEach((frequency, index) => {
      const start = now + index * 0.16;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });
  } catch {
    // Không ảnh hưởng tới luồng thông báo nếu thiết bị không phát được tiếng.
  }
}
