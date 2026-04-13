'use client';
import { useEffect, useState } from 'react';

export default function PollPage() {
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  const [results, setResults] = useState({});

  // 🔹 ambil tenant id (sesuaikan kalau beda)
  const tenantId = localStorage.getItem('tenant_id');

  async function fetchPolls() {
    try {
      const res = await fetch('/api/poll', {
        headers: {
          'x-tenant-id': tenantId
        }
      });

      const data = await res.json();
      setPolls(data);
    } catch (err) {
      console.error('FETCH POLL ERROR:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPolls();
  }, []);

  function addOption() {
    setOptions([...options, '']);
  }

  function updateOption(index, value) {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  }

  async function createPoll() {
    if (!question || options.some(o => !o)) {
      return alert('Isi semua field!');
    }

    try {
      await fetch('/api/poll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({
          question,
          options
        })
      });

      alert('Polling berhasil dibuat!');

      setQuestion('');
      setOptions(['', '']);

      fetchPolls();
    } catch (err) {
      console.error('CREATE POLL ERROR:', err);
    }
  }

  async function fetchResult(pollId) {
    try {
      const res = await fetch(`/api/poll/${pollId}/result`);
      const data = await res.json();

      setResults(prev => ({
        ...prev,
        [pollId]: data
      }));
    } catch (err) {
      console.error('RESULT ERROR:', err);
    }
  }

  function getCount(pollId, index) {
    const data = results[pollId] || [];
    const found = data.find(r => r.option_index === index);
    return found ? parseInt(found.total) : 0;
  }

  function getTotalVotes(pollId) {
    const data = results[pollId] || [];
    return data.reduce((sum, r) => sum + parseInt(r.total), 0);
  }

  if (loading) return <div style={{ padding: 20 }}>Loading polling...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1>📊 Polling Dashboard</h1>

      {/* 🔥 CREATE POLL */}
      <div style={{
        border: '1px solid #ccc',
        padding: 15,
        marginBottom: 20,
        borderRadius: 10
      }}>
        <h3>Buat Polling</h3>

        <input
          placeholder="Pertanyaan..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          style={{ width: '100%', marginBottom: 10, padding: 8 }}
        />

        {options.map((opt, i) => (
          <input
            key={i}
            placeholder={`Opsi ${i + 1}`}
            value={opt}
            onChange={(e) => updateOption(i, e.target.value)}
            style={{ width: '100%', marginBottom: 5, padding: 8 }}
          />
        ))}

        <button onClick={addOption} style={{ marginRight: 10 }}>
          ➕ Tambah Opsi
        </button>

        <button onClick={createPoll}>
          🚀 Buat Polling
        </button>
      </div>

      {/* 🔥 LIST POLLING */}
      {polls.length === 0 ? (
        <div>Tidak ada polling.</div>
      ) : (
        polls.map((poll) => {
          const totalVotes = getTotalVotes(poll.id);

          return (
            <div key={poll.id} style={{
              border: '1px solid #ddd',
              padding: 15,
              marginBottom: 15,
              borderRadius: 10
            }}>
              <h3>{poll.question}</h3>

              <button
                onClick={() => fetchResult(poll.id)}
                style={{ marginBottom: 10 }}
              >
                📊 Load Result
              </button>

              {poll.options.map((opt, i) => {
                const count = getCount(poll.id, i);
                const percent = totalVotes
                  ? ((count / totalVotes) * 100).toFixed(1)
                  : 0;

                return (
                  <div key={i} style={{ marginBottom: 5 }}>
                    {opt} — {count} vote ({percent}%)
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}