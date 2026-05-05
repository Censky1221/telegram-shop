'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '';
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

const STATUS_LABEL = { pending: '⏳ Pending', approved: '✅ Disetujui', paid: '💰 Lunas', rejected: '❌ Ditolak' };
const STATUS_COLOR = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
};

export default function ReferralPage() {
  const [settings, setSettings]         = useState({ bonus_amount: 500, is_active: true, min_withdraw: 10000 });
  const [stats, setStats]               = useState(null);
  const [topReferrers, setTopReferrers] = useState([]);
  const [joinedUsers, setJoinedUsers]   = useState([]);
  const [pendingRef, setPendingRef]     = useState([]);
  const [withdrawals, setWithdrawals]   = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [joinedTab, setJoinedTab]       = useState('done');
  const [saving, setSaving]             = useState(false);
  const [noteModal, setNoteModal]       = useState(null);
  const [note, setNote]                 = useState('');
  const [loading, setLoading]           = useState(true);


  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);

    // Fetch setiap endpoint secara independen agar satu gagal tidak blokir yang lain
    try {
      const sRes = await fetch(`${API}/api/admin/referral/settings`, { headers: authHeaders() });
      if (sRes.ok) setSettings(await sRes.json());
    } catch (e) { console.error('settings fetch error:', e); }

    try {
      const stRes = await fetch(`${API}/api/admin/referral/stats`, { headers: authHeaders() });
      if (stRes.ok) {
        const d = await stRes.json();
        setStats(d.stats);
        setTopReferrers(d.topReferrers || []);
        setJoinedUsers(d.joinedUsers || []);
        setPendingRef(d.pendingReferrals || []);
      } else { console.error('stats status:', stRes.status, await stRes.text().catch(()=>'')); }
    } catch (e) { console.error('stats fetch error:', e); }

    try {
      const wRes = await fetch(`${API}/api/admin/withdrawals`, { headers: authHeaders() });
      console.log('withdrawals status:', wRes.status);
      if (wRes.ok) {
        const data = await wRes.json();
        console.log('withdrawals data:', data);
        setWithdrawals(data);
      } else {
        const errText = await wRes.text().catch(() => '');
        console.error('withdrawals error:', wRes.status, errText);
      }
    } catch (e) { console.error('withdrawals fetch error:', e); }

    setLoading(false);
  }

  async function fetchWithdrawals() {
    try {
      const url = filterStatus
        ? `${API}/api/admin/withdrawals?status=${filterStatus}`
        : `${API}/api/admin/withdrawals`;
      const res = await fetch(url, { headers: authHeaders() });
      console.log('fetchWithdrawals status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('fetchWithdrawals data:', data);
        setWithdrawals(data);
      }
    } catch (e) { console.error('fetchWithdrawals error:', e); }
  }

  useEffect(() => { fetchWithdrawals(); }, [filterStatus]);

  async function saveSettings() {
    setSaving(true);
    await fetch(`${API}/api/admin/referral/settings`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(settings),
    });
    setSaving(false);
    alert('✅ Pengaturan disimpan!');
  }

  async function updateWithdrawal(id, status) {
    await fetch(`${API}/api/admin/withdrawals/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status, admin_note: note }),
    });
    setNoteModal(null);
    setNote('');
    fetchWithdrawals();
    fetchAll();
  }

  const pendingCount = withdrawals.filter(w => w.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">💎 Referral & Penarikan</h1>
          <p className="text-gray-500 text-sm mt-0.5">Kelola program referral dan permintaan tarik saldo user.</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm px-3 py-2 rounded-lg flex items-center gap-1"
        >
          <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Referral', value: stats.total_referrals, color: 'blue', icon: '👥' },
            { label: 'Referrer Aktif', value: stats.total_referrers, color: 'purple', icon: '⭐' },
            { label: 'Bonus Dibayar', value: `Rp ${Number(stats.total_bonus_paid).toLocaleString('id-ID')}`, color: 'green', icon: '💰' },
            { label: 'Pending Tarik', value: pendingCount, color: 'yellow', icon: '⏳' },
          ].map(s => (
            <div key={s.label} className={`bg-${s.color}-50 rounded-2xl p-4 text-center`}>
              <div className="text-2xl mb-1">{s.icon}</div>
              <p className={`text-xl font-bold text-${s.color}-600`}>{s.value}</p>
              <p className={`text-xs text-${s.color}-400`}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Referral Settings */}
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="font-semibold text-base mb-4">⚙️ Pengaturan Referral</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Status Program</label>
              <button
                onClick={() => setSettings(s => ({ ...s, is_active: !s.is_active }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${settings.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.is_active ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Bonus per Referral (Rp)</label>
              <input
                type="number"
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={settings.bonus_amount}
                onChange={e => setSettings(s => ({ ...s, bonus_amount: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-xs text-gray-400 mt-1">Bonus diberikan saat teman yang diajak melakukan pembelian pertama.</p>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Minimum Penarikan (Rp)</label>
              <input
                type="number"
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={settings.min_withdraw}
                onChange={e => setSettings(s => ({ ...s, min_withdraw: parseInt(e.target.value) || 0 }))}
              />
            </div>

            <button
              onClick={saveSettings}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg transition"
            >
              {saving ? 'Menyimpan...' : '💾 Simpan Pengaturan'}
            </button>
          </div>
        </div>

        {/* Top Referrers */}
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="font-semibold text-base mb-4">🏆 Top Referrer</h2>
          {topReferrers.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Belum ada data referral.</p>
          ) : (
            <div className="space-y-2">
              {topReferrers.map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{r.first_name} {r.username ? `@${r.username}` : ''}</p>
                    <p className="text-xs text-gray-400">{r.referral_count} referral · Rp {Number(r.total_earned).toLocaleString('id-ID')}</p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">{r.referral_count}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Withdrawal Requests */}
      <div className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold text-base">💸 Permintaan Penarikan</h2>
          <div className="flex gap-2">
            {['', 'pending', 'approved', 'paid', 'rejected'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-xs px-3 py-1.5 rounded-full transition ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {s === '' ? 'Semua' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {withdrawals.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">Tidak ada permintaan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b">
                  <th className="pb-2">ID</th>
                  <th className="pb-2">User</th>
                  <th className="pb-2">Jumlah</th>
                  <th className="pb-2">Metode</th>
                  <th className="pb-2">Rekening</th>
                  <th className="pb-2">Nama</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Tanggal</th>
                  <th className="pb-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map(w => (
                  <tr key={w.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pr-2 font-mono text-xs text-gray-400">#{w.id}</td>
                    <td className="py-2 pr-2">
                      <p className="font-medium truncate max-w-[80px]">{w.first_name}</p>
                      <p className="text-xs text-gray-400">{w.username ? `@${w.username}` : w.telegram_id}</p>
                    </td>
                    <td className="py-2 pr-2 font-semibold text-green-700">Rp {Number(w.amount).toLocaleString('id-ID')}</td>
                    <td className="py-2 pr-2">{w.method}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{w.account_info}</td>
                    <td className="py-2 pr-2 text-xs">{w.account_name}</td>
                    <td className="py-2 pr-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[w.status]}`}>
                        {STATUS_LABEL[w.status]}
                      </span>
                      {w.admin_note && <p className="text-xs text-gray-400 mt-0.5">{w.admin_note}</p>}
                    </td>
                    <td className="py-2 pr-2 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(w.created_at).toLocaleDateString('id-ID')}
                    </td>
                    <td className="py-2">
                      {w.status === 'pending' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setNoteModal({ id: w.id, action: 'approved' }); setNote(''); }}
                            className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg"
                          >✅ Setuju</button>
                          <button
                            onClick={() => { setNoteModal({ id: w.id, action: 'rejected' }); setNote(''); }}
                            className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg"
                          >❌ Tolak</button>
                        </div>
                      )}
                      {w.status === 'approved' && (
                        <button
                          onClick={() => { setNoteModal({ id: w.id, action: 'paid' }); setNote(''); }}
                          className="text-xs px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg"
                        >💰 Tandai Lunas</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Note Modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-base mb-3">
              {noteModal.action === 'approved' ? '✅ Setujui Penarikan' : noteModal.action === 'paid' ? '💰 Tandai Sudah Lunas' : '❌ Tolak Penarikan'}
            </h3>
            <textarea
              className="border rounded-lg px-3 py-2 text-sm w-full resize-none"
              rows={3}
              placeholder="Catatan untuk user (opsional)..."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => updateWithdrawal(noteModal.id, noteModal.action)}
                className={`flex-1 text-white text-sm py-2.5 rounded-lg transition ${noteModal.action === 'rejected' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {noteModal.action === 'approved' ? '✅ Setujui' : noteModal.action === 'paid' ? '💰 Tandai Lunas' : '❌ Tolak'}
              </button>
              <button
                onClick={() => { setNoteModal(null); setNote(''); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-sm py-2.5 rounded-lg transition"
              >Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
