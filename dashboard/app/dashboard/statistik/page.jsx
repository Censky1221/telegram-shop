'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

export default function StatistikPage() {
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/admin/stats`, { headers: authHeaders() });
      const data = await res.json();
      setStats(data);
    } finally { setLoading(false); }
  }

  if (loading) return <div className="py-20 text-center text-gray-400">⏳ Memuat statistik...</div>;
  if (!stats)  return <div className="py-20 text-center text-gray-400">Gagal memuat statistik.</div>;

  const maxDaily = Math.max(...(stats.daily_chart || []).map(d => d.total), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl md:text-2xl font-semibold">📊 Statistik</h1>
        <button onClick={fetchStats} className="text-sm text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5 hover:bg-gray-50 transition">
          🔄 Refresh
        </button>
      </div>

      {/* Pendapatan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Hari Ini', value: stats.revenue_today, color: 'blue' },
          { label: 'Minggu Ini', value: stats.revenue_week, color: 'green' },
          { label: 'Bulan Ini', value: stats.revenue_month, color: 'purple' },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-2xl shadow p-5">
            <p className="text-xs text-gray-500 mb-1">{item.label}</p>
            <p className={`text-2xl font-bold text-${item.color}-600`}>
              Rp {Number(item.value || 0).toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-gray-400 mt-1">Pendapatan</p>
          </div>
        ))}
      </div>

      {/* Pesanan & User */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.orders_paid || 0}</p>
          <p className="text-xs text-gray-500 mt-1">✅ Paid</p>
        </div>
        <div className="bg-white rounded-2xl shadow p-4 text-center">
          <p className="text-2xl font-bold text-yellow-500">{stats.orders_pending || 0}</p>
          <p className="text-xs text-gray-500 mt-1">⏳ Pending</p>
        </div>
        <div className="bg-white rounded-2xl shadow p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.users_total || 0}</p>
          <p className="text-xs text-gray-500 mt-1">👤 Total User</p>
        </div>
        <div className="bg-white rounded-2xl shadow p-4 text-center">
          <p className="text-2xl font-bold text-indigo-600">{stats.users_new_week || 0}</p>
          <p className="text-xs text-gray-500 mt-1">🆕 User Baru (7 hari)</p>
        </div>
      </div>

      {/* Grafik Penjualan Harian */}
      <div className="bg-white rounded-2xl shadow p-6 mb-6">
        <h2 className="font-medium mb-4">📈 Penjualan 14 Hari Terakhir</h2>
        <div className="flex items-end gap-1.5 h-40">
          {(stats.daily_chart || []).map((d, i) => {
            const pct    = Math.round((d.total / maxDaily) * 100);
            const height = Math.max(pct, 4);
            const tgl    = new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full bg-blue-500 rounded-t-sm hover:bg-blue-600 transition cursor-pointer"
                  style={{ height: `${height}%` }}
                  title={`${tgl}: Rp ${Number(d.total).toLocaleString('id-ID')} (${d.count} pesanan)`}
                />
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                  {tgl}<br/>Rp {Number(d.total).toLocaleString('id-ID')}<br/>{d.count} pesanan
                </div>
                <span className="text-xs text-gray-400 rotate-45 origin-left" style={{ fontSize: '9px' }}>
                  {new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            );
          })}
        </div>
        {stats.daily_chart?.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">Belum ada data penjualan.</p>
        )}
      </div>

      {/* Produk Terlaris */}
      <div className="bg-white rounded-2xl shadow overflow-hidden mb-6">
        <div className="px-6 py-4 border-b">
          <h2 className="font-medium">🏆 Produk/Varian Terlaris</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Produk</th>
              <th className="px-4 py-3">Varian</th>
              <th className="px-4 py-3">Terjual</th>
              <th className="px-4 py-3">Pendapatan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(stats.top_products || []).map((p, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400 font-medium">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </td>
                <td className="px-4 py-3 font-medium">{p.product_name}</td>
                <td className="px-4 py-3 text-gray-500">{p.variant_name || '-'}</td>
                <td className="px-4 py-3 text-green-600 font-medium">{p.total_sold} akun</td>
                <td className="px-4 py-3">Rp {Number(p.total_revenue).toLocaleString('id-ID')}</td>
              </tr>
            ))}
            {!stats.top_products?.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Belum ada data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}