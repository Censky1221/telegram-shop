'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

const STATUS_STYLE = {
  paid:    'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed:  'bg-red-100 text-red-600',
  expired: 'bg-gray-100 text-gray-500',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchOrders(); }, [filter]);

  async function fetchOrders() {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : '';
      const res = await fetch(`${API}/admin/orders${qs}`, { headers: authHeaders() });
      setOrders(await res.json());
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
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">#{o.id}</td>
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
    </div>
  );
}
