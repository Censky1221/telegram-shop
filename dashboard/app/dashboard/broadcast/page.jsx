'use client';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

export default function BroadcastPage() {
  const [message, setMessage]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);

  async function handleBroadcast() {
    if (!message.trim()) return alert('Pesan tidak boleh kosong.');
    if (!confirm(`Kirim pesan broadcast ke semua user?`)) return;

    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch(`${API}/api/admin/broadcast`, {
        method : 'POST',
        headers: authHeaders(),
        body   : JSON.stringify({ message }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) setMessage('');
    } catch (err) {
      setResult({ success: false, error: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-semibold mb-1">📢 Broadcast</h1>
      <p className="text-gray-500 text-sm mb-4 md:mb-6">Kirim pesan ke semua user yang pernah berinteraksi dengan bot.</p>

      <div className="bg-white rounded-2xl shadow p-4 md:p-6 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Pesan</label>
        <textarea
          className="w-full border rounded-xl px-3 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={6}
          placeholder="Tulis pesan broadcast di sini...\n\nSupport Markdown Telegram:\n*bold* _italic_ `code`"
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
        <div className="flex items-center justify-between mt-1 mb-3">
          <p className="text-xs text-gray-400">Mendukung format Markdown Telegram: *bold*, _italic_, `code`</p>
          <p className="text-xs text-gray-400">{message.length} karakter</p>
        </div>

        <button
          onClick={handleBroadcast}
          disabled={loading || !message.trim()}
          className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition"
        >
          {loading ? '⏳ Mengirim...' : '📢 Kirim Broadcast'}
        </button>
      </div>

      {/* Hasil */}
      {result && (
        <div className={`rounded-2xl p-4 text-sm ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {result.success ? (
            <div>
              <p className="font-semibold text-green-700 mb-1">✅ Broadcast berhasil dikirim!</p>
              <p className="text-green-600">
                Terkirim: <strong>{result.sent}</strong> &nbsp;|&nbsp;
                Gagal: <strong>{result.failed}</strong> &nbsp;|&nbsp;
                Total: <strong>{result.total}</strong>
              </p>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-red-700 mb-1">❌ Gagal mengirim broadcast</p>
              <p className="text-red-600">{result.error || 'Terjadi kesalahan.'}</p>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-800">
        <p className="font-medium mb-1">⚠️ Perhatian</p>
        <ul className="list-disc list-inside space-y-1 text-yellow-700">
          <li>Pesan akan dikirim ke <strong>semua user</strong> yang terdaftar di bot ini.</li>
          <li>User yang memblokir bot akan otomatis dilewati.</li>
          <li>Jangan spam — kirim broadcast seperlunya saja.</li>
        </ul>
      </div>
    </div>
  );
}