import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, X } from 'lucide-react';
import {
  changeManagerPassword,
  fetchManagerAuthStatus,
  loginManagerWithPassword,
  setupManagerCredentials,
  type ManagerAuthStatus,
  type ManagerSession,
} from '../services/managerAuthService';

interface ManagerAuthModalProps {
  open: boolean;
  mode: 'login' | 'change-password';
  onClose: () => void;
  onSuccess: (session: ManagerSession) => void;
}

export function ManagerAuthModal({
  open,
  mode,
  onClose,
  onSuccess,
}: ManagerAuthModalProps) {
  const [status, setStatus] = useState<ManagerAuthStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setPassword('');
    setConfirmPassword('');
    setCurrentPassword('');
    setShowPassword(false);

    if (mode === 'login') {
      setLoadingStatus(true);
      fetchManagerAuthStatus()
        .then((res) => setStatus(res))
        .catch(() => setStatus({ configured: true, source: 'file' }))
        .finally(() => setLoadingStatus(false));
    }
  }, [open, mode]);

  const isFirstSetup = mode === 'login' && status !== null && !status.configured;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'change-password') {
      if (!currentPassword || password.length < 6) {
        setError('Vui lòng nhập mật khẩu hiện tại và mật khẩu mới từ 6 ký tự trở lên.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Xác nhận mật khẩu mới chưa khớp.');
        return;
      }
      setSubmitting(true);
      try {
        const session = await changeManagerPassword(currentPassword, password);
        onSuccess(session);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể đổi mật khẩu.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (isFirstSetup) {
      const cleanUser = username.trim();
      if (!/^[a-zA-Z0-9._-]{3,40}$/.test(cleanUser)) {
        setError('Tên đăng nhập dài 3–40 ký tự, chỉ gồm chữ cái, số và dấu . _ -');
        return;
      }
      if (password.length < 6) {
        setError('Mật khẩu tối thiểu 6 ký tự.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Mật khẩu xác nhận không khớp.');
        return;
      }
      setSubmitting(true);
      try {
        const session = await setupManagerCredentials(cleanUser, password);
        onSuccess(session);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể thiết lập tài khoản Quản lý.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!username.trim() || !password) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }

    setSubmitting(true);
    try {
      const session = await loginManagerWithPassword(username.trim(), password);
      onSuccess(session);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center">
                  {mode === 'change-password' ? (
                    <KeyRound className="w-4 h-4 text-teal-700" />
                  ) : (
                    <Lock className="w-4 h-4 text-teal-700" />
                  )}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {mode === 'change-password'
                      ? 'Đổi mật khẩu Quản lý'
                      : isFirstSetup
                        ? 'Thiết lập tài khoản Quản lý lần đầu'
                        : 'Đăng nhập Quản lý'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {mode === 'change-password'
                      ? 'Cập nhật mật khẩu bảo vệ khu vực Quản lý'
                      : isFirstSetup
                        ? 'Tạo tên đăng nhập và mật khẩu riêng cho Quản lý'
                        : 'Chỉ dành cho Quản lý hệ thống nghỉ phép'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {loadingStatus ? (
                <div className="py-6 text-center text-sm text-slate-500">
                  Đang kiểm tra cấu hình đăng nhập...
                </div>
              ) : (
                <>
                  {isFirstSetup && (
                    <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                      <span>
                        Chưa có tài khoản Quản lý nào được thiết lập. Tài khoản bạn tạo ở đây sẽ là tài khoản Quản lý duy nhất để đăng nhập vào trang quản trị.
                      </span>
                    </div>
                  )}

                  {error && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                      {error}
                    </div>
                  )}

                  {mode === 'login' && (
                    <div>
                      <label htmlFor="mgr-auth-user" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Tên đăng nhập
                      </label>
                      <input
                        id="mgr-auth-user"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Ví dụ: quanly"
                        autoComplete="username"
                        autoFocus
                        required
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      />
                    </div>
                  )}

                  {mode === 'change-password' && (
                    <div>
                      <label htmlFor="mgr-auth-current" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Mật khẩu hiện tại
                      </label>
                      <input
                        id="mgr-auth-current"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                        autoFocus
                        required
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="mgr-auth-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {mode === 'change-password' ? 'Mật khẩu mới' : 'Mật khẩu'}
                    </label>
                    <div className="relative">
                      <input
                        id="mgr-auth-pass"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={isFirstSetup || mode === 'change-password' ? 'Tối thiểu 6 ký tự' : 'Nhập mật khẩu'}
                        autoComplete={isFirstSetup || mode === 'change-password' ? 'new-password' : 'current-password'}
                        required
                        className="w-full pl-3 pr-10 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {(isFirstSetup || mode === 'change-password') && (
                    <div>
                      <label htmlFor="mgr-auth-confirm" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Xác nhận mật khẩu
                      </label>
                      <input
                        id="mgr-auth-confirm"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Nhập lại mật khẩu"
                        autoComplete="new-password"
                        required
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      />
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors"
                    >
                      {submitting
                        ? 'Đang xử lý...'
                        : mode === 'change-password'
                          ? 'Lưu mật khẩu mới'
                          : isFirstSetup
                            ? 'Tạo & Đăng nhập'
                            : 'Đăng nhập'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
