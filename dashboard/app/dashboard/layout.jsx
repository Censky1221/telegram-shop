'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

export default function StocksPage() {
  const [products, setProducts]               = useState([]);
  const [variants, setVariants]               = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [rawText, setRawText]                 = useState('');
  const [stocks, setStocks]                   = useState([]);
  const [uploadResult, setUploadResult]       = useState(null);
  const [uploading, setUploading]             = useState(false);
  const [editingId, setEditingId]             = useState(null);
  const [editForm, setEditForm]               = useState({ email: '', password: '' });
  const [editLoading, setEditLoading]         = useState(false);

  useEffect(() => { fetchProducts(); }, []);

  useEffect(() => {
    setSelectedVariant('');
    setVariants([]);
    setStocks([]);
    if (selectedProduct) fetchVariants(selectedProduct);
  }, [selectedProduct]);

  useEffect(() => {
    setStocks([]);
    if (selectedProduct) fetchStocks();
  }, [selectedVariant]);

  async function fetchProducts() {
    const res = await fetch(`${API}/api/admin/products`, { headers: authHeaders() });
    setProducts(await res.json());
  }

  async function fetchVariants(productId) {
    const res  = await fetch(`${API}/api/admin/variants?productId=${productId}`, { headers: authHeaders() });
    setVariants(await res.json());
  }

  async function fetchStocks() {
    if (!selectedProduct) return;
    const qs  = selectedVariant ? `?variantId=${selectedVariant}` : '';
    const res = await fetch(`${API}/api/admin/stocks/${selectedProduct}${qs}`, { headers: authHeaders() });
    setStocks(await res.json());
  }

  async function handleUpload() {
    if (!selectedProduct) return alert('Pilih produk dulu.');
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.includes(':'));
    if (!lines.length) return alert('Format: email:password');
    const stockItems = lines.map(line => {
      const idx = line.indexOf(':');
      return { email: line.substring(0, idx).trim(), password: line.substring(idx + 1).trim() };
    });
    setUploading(true);
    try {
      const body = { product_id: parseInt(selectedProduct), stocks: stockItems };
      if (selectedVariant) body.variant_id = parseInt(selectedVariant);
      const res  = await fetch(`${API}/api/admin/stocks/upload`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      });
      const data = await res.json();
      setUploadResult(data);
      setRawText('');
      fetchStocks();
    } finally { setUploading(false); }
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEditForm({ email: s.email, password: s.password || '' });
  }

  async function handleEditSave(id) {
    if (!editForm.email) return alert('Email tidak boleh kosong.');
    setEditLoading(true);
    try {
      await fetch(`${API}/api/admin/stocks/${id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(editForm),
      });
      setEditingId(null);
      fetchStocks();
    } finally { setEditLoading(false); }
  }

  async function handleDelete(id, status) {
    if (!confirm(status === 'sold' ? 'Stok ini sudah terjual. Yakin hapus?' : 'Hapus stok ini?')) return;
    await fetch(`${API}/api/admin/stocks/${id}`, { method: 'DELETE', headers: authHeaders() });
    fetchStocks();
  }

  const available = stocks.filter(s => s.status === 'available').length;
  const sold      = stocks.filter(s => s.status === 'sold').length;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">🗄️ Stock Management</h1>

      <div className="bg-white rounded-2xl shadow p-6 mb-6">
        <h2 className="font-medium mb-4">Upload Stock</h2>

        <div className="mb-3">
          <label className="block text-sm text-gray-600 mb-1">Pilih Produk</label>
          <select className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs"
            value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
            <option value="">-- pilih produk --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {selectedProduct && (
          <div className="mb-3">
            <label className="block text-sm text-gray-600 mb-1">
              Pilih Varian <span className="text-gray-400">(opsional)</span>
            </label>
            {variants.length === 0 ? (
              <p className="text-sm text-gray-400">Tidak ada varian — stok diupload ke produk langsung.</p>
            ) : (
              <select className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs"
                value={selectedVariant} onChange={e => setSelectedVariant(e.target.value)}>
                <option value="">-- tanpa varian --</option>
                {variants.map(v => (
                  <option key={v.id} value={v.id}>{v.name} — Rp {Number(v.price).toLocaleString('id-ID')}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="mb-3">
          <label className="block text-sm text-gray-600 mb-1">
            Accounts <span className="text-gray-400">(one per line: email:password)</span>
          </label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 font-mono text-sm"
            rows={8}
            placeholder={"user1@gmail.com:pass123\nuser2@gmail.com:pass456"}
            value={rawText}
            onChange={e => setRawText(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            {rawText.split('\n').filter(l => l.includes(':')).length} valid entries detected
          </p>
        </div>

        <button onClick={handleUpload} disabled={uploading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition">
          {uploading ? 'Uploading...' : '⬆️ Upload Stock'}
        </button>

        {uploadResult && (
          <div className="mt-3 inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
            ✅ Berhasil upload <strong>{uploadResult.inserted}</strong> akun
          </div>
        )}
      </div>

      {selectedProduct && (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-medium">
              Stock {selectedVariant ? `— ${variants.find(v => v.id === parseInt(selectedVariant))?.name}` : '— Semua'}
            </h2>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-medium">✅ {available}</span>
              <span className="text-gray-500">🔴 {sold}</span>
              <span className="text-gray-400">Total: {stocks.length}</span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Password</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stocks.map((s, i) => (
                <tr key={s.id} className={`hover:bg-gray-50 ${editingId === s.id ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                  {editingId === s.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input className="border rounded px-2 py-1 text-xs font-mono w-full"
                          value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                      </td>
                      <td className="px-4 py-2">
                        <input className="border rounded px-2 py-1 text-xs font-mono w-full"
                          value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} />
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{new Date(s.created_at).toLocaleDateString('id-ID')}</td>
                      <td className="px-4 py-2 flex gap-2">
                        <button onClick={() => handleEditSave(s.id)} disabled={editLoading}
                          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
                          {editLoading ? '...' : 'Simpan'}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300">Batal</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-mono text-xs">{s.email}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-400">{s.password ? '••••••••' : '-'}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{new Date(s.created_at).toLocaleDateString('id-ID')}</td>
                      <td className="px-4 py-2 flex gap-2">
                        {s.status === 'available' && (
                          <button onClick={() => startEdit(s)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        )}
                        <button onClick={() => handleDelete(s.id, s.status)} className="text-xs text-red-500 hover:underline">Hapus</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {!stocks.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No stock.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}