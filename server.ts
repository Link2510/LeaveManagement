import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const SUPER_ADMIN_EMAIL = 'mynamelink1998@gmail.com';
const FIREBASE_CONFIG_PATH = path.resolve(__dirname, 'firebase-applet-config.json');
const MANAGER_AUTH_FILE_PATH = path.resolve(__dirname, '.manager-auth.json');
const EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface FirebaseConfigFile {
  apiKey?: string;
  projectId?: string;
  firestoreDatabaseId?: string;
}

interface StoredManagerCredentials {
  username: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

interface ManagerTokenPayload {
  sub: string;
  role: 'manager';
  iat: number;
  exp: number;
}

// In-memory rate limiters
const publicRateMap = new Map<string, { count: number; resetAt: number }>();
const loginRateMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  store: Map<string, { count: number; resetAt: number }>,
  ip: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || entry.resetAt <= now) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  return envSecret && envSecret.length >= 16 ? envSecret : EPHEMERAL_SESSION_SECRET;
}

function getEnvManagerCredentials(): { username: string; password: string } | null {
  const username = process.env.MANAGER_USERNAME?.trim() || '';
  const password = process.env.MANAGER_PASSWORD || '';
  if (username && password) {
    return { username, password };
  }
  return null;
}

function readStoredManagerCredentials(): StoredManagerCredentials | null {
  try {
    if (!fs.existsSync(MANAGER_AUTH_FILE_PATH)) {
      return null;
    }
    const raw = fs.readFileSync(MANAGER_AUTH_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredManagerCredentials>;
    if (
      typeof parsed.username === 'string' &&
      typeof parsed.salt === 'string' &&
      typeof parsed.passwordHash === 'string' &&
      parsed.username.length > 0 &&
      parsed.salt.length > 0 &&
      parsed.passwordHash.length > 0
    ) {
      return parsed as StoredManagerCredentials;
    }
    return null;
  } catch {
    return null;
  }
}

function getAuthSource(): 'env' | 'file' | 'unconfigured' {
  if (getEnvManagerCredentials()) return 'env';
  if (readStoredManagerCredentials()) return 'file';
  return 'unconfigured';
}

function timingSafeTextEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function hashPasswordScrypt(password: string, saltHex: string): string {
  return crypto.scryptSync(password, saltHex, 64).toString('hex');
}

function verifyPasswordScrypt(password: string, saltHex: string, storedHashHex: string): boolean {
  try {
    const derived = crypto.scryptSync(password, saltHex, 64);
    const expected = Buffer.from(storedHashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function signManagerSessionToken(username: string): { token: string; expiresAt: number } {
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const payload: ManagerTokenPayload = {
    sub: username,
    role: 'manager',
    iat: now,
    exp: expiresAt,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');
  return {
    token: `lm_mgr.${payloadB64}.${sig}`,
    expiresAt,
  };
}

function verifyManagerSessionToken(token: string): ManagerTokenPayload | null {
  if (!token.startsWith('lm_mgr.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(sigB64, 'utf-8');
  const expectedBuf = Buffer.from(expectedSig, 'utf-8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    ) as ManagerTokenPayload;
    if (
      payload.role !== 'manager' ||
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function getBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

function getFirebaseConfig(): FirebaseConfigFile {
  try {
    if (fs.existsSync(FIREBASE_CONFIG_PATH)) {
      const raw = fs.readFileSync(FIREBASE_CONFIG_PATH, 'utf-8');
      return JSON.parse(raw) as FirebaseConfigFile;
    }
  } catch {
    return {};
  }
  return {};
}

async function verifyFirebaseIdToken(
  idToken: string,
): Promise<{ email?: string; emailVerified?: boolean; localId?: string } | null> {
  const { apiKey } = getFirebaseConfig();
  if (!apiKey || !idToken) return null;

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{ email?: string; emailVerified?: boolean; localId?: string }>;
    };
    const user = data.users?.[0];
    if (!user || !user.emailVerified || !user.email) return null;
    return user;
  } catch {
    return null;
  }
}

async function isAuthorizedFirebaseManager(email: string, idToken: string): Promise<boolean> {
  const lower = email.trim().toLowerCase();
  if (lower === SUPER_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }

  const { projectId, firestoreDatabaseId } = getFirebaseConfig();
  if (!projectId) return false;
  const dbId = firestoreDatabaseId || '(default)';

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId,
    )}/databases/${encodeURIComponent(dbId)}/documents/managers/${encodeURIComponent(lower)}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/manager/auth-status', (_req, res) => {
    const source = getAuthSource();
    res.json({
      configured: source !== 'unconfigured',
      source,
    });
  });

  app.post('/api/manager/setup', (req, res) => {
    const source = getAuthSource();
    if (source !== 'unconfigured') {
      res.status(409).json({
        error: 'Tài khoản Quản lý đã được thiết lập trước đó. Vui lòng đăng nhập.',
      });
      return;
    }

    const body = req.body as { username?: unknown; password?: unknown };
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
      res.status(400).json({
        error: 'Tên đăng nhập dài 3–40 ký tự, chỉ gồm chữ cái, số và dấu . _ -',
      });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({
        error: 'Mật khẩu cần tối thiểu 6 ký tự (tối đa 128 ký tự).',
      });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPasswordScrypt(password, salt);
    const nowIso = new Date().toISOString();
    const record: StoredManagerCredentials = {
      username,
      salt,
      passwordHash,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      fs.writeFileSync(MANAGER_AUTH_FILE_PATH, JSON.stringify(record, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
        flag: 'wx',
      });
    } catch {
      res.status(409).json({
        error: 'Tài khoản Quản lý đã được thiết lập trước đó. Vui lòng đăng nhập.',
      });
      return;
    }

    const session = signManagerSessionToken(username);
    res.status(201).json({
      token: session.token,
      username,
      expiresAt: session.expiresAt,
      source: 'file',
    });
  });

  app.post('/api/manager/login', (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(loginRateMap, clientIp, 12, 10 * 60 * 1000)) {
      res.status(429).json({
        error: 'Quá nhiều lần thử đăng nhập. Vui lòng đợi vài phút rồi thử lại.',
      });
      return;
    }

    const body = req.body as { username?: unknown; password?: unknown };
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' });
      return;
    }

    const envCreds = getEnvManagerCredentials();
    if (envCreds) {
      const userMatch = timingSafeTextEqual(username.toLowerCase(), envCreds.username.toLowerCase());
      const passMatch = timingSafeTextEqual(password, envCreds.password);
      if (!userMatch || !passMatch) {
        res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
        return;
      }
      const session = signManagerSessionToken(envCreds.username);
      res.json({
        token: session.token,
        username: envCreds.username,
        expiresAt: session.expiresAt,
        source: 'env',
      });
      return;
    }

    const stored = readStoredManagerCredentials();
    if (!stored) {
      res.status(404).json({
        error: 'Chưa thiết lập tài khoản Quản lý. Vui lòng tạo tài khoản lần đầu.',
      });
      return;
    }

    const userMatch = timingSafeTextEqual(username.toLowerCase(), stored.username.toLowerCase());
    const passMatch = verifyPasswordScrypt(password, stored.salt, stored.passwordHash);

    if (!userMatch || !passMatch) {
      res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
      return;
    }

    const session = signManagerSessionToken(stored.username);
    res.json({
      token: session.token,
      username: stored.username,
      expiresAt: session.expiresAt,
      source: 'file',
    });
  });

  app.get('/api/manager/me', (req, res) => {
    const token = getBearerToken(req);
    const payload = token ? verifyManagerSessionToken(token) : null;
    if (!payload) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({
      authenticated: true,
      username: payload.sub,
      expiresAt: payload.exp,
      source: getAuthSource(),
    });
  });

  app.post('/api/manager/change-password', (req, res) => {
    const token = getBearerToken(req);
    const payload = token ? verifyManagerSessionToken(token) : null;
    if (!payload) {
      res.status(401).json({ error: 'Phiên đăng nhập Quản lý không hợp lệ hoặc đã hết hạn.' });
      return;
    }

    if (getEnvManagerCredentials()) {
      res.status(400).json({
        error: 'Tài khoản đang cấu hình qua biến môi trường (.env), không thể đổi tại đây.',
      });
      return;
    }

    const stored = readStoredManagerCredentials();
    if (!stored) {
      res.status(404).json({ error: 'Không tìm thấy cấu hình tài khoản Quản lý.' });
      return;
    }

    const body = req.body as { currentPassword?: unknown; newPassword?: unknown };
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!verifyPasswordScrypt(currentPassword, stored.salt, stored.passwordHash)) {
      res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });
      return;
    }

    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'Mật khẩu mới cần dài từ 6 đến 128 ký tự.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPasswordScrypt(newPassword, salt);
    const updated: StoredManagerCredentials = {
      ...stored,
      salt,
      passwordHash,
      updatedAt: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(MANAGER_AUTH_FILE_PATH, JSON.stringify(updated, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
    } catch {
      res.status(500).json({ error: 'Không thể lưu mật khẩu mới. Vui lòng thử lại.' });
      return;
    }

    const nextSession = signManagerSessionToken(stored.username);
    res.json({
      token: nextSession.token,
      username: stored.username,
      expiresAt: nextSession.expiresAt,
      source: 'file',
    });
  });

  app.post('/api/notify-email', async (req, res) => {
    const body = req.body as {
      to?: unknown;
      subject?: unknown;
      message?: unknown;
      eventType?: unknown;
    };

    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 180) : '';
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
    const eventType = typeof body.eventType === 'string' ? body.eventType : '';

    if (!['NEW_REQUEST', 'RECEIVED', 'APPROVED', 'REJECTED'].includes(eventType)) {
      res.status(400).json({ error: 'Loại thông báo không hợp lệ.' });
      return;
    }

    if (eventType === 'NEW_REQUEST') {
      const clientIp = req.ip || 'unknown';
      if (!checkRateLimit(publicRateMap, clientIp, 15, 10 * 60 * 1000)) {
        res.status(429).json({ error: 'Quá nhiều yêu cầu gửi thông báo. Vui lòng thử lại sau.' });
        return;
      }
    } else {
      const token = getBearerToken(req);
      if (!token) {
        res.status(401).json({ error: 'Chỉ Quản lý mới có quyền gửi thông báo kết quả duyệt.' });
        return;
      }

      const managerPayload = verifyManagerSessionToken(token);
      if (!managerPayload) {
        const verifiedUser = await verifyFirebaseIdToken(token);
        if (!verifiedUser?.email) {
          res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
          return;
        }
        const allowed = await isAuthorizedFirebaseManager(verifiedUser.email, token);
        if (!allowed) {
          res.status(403).json({ error: 'Tài khoản không có quyền Quản lý.' });
          return;
        }
      }
    }

    const targetEmail =
      eventType === 'NEW_REQUEST'
        ? process.env.ADMIN_NOTIFICATION_EMAIL || SUPER_ADMIN_EMAIL
        : to;

    if (!isValidEmail(targetEmail) || !subject || !message) {
      res.status(400).json({ error: 'Thông tin email thông báo không hợp lệ.' });
      return;
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      res.json({
        sent: false,
        mode: 'in_app_and_mailto',
        recipient: targetEmail,
      });
      return;
    }

    const fromAddress = process.env.EMAIL_FROM || 'LeaveManagement <onboarding@resend.dev>';
    try {
      const emailResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [targetEmail],
          subject,
          html: `<div style="font-family:sans-serif;line-height:1.6;color:#0f172a">
            <h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2>
            <p style="white-space:pre-line;margin:0 0 16px">${escapeHtml(message)}</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
            <p style="font-size:12px;color:#64748b">LeaveManagement - Hệ thống Quản lý Nghỉ phép Nội bộ</p>
          </div>`,
        }),
      });

      if (!emailResp.ok) {
        const errText = await emailResp.text();
        res.status(502).json({ sent: false, mode: 'in_app_and_mailto', detail: errText.slice(0, 200) });
        return;
      }

      res.json({ sent: true, mode: 'resend', recipient: targetEmail });
    } catch {
      res.status(502).json({ sent: false, mode: 'in_app_and_mailto' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LeaveManagement server listening on http://localhost:${PORT}`);
  });
}

startServer();
