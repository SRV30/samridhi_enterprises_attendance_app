import { useEffect, useMemo, useState } from 'react';
import { Activity, LogOut, MapPin, Plus, RefreshCw, ShieldCheck, Store, Users } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('adminToken') || '');
  const [user, setUser] = useState(() => JSON.parse(sessionStorage.getItem('adminUser') || 'null'));
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [shops, setShops] = useState([]);
  const [visits, setVisits] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', employeeId: '', email: '', password: '', role: 'employee', managerId: '' });
  const [shopForm, setShopForm] = useState({ name: '', shopCode: '', address: '', area: '', latitude: '', longitude: '' });

  const stats = useMemo(() => ({
    employees: users.filter(x => x.role === 'employee' && x.active).length,
    managers: users.filter(x => x.role === 'manager' && x.active).length,
    shops: shops.length,
    visits: visits.length
  }), [users, shops, visits]);

  async function loadData(activeToken = token) {
    const [u, s, v] = await Promise.all([
      request('/api/users', { token: activeToken }),
      request('/api/shops', { token: activeToken }),
      request('/api/visits/team/today', { token: activeToken })
    ]);
    setUsers(u.users || []);
    setShops(s.shops || []);
    setVisits(v.visits || []);
  }

  useEffect(() => {
    if (token && user?.role === 'admin') {
      loadData().catch(e => { setError(e.message); if (/permission|token|auth/i.test(e.message)) logout(); });
    }
  }, [token]);

  async function login(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await request('/api/auth/login', { method: 'POST', body: { employeeId, password } });
      if (result.user.role !== 'admin') throw new Error('This panel is for administrator accounts only.');
      sessionStorage.setItem('adminToken', result.token);
      sessionStorage.setItem('adminUser', JSON.stringify(result.user));
      setToken(result.token); setUser(result.user); setPassword('');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function logout() {
    sessionStorage.removeItem('adminToken'); sessionStorage.removeItem('adminUser');
    setToken(''); setUser(null); setUsers([]); setShops([]); setVisits([]);
  }

  async function createUser(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const payload = { ...userForm, managerId: userForm.managerId || null };
      if (!payload.email) delete payload.email;
      if (!payload.managerId) delete payload.managerId;
      const result = await request('/api/users', { token, method: 'POST', body: payload });
      setMessage(`${result.user.role} account created: ${result.user.employeeId}`);
      setUserForm({ name: '', employeeId: '', email: '', password: '', role: 'employee', managerId: '' });
      await loadData();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function createShop(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const payload = { ...shopForm, latitude: Number(shopForm.latitude), longitude: Number(shopForm.longitude) };
      await request('/api/shops', { token, method: 'POST', body: payload });
      setMessage('Shop registered successfully.');
      setShopForm({ name: '', shopCode: '', address: '', area: '', latitude: '', longitude: '' });
      await loadData();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function toggleUser(account) {
    setBusy(true); setError(''); setMessage('');
    try {
      await request(`/api/users/${account._id || account.id}`, { token, method: 'PATCH', body: { active: !account.active } });
      setMessage(`${account.name} account ${account.active ? 'deactivated' : 'reactivated'}.`);
      await loadData();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!token || user?.role !== 'admin') return (
    <main className="login-shell">
      <form className="login-card" onSubmit={login}>
        <div className="brand-mark"><ShieldCheck size={25} /></div>
        <p className="eyebrow">SAMRIDHI ENTERPRISES</p>
        <h1>Sales Attendance</h1>
        <p className="muted">Administrator sign in</p>
        {error && <div className="alert error">{error}</div>}
        <label>Admin ID / Email<input value={employeeId} onChange={e => setEmployeeId(e.target.value)} autoComplete="username" required /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        <button className="primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="fine">Access is restricted to administrator accounts.</p>
      </form>
    </main>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><ShieldCheck size={22} /></div><div><strong>Samridhi</strong><small>Sales Attendance</small></div></div>
        <div className="side-label">WORKSPACE</div>
        {[
          ['overview', Activity, 'Overview'], ['users', Users, 'People'], ['shops', Store, 'Shops']
        ].map(([id, Icon, label]) => <button key={id} className={tab === id ? 'nav-item active' : 'nav-item'} onClick={() => setTab(id)}><Icon size={18}/>{label}</button>)}
        <div className="sidebar-bottom"><div className="profile"><span className="avatar">{user?.name?.slice(0,1) || 'A'}</span><div><strong>{user?.name}</strong><small>Administrator</small></div></div><button className="logout" onClick={logout}><LogOut size={17}/> Sign out</button></div>
      </aside>
      <main className="main">
        <header className="topbar"><div><p className="eyebrow">ADMINISTRATION</p><h1>{tab === 'overview' ? 'Overview' : tab === 'users' ? 'People' : 'Shop locations'}</h1></div><button className="secondary" onClick={() => loadData().catch(e => setError(e.message))}><RefreshCw size={16}/> Refresh</button></header>
        {error && <div className="alert error">{error}</div>}{message && <div className="alert success">{message}</div>}
        {tab === 'overview' && <>
          <section className="welcome"><div><p className="eyebrow light">ATTENDANCE OPERATIONS</p><h2>Good day, {user?.name?.split(' ')[0]}.</h2><p>Manage your field team, registered shops and today's verified visits.</p></div><Activity size={42} strokeWidth={1.4}/></section>
          <section className="stats-grid">
            <Stat icon={Users} label="Active employees" value={stats.employees}/><Stat icon={ShieldCheck} label="Active managers" value={stats.managers}/><Stat icon={Store} label="Registered shops" value={stats.shops}/><Stat icon={MapPin} label="Today's visits" value={stats.visits}/>
          </section>
          <section className="panel"><div className="panel-heading"><div><h3>Today's verified visits</h3><p>Visits recorded by the server for the current India date.</p></div><span className="pill">{visits.length} visits</span></div><VisitTable visits={visits}/></section>
        </>}
        {tab === 'users' && <div className="content-grid">
          <section className="panel"><div className="panel-heading"><div><h3>Create an account</h3><p>Add a manager or field employee.</p></div></div>
            <form className="form-grid" onSubmit={createUser}>
              <label>Full name<input required value={userForm.name} onChange={e=>setUserForm({...userForm,name:e.target.value})}/></label>
              <label>Employee ID<input required value={userForm.employeeId} onChange={e=>setUserForm({...userForm,employeeId:e.target.value})}/></label>
              <label>Email (optional)<input type="email" value={userForm.email} onChange={e=>setUserForm({...userForm,email:e.target.value})}/></label>
              <label>Temporary password<input type="password" required value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})}/></label>
              <label>Role<select value={userForm.role} onChange={e=>setUserForm({...userForm,role:e.target.value,managerId:''})}><option value="employee">Employee</option><option value="manager">Manager</option></select></label>
              {userForm.role === 'employee' && <label>Manager (optional)<select value={userForm.managerId} onChange={e=>setUserForm({...userForm,managerId:e.target.value})}><option value="">Unassigned</option>{users.filter(x=>x.role==='manager'&&x.active).map(m=><option key={m._id||m.id} value={m._id||m.id}>{m.name} ({m.employeeId})</option>)}</select></label>}
              <button className="primary" disabled={busy}><Plus size={16}/> Create account</button>
            </form>
          </section>
          <section className="panel"><div className="panel-heading"><div><h3>Team accounts</h3><p>Manage access for managers and employees.</p></div></div><UserTable users={users} onToggle={toggleUser} busy={busy}/></section>
        </div>}
        {tab === 'shops' && <div className="content-grid">
          <section className="panel"><div className="panel-heading"><div><h3>Register a shop</h3><p>Use trusted coordinates from the actual shop location.</p></div></div>
            <form className="form-grid" onSubmit={createShop}>
              <label>Shop name<input required value={shopForm.name} onChange={e=>setShopForm({...shopForm,name:e.target.value})}/></label>
              <label>Shop code<input required value={shopForm.shopCode} onChange={e=>setShopForm({...shopForm,shopCode:e.target.value})}/></label>
              <label>Address<input value={shopForm.address} onChange={e=>setShopForm({...shopForm,address:e.target.value})}/></label>
              <label>Area<input value={shopForm.area} onChange={e=>setShopForm({...shopForm,area:e.target.value})}/></label>
              <label>Latitude<input type="number" step="any" required value={shopForm.latitude} onChange={e=>setShopForm({...shopForm,latitude:e.target.value})}/></label>
              <label>Longitude<input type="number" step="any" required value={shopForm.longitude} onChange={e=>setShopForm({...shopForm,longitude:e.target.value})}/></label>
              <button className="primary" disabled={busy}><Plus size={16}/> Register shop</button>
            </form>
          </section>
          <section className="panel"><div className="panel-heading"><div><h3>Registered shops</h3><p>Active locations available for employee check-in.</p></div><span className="pill">{shops.length} shops</span></div>
            {shops.length ? <div className="table-wrap"><table><thead><tr><th>Shop</th><th>Code</th><th>Area</th><th>Coordinates</th></tr></thead><tbody>{shops.map(s=><tr key={s._id}><td><strong>{s.name}</strong><small>{s.address}</small></td><td>{s.shopCode}</td><td>{s.area || '—'}</td><td className="mono">{s.location?.latitude?.toFixed?.(5)}, {s.location?.longitude?.toFixed?.(5)}</td></tr>)}</tbody></table></div> : <Empty text="No shops registered yet."/>}
          </section>
        </div>}
      </main>
    </div>
  );
}

function Stat({icon: Icon,label,value}) { return <div className="stat-card"><div className="stat-icon"><Icon size={19}/></div><p>{label}</p><strong>{value}</strong></div>; }
function Empty({text}) { return <div className="empty">{text}</div>; }
function UserTable({users,onToggle,busy}) {
  const rows=users.filter(u=>u.role!=='admin');
  if(!rows.length) return <Empty text="No manager or employee accounts yet."/>;
  return <div className="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Manager</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(u=><tr key={u._id||u.id}><td><strong>{u.name}</strong><small>{u.employeeId}</small></td><td>{u.role}</td><td>{u.manager?.name || '—'}</td><td><span className={u.active?'status active':'status inactive'}>{u.active?'Active':'Inactive'}</span></td><td><button className="text-button" disabled={busy} onClick={()=>onToggle(u)}>{u.active?'Deactivate':'Reactivate'}</button></td></tr>)}</tbody></table></div>;
}
function VisitTable({visits}) {
  if(!visits?.length) return <Empty text="No verified visits recorded today."/>;
  return <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Shop</th><th>Check-in</th><th>Distance</th></tr></thead><tbody>{visits.map(v=><tr key={v._id}><td><strong>{v.employee?.name || 'Employee'}</strong></td><td>{v.shop?.name || 'Shop'}</td><td>{v.checkedInAt ? new Date(v.checkedInAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'}</td><td>{Number.isFinite(v.distanceMeters)?`${Math.round(v.distanceMeters)} m`:'—'}</td></tr>)}</tbody></table></div>;
}