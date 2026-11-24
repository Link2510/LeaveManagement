const ALLOWED_DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);

export function validateGoogleDriveUrl(raw: string): {
  valid: boolean;
  url: string;
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, url: '' };
  }

  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      url: '',
      error: 'Đường dẫn Google Drive không được chứa khoảng trắng.',
    };
  }

  if (trimmed.length > 500) {
    return {
      valid: false,
      url: '',
      error: 'Đường dẫn Google Drive quá dài (tối đa 500 ký tự).',
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || !ALLOWED_DRIVE_HOSTS.has(parsed.hostname)) {
      return {
        valid: false,
        url: '',
        error:
          'Vui lòng dán đường dẫn Google Drive hợp lệ (bắt đầu bằng https://drive.google.com/... hoặc https://docs.google.com/...).',
      };
    }
    if (!parsed.pathname || parsed.pathname === '/') {
      return {
        valid: false,
        url: '',
        error: 'Vui lòng dán đường dẫn cụ thể tới tệp hoặc thư mục trên Google Drive.',
      };
    }
    return { valid: true, url: parsed.toString() };
  } catch {
    return {
      valid: false,
      url: '',
      error:
        'Đường dẫn không hợp lệ. Vui lòng sao chép liên kết chia sẻ từ Google Drive (https://drive.google.com/...).',
    };
  }
}

export function getSafeGoogleDriveHref(raw?: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const check = validateGoogleDriveUrl(raw);
  return check.valid && check.url ? check.url : null;
}
