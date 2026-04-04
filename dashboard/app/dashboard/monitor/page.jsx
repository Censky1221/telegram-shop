'use client';

import { useEffect, useState } from 'react';

export default function MonitorPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    try {
      const API = process.env.NEXT_PUBLIC_API_URL;

      const res = await fetch(`${API}/monitor/stocks`);
      const json = await res.json();

      setData(json);
    } catch (e) {
      console.error('FETCH ERROR:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">📊 Stock Monitoring</h1>

      {loading && (
        <p className="text-gray-500">Loading...</p>
      )}

      {!loading && data.length === 0 && (
        <p className="text-gray-500">Belum ada data monitoring.</p>
      )}

      <div className="grid gap-4">
        {data.map((item) => {
          const isError = item.total > item.qty;

          return (
            <div
              key={item.order_id}
              className={`p-5 rounded-xl border shadow-sm
              ${isError ? 'bg-red-100 border-red-400' : 'bg-white border-gray-200'}`}
            >
              <div className="flex justify-between">
                <div>
                  <p className="font-semibold">Order #{item.order_id}</p>
                  <p className="text-sm text-gray-500">
                    Qty: {item.qty}
                  </p>
                </div>

                <div className="text-right">
                  <p className={`text-xl font-bold ${isError ? 'text-red-600' : 'text-green-600'}`}>
                    {item.total}
                  </p>
                  <p className="text-xs">Stock</p>
                </div>
              </div>

              {isError && (
                <p className="mt-2 text-red-600 text-sm">
                  ⚠️ Over stock (bug terdeteksi)
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}