'use client';
import { useEffect, useState } from 'react';

export default function PollPage() {
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchPolls() {
    try {
      const res = await fetch('/api/poll'); // ⚠️ endpoint backend
      const data = await res.json();

      console.log("POLL DATA:", data);

      setPolls(data);
    } catch (err) {
      console.error("FETCH ERROR:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPolls();
  }, []);

  if (loading) return <div>Loading polling...</div>;

  if (!polls.length) {
    return <div>Tidak ada polling.</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>📊 Polling Dashboard</h1>

      {polls.map((poll) => (
        <div key={poll.id} style={{
          border: '1px solid #ccc',
          padding: 15,
          marginBottom: 15,
          borderRadius: 8
        }}>
          <h3>{poll.question}</h3>

          {poll.options.map((opt, i) => (
            <div key={i}>
              • {opt}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}