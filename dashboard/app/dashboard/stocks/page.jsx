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
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [rawText, setRawText] = useState('');
  const [stocks, setStocks] = useState([]);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { fetchProducts(); }, []);

  async function fetchProducts() {
    const res = await fetch(`${API}/api/admin/products`, { headers: authHeaders() });
    const data = await res.json();
    setProducts(data);
  }

  async function fetchStocks() {
    if (!selectedProduct) return;
    const res = await fetch(`${API}/api/admin/stocks/${selectedProduct}`, { headers: authHeaders() });
    setStocks(await res.json());
  }

  useEffect(() => { fetchStocks(); }, [selectedProduct]);

  async function handleUpload() {
    if (!selectedProduct) return alert('Select a product first.');
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.includes(':'));
    if (!lines.length) return alert('No valid lines found. Format: email:password');

    const stockItems = lines.map(line => {
      const idx = line.indexOf(':');
      return { email: line.substring(0, idx).trim(), password: line.substring(idx + 1).trim() };
    });

    setUploading(true);
    try {
      const res = await fetch(`${API}/api/admin/stocks/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ product_id: parseInt(selectedProduct), stocks: stockItems }),
      });
      const data = await res.json();
      setUploadResult(data);
      setRawText('');
      fetchStocks();
    } finally { setUploading(false); }
  }

  const available = stocks.filter(s => s.status === 'available').length;
  const sold      = stocks.filter(s => s.status === 'sold').length;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">🗄️ Stock Management</h1>

      <div className="bg-white rounded-2xl shadow p-6 mb-6">
        <h2 className="font-medium mb-4">Upload Stock</h2>

        <div className="mb-3">
          <label className="block text-sm text-gray-600 mb-1">Select Product</label>
          <select className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs"
            value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
            <option value="">-- choose product --</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="block text-sm text-gray-600 mb-1">
            Accounts <span className="text-gray-400">(one per line: email:password)</span>
          </label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 font-mono text-sm"
            rows={8}
            placeholder={"user1@gmail.com:pass123\nuser2@gmail.com:pass456\nuser3@yahoo.com:secret789"}
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
            ✅ Successfully uploaded <strong>{uploadResult.inserted}</strong> accounts
          </div>
        )}
      </div>

      {selectedProduct && (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-medium">Stock List</h2>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-medium">✅ Available: {available}</span>
              <span className="text-gray-500">🔴 Sold: {sold}</span>
              <span className="text-gray-400">Total: {stocks.length}</span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stocks.map((s, i) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.email}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {new Date(s.created_at).toLocaleDateString('id-ID')}
                  </td>
                </tr>
              ))}
              {!stocks.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No stock for this product.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}