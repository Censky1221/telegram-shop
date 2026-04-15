'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

export default function UsersPage() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount]     = useState('');
  const [note, setNote]         = useState('');
  const [mode, setMode]         = useState('topup'); // topup | deduct
  const [saving, setSaving]     = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg]           = useState('');

  useEffect(() => {
  const delay = setTimeout(() => {
    fetchUsers();
  }, 300);

  return () => clearTimeout(delay);
}, [search]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch(
  `${API}/api/admin/users?search=${search}`,
  { headers: authHeaders() }
);
      setUsers(await res.json());
    } finally { setLoading(false); }
  }

  async function handleSubmit() {
    if (!selected || !amount) return;
    setSaving(true);
    setMsg('');
    try {
      const endpoint = mode === 'topup'
        ? `${API}/api/admin/users/${selected.id}/topup`
        : `${API}/api/admin/users/${selected.id}/deduct`;
      const res  = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ amount: parseInt(amount), note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`✅ Berhasil! Saldo ${selected.username || selected.first_name} sekarang: Rp ${Number(data.user.balance).toLocaleString('id-ID')}`);
      setAmount('');
      setNote('');
      fetchUsers();
    } catch (err) {
      setMsg(`❌ ${err.message}`);
    } finally { setSaving(false); }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">👤 Users & Saldo</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User list */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow overflow-hidden">

  {/* 🔍 SEARCH */}
  <div className="p-4 border-b">
    <input
      type="text"
      placeholder="🔍 Cari username / nama / ID..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring focus:ring-blue-200"
    />
  </div>
          {loading ? (
            <div className="py-16 text-center text-gray-400">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Telegram ID</th>
                  <th className="px-4 py-3">Saldo</th>
                  <th className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id}
                    className={`hover:bg-gray-50 cursor-pointer ${selected?.id === u.id ? 'bg-blue-50' : ''}`}
                    onClick={() => { setSelected(u); setMsg(''); }}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.first_name || '—'}</div>
                      <div className="text-xs text-gray-400">@{u.username || 'no username'}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{u.telegram_id}</td>
                    <td className="px-4 py-3 font-semibold text-green-600">
                      Rp {Number(u.balance || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelected(u); setMsg(''); }}
                        className="text-blue-600 hover:underline text-xs">
                        Kelola Saldo
                      </button>
                    </td>
                  </tr>
                ))}
                {!users.length && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">Belum ada user.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Top-up / Deduct panel */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="font-medium mb-4">💰 Kelola Saldo</h2>

          {selected ? (
            <div>
              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                <p className="font-medium text-sm">{selected.first_name || '—'}</p>
                <p className="text-xs text-gray-400">@{selected.username || 'no username'}</p>
                <p className="text-green-600 font-semibold mt-1">
                  Saldo: Rp {Number(selected.balance || 0).toLocaleString('id-ID')}
                </p>
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-lg border overflow-hidden mb-4 text-sm">
                <button
                  onClick={() => setMode('topup')}
                  className={`flex-1 py-2 transition ${mode === 'topup' ? 'bg-green-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  ➕ Top-up
                </button>
                <button
                  onClick={() => setMode('deduct')}
                  className={`flex-1 py-2 transition ${mode === 'deduct' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  ➖ Kurangi
                </button>
              </div>

              <label className="block text-sm text-gray-600 mb-1">Jumlah (Rp)</label>
              <input
                type="number"
                className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
                placeholder="contoh: 50000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />

              {mode === 'topup' && (
                <>
                  <label className="block text-sm text-gray-600 mb-1">Catatan (opsional)</label>
                  <input
                    type="text"
                    className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
                    placeholder="contoh: Top-up via BCA"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                  />
                </>
              )}

              {/* Shortcut amounts */}
              <div className="flex flex-wrap gap-2 mb-4">
                {[10000, 25000, 50000, 100000].map(v => (
                  <button key={v} onClick={() => setAmount(String(v))}
                    className="px-2 py-1 text-xs border rounded-lg hover:bg-gray-50">
                    {(v/1000)}rb
                  </button>
                ))}
              </div>

              <button
                onClick={handleSubmit}
                disabled={saving || !amount}
                className={`w-full text-white text-sm py-2 rounded-lg disabled:opacity-50 transition
                  ${mode === 'topup' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}>
                {saving ? 'Menyimpan...' : mode === 'topup' ? '✅ Top-up Saldo' : '➖ Kurangi Saldo'}
              </button>

              {msg && (
                <div className={`mt-3 text-sm p-3 rounded-lg ${msg.startsWith('✅')
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {msg}
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">
              Pilih user dari tabel untuk mengelola saldo
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
