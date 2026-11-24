/**
 * Center-crops and compresses an uploaded portrait image into a small JPEG data URL
 * suitable for storing safely in Firestore (< 30 KB).
 */
export async function compressAvatarImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Vui lòng chọn tệp hình ảnh (JPG, PNG, WebP...).');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ảnh quá lớn (tối đa 10 MB).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Không thể đọc tệp ảnh này.'));
      el.src = objectUrl;
    });

    const targetSize = 160;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
    }

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const cropSize = Math.min(srcW, srcH);
    const sx = Math.max(0, (srcW - cropSize) / 2);
    const sy = Math.max(0, (srcH - cropSize) / 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, targetSize, targetSize);

    let quality = 0.82;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 32000 && quality > 0.35) {
      quality -= 0.12;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    if (dataUrl.length > 34500) {
      throw new Error('Ảnh sau khi nén vẫn vượt giới hạn. Vui lòng chọn ảnh đơn giản hơn.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
