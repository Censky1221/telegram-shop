'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

export default function VariantsPage() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [variants, setVariants] = useState([]);
  const [form, setForm]         = useState({ name: '', description: '', price: '' });
  const [editing, setEditing]   = useState(null);
  const [loading, setLoading]   = useState(false);

  useEffect(() => { fetchProducts(); }, []);
  useEffect(() => { if (selected) fetchVariants(selected); }, [selected]);

  async function fetchProducts() {
    const res  = await fetch(`${API}/api/admin/products`, { headers: authHeaders() });
    const data = await res.json();
    setProducts(data);
    if (data.length && !selected) setSelected(data[0].id);
  }

  async function fetchVariants(productId) {
    const res = await fetch(`${API}/api/admin/variants?productId=${productId}`, { headers: authHeaders() });
    setVariants(await res.json());
  }

  async function handleSave() {
    if (!form.name || !form.price) return alert('Nama dan harga wajib diisi.');
    setLoading(true);
    try {
      if (editing) {
        // UPDATE existing variant
        await fetch(`${API}/api/admin/variants/${editing}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ ...form, price: parseInt(form.price) }),
        });
      } else {
        // CREATE new variant
        await fetch(`${API}/api/admin/variants`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ product_id: selected, ...form, price: parseInt(form.price) }),
        });
      }
      setForm({ name: '', description: '', price: '' });
      setEditing(null);
      await fetchVariants(selected);
    } finally { setLoading(false); }
  }

  async function handleToggle(variantId, isActive) {
    await fetch(`${API}/api/admin/variants/${variantId}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ is_active: !isActive }),
    });
    fetchVariants(selected);
  }

  async function handleDelete(variantId) {
    if (!confirm('Hapus varian ini?')) return;
    await fetch(`${API}/api/admin/variants/${variantId}`, { method: 'DELETE', headers: authHeaders() });
    fetchVariants(selected);
  }

  function startEdit(v) {
    setEditing(v.id);
    setForm({ name: v.name, description: v.description || '', price: String(v.price) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const selectedProduct = products.find(p => p.id === selected);

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-semibold mb-1">🎛️ Varian Produk</h1>
      <p className="text-gray-500 text-sm mb-4 md:mb-6">Kelola varian untuk setiap produk (contoh: NOGAR, FULLGAR).</p>

      <div className="bg-white rounded-2xl shadow p-4 md:p-6 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Pilih Produk</label>
        <select
          className="w-full border rounded-lg px-3 py-2.5 text-sm"
          value={selected || ''}
          onChange={e => { setSelected(parseInt(e.target.value)); setEditing(null); setForm({ name: '', description: '', price: '' }); }}
        >
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selected && (
        <>
          <div className="bg-white rounded-2xl shadow p-4 md:p-6 mb-4">
            <h2 className="font-medium mb-3">
              {editing ? 'Edit Varian' : `Tambah Varian — ${selectedProduct?.name}`}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input className="border rounded-lg px-3 py-2.5 text-sm" placeholder="Nama varian (e.g. NOGAR, FULLGAR)"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input className="border rounded-lg px-3 py-2.5 text-sm" placeholder="Harga (IDR e.g. 15000)"
                type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
              <textarea className="border rounded-lg px-3 py-2.5 text-sm sm:col-span-2" rows={2}
                placeholder="Deskripsi (opsional)" value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              <button onClick={handleSave} disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2.5 rounded-lg transition">
                {loading ? 'Menyimpan...' : editing ? 'Update Varian' : 'Tambah Varian'}
              </button>
              {editing && (
                <button onClick={() => { setEditing(null); setForm({ name: '', description: '', price: '' }); }}
                  className="bg-gray-200 hover:bg-gray-300 text-sm px-4 py-2.5 rounded-lg transition">Batal</button>
              )}
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-2xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3">Nama Varian</th>
                  <th className="px-4 py-3">Harga</th>
                  <th className="px-4 py-3">Stok</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {variants.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{v.name}</td>
                    <td className="px-4 py-3">Rp {Number(v.price).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-green-600 font-medium">{v.stock_count || 0}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {v.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => startEdit(v)} className="text-blue-600 hover:underline text-xs">Edit</button>
                      <button onClick={() => handleToggle(v.id, v.is_active)} className="text-yellow-600 hover:underline text-xs">
                        {v.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button onClick={() => handleDelete(v.id)} className="text-red-500 hover:underline text-xs">Hapus</button>
                    </td>
                  </tr>
                ))}
                {!variants.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Belum ada varian.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {variants.map(v => (
              <div key={v.id} className="bg-white rounded-2xl shadow p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-gray-800">{v.name}</p>
                    <p className="text-blue-600 font-medium text-sm mt-0.5">Rp {Number(v.price).toLocaleString('id-ID')}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${v.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {v.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-3">✅ {v.stock_count || 0} stok tersedia</p>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(v)} className="flex-1 text-center text-sm text-blue-600 border border-blue-200 py-1.5 rounded-lg hover:bg-blue-50 transition">Edit</button>
                  <button onClick={() => handleToggle(v.id, v.is_active)} className="flex-1 text-center text-sm text-yellow-600 border border-yellow-200 py-1.5 rounded-lg hover:bg-yellow-50 transition">
                    {v.is_active ? 'Nonaktif' : 'Aktifkan'}
                  </button>
                  <button onClick={() => handleDelete(v.id)} className="flex-1 text-center text-sm text-red-500 border border-red-200 py-1.5 rounded-lg hover:bg-red-50 transition">Hapus</button>
                </div>
              </div>
            ))}
            {!variants.length && <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-400">Belum ada varian.</div>}
          </div>
        </>
      )}
    </div>
  );
}