import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  type User,
} from 'firebase/auth';

interface AccountSettingsProps {
  user: User;
}

export function AccountSettings({ user }: AccountSettingsProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const hasPasswordLogin = user.providerData.some(
    (provider) => provider.providerId === 'password',
  );
  const username = user.email?.split('@')[0] || '';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!hasPasswordLogin) {
      setErrorMsg('Tài khoản này đăng nhập qua Google, không có mật khẩu nội bộ để đổi.');
      return;
    }
    if (!currentPassword) {
      setErrorMsg('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu mới và xác nhận không khớp.');
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMsg('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }

    setBusy(true);
    try {
      // Firebase yêu cầu đăng nhập lại gần đây trước khi đổi mật khẩu.
      const credential = EmailAuthProvider.credential(user.email || '', currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMsg('Đã đổi mật khẩu thành công. Dùng mật khẩu mới cho lần đăng nhập sau.');
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErrorMsg('Mật khẩu hiện tại không đúng.');
      } else if (code === 'auth/weak-password') {
        setErrorMsg('Mật khẩu mới quá yếu (tối thiểu 6 ký tự theo Firebase).');
      } else if (code === 'auth/requires-recent-login') {
        setErrorMsg('Phiên đăng nhập đã cũ. Vui lòng đăng xuất và đăng nhập lại rồi thử lại.');
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Không thể đổi mật khẩu. Vui lòng thử lại.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-teal-700" />
            Tài khoản &amp; mật khẩu
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Đổi mật khẩu đăng nhập Quản lý. Mật khẩu chỉ nằm trong Firebase Authentication;
            ứng dụng không lưu mật khẩu ở Firestore.
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5">
              <div className="text-[11px] text-slate-500">Tên đăng nhập</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5 font-mono-num">
                {username || '—'}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5">
              <div className="text-[11px] text-slate-500">Phương thức đăng nhập</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">
                {hasPasswordLogin ? 'Username / mật khẩu' : 'Google'}
              </div>
            </div>
          </div>

          {!hasPasswordLogin && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              Tài khoản Google không có mật khẩu nội bộ để đổi. Quản trị mật khẩu tại
              tài khoản Google của bạn.
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="account-current-password"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Mật khẩu hiện tại
              </label>
              <input
                id="account-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="account-new-password"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Mật khẩu mới (tối thiểu 8 ký tự)
                </label>
                <input
                  id="account-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
              <div>
                <label
                  htmlFor="account-confirm-password"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Xác nhận mật khẩu mới
                </label>
                <input
                  id="account-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <LockKeyhole className="w-3.5 h-3.5 text-slate-400" />
                Bạn sẽ phải dùng mật khẩu mới từ lần đăng nhập tiếp theo.
              </p>
              <button
                type="submit"
                disabled={busy || !hasPasswordLogin}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                {busy ? 'Đang đổi...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
