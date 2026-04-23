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
  const [uploadMode, setUploadMode]           = useState('normal');
  const [stocks, setStocks]                   = useState([]);
  const [uploadResult, setUploadResult]       = useState(null);
  const [uploading, setUploading]             = useState(false);
  const [editingId, setEditingId]             = useState(null);
  const [editForm, setEditForm]               = useState({ email: '', password: '', content: '' });
  const [editLoading, setEditLoading]         = useState(false);

  // ✅ NEW
  const [selectedStocks, setSelectedStocks]   = useState([]);

  useEffect(() => { fetchProducts(); }, []);

  useEffect(() => {
    setSelectedVariant('');
    setVariants([]);
    setStocks([]);
    setSelectedStocks([]);
    if (selectedProduct) fetchVariants(selectedProduct);
  }, [selectedProduct]);

  useEffect(() => {
    setStocks([]);
    setSelectedStocks([]);
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

  // ✅ MULTI SELECT
  function toggleSelect(id) {
    setSelectedStocks(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  }

  function selectAll() {
    if (selectedStocks.length === stocks.length) {
      setSelectedStocks([]);
    } else {
      setSelectedStocks(stocks.map(s => s.id));
    }
  }

  async function handleDeleteMass() {
    if (selectedStocks.length === 0) return alert('Pilih stock dulu.');
    if (!confirm(`Hapus ${selectedStocks.length} stock?`)) return;

    await fetch(`${API}/api/admin/stocks/delete-mass`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ids: selectedStocks }),
    });

    setSelectedStocks([]);
    fetchStocks();
  }

  async function handleUpload() {
    if (!selectedProduct) return alert('Pilih produk dulu.');

    let stockItems = [];

    if (uploadMode === 'bundle') {
      const blocks = bundleItems.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
      if (!blocks.length) return alert('Isi konten bundle terlebih dahulu.');
      stockItems = blocks.map(block => ({ content: block, email: null, password: null }));
    } else {
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
    fetchStocks();
  }

  const available = stocks.filter(s => s.status === 'available').length;
  const sold      = stocks.filter(s => s.status === 'sold').length;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">🗄️ Stock Management</h1>

      {selectedProduct && (
        <div className="bg-white rounded-2xl shadow overflow-hidden">

          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-medium">
              Stock {selectedVariant
                ? `— ${variants.find(v => v.id === parseInt(selectedVariant))?.name}`
                : '— Semua'}
            </h2>

            <div className="flex items-center gap-3">

              {selectedStocks.length > 0 && (
                <button
                  onClick={handleDeleteMass}
                  className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700">
                  🗑 Hapus ({selectedStocks.length})
                </button>
              )}

              <button
                onClick={fetchStocks}
                className="text-xs bg-gray-200 px-3 py-1.5 rounded hover:bg-gray-300">
                🔄 Refresh
              </button>

              <div className="flex gap-4 text-sm">
                <span className="text-green-600 font-medium">✅ {available}</span>
                <span className="text-gray-500">🔴 {sold}</span>
                <span className="text-gray-400">Total: {stocks.length}</span>
              </div>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    onChange={selectAll}
                    checked={selectedStocks.length === stocks.length && stocks.length > 0}
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
                <tr key={s.id} className="hover:bg-gray-50">

                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selectedStocks.includes(s.id)}
                      onChange={() => toggleSelect(s.id)}
                    />
                  </td>

                  <td className="px-4 py-2 text-gray-400">{i + 1}</td>

                  <td className="px-4 py-2 font-mono text-xs">
                    {s.content ? 'bundle' : s.email}
                  </td>

                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {s.content ? '—' : '••••••••'}
                  </td>

                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      s.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {s.status}
                    </span>
                  </td>

                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {new Date(s.created_at).toLocaleDateString('id-ID')}
                  </td>

                  <td className="px-4 py-2 flex gap-2">
                    <button
                      onClick={() => handleDelete(s.id, s.status)}
                      className="text-xs text-red-500 hover:underline">
                      Hapus
                    </button>
                  </td>

                </tr>
              ))}

              {!stocks.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No stock.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

        </div>
      )}
    </div>
  );
}