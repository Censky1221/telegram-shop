'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

export default function SettingsPage() {
  const [bannerFileId, setBannerFileId] = useState('');
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  async function fetchSettings() {
    const res  = await fetch(`${API}/api/admin/settings`, { headers: authHeaders() });
    const data = await res.json();
    setBannerFileId(data.banner_file_id || '');
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API}/api/admin/settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ banner_file_id: bannerFileId }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  }

  async function handleRemove() {
    if (!confirm('Hapus banner?')) return;
    setBannerFileId('');
    await fetch(`${API}/api/admin/settings`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ banner_file_id: '' }),
    });
  }

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-semibold mb-1">⚙️ Settings</h1>
      <p className="text-gray-500 text-sm mb-6">Pengaturan tampilan bot kamu.</p>

      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="font-medium mb-1">🖼️ Banner Daftar Produk</h2>
        <p className="text-sm text-gray-500 mb-4">
          Banner ini akan muncul setiap kali user membuka daftar produk di bot.<br />
          Cara mendapatkan File ID:
        </p>

        <ol className="text-sm text-gray-600 mb-4 space-y-1 list-decimal list-inside bg-gray-50 rounded-lg p-4">
          <li>Kirim gambar banner ke bot kamu di Telegram</li>
          <li>Ketik <code className="bg-gray-200 px-1 rounded">/fileid</code> setelah kirim gambar</li>
          <li>Bot akan membalas dengan File ID gambar tersebut</li>
          <li>Copy File ID dan paste di bawah</li>
        </ol>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File ID Banner</label>
            <input
              className="w-full border rounded-lg px-3 py-2.5 text-sm font-mono"
              placeholder="AgACAgIAAxkBAAI..."
              value={bannerFileId}
              onChange={e => setBannerFileId(e.target.value)}
            />
          </div>

          {bannerFileId && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
              ✅ Banner sudah diset. File ID: <code className="font-mono text-xs break-all">{bannerFileId}</code>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded-lg transition"
            >
              {saving ? 'Menyimpan...' : '💾 Simpan'}
            </button>
            {bannerFileId && (
              <button
                onClick={handleRemove}
                className="bg-red-50 hover:bg-red-100 text-red-600 text-sm px-5 py-2.5 rounded-lg transition border border-red-200"
              >
                🗑️ Hapus Banner
              </button>
            )}
          </div>

          {saved && (
            <div className="text-green-600 text-sm font-medium">✅ Berhasil disimpan!</div>
          )}
        </div>
      </div>
    </div>
  );
}