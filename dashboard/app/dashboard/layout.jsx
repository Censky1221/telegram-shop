'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// ── Desktop sidebar: all items ──────────────────────────────────────────────
const sidebarItems = [
  { href: '/dashboard/statistik', label: '📊 Statistik' },
  { href: '/dashboard/products',  label: '📦 Products' },
  { href: '/dashboard/variants',  label: '🎛️ Varian' },
  { href: '/dashboard/stocks',    label: '🗄️ Stocks' },
  { href: '/dashboard/orders',    label: '📋 Orders' },
  { href: '/dashboard/users',     label: '👤 Users & Saldo' },
  { href: '/dashboard/vouchers',  label: '🎟️ Voucher' },
  { href: '/dashboard/votes',     label: '🗳️ Vote' },
  { href: '/dashboard/referral',  label: '💎 Referral' },
  { href: '/dashboard/broadcast', label: '📢 Broadcast' },
  { href: '/dashboard/settings',  label: '⚙️ Settings' },
];

// ── Mobile bottom bar: 4 primary tabs ──────────────────────────────────────
const primaryNav = [
  { href: '/dashboard/statistik', label: 'Statistik', icon: '📊' },
  { href: '/dashboard/products',  label: 'Products',  icon: '📦' },
  { href: '/dashboard/variants',  label: 'Varian',    icon: '🎛️' },
  { href: '/dashboard/stocks',    label: 'Stocks',    icon: '🗄️' },
];

// ── Mobile "Lainnya" sheet items ────────────────────────────────────────────
const moreNav = [
  { href: '/dashboard/orders',    label: '📋 Orders' },
  { href: '/dashboard/users',     label: '👤 Users & Saldo' },
  { href: '/dashboard/vouchers',  label: '🎟️ Voucher' },
  { href: '/dashboard/votes',     label: '🗳️ Vote' },
  { href: '/dashboard/referral',  label: '💎 Referral' },
  { href: '/dashboard/broadcast', label: '📢 Broadcast' },
  { href: '/dashboard/settings',  label: '⚙️ Settings' },
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) router.push('/login');
  }, []);

  // Close sheet whenever route changes
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  function handleLogout() {
    localStorage.removeItem('token');
    router.push('/login');
  }

  // Is any "more" item active?
  const moreActive = moreNav.some((item) => pathname.startsWith(item.href));

  return (
    <div className="flex h-[100dvh] md:min-h-screen">

      {/* ── Desktop Sidebar (unchanged) ──────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 bg-gray-900 text-white sticky top-0 h-screen">
        <div className="px-6 py-5 border-b border-gray-700">
          <h1 className="font-semibold text-lg">🛍 Shop Admin</h1>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {sidebarItems.map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition ${
                pathname.startsWith(item.href)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
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

      {/* ── Main content area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">

        {/* Mobile header — clean, no hamburger */}
        <header className="md:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
          <span className="font-bold text-gray-800 text-base">🛍 Shop Admin</span>
          {/* Avatar placeholder */}
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold select-none">
            A
          </div>
        </header>

        {/* Page content — pb-20 on mobile so content clears the bottom bar */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-gray-50 pb-24 md:pb-0">
          <div className="max-w-5xl mx-auto p-4 md:p-6">{children}</div>
        </main>
      </div>

      {/* ── Mobile Bottom Navigation Bar ─────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
        <div className="flex items-stretch h-16">

          {/* Primary tabs */}
          {primaryNav.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className="relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors select-none"
              >
                <span className={`text-xl leading-none transition-transform duration-150 ${isActive ? 'scale-110' : ''}`}>
                  {item.icon}
                </span>
                <span className={`text-[10px] font-medium leading-tight ${
                  isActive ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  {item.label}
                </span>
                {/* Active indicator dot */}
                {isActive && (
                  <span className="absolute bottom-0 w-6 h-0.5 rounded-full bg-blue-600" />
                )}
              </Link>
            );
          })}

          {/* "Lainnya" tab */}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors select-none"
          >
            <span className={`text-xl leading-none transition-transform duration-150 ${moreOpen || moreActive ? 'scale-110' : ''}`}>
              ⋯
            </span>
            <span className={`text-[10px] font-medium leading-tight ${
              moreOpen || moreActive ? 'text-blue-600' : 'text-gray-400'
            }`}>
              Lainnya
            </span>
            {moreActive && !moreOpen && (
              <span className="absolute bottom-0 w-6 h-0.5 rounded-full bg-blue-600" />
            )}
          </button>
        </div>
      </nav>

      {/* ── "Lainnya" slide-up sheet ──────────────────────────────────── */}
      {/* Backdrop */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* Sheet */}
      <div className={`
        md:hidden fixed bottom-0 left-0 right-0 z-50
        bg-white rounded-t-2xl shadow-2xl
        transform transition-transform duration-300 ease-out
        ${moreOpen ? 'translate-y-0' : 'translate-y-full'}
      `}>
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="px-2 pb-4 pt-2 space-y-1">
          {moreNav.map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                pathname.startsWith(item.href)
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}>
              {item.label}
            </Link>
          ))}

          <hr className="my-2 border-gray-100" />

          {/* Logout inside sheet */}
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition">
            🚪 Logout
          </button>
        </div>

        {/* Bottom safe-area spacer (for phones with home indicator) */}
        <div className="h-4" />
      </div>

    </div>
  );
}