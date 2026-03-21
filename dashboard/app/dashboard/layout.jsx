'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const navItems = [
  { href: '/dashboard/products',  label: '📦 Products' },
  { href: '/dashboard/variants',  label: '🎛️ Varian' },
  { href: '/dashboard/stocks',    label: '🗄️ Stocks' },
  { href: '/dashboard/orders',    label: '📋 Orders' },
  { href: '/dashboard/users',     label: '👤 Users & Saldo' },
  { href: '/dashboard/broadcast', label: '📢 Broadcast' },
  { href: '/dashboard/settings',  label: '⚙️ Settings' },
];

export default function DashboardLayout({ children }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) router.push('/login');
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  function handleLogout() {
    localStorage.removeItem('token');
    router.push('/login');
  }

  return (
    <div className="flex min-h-screen">
      {open && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setOpen(false)} />
      )}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-gray-900 text-white flex flex-col z-30
        transform transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:w-56 md:translate-x-0
      `}>
        <div className="px-6 py-5 border-b border-gray-700 flex items-center justify-between">
          <h1 className="font-semibold text-lg">🛍 Shop Admin</h1>
          <button onClick={() => setOpen(false)} className="md:hidden text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition ${
                pathname.startsWith(item.href) ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
              }`}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-700">
          <button onClick={handleLogout}
            className="w-full text-left text-gray-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-gray-700 transition">
            🚪 Logout
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setOpen(true)} className="text-gray-700 hover:text-gray-900 p-1 rounded-lg hover:bg-gray-100 transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-gray-800">🛍 Shop Admin</span>
        </header>
        <main className="flex-1 bg-gray-50 overflow-auto">
          <div className="max-w-5xl mx-auto p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}