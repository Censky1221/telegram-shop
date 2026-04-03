'use client';

import { useEffect, useState } from 'react';

export default function MonitorPage() {
  const [data, setData] = useState([]);

  async function fetchData() {
    try {
      const res = await fetch('http://localhost:3001/monitor/stocks');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">📊 Stock Monitoring</h1>

      <div className="grid gap-4">
        {data.map((item) => {
          const isError = item.total > item.qty;

          return (
            <div
              key={item.order_id}
              className={`p-5 rounded-2xl shadow-md border cursor-pointer transition
              ${isError ? 'bg-red-100 border-red-400' : 'bg-white border-gray-200'}
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
                  <p className={`text-xl font-bold ${isError ? 'text-red-600' : 'text-green-600'}`}>
                    {item.total}
                  </p>
                  <p className="text-xs text-gray-400">Stock</p>
                </div>
              </div>

              {isError && (
                <p className="mt-2 text-sm text-red-600 font-medium">
                  ⚠️ Over stock detected
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}