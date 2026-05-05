'use client';
import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

const EMPTY_OPTION = { emoji: '', label: '' };

export default function VotesPage() {
  const [votes, setVotes]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [selected, setSelected] = useState(null); // detail panel vote id
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    is_multiple: false,
    ended_at: '',
  });
  const [options, setOptions] = useState([
    { ...EMPTY_OPTION },
    { ...EMPTY_OPTION },
  ]);

  const fetchVotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/votes`, { headers: authHeaders() });
      const data = await res.json();
      setVotes(Array.isArray(data) ? data : []);
    } catch {
      setVotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVotes(); }, [fetchVotes]);

  // ── helpers ────────────────────────────────────────────────────
  function resetForm() {
    setForm({ title: '', description: '', is_multiple: false, ended_at: '' });
    setOptions([{ ...EMPTY_OPTION }, { ...EMPTY_OPTION }]);
    setShowForm(false);
  }

  function addOption() {
    setOptions(prev => [...prev, { ...EMPTY_OPTION }]);
  }

  function removeOption(i) {
    setOptions(prev => prev.filter((_, idx) => idx !== i));
  }

  function setOption(i, field, value) {
    setOptions(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: value } : o));
  }

  async function handleCreate() {
    if (!form.title.trim()) return alert('Judul vote wajib diisi');
    const validOpts = options.filter(o => o.label.trim());
    if (validOpts.length < 2) return alert('Minimal 2 pilihan harus diisi');
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/votes`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...form, ended_at: form.ended_at || null, options: validOpts }),
      });
      const data = await res.json();
      if (!res.ok) return alert(`❌ ${data.error}`);
      resetForm();
      fetchVotes();
    } finally { setSaving(false); }
  }

  async function handleToggle(vote) {
    await fetch(`${API}/api/admin/votes/${vote.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        title: vote.title,
        description: vote.description,
        is_active: !vote.is_active,
        ended_at: vote.ended_at,
      }),
    });
    fetchVotes();
  }

  async function handleDelete(id) {
    if (!confirm('Hapus vote ini beserta semua responsnya?')) return;
    await fetch(`${API}/api/admin/votes/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (selected === id) setSelected(null);
    fetchVotes();
  }

  async function handleReset(id) {
    if (!confirm('Reset semua suara pada vote ini? Data tidak bisa dikembalikan.')) return;
    await fetch(`${API}/api/admin/votes/${id}/responses`, { method: 'DELETE', headers: authHeaders() });
    fetchVotes();
  }

  function isEnded(vote) {
    return vote.ended_at && new Date(vote.ended_at) < new Date();
  }

  function totalVotes(vote) {
    return (vote.options || []).reduce((s, o) => s + parseInt(o.vote_count || 0), 0);
  }

  function pct(count, total) {
    if (!total) return 0;
    return Math.round((parseInt(count || 0) / total) * 100);
  }

  const selectedVote = votes.find(v => v.id === selected);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl md:text-2xl font-semibold">🗳️ Vote & Polling</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchVotes}
            disabled={loading}
            className="border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-600 text-sm px-3 py-2 rounded-lg transition flex items-center gap-1"
            title="Refresh data"
          >
            <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition flex items-center gap-1"
          >
            {showForm ? '✕ Tutup' : '+ Buat Vote'}
          </button>
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-6">Buat polling & lihat hasil suara secara real-time.</p>

      {/* ── Create Form ─────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow p-4 md:p-6 mb-6 border border-blue-100">
          <h2 className="font-semibold text-base mb-4">📝 Buat Vote Baru</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Judul Vote *</label>
              <input
                className="border rounded-lg px-3 py-2.5 text-sm w-full"
                placeholder="Contoh: Produk favorit kamu?"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Deskripsi (opsional)</label>
              <textarea
                className="border rounded-lg px-3 py-2.5 text-sm w-full resize-none"
                rows={2}
                placeholder="Keterangan tambahan..."
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Batas Waktu (opsional)</label>
                <input
                  type="datetime-local"
                  className="border rounded-lg px-3 py-2.5 text-sm w-full"
                  value={form.ended_at}
                  onChange={e => setForm({ ...form, ended_at: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="is_multiple"
                  checked={form.is_multiple}
                  onChange={e => setForm({ ...form, is_multiple: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                <label htmlFor="is_multiple" className="text-sm text-gray-700">Boleh pilih lebih dari 1</label>
              </div>
            </div>

            {/* Options */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">Pilihan Jawaban *</label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      className="border rounded-lg px-2 py-2 text-base w-14 text-center"
                      placeholder="😊"
                      value={opt.emoji}
                      maxLength={4}
                      onChange={e => setOption(i, 'emoji', e.target.value)}
                    />
                    <input
                      className="border rounded-lg px-3 py-2 text-sm flex-1"
                      placeholder={`Pilihan ${i + 1}`}
                      value={opt.label}
                      onChange={e => setOption(i, 'label', e.target.value)}
                    />
                    {options.length > 2 && (
                      <button
                        onClick={() => removeOption(i)}
                        className="text-red-400 hover:text-red-600 text-lg px-1"
                        title="Hapus pilihan"
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={addOption}
                className="mt-2 text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
              >
                + Tambah pilihan
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2.5 rounded-lg transition"
            >
              {saving ? 'Menyimpan...' : '🗳️ Buat Vote'}
            </button>
            <button
              onClick={resetForm}
              className="bg-gray-100 hover:bg-gray-200 text-sm px-4 py-2.5 rounded-lg transition"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* ── Main Content: list + detail ────────────────────────── */}
      <div className={`${selectedVote ? 'grid md:grid-cols-2 gap-4' : ''}`}>

        {/* ── Vote List ───────────────────────────────────────── */}
        <div className="space-y-3">
          {loading && (
            <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-400">
              ⏳ Memuat...
            </div>
          )}
          {!loading && votes.length === 0 && (
            <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-400">
              Belum ada vote. Klik <strong>+ Buat Vote</strong> untuk memulai.
            </div>
          )}

          {votes.map(vote => {
            const total = totalVotes(vote);
            const ended = isEnded(vote);
            const isOpen = selected === vote.id;

            return (
              <div
                key={vote.id}
                className={`bg-white rounded-2xl shadow p-4 border-2 transition cursor-pointer ${
                  isOpen ? 'border-blue-500' : 'border-transparent hover:border-gray-200'
                }`}
                onClick={() => setSelected(isOpen ? null : vote.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        ended
                          ? 'bg-gray-100 text-gray-500'
                          : vote.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-600'
                      }`}>
                        {ended ? '🔒 Berakhir' : vote.is_active ? '🟢 Aktif' : '⏸ Nonaktif'}
                      </span>
                      {vote.is_multiple && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-600 font-medium">
                          Multi-pilih
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-800 mt-1 truncate">{vote.title}</p>
                    {vote.description && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{vote.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {total} suara · {(vote.options || []).length} pilihan
                      {vote.ended_at && ` · Berakhir ${new Date(vote.ended_at).toLocaleDateString('id-ID')}`}
                    </p>
                  </div>
                  <span className="text-gray-300 text-xl select-none mt-1">{isOpen ? '▲' : '▼'}</span>
                </div>

                {/* Mini bar preview */}
                {!isOpen && (vote.options || []).slice(0, 3).map(opt => {
                  const p = pct(opt.vote_count, total);
                  return (
                    <div key={opt.id} className="mt-2">
                      <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                        <span>{opt.emoji} {opt.label}</span>
                        <span>{opt.vote_count} ({p}%)</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-400 rounded-full transition-all duration-500"
                          style={{ width: `${p}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ── Detail Panel ────────────────────────────────────── */}
        {selectedVote && (
          <div className="bg-white rounded-2xl shadow p-4 md:p-5 self-start sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-base text-gray-800 flex-1 min-w-0 truncate">
                🗳️ Hasil: {selectedVote.title}
              </h2>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-300 hover:text-gray-600 text-xl ml-2"
              >×</button>
            </div>

            {selectedVote.description && (
              <p className="text-sm text-gray-500 mb-3">{selectedVote.description}</p>
            )}

            {/* Stats row */}
            <div className="flex gap-3 mb-4 flex-wrap">
              <div className="flex-1 min-w-[80px] bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{totalVotes(selectedVote)}</p>
                <p className="text-xs text-blue-400">Total Suara</p>
              </div>
              <div className="flex-1 min-w-[80px] bg-purple-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-purple-600">{(selectedVote.options || []).length}</p>
                <p className="text-xs text-purple-400">Pilihan</p>
              </div>
              <div className="flex-1 min-w-[80px] bg-green-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{parseInt(selectedVote.total_voters || 0)}</p>
                <p className="text-xs text-green-400">Voter</p>
              </div>
            </div>

            {/* Results bars */}
            {(() => {
              const total  = totalVotes(selectedVote);
              const sorted = [...(selectedVote.options || [])].sort(
                (a, b) => parseInt(b.vote_count || 0) - parseInt(a.vote_count || 0)
              );
              const maxCount = sorted[0] ? parseInt(sorted[0].vote_count || 0) : 0;

              return (
                <div className="space-y-3 mb-4">
                  {sorted.map((opt, rank) => {
                    const count = parseInt(opt.vote_count || 0);
                    const p     = pct(count, total);
                    const isWinner = rank === 0 && count > 0;

                    return (
                      <div key={opt.id}>
                        <div className="flex justify-between items-center text-sm mb-1">
                          <span className="font-medium text-gray-700 flex items-center gap-1">
                            {isWinner && <span className="text-yellow-500 text-base">🏆</span>}
                            {opt.emoji && <span>{opt.emoji}</span>}
                            <span>{opt.label}</span>
                          </span>
                          <span className="text-gray-500 font-semibold tabular-nums">
                            {count} <span className="text-gray-400 text-xs">({p}%)</span>
                          </span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              isWinner ? 'bg-gradient-to-r from-yellow-400 to-orange-400' : 'bg-gradient-to-r from-blue-400 to-blue-500'
                            }`}
                            style={{ width: total ? `${p}%` : '0%' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {!sorted.length && (
                    <p className="text-sm text-gray-400 text-center py-4">Belum ada pilihan.</p>
                  )}
                </div>
              );
            })()}

            {/* Vote info */}
            <div className="text-xs text-gray-400 space-y-0.5 mb-4 border-t pt-3">
              <p>📅 Dibuat: {new Date(selectedVote.created_at).toLocaleString('id-ID')}</p>
              {selectedVote.ended_at && (
                <p>⏰ Berakhir: {new Date(selectedVote.ended_at).toLocaleString('id-ID')}</p>
              )}
              <p>{selectedVote.is_multiple ? '✅ Multi-pilih diaktifkan' : '☑️ Satu pilihan per user'}</p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={e => { e.stopPropagation(); handleToggle(selectedVote); }}
                className={`flex-1 text-sm py-2 rounded-lg border transition ${
                  selectedVote.is_active
                    ? 'border-orange-200 text-orange-600 hover:bg-orange-50'
                    : 'border-green-200 text-green-600 hover:bg-green-50'
                }`}
              >
                {selectedVote.is_active ? '⏸ Nonaktifkan' : '▶️ Aktifkan'}
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleReset(selectedVote.id); }}
                className="flex-1 text-sm py-2 rounded-lg border border-yellow-200 text-yellow-600 hover:bg-yellow-50 transition"
              >
                🔄 Reset Suara
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(selectedVote.id); }}
                className="flex-1 text-sm py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition"
              >
                🗑️ Hapus
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
