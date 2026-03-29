'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;

function authHeaders() {
  // Guard: localStorage hanya tersedia di browser (bukan SSR)
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

const STATUS_STYLE = {
  paid:    'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed:  'bg-red-100 text-red-600',
  expired: 'bg-gray-100 text-gray-500',
};

export default function OrdersPage() {
  const [orders, setOrders]   = useState([]);
  const [filter, setFilter]   = useState('');
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail]   = useState(null);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    fetchOrders();
  }, [filter]);

  async function fetchOrders() {
    setLoading(true);
    setSearch('');
    setDetail(null);
    setError(null);
    try {
      const qs  = filter ? `?status=${filter}` : '';
      const res = await fetch(`${API}/api/admin/orders${qs}`, { headers: authHeaders() });
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('fetchOrders error:', err);
      setError('Gagal memuat orders. Periksa koneksi internet.');
      setOrders([]);
    } finally { setLoading(false); }
  }

  async function handleSearch() {
    if (!search.trim()) return fetchOrders();
    setLoading(true);
    setDetail(null);
    try {
      const res  = await fetch(`${API}/api/admin/orders/search?id=${search.trim()}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.error) {
        setOrders([]);
        setDetail(null);
      } else if (Array.isArray(data)) {
        setOrders(data);
      } else {
        setOrders([data]);
        setDetail(data);
      }
    } catch (err) {
      console.error('handleSearch error:', err);
      setOrders([]);
    } finally { setLoading(false); }
  }

  const statusCounts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">📋 Orders</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {['paid', 'pending', 'failed', 'expired'].map(s => (
          <div key={s} className="bg-white rounded-xl shadow p-4 text-center">
            <p className="text-2xl font-semibold">{statusCounts[s] || 0}</p>
            <p className="text-xs text-gray-500 capitalize mt-1">{s}</p>
          </div>
        ))}
      </div>

      {/* Search by ID */}
      <div className="bg-white rounded-2xl shadow p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">🔍 Cari by ID Pesanan</label>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="Masukkan ID pesanan (contoh: 42)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            Cari
          </button>
          {search && (
            <button
              onClick={() => { setSearch(''); fetchOrders(); }}
              className="bg-gray-200 hover:bg-gray-300 text-sm px-4 py-2 rounded-lg transition"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Detail pesanan jika ditemukan by ID */}
      {detail && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 text-sm">
          <p className="font-semibold text-blue-800 mb-2">📋 Detail Pesanan #{detail.id}</p>
          <div className="grid grid-cols-2 gap-2 text-blue-700">
            <div><span className="text-blue-500">Produk:</span> {detail.product_name}</div>
            <div><span className="text-blue-500">User:</span> {detail.telegram_username ? `@${detail.telegram_username}` : `#${detail.telegram_id}`}</div>
            <div><span className="text-blue-500">Total:</span> Rp {Number(detail.amount).toLocaleString('id-ID')}</div>
            <div><span className="text-blue-500">Status:</span>
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[detail.status] || ''}`}>
                {detail.status}
              </span>
            </div>
            <div><span className="text-blue-500">Payment ID:</span> <span className="font-mono text-xs">{detail.payment_id}</span></div>
            <div><span className="text-blue-500">Tanggal:</span> {new Date(detail.created_at).toLocaleString('id-ID')}</div>
            {detail.paid_at && <div><span className="text-blue-500">Dibayar:</span> {new Date(detail.paid_at).toLocaleString('id-ID')}</div>}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'paid', 'pending', 'failed', 'expired'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
            {s || 'All'}
          </button>
        ))}
        <button onClick={fetchOrders} className="ml-auto px-3 py-1.5 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          🔄 Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading...</div>
        ) : error ? (
          <div className="py-16 text-center text-red-400">{error}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3">#ID</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetail(o)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 font-semibold">#{o.id}</td>
                  <td className="px-4 py-3 font-medium">{o.product_name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {o.telegram_username ? `@${o.telegram_username}` : `#${o.telegram_id}`}
                  </td>
                  <td className="px-4 py-3">Rp {Number(o.amount).toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[o.status] || ''}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(o.created_at).toLocaleString('id-ID')}
                  </td>
                </tr>
              ))}
              {!orders.length && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No orders found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2 text-center">Klik baris untuk melihat detail pesanan.</p>
    </div>
  );
}