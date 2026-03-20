'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

export default function ProductsPage() {
  const [products, setProducts]  = useState([]);
  const [form, setForm]          = useState({ name: '', description: '', price: '' });
  const [editing, setEditing]    = useState(null);
  const [loading, setLoading]    = useState(false);

  useEffect(() => { fetchProducts(); }, []);

  async function fetchProducts() {
    const res = await fetch(`${API}/api/admin/products`, { headers: authHeaders() });
    setProducts(await res.json());
  }

  async function handleSave() {
    if (!form.name || !form.price) return alert('Name and price are required.');
    setLoading(true);
    try {
      const url    = editing ? `${API}/api/admin/products/${editing}` : `${API}/api/admin/products`;
      const method = editing ? 'PUT' : 'POST';
      await fetch(url, { method, headers: authHeaders(), body: JSON.stringify({ ...form, price: parseInt(form.price) }) });
      setForm({ name: '', description: '', price: '' });
      setEditing(null);
      await fetchProducts();
    } finally { setLoading(false); }
  }

  async function handleDeactivate(id) {
    if (!confirm('Nonaktifkan produk ini?')) return;
    await fetch(`${API}/api/admin/products/${id}`, { method: 'DELETE', headers: authHeaders() });
    fetchProducts();
  }

  async function handleHapus(id, available) {
  const pesanKonfirmasi = parseInt(available) > 0
    ? `HAPUS PERMANEN produk ini?\n\nMasih ada ${available} stok yang akan ikut terhapus!`
    : `HAPUS PERMANEN produk ini? Tindakan ini tidak bisa dibatalkan!`;
  if (!confirm(pesanKonfirmasi)) return;
    const res  = await fetch(`${API}/api/admin/products/${id}/destroy`, { method: 'DELETE', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return alert(`❌ ${data.error}`);
    fetchProducts();
  }

  function startEdit(p) {
    setEditing(p.id);
    setForm({ name: p.name, description: p.description || '', price: String(p.price) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">📦 Products</h1>

      {/* Form */}
      <div className="bg-white rounded-2xl shadow p-4 md:p-6 mb-4 md:mb-6">
        <h2 className="font-medium mb-3 md:mb-4">{editing ? 'Edit Product' : 'Add New Product'}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className="border rounded-lg px-3 py-2.5 text-sm w-full"
            placeholder="Product name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="border rounded-lg px-3 py-2.5 text-sm w-full"
            placeholder="Price (IDR e.g. 50000)"
            type="number"
            value={form.price}
            onChange={e => setForm({ ...form, price: e.target.value })}
          />
          <textarea
            className="border rounded-lg px-3 py-2.5 text-sm sm:col-span-2 w-full"
            rows={2}
            placeholder="Description"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          <button
            onClick={handleSave}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2.5 rounded-lg disabled:opacity-50 transition"
          >
            {loading ? 'Saving...' : editing ? 'Update Product' : 'Add Product'}
          </button>
          {editing && (
            <button
              onClick={() => { setEditing(null); setForm({ name: '', description: '', price: '' }); }}
              className="bg-gray-200 hover:bg-gray-300 text-sm px-4 py-2.5 rounded-lg transition"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-2xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Available</th>
              <th className="px-4 py-3">Sold</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">Rp {Number(p.price).toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-green-600 font-medium">{p.available}</td>
                <td className="px-4 py-3 text-gray-500">{p.sold}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-2 items-center">
                  <button onClick={() => startEdit(p)} className="text-blue-600 hover:underline text-xs">Edit</button>
                  <button onClick={() => handleDeactivate(p.id)} className="text-yellow-600 hover:underline text-xs">Nonaktifkan</button>
                  <button
                    onClick={() => handleHapus(p.id, p.available)}
                    className={`text-xs ${parseInt(p.available) > 0 ? 'text-gray-300 cursor-not-allowed' : 'text-red-500 hover:underline'}`}
                    title={parseInt(p.available) > 0 ? `Masih ada ${p.available} stok` : 'Hapus permanen'}
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
            {!products.length && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No products yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {products.map(p => (
          <div key={p.id} className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="font-semibold text-gray-800">{p.name}</p>
                <p className="text-blue-600 font-medium text-sm mt-0.5">
                  Rp {Number(p.price).toLocaleString('id-ID')}
                </p>
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {p.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex gap-4 text-sm text-gray-500 mb-3">
              <span>✅ {p.available} tersedia</span>
              <span>📦 {p.sold} terjual</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => startEdit(p)}
                className="flex-1 text-center text-sm text-blue-600 border border-blue-200 py-1.5 rounded-lg hover:bg-blue-50 transition"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeactivate(p.id)}
                className="flex-1 text-center text-sm text-yellow-600 border border-yellow-200 py-1.5 rounded-lg hover:bg-yellow-50 transition"
              >
                Nonaktifkan
              </button>
              <button
                onClick={() => handleHapus(p.id, p.available)}
                className={`flex-1 text-center text-sm py-1.5 rounded-lg transition border ${
                  parseInt(p.available) > 0
                    ? 'text-gray-300 border-gray-100 cursor-not-allowed'
                    : 'text-red-500 border-red-200 hover:bg-red-50'
                }`}
              >
                Hapus
              </button>
            </div>
            {parseInt(p.available) > 0 && (
              <p className="text-xs text-orange-500 mt-2 text-center">
                ⚠️ Tidak bisa dihapus — stok masih {p.available}
              </p>
            )}
          </div>
        ))}
        {!products.length && (
          <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-400">No products yet.</div>
        )}
      </div>
    </div>
  );
}