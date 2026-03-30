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
  const [bannerFileId,     setBannerFileId]     = useState('');
  const [helpText,         setHelpText]         = useState('');
  const [adminTelegramId,  setAdminTelegramId]  = useState('');
  const [saving,           setSaving]           = useState(false);
  const [saved,            setSaved]            = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  async function fetchSettings() {
    const res  = await fetch(`${API}/api/admin/settings`, { headers: authHeaders() });
    const data = await res.json();
    setBannerFileId(data.banner_file_id || '');
    setHelpText(data.help_text || '');
    setAdminTelegramId(data.admin_telegram_id || '');
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API}/api/admin/settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          banner_file_id   : bannerFileId,
          help_text        : helpText,
          admin_telegram_id: adminTelegramId,
        }),
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
        <p className="text-sm text-gray-500 mb-4">Gambar ini muncul saat user membuka daftar produk di bot.</p>
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

      {/* Notif Admin */}
      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="font-medium mb-1">🔔 Notifikasi Order ke Admin</h2>
        <p className="text-sm text-gray-500 mb-4">
          Admin akan mendapat notif Telegram setiap ada order baru masuk atau terbayar.
        </p>
        <ol className="text-sm text-gray-600 mb-4 space-y-1 list-decimal list-inside bg-gray-50 rounded-lg p-4">
          <li>Buka bot kamu di Telegram</li>
          <li>Ketik <code className="bg-gray-200 px-1 rounded">/start</code></li>
          <li>Lihat pesan dari bot, cari teks <strong>ID:</strong></li>
          <li>Copy angka ID tersebut dan paste di bawah</li>
        </ol>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 mb-4">
          <p className="font-medium mb-2">📢 Mau kirim notif ke Channel Telegram?</p>
          <ol className="space-y-1 list-decimal list-inside text-blue-700">
            <li>Buat channel Telegram & tambahkan bot kamu sebagai <strong>Admin</strong></li>
            <li>Untuk channel <strong>public</strong>: isi dengan <code className="bg-blue-100 px-1 rounded">@namachannel</code></li>
            <li>Untuk channel <strong>private</strong>: forward pesan dari channel ke <code className="bg-blue-100 px-1 rounded">@userinfobot</code></li>
            <li>Bot akan balas dengan ID seperti <code className="bg-blue-100 px-1 rounded">-100xxxxxxxxxx</code></li>
            <li>Copy ID tersebut dan paste di field bawah</li>
          </ol>
        </div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Telegram ID Admin / Username channel</label>
        <input
          className="w-full border rounded-lg px-3 py-2.5 text-sm font-mono"
          placeholder="123456789 atau @namachannel"
          value={adminTelegramId}
          onChange={e => setAdminTelegramId(e.target.value)}
        />
        {adminTelegramId && (
          <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
            ✅ Notif aktif ke ID: <strong>{adminTelegramId}</strong>
          </div>
        )}
      </div>

      {/* Teks Bantuan */}
      <div className="bg-white rounded-2xl shadow p-6 mb-4">
        <h2 className="font-medium mb-1">📞 Teks Bantuan</h2>
        <p className="text-sm text-gray-500 mb-4">
          Teks ini ditampilkan saat user menekan tombol <strong>Bantuan</strong> di bot.
        </p>
        <textarea
          className="w-full border rounded-lg px-3 py-2.5 text-sm"
          rows={8}
          placeholder={`Contoh:\n📞 Bantuan & Support\n\nHubungi admin jika ada masalah.\n\n• Produk dikirim otomatis setelah pembayaran\n• Pembayaran via QRIS\n\n⚠️ Sertakan ID pesanan saat menghubungi admin.\n\n📱 Contact: @username`}
          value={helpText}
          onChange={e => setHelpText(e.target.value)}
        />
        <p className="text-xs text-gray-400 mt-1">Mendukung format Markdown Telegram: *bold*, _italic_, `code`</p>
      </div>

      {/* Simpan */}
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