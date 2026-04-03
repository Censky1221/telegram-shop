'use client';

import { useEffect, useState } from 'react';

export default function MonitorPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API = process.env.NEXT_PUBLIC_API_URL;

  async function fetchData() {
    try {
      if (!API) throw new Error('API URL belum diset');

      const res = await fetch(`${API}/monitor/stocks`);
      const json = await res.json();

      setData(json);
      setError(null);
    } catch (e) {
      console.error(e);
      setError('Gagal ambil data monitoring');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-6">⏳ Loading monitoring...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-500">❌ {error}</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">📊 Stock Monitoring</h1>

      <div className="grid gap-4">
        {data.map((item) => {
          const isError = item.total > item.qty;
          const isLess = item.total < item.qty;

          return (
            <div
              key={item.order_id}
              className={`p-5 rounded-2xl shadow-md border cursor-pointer transition
              ${
                isError
                  ? 'bg-red-100 border-red-400'
                  : isLess
                  ? 'bg-yellow-100 border-yellow-400'
                  : 'bg-green-100 border-green-400'
              }
              hover:scale-[1.02]`}
              onClick={() => window.location.href = `/monitor/${item.order_id}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-lg font-semibold">
                    Order #{item.order_id}
                  </p>
                  <p className="text-sm text-gray-500">
                    Qty: {item.qty || '-'}
                  </p>
                </div>

                <div className="text-right">
                  <p
                    className={`text-xl font-bold ${
                      isError
                        ? 'text-red-600'
                        : isLess
                        ? 'text-yellow-600'
                        : 'text-green-600'
                    }`}
                  >
                    {item.total}
                  </p>
                  <p className="text-xs text-gray-400">Stock Used</p>
                </div>
              </div>

              {isError && (
                <p className="mt-2 text-sm text-red-600 font-medium">
                  ⚠️ Over stock (BUG / double process)
                </p>
              )}

              {isLess && (
                <p className="mt-2 text-sm text-yellow-600 font-medium">
                  ⏳ Belum terpenuhi
                </p>
              )}

              {!isError && !isLess && (
                <p className="mt-2 text-sm text-green-600 font-medium">
                  ✅ Aman
                </p>
              )}
            </div>
          );
        })}

        {!data.length && (
          <div className="text-center text-gray-400 py-10">
            Tidak ada data monitoring
          </div>
        )}
      </div>
    </div>
  );
}