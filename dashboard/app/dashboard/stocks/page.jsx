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
  const [bundleItems, setBundleItems]         = useState('');
  const [uploadMode, setUploadMode]           = useState('normal'); // 'normal' | 'bundle'
  const [stocks, setStocks]                   = useState([]);
  const [uploadResult, setUploadResult]       = useState(null);
  const [uploading, setUploading]             = useState(false);
  const [editingId, setEditingId]             = useState(null);
  const [editForm, setEditForm]               = useState({ email: '', password: '', content: '' });
  const [editLoading, setEditLoading]         = useState(false);
  const [refreshing, setRefreshing]           = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds]         = useState([]);
  const [bulkDeleting, setBulkDeleting]       = useState(false);

  useEffect(() => { fetchProducts(); }, []);

  useEffect(() => {
    setSelectedVariant('');
    setVariants([]);
    setStocks([]);
    setSelectedIds([]);
    if (selectedProduct) fetchVariants(selectedProduct);
  }, [selectedProduct]);

  useEffect(() => {
    setStocks([]);
    setSelectedIds([]);
    if (selectedProduct) fetchStocks();
  }, [selectedVariant]);

  async function fetchProducts() {
    const res = await fetch(`${API}/api/admin/products`, { headers: authHeaders() });
    setProducts(await res.json());
  }

  async function fetchVariants(productId) {
    const res = await fetch(`${API}/api/admin/variants?productId=${productId}`, { headers: authHeaders() });
    setVariants(await res.json());
  }

  async function fetchStocks() {
    if (!selectedProduct) return;
    const qs  = selectedVariant ? `?variantId=${selectedVariant}` : '';
    const res = await fetch(`${API}/api/admin/stocks/${selectedProduct}${qs}`, { headers: authHeaders() });
    setStocks(await res.json());
  }

  async function handleRefresh() {
    setRefreshing(true);
    setSelectedIds([]);
    try {
      await fetchStocks();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleUpload() {
    if (!selectedProduct) return alert('Pilih produk dulu.');

    let stockItems = [];

    if (uploadMode === 'bundle') {
      // Setiap blok dipisah baris kosong = 1 row stok
      const blocks = bundleItems.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
      if (!blocks.length) return alert('Isi konten bundle terlebih dahulu.');
      stockItems = blocks.map(block => ({ content: block, email: null, password: null }));
    } else {
      // Normal: email:password per baris
      const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.includes(':'));
      if (!lines.length) return alert('Format: email:password');
      stockItems = lines.map(line => {
        const idx = line.indexOf(':');
        return { email: line.substring(0, idx).trim(), password: line.substring(idx + 1).trim() };
      });
    }

    setUploading(true);
    setUploadResult(null);
    try {
      const body = { product_id: parseInt(selectedProduct), stocks: stockItems };
      if (selectedVariant) body.variant_id = parseInt(selectedVariant);
      const res  = await fetch(`${API}/api/admin/stocks/upload`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      });
      const data = await res.json();
      setUploadResult(data);
      setRawText('');
      setBundleItems('');
      fetchStocks();
    } finally { setUploading(false); }
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEditForm({
      email:    s.email    || '',
      password: s.password || '',
      content:  s.content  || '',
    });
  }

  async function handleEditSave(id) {
    const isBundle = !!editForm.content;
    if (!isBundle && !editForm.email) return alert('Email tidak boleh kosong.');
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
    setSelectedIds(prev => prev.filter(sid => sid !== id));
    fetchStocks();
  }

  // Multi-select handlers
  function toggleSelectOne(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === stocks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(stocks.map(s => s.id));
    }
  }

  async function handleBulkDelete() {
    const soldCount = stocks.filter(s => selectedIds.includes(s.id) && s.status === 'sold').length;
    const msg = soldCount > 0
      ? `Hapus ${selectedIds.length} stok? (${soldCount} di antaranya sudah terjual)`
      : `Hapus ${selectedIds.length} stok yang dipilih?`;
    if (!confirm(msg)) return;

    setBulkDeleting(true);
    try {
      await Promise.all(
        selectedIds.map(id =>
          fetch(`${API}/api/admin/stocks/${id}`, { method: 'DELETE', headers: authHeaders() })
        )
      );
      setSelectedIds([]);
      fetchStocks();
    } finally {
      setBulkDeleting(false);
    }
  }

  const available   = stocks.filter(s => s.status === 'available').length;
  const sold        = stocks.filter(s => s.status === 'sold').length;
  const allSelected = stocks.length > 0 && selectedIds.length === stocks.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < stocks.length;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">🗄️ Stock Management</h1>

      <div className="bg-white rounded-2xl shadow p-6 mb-6">
        <h2 className="font-medium mb-4">Upload Stock</h2>

        {/* Pilih Produk */}
        <div className="mb-3">
          <label className="block text-sm text-gray-600 mb-1">Pilih Produk</label>
          <select className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs"
            value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
            <option value="">-- pilih produk --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Pilih Varian */}
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

        {/* Toggle mode Normal / Bundle */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setUploadMode('normal')}
            className={`text-sm px-4 py-1.5 rounded-lg border transition ${
              uploadMode === 'normal'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
            }`}>
            📧 Normal (email:password)
          </button>
          <button
            onClick={() => setUploadMode('bundle')}
            className={`text-sm px-4 py-1.5 rounded-lg border transition ${
              uploadMode === 'bundle'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
            }`}>
            📦 Bundle (teks bebas)
          </button>
        </div>

        {/* Input area */}
        {uploadMode === 'normal' ? (
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
        ) : (
          <div className="mb-3">
            <label className="block text-sm text-gray-600 mb-1">
              Bundle Content{' '}
              <span className="text-gray-400">
                — pisahkan tiap bundle dengan <strong>baris kosong</strong>. Tiap blok = 1 item stok.
              </span>
            </label>
            <textarea
              className="w-full border border-purple-200 rounded-lg px-3 py-2 font-mono text-sm focus:ring-purple-300"
              rows={12}
              placeholder={
                `akun1@gmail.com:pass1\nakun2@gmail.com:pass2\nakun3@gmail.com:pass3\n\nakun4@gmail.com:pass4\nakun5@gmail.com:pass5\nakun6@gmail.com:pass6`
              }
              value={bundleItems}
              onChange={e => setBundleItems(e.target.value)}
            />
            <p className="text-xs text-purple-500 mt-1">
              📦 {bundleItems.split(/\n\s*\n/).filter(b => b.trim()).length} bundle siap diupload
            </p>
          </div>
        )}

        <button onClick={handleUpload} disabled={uploading}
          className={`disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition ${
            uploadMode === 'bundle'
              ? 'bg-purple-600 hover:bg-purple-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}>
          {uploading ? 'Uploading...' : '⬆️ Upload Stock'}
        </button>

        {uploadResult && (
          <div className="mt-3 inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
            ✅ Berhasil upload <strong>{uploadResult.inserted}</strong> {uploadMode === 'bundle' ? 'bundle' : 'akun'}
          </div>
        )}
      </div>

      {/* Tabel stok */}
      {selectedProduct && (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-3">
            <h2 className="font-medium">
              Stock {selectedVariant
                ? `— ${variants.find(v => v.id === parseInt(selectedVariant))?.name}`
                : '— Semua'}
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Bulk delete bar */}
              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                  <span className="text-sm text-red-600 font-medium">
                    {selectedIds.length} dipilih
                  </span>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 disabled:opacity-50 transition flex items-center gap-1"
                  >
                    {bulkDeleting ? (
                      <>
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Menghapus...
                      </>
                    ) : '🗑️ Hapus Massal'}
                  </button>
                  <button
                    onClick={() => setSelectedIds([])}
                    className="text-xs text-gray-500 hover:text-gray-700 px-1"
                    title="Batalkan pilihan"
                  >✕</button>
                </div>
              )}

              {/* Stats */}
              <div className="flex gap-3 text-sm">
                <span className="text-green-600 font-medium">✅ {available}</span>
                <span className="text-gray-500">🔴 {sold}</span>
                <span className="text-gray-400">Total: {stocks.length}</span>
              </div>

              {/* Refresh button */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh data stok"
                className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 transition"
              >
                <svg
                  className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {refreshing ? 'Memuat...' : 'Refresh'}
              </button>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 w-10">
                  {/* Select all checkbox */}
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    title={allSelected ? 'Batalkan semua' : 'Pilih semua'}
                  />
                </th>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Konten / Email</th>
                <th className="px-4 py-3">Password</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stocks.map((s, i) => (
                <tr
                  key={s.id}
                  className={`hover:bg-gray-50 transition-colors ${
                    editingId === s.id ? 'bg-blue-50' :
                    selectedIds.includes(s.id) ? 'bg-red-50' : ''
                  }`}
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggleSelectOne(s.id)}
                    />
                  </td>
                  <td className="px-4 py-2 text-gray-400">{i + 1}</td>

                  {editingId === s.id ? (
                    <>
                      <td className="px-4 py-2" colSpan={editForm.content ? 2 : 1}>
                        {editForm.content ? (
                          <textarea
                            className="border rounded px-2 py-1 text-xs font-mono w-full"
                            rows={4}
                            value={editForm.content}
                            onChange={e => setEditForm({ ...editForm, content: e.target.value })}
                          />
                        ) : (
                          <input className="border rounded px-2 py-1 text-xs font-mono w-full"
                            value={editForm.email}
                            onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                        )}
                      </td>
                      {!editForm.content && (
                        <td className="px-4 py-2">
                          <input className="border rounded px-2 py-1 text-xs font-mono w-full"
                            value={editForm.password}
                            onChange={e => setEditForm({ ...editForm, password: e.target.value })} />
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">
                        {new Date(s.created_at).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-4 py-2 flex gap-2">
                        <button onClick={() => handleEditSave(s.id)} disabled={editLoading}
                          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
                          {editLoading ? '...' : 'Simpan'}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300">
                          Batal
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-mono text-xs max-w-xs">
                        {s.content ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded">
                              bundle
                            </span>
                            <span className="text-gray-400 truncate">
                              {s.content.split('\n')[0].substring(0, 30)}...
                            </span>
                          </span>
                        ) : s.email}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-400">
                        {s.content ? '—' : (s.password ? '••••••••' : '-')}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">
                        {new Date(s.created_at).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-4 py-2 flex gap-2">
                        {s.status === 'available' && (
                          <button onClick={() => startEdit(s)}
                            className="text-xs text-blue-600 hover:underline">Edit</button>
                        )}
                        <button onClick={() => handleDelete(s.id, s.status)}
                          className="text-xs text-red-500 hover:underline">Hapus</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {!stocks.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No stock.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}