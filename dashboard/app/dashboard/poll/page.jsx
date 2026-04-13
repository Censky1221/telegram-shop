'use client';

import { useEffect, useState } from 'react';

export default function PollPage() {
  const [polls, setPolls] = useState([]);
  const [results, setResults] = useState({});
  const tenantId = 1; // 🔥 ganti sesuai tenant login

  // ========================
  // FETCH POLL LIST
  // ========================
  const fetchPolls = async () => {
    try {
      const res = await fetch(`/api/poll?tenant_id=${tenantId}`);
      const data = await res.json();
      setPolls(data);
    } catch (err) {
      console.error(err);
    }
  };

  // ========================
  // FETCH RESULT
  // ========================
  const fetchResult = async (pollId) => {
    try {
      const res = await fetch(`/api/poll/${pollId}/result?tenant_id=${tenantId}`);
      const data = await res.json();

      setResults(prev => ({
        ...prev,
        [pollId]: data
      }));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPolls();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>📊 Polling Dashboard</h1>

      {polls.map((poll) => {
        const pollResults = results[poll.id] || [];

        const getCount = (i) => {
          const r = pollResults.find(x => x.option_index === i);
          return r ? parseInt(r.total) : 0;
        };

        const totalVotes = pollResults.reduce((a, b) => a + parseInt(b.total), 0);

        return (
          <div
            key={poll.id}
            style={{
              border: '1px solid #333',
              borderRadius: 10,
              padding: 15,
              marginBottom: 20,
              background: '#111',
              color: '#fff'
            }}
          >
            <h3 style={{ marginBottom: 10 }}>{poll.question}</h3>

            <button
              onClick={() => fetchResult(poll.id)}
              style={{
                marginBottom: 10,
                padding: '6px 10px',
                cursor: 'pointer'
              }}
            >
              🔄 Load Result
            </button>

            {poll.options.map((opt, i) => {
              const count = getCount(i);
              const percent = totalVotes
                ? ((count / totalVotes) * 100).toFixed(1)
                : 0;

              return (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ marginBottom: 4 }}>
                    {opt} — {count} vote ({percent}%)
                  </div>

                  <div
                    style={{
                      background: '#333',
                      borderRadius: 6,
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        width: `${percent}%`,
                        background: '#4caf50',
                        padding: 5,
                        fontSize: 12
                      }}
                    >
                      {percent}%
                    </div>
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: 10, fontSize: 12 }}>
              Total Vote: {totalVotes}
            </div>
          </div>
        );
      })}
    </div>
  );
}