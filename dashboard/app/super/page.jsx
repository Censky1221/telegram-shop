'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('super_token') : null;
}
function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

const emptyForm = {
  name: '', bot_token: '', plan: 'basic', expired_at: '',
  admin_email: '', admin_password: '',
  tripay_api_key: '', tripay_private_key: '', tripay_merchant_code: '', tripay_mode: 'sandbox',
  pakasir_api_key: '', pakasir_project_slug: '', payment_gateway: 'tripay',
};

export default function SuperDashboard() {
  const router = useRouter();
  const [tenants, setTenants]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editTenant, setEditTenant] = useState(null);
  const [form, setForm]             = useState(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [showTripay, setShowTripay] = useState(false);
  const [showPakasir, setShowPakasir] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.push('/super/login'); return; }
    fetchTenants();
  }, []);

  async function fetchTenants() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/tenant`, { headers: authHeaders() });
      if (res.status === 401) { router.push('/super/login'); return; }
      setTenants(await res.json());
    } catch { setError('Gagal memuat data'); }
    finally { setLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    setSaving(true);
    try {
      const url    = editTenant ? `${API}/tenant/${editTenant.id}` : `${API}/tenant`;
      const method = editTenant ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(form) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan');
      const tenantId = editTenant ? editTenant.id : data.id;

      if (!editTenant && form.admin_email && form.admin_password) {
        const adminRes = await fetch(`${API}/admin/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.admin_email, password: form.admin_password, tenant_id: tenantId }),
        });
        const adminData = await adminRes.json();
        if (!adminRes.ok) throw new Error(adminData.error || 'Gagal buat akun admin');
      }

      setSuccess(editTenant ? 'Tenant diupdate!' : `Tenant & admin berhasil dibuat! Email: ${form.admin_email}`);
      setShowForm(false); setEditTenant(null); setForm(emptyForm);
      setShowTripay(false); setShowPakasir(false);
      fetchTenants();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleSuspend(id) {
    if (!confirm('Suspend tenant? Bot akan berhenti.')) return;
    await fetch(`${API}/tenant/${id}/suspend`, { method: 'POST', headers: authHeaders() });
    fetchTenants();
  }
  async function handleActivate(id) {
    await fetch(`${API}/tenant/${id}/activate`, { method: 'POST', headers: authHeaders() });
    fetchTenants();
  }
  async function handleDelete(id) {
    if (!confirm('Hapus tenant? Data akan terhapus permanen!')) return;
    await fetch(`${API}/tenant/${id}`, { method: 'DELETE', headers: authHeaders() });
    fetchTenants();
  }

  function openEdit(tenant) {
    setEditTenant(tenant);
    setForm({
      name: tenant.name, bot_token: tenant.bot_token, plan: tenant.plan,
      expired_at: tenant.expired_at ? tenant.expired_at.split('T')[0] : '',
      admin_email: '', admin_password: '',
      tripay_api_key: '', tripay_private_key: '',
      tripay_merchant_code: tenant.tripay_merchant_code || '',
      tripay_mode: tenant.tripay_mode || 'sandbox',
      pakasir_api_key: '',
      pakasir_project_slug: tenant.pakasir_project_slug || '',
      payment_gateway: tenant.payment_gateway || 'tripay',
    });
    setShowForm(true); setShowTripay(false); setShowPakasir(false);
    setError(''); setSuccess('');
  }

  function handleLogout() { localStorage.removeItem('super_token'); router.push('/super/login'); }
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.status==='active').length,
    suspended: tenants.filter(t => t.status==='suspended').length,
    totalUsers: tenants.reduce((a,t)=>a+parseInt(t.total_users||0),0),
    totalOrders: tenants.reduce((a,t)=>a+parseInt(t.total_orders||0),0)
  };

  const getGatewayBadge = (t) => {
    if (t.payment_gateway === 'pakasir' && t.pakasir_project_slug)
      return <span className="pakasir-badge">💚 Pakasir</span>;
    if (t.tripay_merchant_code)
      return <span className="tripay-badge">💳 Tripay</span>;
    return <span className="no-tripay">⚠️ No Payment</span>;
  };

  return (
    <div style={{minHeight:'100vh',background:'#0a0a0f',color:'#e0e0e0',fontFamily:"'DM Mono',monospace"}}>
      <style suppressHydrationWarning>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box}
        .topbar{background:#111118;border-bottom:1px solid #1e1e2e;padding:16px 32px;display:flex;align-items:center;justify-content:space-between}
        .logo{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:#fff;display:flex;align-items:center;gap:10px}
        .sp-badge{background:#ff3c3c22;border:1px solid #ff3c3c55;color:#ff6b6b;font-size:10px;letter-spacing:2px;padding:3px 8px;border-radius:4px}
        .content{padding:32px;max-width:1200px;margin:0 auto}
        .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:32px}
        .stat-card{background:#111118;border:1px solid #1e1e2e;border-radius:12px;padding:20px}
        .stat-num{font-family:'Syne',sans-serif;font-size:32px;font-weight:800;color:#fff}
        .stat-label{color:#555;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-top:4px}
        .sec-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
        .sec-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#fff}
        .btn{padding:10px 20px;border-radius:8px;border:none;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;transition:all 0.2s}
        .btn-primary{background:#ff3c3c;color:#fff}.btn-primary:hover{opacity:.85;transform:translateY(-1px)}
        .btn-sm{padding:6px 12px;font-size:11px;border-radius:6px}
        .btn-ghost{background:#1e1e2e;color:#aaa;border:1px solid #2a2a3e}.btn-ghost:hover{background:#252535;color:#fff}
        .btn-danger{background:#ff3c3c22;color:#ff6b6b;border:1px solid #ff3c3c44}.btn-danger:hover{background:#ff3c3c33}
        .btn-success{background:#22c55e22;color:#4ade80;border:1px solid #22c55e44}.btn-success:hover{background:#22c55e33}
        .btn-info{background:#3b82f622;color:#60a5fa;border:1px solid #3b82f644}.btn-info:hover{background:#3b82f633}
        .tcard{background:#111118;border:1px solid #1e1e2e;border-radius:12px;padding:20px 24px;margin-bottom:12px;display:flex;align-items:center;gap:16px}
        .tinfo{flex:1}
        .tname{font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#fff;margin-bottom:4px}
        .ttoken{color:#444;font-size:11px;margin-bottom:8px}
        .tmeta{display:flex;gap:16px;flex-wrap:wrap}
        .mi{color:#555;font-size:11px}.mi span{color:#aaa}
        .sbadge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px}
        .s-active{background:#22c55e22;color:#4ade80;border:1px solid #22c55e44}
        .s-suspended{background:#ff3c3c22;color:#ff6b6b;border:1px solid #ff3c3c44}
        .tactions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .overlay{position:fixed;inset:0;background:#000000cc;display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:20px;overflow-y:auto}
        .modal{background:#111118;border:1px solid #222230;border-radius:16px;padding:32px;width:100%;max-width:520px;margin:auto}
        .mtitle{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:#fff;margin-bottom:6px}
        .msub{color:#555;font-size:12px;margin-bottom:24px}
        .divider{border:none;border-top:1px solid #1e1e2e;margin:20px 0}
        .slabel{color:#ff6b6b;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;font-family:'Syne',sans-serif}
        .slabel-blue{color:#60a5fa;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;font-family:'Syne',sans-serif}
        .slabel-green{color:#4ade80;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;font-family:'Syne',sans-serif}
        .field{margin-bottom:14px}
        label{display:block;color:#666;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
        input,select{width:100%;background:#0d0d14;border:1px solid #222230;border-radius:8px;padding:10px 14px;color:#fff;font-family:'DM Mono',monospace;font-size:13px;outline:none}
        input:focus,select:focus{border-color:#ff3c3c66}
        select option{background:#111118}
        .hint{color:#444;font-size:11px;margin-top:4px}
        .alert{padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px}
        .alert-error{background:#ff3c3c15;border:1px solid #ff3c3c44;color:#ff6b6b}
        .alert-success{background:#22c55e15;border:1px solid #22c55e44;color:#4ade80}
        .empty{text-align:center;padding:60px;color:#333}
        .logout-btn{background:none;border:1px solid #2a2a3e;color:#555;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:'DM Mono',monospace;font-size:12px;transition:all 0.2s}
        .logout-btn:hover{color:#ff6b6b;border-color:#ff3c3c44}
        .form-row{display:flex;gap:10px;margin-top:8px}
        .form-row .btn{flex:1}
        .toggle-btn{background:#1e1e2e;border:1px solid #2a2a3e;color:#60a5fa;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:12px;width:100%;text-align:left;margin-bottom:16px;font-family:'DM Mono',monospace}
        .toggle-btn-green{background:#1e1e2e;border:1px solid #2a2a3e;color:#4ade80;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:12px;width:100%;text-align:left;margin-bottom:16px;font-family:'DM Mono',monospace}
        .tripay-badge{display:inline-block;background:#22c55e22;border:1px solid #22c55e44;color:#4ade80;font-size:10px;padding:2px 8px;border-radius:4px;margin-left:8px}
        .pakasir-badge{display:inline-block;background:#3b82f622;border:1px solid #3b82f644;color:#60a5fa;font-size:10px;padding:2px 8px;border-radius:4px;margin-left:8px}
        .no-tripay{display:inline-block;background:#ff3c3c22;border:1px solid #ff3c3c44;color:#ff6b6b;font-size:10px;padding:2px 8px;border-radius:4px;margin-left:8px}
        .gw-tabs{display:flex;gap:8px;margin-bottom:16px}
        .gw-tab{flex:1;padding:10px;border-radius:8px;border:1px solid #2a2a3e;background:#0d0d14;color:#666;cursor:pointer;font-size:12px;text-align:center;font-family:'DM Mono',monospace;transition:all 0.2s}
        .gw-tab.active-tripay{border-color:#60a5fa66;background:#3b82f611;color:#60a5fa}
        .gw-tab.active-pakasir{border-color:#4ade8066;background:#22c55e11;color:#4ade80}
      `}</style>

      <div className="topbar">
        <div className="logo">⚡ SuperPanel <span className="sp-badge">SUPER ADMIN</span></div>
        <button className="logout-btn" onClick={handleLogout}>Logout →</button>
      </div>

      <div className="content">
        <div className="stats">
          <div className="stat-card"><div className="stat-num">{stats.total}</div><div className="stat-label">Total Tenant</div></div>
          <div className="stat-card"><div className="stat-num" style={{color:'#4ade80'}}>{stats.active}</div><div className="stat-label">Aktif</div></div>
          <div className="stat-card"><div className="stat-num" style={{color:'#ff6b6b'}}>{stats.suspended}</div><div className="stat-label">Suspended</div></div>
          <div className="stat-card"><div className="stat-num" style={{color:'#60a5fa'}}>{stats.totalUsers}</div><div className="stat-label">Total Users</div></div>
          <div className="stat-card"><div className="stat-num" style={{color:'#f59e0b'}}>{stats.totalOrders}</div><div className="stat-label">Total Orders</div></div>
        </div>

        {error   && <div className="alert alert-error">⚠️ {error}</div>}
        {success && <div className="alert alert-success">✅ {success}</div>}

        <div className="sec-header">
          <div className="sec-title">🏪 Daftar Tenant</div>
          <button className="btn btn-primary" onClick={() => {
            setShowForm(true); setEditTenant(null); setForm(emptyForm);
            setShowTripay(false); setShowPakasir(false); setError(''); setSuccess('');
          }}>+ Tambah Tenant</button>
        </div>

        {loading ? <div className="empty">⏳ Memuat...</div> : tenants.length === 0 ? <div className="empty">🏪 Belum ada tenant.</div> : tenants.map(t => (
          <div key={t.id} className="tcard">
            <div className="tinfo">
              <div className="tname">
                {t.name}{' '}
                <span className={`sbadge ${t.status==='active'?'s-active':'s-suspended'}`}>{t.status}</span>{' '}
                <span style={{fontSize:'11px',color:t.plan==='pro'?'#f59e0b':t.plan==='enterprise'?'#a855f7':'#94a3b8'}}>[{t.plan}]</span>
                {getGatewayBadge(t)}
              </div>
              <div className="ttoken">🤖 {t.bot_token.substring(0,25)}•••</div>
              <div className="tmeta">
                <div className="mi">👥 <span>{t.total_users||0}</span></div>
                <div className="mi">📦 <span>{t.total_orders||0}</span></div>
                <div className="mi">🛍 <span>{t.total_products||0}</span></div>
                {t.expired_at && <div className="mi">⏰ <span>{new Date(t.expired_at).toLocaleDateString('id-ID')}</span></div>}
                {t.payment_gateway==='pakasir' && t.pakasir_project_slug && <div className="mi">💚 Pakasir: <span>{t.pakasir_project_slug}</span></div>}
                {t.payment_gateway!=='pakasir' && t.tripay_merchant_code && <div className="mi">💳 Tripay: <span>{t.tripay_merchant_code}</span> [{t.tripay_mode}]</div>}
              </div>
            </div>
            <div className="tactions">
              <button className="btn btn-sm btn-ghost" onClick={() => openEdit(t)}>Edit</button>
              {t.status==='active'
                ? <button className="btn btn-sm btn-danger" onClick={() => handleSuspend(t.id)}>Suspend</button>
                : <button className="btn btn-sm btn-success" onClick={() => handleActivate(t.id)}>Aktifkan</button>}
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>Hapus</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="overlay" onClick={e => e.target===e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="mtitle">{editTenant ? '✏️ Edit Tenant' : '➕ Tambah Tenant Baru'}</div>
            <div className="msub">{editTenant ? 'Update info tenant' : 'Buat toko baru beserta akun admin & konfigurasi payment'}</div>
            {error && <div className="alert alert-error">⚠️ {error}</div>}

            <form onSubmit={handleSubmit}>
              {/* Info Toko */}
              <div className="slabel">🏪 Info Toko</div>
              <div className="field"><label>Nama Toko</label><input type="text" required placeholder="Toko Digital Mamat" value={form.name} onChange={e=>f('name',e.target.value)} /></div>
              <div className="field"><label>Bot Token Telegram</label><input type="text" required placeholder="1234567890:AAFxxxxxxxx" value={form.bot_token} onChange={e=>f('bot_token',e.target.value)} /><div className="hint">Dari @BotFather di Telegram</div></div>
              <div className="field"><label>Plan</label><select value={form.plan} onChange={e=>f('plan',e.target.value)}><option value="basic">Basic</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></div>
              <div className="field"><label>Expired (opsional)</label><input type="date" value={form.expired_at} onChange={e=>f('expired_at',e.target.value)} /></div>

              {/* Akun Admin - hanya saat tambah baru */}
              {!editTenant && (<>
                <hr className="divider" />
                <div className="slabel">👤 Akun Admin Penyewa</div>
                <div className="field"><label>Email Admin</label><input type="email" required placeholder="admin@tokopenyewa.com" value={form.admin_email} onChange={e=>f('admin_email',e.target.value)} /><div className="hint">Email untuk login ke dashboard</div></div>
                <div className="field"><label>Password Admin</label><input type="text" required placeholder="Min. 6 karakter" value={form.admin_password} onChange={e=>f('admin_password',e.target.value)} /><div className="hint">Berikan ke penyewa</div></div>
              </>)}

              {/* Payment Gateway */}
              <hr className="divider" />
              <div className="slabel">💳 Payment Gateway</div>
              <div className="field">
                <label>Pilih Gateway</label>
                <div className="gw-tabs">
                  <button type="button"
                    className={`gw-tab ${form.payment_gateway==='tripay' ? 'active-tripay' : ''}`}
                    onClick={() => f('payment_gateway', 'tripay')}>
                    💳 Tripay
                  </button>
                  <button type="button"
                    className={`gw-tab ${form.payment_gateway==='pakasir' ? 'active-pakasir' : ''}`}
                    onClick={() => f('payment_gateway', 'pakasir')}>
                    💚 Pakasir
                  </button>
                </div>
              </div>

              {/* Tripay Config */}
              {form.payment_gateway === 'tripay' && (<>
                <button type="button" className="toggle-btn" onClick={() => setShowTripay(!showTripay)}>
                  💳 Konfigurasi Tripay {showTripay ? '▲' : '▼'}
                  {(form.tripay_merchant_code || editTenant?.tripay_merchant_code) && <span className="tripay-badge">Configured</span>}
                </button>
                {showTripay && (<>
                  <div className="slabel-blue">💳 Tripay Payment Gateway</div>
                  <div className="field"><label>API Key</label><input type="text" placeholder={editTenant?.tripay_api_key_preview || 'DEV-xxxx atau PROD-xxxx'} value={form.tripay_api_key} onChange={e=>f('tripay_api_key',e.target.value)} /><div className="hint">{editTenant ? 'Kosongkan jika tidak ingin mengubah' : 'Dari dashboard Tripay'}</div></div>
                  <div className="field"><label>Private Key</label><input type="text" placeholder={editTenant?.tripay_private_key_preview || 'xxxx-xxxx-xxxx'} value={form.tripay_private_key} onChange={e=>f('tripay_private_key',e.target.value)} /></div>
                  <div className="field"><label>Merchant Code</label><input type="text" placeholder="T12345" value={form.tripay_merchant_code} onChange={e=>f('tripay_merchant_code',e.target.value)} /></div>
                  <div className="field"><label>Mode</label><select value={form.tripay_mode} onChange={e=>f('tripay_mode',e.target.value)}><option value="sandbox">Sandbox (Testing)</option><option value="production">Production</option></select></div>
                </>)}
              </>)}

              {/* Pakasir Config */}
              {form.payment_gateway === 'pakasir' && (<>
                <button type="button" className="toggle-btn-green" onClick={() => setShowPakasir(!showPakasir)}>
                  💚 Konfigurasi Pakasir {showPakasir ? '▲' : '▼'}
                  {(form.pakasir_project_slug || editTenant?.pakasir_project_slug) && <span className="tripay-badge">Configured</span>}
                </button>
                {showPakasir && (<>
                  <div className="slabel-green">💚 Pakasir Payment Gateway</div>
                  <div className="field">
                    <label>API Key</label>
                    <input type="text" placeholder={editTenant ? 'Kosongkan jika tidak ingin mengubah' : 'API Key dari dashboard Pakasir'} value={form.pakasir_api_key} onChange={e=>f('pakasir_api_key',e.target.value)} />
                    <div className="hint">{editTenant ? 'Kosongkan jika tidak ingin mengubah' : 'Dari halaman Integrasi di dashboard Pakasir'}</div>
                  </div>
                  <div className="field">
                    <label>Project Slug</label>
                    <input type="text" placeholder="nama-toko (dari URL Pakasir)" value={form.pakasir_project_slug} onChange={e=>f('pakasir_project_slug',e.target.value)} />
                    <div className="hint">Contoh: censky-store (lihat di halaman Integrasi Pakasir)</div>
                  </div>
                  <div className="field">
                    <label>Webhook URL (isi di dashboard Pakasir)</label>
                    <input type="text" readOnly value={`${process.env.NEXT_PUBLIC_API_URL?.replace('/api','')}/api/webhook/pakasir`} style={{color:'#4ade80',cursor:'text'}} onClick={e=>e.target.select()} />
                    <div className="hint">Copy URL ini dan paste ke Webhook URL di dashboard Pakasir</div>
                  </div>
                </>)}
              </>)}

              <div className="form-row">
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan...' : (editTenant ? 'Update' : '+ Tambahkan')}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}