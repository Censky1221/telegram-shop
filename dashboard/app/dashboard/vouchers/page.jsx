'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

export default function VoucherPage() {
  const [vouchers, setVouchers] = useState([]);
  const [form, setForm]         = useState({
    code: '', type: 'percent', value: '', max_per_user: '1', expired_at: '',
  });
  const [editing, setEditing]   = useState(null);
  const [loading, setLoading]   = useState(false);

  useEffect(() => { fetchVouchers(); }, []);

  async function fetchVouchers() {
    const res  = await fetch(`${API}/api/admin/vouchers`, { headers: authHeaders() });
    setVouchers(await res.json());
  }

  async function handleSave() {
    if (!form.code || !form.value) return alert('Kode dan nilai wajib diisi.');
    setLoading(true);
    try {
      const url    = editing ? `${API}/api/admin/vouchers/${editing}` : `${API}/api/admin/vouchers`;
      const method = editing ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method, headers: authHeaders(),
        body: JSON.stringify({
          ...form,
          value       : parseInt(form.value),
          max_per_user: parseInt(form.max_per_user) || 1,
          expired_at  : form.expired_at || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) return alert(`❌ ${data.error}`);
      setForm({ code: '', type: 'percent', value: '', max_per_user: '1', expired_at: '' });
      setEditing(null);
      fetchVouchers();
    } finally { setLoading(false); }
  }

  async function handleToggle(v) {
    await fetch(`${API}/api/admin/vouchers/${v.id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ is_active: !v.is_active }),
    });
    fetchVouchers();
  }

  async function handleDelete(id) {
    if (!confirm('Hapus voucher ini?')) return;
    await fetch(`${API}/api/admin/vouchers/${id}`, { method: 'DELETE', headers: authHeaders() });
    fetchVouchers();
  }

  function startEdit(v) {
    setEditing(v.id);
    setForm({
      code        : v.code,
      type        : v.type,
      value       : String(v.value),
      max_per_user: String(v.max_per_user),
      expired_at  : v.expired_at ? new Date(v.expired_at).toISOString().slice(0, 16) : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function isExpired(v) {
    return v.expired_at && new Date(v.expired_at) < new Date();
  }

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-semibold mb-1">🎟️ Voucher & Diskon</h1>
      <p className="text-gray-500 text-sm mb-6">Kelola kode promo untuk user bot kamu.</p>

      {/* Form */}
      <div className="bg-white rounded-2xl shadow p-4 md:p-6 mb-6">
        <h2 className="font-medium mb-3">{editing ? 'Edit Voucher' : 'Buat Voucher Baru'}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kode Voucher</label>
            <input
              className="border rounded-lg px-3 py-2.5 text-sm w-full font-mono uppercase"
              placeholder="DISKON10"
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipe Diskon</label>
            <select
              className="border rounded-lg px-3 py-2.5 text-sm w-full"
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
            >
              <option value="percent">Persen (%)</option>
              <option value="nominal">Nominal (Rp)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Nilai {form.type === 'percent' ? '(%)' : '(Rp)'}
            </label>
            <input
              className="border rounded-lg px-3 py-2.5 text-sm w-full"
              type="number"
              placeholder={form.type === 'percent' ? '10' : '5000'}
              value={form.value}
              onChange={e => setForm({ ...form, value: e.target.value })}
            />
            {form.type === 'percent' && parseInt(form.value) > 100 && (
              <p className="text-xs text-red-500 mt-1">Maksimal 100%</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max Pakai per User</label>
            <input
              className="border rounded-lg px-3 py-2.5 text-sm w-full"
              type="number"
              min="1"
              value={form.max_per_user}
              onChange={e => setForm({ ...form, max_per_user: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Masa Berlaku (opsional)</label>
            <input
              className="border rounded-lg px-3 py-2.5 text-sm w-full"
              type="datetime-local"
              value={form.expired_at}
              onChange={e => setForm({ ...form, expired_at: e.target.value })}
            />
            <p className="text-xs text-gray-400 mt-1">Kosongkan jika tidak ada batas waktu.</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSave}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2.5 rounded-lg transition"
          >
            {loading ? 'Menyimpan...' : editing ? 'Update Voucher' : 'Buat Voucher'}
          </button>
          {editing && (
            <button
              onClick={() => { setEditing(null); setForm({ code: '', type: 'percent', value: '', max_per_user: '1', expired_at: '' }); }}
              className="bg-gray-200 hover:bg-gray-300 text-sm px-4 py-2.5 rounded-lg transition"
            >
              Batal
            </button>
          )}
        </div>
      </div>

      {/* List Voucher */}
      <div className="hidden md:block bg-white rounded-2xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3">Kode</th>
              <th className="px-4 py-3">Diskon</th>
              <th className="px-4 py-3">Max/User</th>
              <th className="px-4 py-3">Expired</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vouchers.map(v => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-semibold text-blue-700">{v.code}</td>
                <td className="px-4 py-3 font-medium">
                  {v.type === 'percent'
                    ? `${v.value}%`
                    : `Rp ${Number(v.value).toLocaleString('id-ID')}`}
                </td>
                <td className="px-4 py-3 text-gray-500">{v.max_per_user}x</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {v.expired_at
                    ? <span className={isExpired(v) ? 'text-red-500' : ''}>
                        {new Date(v.expired_at).toLocaleString('id-ID')}
                        {isExpired(v) && ' (Expired)'}
                      </span>
                    : <span className="text-gray-400">Tidak ada</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    v.is_active && !isExpired(v) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {isExpired(v) ? 'Expired' : v.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => startEdit(v)} className="text-blue-600 hover:underline text-xs">Edit</button>
                  <button onClick={() => handleToggle(v)} className="text-yellow-600 hover:underline text-xs">
                    {v.is_active ? 'Nonaktif' : 'Aktifkan'}
                  </button>
                  <button onClick={() => handleDelete(v.id)} className="text-red-500 hover:underline text-xs">Hapus</button>
                </td>
              </tr>
            ))}
            {!vouchers.length && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Belum ada voucher.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {vouchers.map(v => (
          <div key={v.id} className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-mono font-bold text-blue-700 text-lg">{v.code}</p>
                <p className="text-green-600 font-medium">
                  {v.type === 'percent' ? `${v.value}%` : `Rp ${Number(v.value).toLocaleString('id-ID')}`} diskon
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                v.is_active && !isExpired(v) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {isExpired(v) ? 'Expired' : v.is_active ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Max {v.max_per_user}x per user •{' '}
              {v.expired_at ? `Expired: ${new Date(v.expired_at).toLocaleDateString('id-ID')}` : 'Tanpa batas waktu'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => startEdit(v)} className="flex-1 text-center text-sm text-blue-600 border border-blue-200 py-1.5 rounded-lg">Edit</button>
              <button onClick={() => handleToggle(v)} className="flex-1 text-center text-sm text-yellow-600 border border-yellow-200 py-1.5 rounded-lg">
                {v.is_active ? 'Nonaktif' : 'Aktifkan'}
              </button>
              <button onClick={() => handleDelete(v.id)} className="flex-1 text-center text-sm text-red-500 border border-red-200 py-1.5 rounded-lg">Hapus</button>
            </div>
          </div>
        ))}
        {!vouchers.length && <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-400">Belum ada voucher.</div>}
      </div>
    </div>
  );
}