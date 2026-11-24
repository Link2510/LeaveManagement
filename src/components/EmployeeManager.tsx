import React, { useState } from 'react';
import { Camera, Check, Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import type { Department, EmployeeStats, ManagerAccount } from '../types/leave';
import { FIXED_PERSONAL_LEAVE_DAYS } from '../types/leave';
import {
  addEmployeeWithQuota,
  createManagerAccountWithPassword,
  deleteEmployeeWithQuota,
  removeManagerAccount,
  updateEmployeeWithQuota,
} from '../services/firestoreService';
import { ADMIN_EMAIL } from '../firebase';
import { compressAvatarImage } from '../utils/imageUtils';
import { AVATAR_PRESETS, BobbleAvatar, getEmployeeAvatarId } from './BobbleAvatar';

interface EmployeeManagerProps {
  employees: EmployeeStats[];
  managers: ManagerAccount[];
  isSuperAdmin: boolean;
  currentAdminEmail: string;
}

export function EmployeeManager({
  employees,
  managers,
  isSuperAdmin,
  currentAdminEmail,
}: EmployeeManagerProps) {
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState<Department>('Nhân sự');
  const [newAnnual, setNewAnnual] = useState<number>(12);
  const [newAvatarPreset, setNewAvatarPreset] = useState<string>(AVATAR_PRESETS[0].id);
  const [newAvatarPhoto, setNewAvatarPhoto] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [mgrName, setMgrName] = useState('');
  const [mgrUsername, setMgrUsername] = useState('');
  const [mgrPassword, setMgrPassword] = useState('');
  const [mgrConfirmPassword, setMgrConfirmPassword] = useState('');
  const [mgrSaving, setMgrSaving] = useState(false);
  const [mgrError, setMgrError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDept, setEditDept] = useState<Department>('Nhân sự');
  const [editAnnual, setEditAnnual] = useState<number>(12);
  const [editAvatarPreset, setEditAvatarPreset] = useState<string>(AVATAR_PRESETS[0].id);
  const [editAvatarPhoto, setEditAvatarPhoto] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handlePhotoFileChange = async (
    file: File | undefined,
    setter: (dataUrl: string) => void,
  ) => {
    if (!file) return;
    setError('');
    try {
      const compressed = await compressAvatarImage(file);
      setter(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xử lý ảnh đại diện.');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newName.trim().length < 2) {
      setError('Vui lòng nhập họ tên nhân viên (ít nhất 2 ký tự).');
      return;
    }

    setSaving(true);
    try {
      await addEmployeeWithQuota(
        newName.trim(),
        newDept,
        newAnnual,
        newAvatarPreset,
        newAvatarPhoto || undefined,
      );
      setNewName('');
      setNewDept('Nhân sự');
      setNewAnnual(12);
      setNewAvatarPreset(AVATAR_PRESETS[0].id);
      setNewAvatarPhoto('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể thêm nhân viên.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (emp: EmployeeStats) => {
    setEditingId(emp.id);
    setEditName(emp.name);
    setEditDept(emp.department);
    setEditAnnual(emp.annualLeaveInitial ?? 12);
    setEditAvatarPreset(getEmployeeAvatarId(emp));
    setEditAvatarPhoto(emp.avatarPhoto || '');
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = async (id: string) => {
    if (editName.trim().length < 2) {
      setError('Tên nhân viên phải có ít nhất 2 ký tự.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateEmployeeWithQuota(
        id,
        editName.trim(),
        editDept,
        editAnnual,
        editAvatarPreset,
        editAvatarPhoto,
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật nhân viên.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError('');
    try {
      await deleteEmployeeWithQuota(id);
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa nhân viên.');
    } finally {
      setSaving(false);
    }
  };


  const handleAddManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setMgrError('');

    const cleanUsername = mgrUsername.trim().toLowerCase();
    const cleanName = mgrName.trim();
    const cleanPassword = mgrPassword;

    if (cleanName.length < 2) {
      setMgrError('Vui lòng nhập tên quản lý (ít nhất 2 ký tự).');
      return;
    }

    if (!/^[a-z0-9._]{4,30}$/.test(cleanUsername)) {
      setMgrError(
        'Username phải có 4–30 ký tự, chỉ gồm chữ thường, số, dấu chấm và dấu gạch dưới.',
      );
      return;
    }

    if (cleanPassword.length < 6) {
      setMgrError('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    if (cleanPassword !== mgrConfirmPassword) {
      setMgrError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setMgrSaving(true);

    try {
      await createManagerAccountWithPassword(
        cleanUsername,
        cleanName,
        cleanPassword,
        currentAdminEmail,
      );

      setMgrName('');
      setMgrUsername('');
      setMgrPassword('');
      setMgrConfirmPassword('');
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';

      if (code === 'auth/email-already-in-use') {
        setMgrError('Username này đã được sử dụng.');
      } else {
        setMgrError(
          err instanceof Error ? err.message : 'Không thể tạo tài khoản quản lý.',
        );
      }
    } finally {
      setMgrSaving(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Add New Employee Row */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Thêm dòng nhân viên mới
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý nhập số ngày phép năm ban đầu. Ngày nghỉ phép cá nhân được hệ thống cố định{' '}
            <strong className="text-slate-700">{FIXED_PERSONAL_LEAVE_DAYS} ngày / người</strong>.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-4">
              <label htmlFor="emp-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                Tên nhân viên
              </label>
              <input
                id="emp-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ví dụ: Nguyễn Văn An"
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>

            <div className="md:col-span-3">
              <label htmlFor="emp-dept" className="block text-xs font-medium text-slate-700 mb-1.5">
                Phòng ban
              </label>
              <select
                id="emp-dept"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value as Department)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              >
                <option value="Nhân sự">Nhân sự</option>
                <option value="Quản lý">Quản lý</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="emp-annual" className="block text-xs font-medium text-slate-700 mb-1.5">
                Phép năm ban đầu
              </label>
              <input
                id="emp-annual"
                type="number"
                min={0}
                max={60}
                step={0.5}
                value={newAnnual}
                onChange={(e) => setNewAnnual(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm font-mono-num tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>

            <div className="md:col-span-1">
              <div className="text-xs font-medium text-slate-500 mb-1.5">Cá nhân</div>
              <div className="px-3 py-2 text-sm font-mono-num text-slate-600 bg-slate-50 border border-slate-200 rounded-lg text-center">
                5
              </div>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Thêm nhân viên
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 shrink-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <BobbleAvatar
                presetId={newAvatarPreset}
                photoUrl={newAvatarPhoto || undefined}
                size="md"
                interactive
              />
              <div className="space-y-1.5">
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-teal-800 bg-white border border-teal-200 hover:bg-teal-50 rounded-md cursor-pointer transition-colors">
                  <Camera className="w-3.5 h-3.5" />
                  <span>{newAvatarPhoto ? 'Đổi ảnh khuôn mặt' : 'Tải ảnh khuôn mặt'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handlePhotoFileChange(e.target.files?.[0], setNewAvatarPhoto);
                      e.target.value = '';
                    }}
                  />
                </label>
                {newAvatarPhoto ? (
                  <button
                    type="button"
                    onClick={() => setNewAvatarPhoto('')}
                    className="block text-[11px] text-red-700 hover:underline"
                  >
                    Dùng mặt chibi mặc định
                  </button>
                ) : (
                  <div className="text-[11px] text-slate-500">Tùy chọn ghép ảnh thật</div>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-700 mb-2">
                Chọn kiểu mô hình đầu lúc lắc (xe tay ga, ván trượt, cà phê...)
              </div>
              <div className="flex flex-wrap gap-2">
                {AVATAR_PRESETS.map((preset, idx) => {
                  const selected = newAvatarPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setNewAvatarPreset(preset.id)}
                      title={preset.label}
                      className={`p-1 rounded-xl border transition-colors ${selected
                        ? 'border-teal-600 bg-teal-50 ring-2 ring-teal-600/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                    >
                      <BobbleAvatar
                        presetId={preset.id}
                        photoUrl={newAvatarPhoto || undefined}
                        size="sm"
                        bobbleIndex={idx}
                        interactive={false}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </form>
      </section>

      {/* Employee List */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            Danh sách nhân sự ({employees.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600">
                <th className="py-3 px-6">Tên nhân viên</th>
                <th className="py-3 px-4">Phòng ban</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Phép năm ban đầu</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Phép năm còn lại</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Nghỉ cá nhân (5 ngày)</th>
                <th className="py-3 px-6 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    Chưa có nhân viên nào. Hãy thêm dòng nhân viên mới ở biểu mẫu phía trên.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => {
                  const isEditing = editingId === emp.id;
                  const isConfirmDelete = confirmDeleteId === emp.id;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-6">
                        {isEditing ? (
                          <div className="space-y-2.5">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full px-2.5 py-1 text-sm border border-teal-600 rounded-md focus:outline-none"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md cursor-pointer hover:bg-teal-100">
                                <Camera className="w-3 h-3" />
                                <span>{editAvatarPhoto ? 'Đổi ảnh mặt' : 'Tải ảnh mặt'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    void handlePhotoFileChange(
                                      e.target.files?.[0],
                                      setEditAvatarPhoto,
                                    );
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {editAvatarPhoto && (
                                <button
                                  type="button"
                                  onClick={() => setEditAvatarPhoto('')}
                                  className="text-[11px] text-red-700 hover:underline"
                                >
                                  Gỡ ảnh
                                </button>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {AVATAR_PRESETS.map((preset) => (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => setEditAvatarPreset(preset.id)}
                                  title={preset.label}
                                  className={`p-0.5 rounded-xl border ${editAvatarPreset === preset.id
                                    ? 'border-teal-600 bg-teal-50'
                                    : 'border-slate-200 bg-white'
                                    }`}
                                >
                                  <BobbleAvatar
                                    presetId={preset.id}
                                    photoUrl={editAvatarPhoto || undefined}
                                    size="sm"
                                    interactive={false}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <BobbleAvatar
                              presetId={getEmployeeAvatarId(emp)}
                              photoUrl={emp.avatarPhoto}
                              size="sm"
                              interactive={false}
                            />
                            <span className="font-medium text-slate-900">{emp.name}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {isEditing ? (
                          <select
                            value={editDept}
                            onChange={(e) => setEditDept(e.target.value as Department)}
                            className="px-2.5 py-1 text-sm border border-teal-600 rounded-md bg-white focus:outline-none"
                          >
                            <option value="Nhân sự">Nhân sự</option>
                            <option value="Quản lý">Quản lý</option>
                          </select>
                        ) : (
                          <span className="text-slate-600">{emp.department}</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono-num tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            max={60}
                            step={0.5}
                            value={editAnnual}
                            onChange={(e) => setEditAnnual(Number(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-right text-sm border border-teal-600 rounded-md focus:outline-none"
                          />
                        ) : (
                          <span className="font-medium text-slate-900">
                            {emp.annualLeaveInitial ?? '—'}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono-num tabular-nums text-slate-700">
                        {emp.annualLeaveRemaining ?? '—'}
                      </td>

                      <td className="py-3 px-4 text-right font-mono-num tabular-nums text-teal-800">
                        {emp.personalLeaveRemaining ?? '—'} / 5
                      </td>

                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleSaveEdit(emp.id)}
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-md"
                              title="Lưu"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-md"
                              title="Hủy"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : isConfirmDelete ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="text-xs text-red-700">Xóa?</span>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleDelete(emp.id)}
                              className="px-2.5 py-1 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-md"
                            >
                              Xác nhận
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEdit(emp)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(emp.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md transition-colors"
                              title="Xóa nhân viên đã nghỉ việc"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Xóa dòng
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Manager Accounts Section */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              <h3 className="text-base font-semibold text-slate-900">
                Tài khoản Quản lý được phép đăng nhập
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
  Các tài khoản Admin được Super Admin cấp username và mật khẩu có thể đăng nhập để quản lý lịch nghỉ, thống kê phép và duyệt đơn.
</p>
          </div>
        </div>


        {isSuperAdmin && (
          <form
            onSubmit={handleAddManager}
            className="p-6 border-b border-slate-200 bg-slate-50/50 space-y-4"
          >
            {mgrError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {mgrError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="mgr-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Họ và tên Admin
                </label>
                <input
                  id="mgr-name"
                  type="text"
                  value={mgrName}
                  onChange={(e) => setMgrName(e.target.value)}
                  placeholder="Ví dụ: Trần Hoàng Nam"
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="mgr-username"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Username đăng nhập
                </label>
                <input
                  id="mgr-username"
                  type="text"
                  value={mgrUsername}
                  onChange={(e) => setMgrUsername(e.target.value.toLowerCase())}
                  placeholder="Ví dụ: admin01"
                  autoComplete="off"
                  minLength={4}
                  maxLength={30}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label htmlFor="mgr-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Mật khẩu
                </label>
                <input
                  id="mgr-password"
                  type="password"
                  value={mgrPassword}
                  onChange={(e) => setMgrPassword(e.target.value)}
                  placeholder="Ít nhất 6 ký tự"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label htmlFor="mgr-confirm-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Xác nhận mật khẩu
                </label>
                <input
                  id="mgr-confirm-password"
                  type="password"
                  value={mgrConfirmPassword}
                  onChange={(e) => setMgrConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-slate-500">
                Username dài 4–30 ký tự. Admin đăng nhập bằng username và mật khẩu do Super Admin cấp.
              </p>

              <button
                type="submit"
                disabled={mgrSaving}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                {mgrSaving ? 'Đang tạo tài khoản...' : 'Tạo tài khoản Admin'}
              </button>
            </div>
          </form>
        )}


        <div className="divide-y divide-slate-100 text-sm">
          <div className="px-6 py-3.5 flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-slate-900">Quản trị viên chính (Mặc định)</div>
              <div className="text-xs text-slate-500 font-mono-num">{ADMIN_EMAIL}</div>
            </div>
            <span className="text-xs font-medium text-teal-800">Toàn quyền</span>
          </div>

          {managers.map((mgr) => (
            <div key={mgr.id} className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70">
              <div>
                <div className="font-medium text-slate-900">{mgr.name}</div>
                <div className="text-xs text-slate-500 font-mono-num">{mgr.username}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-600">Quản lý</span>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => void removeManagerAccount(mgr.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Gỡ quyền
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
