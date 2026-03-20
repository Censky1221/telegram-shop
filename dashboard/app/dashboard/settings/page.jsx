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
  const [terms, setTerms]               = useState('');
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  async function fetchSettings() {
    const res  = await fetch(`${API}/api/admin/settings`, { headers: authHeaders() });
    const data = await res.json();
    setBannerFileId(data.banner_file_id || '');
    setTerms(data.terms || '');
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API}/api/admin/settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ banner_file_id: bannerFileId, terms }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  }

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-semibold mb-1">⚙️ Settings</h1>
      <p className="text-gray-500 text-sm mb-6">Pengaturan tampilan dan teks bot kamu.</p>

      {/* Banner */}
      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="font-medium mb-1">🖼️ Banner Daftar Produk</h2>
        <p className="text-sm text-gray-500 mb-4">
          Gambar ini muncul saat user membuka daftar produk di bot.
        </p>
        <ol className="text-sm text-gray-600 mb-4 space-y-1 list-decimal list-inside bg-gray-50 rounded-lg p-4">
          <li>Kirim gambar banner ke bot kamu di Telegram</li>
          <li>Reply gambar itu lalu ketik <code className="bg-gray-200 px-1 rounded">/fileid</code></li>
          <li>Bot akan balas dengan File ID</li>
          <li>Copy dan paste di bawah</li>
        </ol>
        <label className="block text-sm font-medium text-gray-700 mb-1">File ID Banner</label>
        <input
          className="w-full border rounded-lg px-3 py-2.5 text-sm font-mono mb-2"
          placeholder="AgACAgIAAxkBAAI..."
          value={bannerFileId}
          onChange={e => setBannerFileId(e.target.value)}
        />
        {bannerFileId && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700 mb-2">
            <span>✅ Banner aktif</span>
            <button onClick={() => setBannerFileId('')} className="text-red-500 hover:underline text-xs">Hapus</button>
          </div>
        )}
      </div>

      {/* S&K */}
      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="font-medium mb-1">📋 Syarat & Ketentuan</h2>
        <p className="text-sm text-gray-500 mb-4">
          Teks ini akan dikirim ke user setelah berhasil membeli produk, di bawah detail akun.
        </p>
        <textarea
          className="w-full border rounded-lg px-3 py-2.5 text-sm"
          rows={8}
          placeholder={`Contoh:\n⚠️ Penting:\n• Ganti password setelah login pertama\n• Simpan pesan ini dengan aman\n• Kami tidak dapat mengirim ulang kredensial ini\n\nTerima kasih telah berbelanja! 🙏`}
          value={terms}
          onChange={e => setTerms(e.target.value)}
        />
        <p className="text-xs text-gray-400 mt-1">Gunakan • untuk poin, baris baru untuk paragraf baru.</p>
      </div>

      {/* Tombol Simpan */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-6 py-2.5 rounded-lg transition"
        >
          {saving ? 'Menyimpan...' : '💾 Simpan Semua'}
        </button>
        {saved && <span className="text-green-600 text-sm font-medium">✅ Berhasil disimpan!</span>}
      </div>
    </div>
  );
}