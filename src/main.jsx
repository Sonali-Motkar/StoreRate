import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, mapStore, mapUser, roleLabel } from './api';
import './styles.css';
import './backend.css';

const Icon = ({ name, size = 18 }) => {
  const paths = { grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></>, store: <><path d="M3 10v10h18V10"/><path d="M2 10l2-7h16l2 7M2 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 4 0M9 20v-6h6v6"/></>, users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>, star: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z"/></>, chart: <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/></>, settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7-.2.1a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.9-.9l-1.7.7-1.4-2.4 1.4-1.2v-.2a8 8 0 0 1 0-2.1v-.2l-1.4-1.1 1.4-2.4 1.7.7.2-.1a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.9.9l1.7-.7 1.4 2.4-1.4 1.2v.2a8 8 0 0 1 0 2.1z"/></>, search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, arrow: <><path d="M7 17 17 7M7 7h10v10"/></>, plus: <><path d="M12 5v14M5 12h14"/></>, bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>, filter: <><path d="M4 7h16M7 12h10M10 17h4"/></>, chevron: <path d="m9 18 6-6-6-6"/>, down: <path d="m7 10 5 5 5-5"/>, logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></>, close: <><path d="m18 6-12 12M6 6l12 12"/></>, pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></> };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};
function Avatar({ user, small = false }) { return <span className={`avatar ${user.color || 'mint'} ${small ? 'small' : ''}`}>{user.initials || user.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</span>; }
function Stars({ value, interactive = false, onChange }) { return <span className="stars" aria-label={`${value} out of 5 stars`}>{[1,2,3,4,5].map(n => <button key={n} disabled={!interactive} onClick={() => onChange?.(n)} aria-label={`Rate ${n} stars`} className={n <= value ? 'filled' : ''}>★</button>)}</span>; }
function App() {
  const [role, setRole] = useState('Customer'); const [page, setPage] = useState('Discover stores'); const [signedIn, setSignedIn] = useState(false); const [authLoading, setAuthLoading] = useState(true); const [authUser, setAuthUser] = useState(null); const [stores, setStores] = useState([]); const [users, setUsers] = useState([]); const [metrics, setMetrics] = useState(null); const [ownerStores, setOwnerStores] = useState([]);
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('All roles'); const [sort, setSort] = useState({ key: 'name', dir: 'asc' }); const [modal, setModal] = useState(''); const [toast, setToast] = useState(''); const [ratingStore, setRatingStore] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false); const [accountOpen, setAccountOpen] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', address: '', password: '', role: 'customer' });
  const flash = message => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const acceptUser = user => {
    const userRole = roleLabel(user.role);
    setAuthUser(user);
    setRole(userRole);
    setPage(userRole === 'Customer' ? 'Discover stores' : 'Overview');
    setSignedIn(true);
    setQuery('');
  };
  useEffect(() => {
    let active = true;
    api('/auth/me').then(({ user }) => { if (active) acceptUser(user); }).catch(() => {}).finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!signedIn || !authUser) return;
    let active = true;
    const load = async () => {
      try {
        if (role === 'Store owner') {
          const result = await api('/owner/dashboard');
          if (active) { setOwnerStores(result.stores); setStores(result.stores.map(mapStore)); }
          return;
        }
        const storeResult = await api(`/stores?search=${encodeURIComponent(query)}&sortBy=${encodeURIComponent(sort.key)}&order=${sort.dir}`);
        if (active) setStores(storeResult.stores.map(mapStore));
        if (role === 'Admin') {
          const apiRole = { 'All roles': '', Admin: 'admin', Customer: 'customer', 'Store owner': 'store_owner' }[filter] || '';
          const [userResult, dashboard] = await Promise.all([
            api(`/admin/users?search=${encodeURIComponent(query)}&role=${encodeURIComponent(apiRole)}&sortBy=${sort.key}&order=${sort.dir}`),
            api('/admin/dashboard'),
          ]);
          if (active) { setUsers(userResult.users.map(mapUser)); setMetrics(dashboard); }
        }
      } catch (error) { if (active) flash(error.message); }
    };
    load();
    return () => { active = false; };
  }, [signedIn, authUser, role, query, filter, sort]);
  const nav = role === 'Admin' ? ['Overview', 'Stores', 'Users'] : role === 'Customer' ? ['Discover stores', 'My ratings'] : ['Overview', 'My store'];
  const currentPage = nav.includes(page) ? page : nav[0];
  const filteredStores = useMemo(() => stores.filter(s => `${s.name} ${s.address} ${s.email}`.toLowerCase().includes(query.toLowerCase())), [stores, query]);
  const filteredUsers = useMemo(() => users.filter(u => `${u.name} ${u.email} ${u.address} ${u.role}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All roles' || u.role === filter)).sort((a,b) => { const d = String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? '')); return sort.dir === 'asc' ? d : -d; }), [users, query, filter, sort]);
  const toggleSort = key => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const submitRating = async (id, value) => {
    try {
      await api(`/stores/${id}/rating`, { method: 'PUT', body: JSON.stringify({ rating: value }) });
      setStores(current => current.map(store => {
        if (store.id !== id) return store;
        const ratings = store.ratings + (store.myRating ? 0 : 1);
        return { ...store, myRating: value, ratings, rating: Number(((store.rating * store.ratings + value - (store.myRating || 0)) / Math.max(ratings, 1)).toFixed(1)) };
      }));
      setRatingStore(null);
      flash('Your rating has been saved');
    } catch (error) { flash(error.message); }
  };
  const addUser = async e => {
    e.preventDefault();
    try {
      const result = await api('/admin/users', { method: 'POST', body: JSON.stringify(userForm) });
      setUsers(current => [mapUser(result.user), ...current]);
      setUserForm({ name: '', email: '', address: '', password: '', role: 'customer' });
      setModal('');
      flash('User added successfully');
    } catch (error) { flash(error.message); }
  };
  const addStore = async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const result = await api('/admin/stores', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), address: form.get('address'), ownerEmail: form.get('ownerEmail') || '' }) });
      setStores(current => [mapStore(result.store), ...current]);
      setModal('');
      flash('Store added successfully');
    } catch (error) { flash(error.message); }
  };
  const updatePassword = async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get('newPassword') !== form.get('confirmPassword')) return flash('New passwords do not match.');
    try {
      await api('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') }) });
      setModal('');
      flash('Password updated successfully');
    } catch (error) { flash(error.message); }
  };
  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (error) { flash(error.message); }
    setAuthUser(null);
    setSignedIn(false);
  };
  if (authLoading) return <div className="auth-loading"><span className="loading-mark"/> Loading StoreRate…</div>;
  if (!signedIn) return <AuthScreen onLogin={acceptUser} />;
  const heading = currentPage === 'Overview' ? `Good morning, ${authUser?.name.split(' ')[0] || 'there'}` : currentPage === 'Stores' ? 'Stores' : currentPage === 'Users' ? 'Users' : currentPage === 'My store' ? 'Your store' : currentPage;
  const adminStats = [
    { title: 'Total users', value: metrics?.total_users?.toLocaleString('en-IN') ?? '—', icon: 'users', tone: 'violet' },
    { title: 'Total stores', value: metrics?.total_stores?.toLocaleString('en-IN') ?? '—', icon: 'store', tone: 'mint' },
    { title: 'Ratings submitted', value: metrics?.total_ratings?.toLocaleString('en-IN') ?? '—', icon: 'star', tone: 'peach' },
    { title: 'Avg. store rating', value: metrics?.average_rating?.toFixed(2) ?? '—', icon: 'chart', tone: 'blue' },
  ];
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" type="button" onClick={()=>{setPage(nav[0]);setQuery('');setWorkspaceOpen(false);setAccountOpen(false)}} aria-label="Go to StoreRate home"><span className="brand-mark"><span/><span/><span/><span/></span><span>storerate</span></button>
      <div className="workspace-label">WORKSPACE</div>
      <button className="workspace-picker" type="button" aria-expanded={workspaceOpen} onClick={()=>{setWorkspaceOpen(open=>!open);setAccountOpen(false)}}><span className="workspace-icon">S</span><span className="workspace-copy"><b>StoreRate Community</b><small>Community workspace</small></span><Icon name="down" size={15}/></button>
      {workspaceOpen&&<div className="workspace-popover"><span className="popover-kicker">CURRENT WORKSPACE</span><b>StoreRate Community</b><small>Shared space · {role}</small><button type="button" onClick={()=>{setWorkspaceOpen(false);setModal('profile')}}>View account details</button></div>}
      <div className="nav-label">MENU</div>
      <nav>{nav.map((item,i)=><button key={item} onClick={()=>{setPage(item);setQuery('')}} className={`nav-item ${currentPage===item?'active':''}`}><Icon name={item.includes('Store')||item.includes('discover')||item==='My store'?'store':item==='Users'? 'users':item==='My ratings'?'star':item==='Overview'?'grid':'chart'}/><span>{item}</span>{item==='Stores'&&<span className="nav-count">24</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">✦</div><b>Need a hand?</b><p>Our team is here to help you get the most out of StoreRate.</p><button onClick={()=>flash('Help center is coming soon')}>Visit help center <Icon name="arrow" size={14}/></button></div><button className="nav-item" onClick={()=>setModal('profile')}><Icon name="settings"/><span>Settings</span></button><button className="nav-item" onClick={logout}><Icon name="logout"/><span>Log out</span></button><button type="button" className="side-user" onClick={()=>setModal('profile')} aria-label="Open your account profile"><Avatar user={{name:authUser.name,initials:authUser.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase(),color:'lavender'}}/><span><b>{authUser.name}</b><small>{authUser.email}</small></span><Icon name="down" size={14}/></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={14}/><b>{currentPage}</b></div><div className="top-actions"><button type="button" className="role-badge" onClick={()=>setModal('profile')} aria-label="View account profile">{role}</button><button className="icon-btn" aria-label="Notifications" onClick={()=>flash('You’re all caught up')}><Icon name="bell"/></button><button type="button" className="top-avatar" aria-label="Open account menu" aria-expanded={accountOpen} onClick={()=>{setAccountOpen(open=>!open);setWorkspaceOpen(false)}}>{authUser.name.charAt(0).toUpperCase()}</button>{accountOpen&&<div className="account-popover"><b>{authUser.name}</b><small>{authUser.email}</small><button type="button" onClick={()=>{setAccountOpen(false);setModal('profile')}}>View profile</button><button type="button" onClick={()=>{setAccountOpen(false);setModal('password')}}>Update password</button><button type="button" onClick={()=>{setAccountOpen(false);logout()}}>Log out</button></div>}</div></header>
      <div className="content">
        <div className="page-title-row"><div><div className="eyebrow">{role==='Admin'?new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase():role==='Customer'?'YOUR NEIGHBORHOOD, DISCOVERED':'STORE OWNER PORTAL'}</div><h1>{heading}</h1><p className="subtitle">{currentPage==='Overview'?'Here’s what’s happening with your stores today.':currentPage==='Stores'?'Manage your stores and keep your directory up to date.':currentPage==='Users'?'Manage access and profiles across your workspace.':currentPage==='Discover stores'?'Find your next favorite spot around the neighborhood.':currentPage==='My ratings'?'All the places you’ve rated, in one place.':'A snapshot of your store’s performance.'}</p></div><div className="title-actions">{role==='Admin'&&currentPage==='Stores'&&<button className="button primary" onClick={()=>setModal('store')}><Icon name="plus" size={16}/> Add store</button>}{role==='Admin'&&currentPage==='Users'&&<button className="button primary" onClick={()=>setModal('user')}><Icon name="plus" size={16}/> Add user</button>}{role==='Customer'&&<button className="button secondary" onClick={()=>setModal('password')}>Update password</button>}</div></div>
        {role==='Admin'&&currentPage==='Overview'&&<>
          <div className="stats-grid">{adminStats.map(stat => <Stat key={stat.title} {...stat}/>)}</div>
          <div className="overview-grid"><RatingActivity daily={metrics?.daily_ratings || []}/>
          <section className="panel recent-panel"><div className="panel-head"><div><h2>Top rated stores</h2><p>Based on customer ratings</p></div><button className="text-link" onClick={()=>setPage('Stores')}>View all <Icon name="arrow" size={14}/></button></div><div className="top-store-list">{stores.slice(0,4).map(s=><div className="top-store" key={s.id}><div className={`store-avatar ${s.color}`}>{s.initials}</div><div className="top-store-copy"><b>{s.name}</b><span>{s.category}</span></div><div className="top-store-rating"><Stars value={Math.round(s.rating)}/><b>{s.rating}</b></div></div>)}</div><button className="full-link" onClick={()=>setPage('Stores')}>View all stores <Icon name="arrow" size={14}/></button></section></div>
          <section className="panel table-panel"><div className="panel-head table-head"><div><h2>Recently joined</h2><p>The newest members in your community</p></div><button className="text-link" onClick={()=>setPage('Users')}>View all users <Icon name="arrow" size={14}/></button></div><UserTable users={users.slice(0,4)} sort={sort} toggleSort={toggleSort} onView={setSelectedUser}/></section>
        </>}
        {role==='Admin'&&currentPage==='Stores'&&<section className="panel table-panel directory-panel"><div className="toolbar"><div className="searchbox"><Icon name="search"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search stores by name, email or address..."/></div><button className="button secondary" onClick={()=>setQuery('')}><Icon name="filter" size={16}/> Clear search</button></div><StoreTable stores={filteredStores} sort={sort} toggleSort={toggleSort}/><div className="pagination"><span>Showing <b>{filteredStores.length?1:0}–{filteredStores.length}</b> of <b>{stores.length}</b> stores</span><div><button disabled>← Previous</button><button disabled>Next →</button></div></div></section>}
        {role==='Admin'&&currentPage==='Users'&&<section className="panel table-panel directory-panel"><div className="toolbar"><div className="searchbox"><Icon name="search"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by name, email or address..."/></div><select className="select-small" value={filter} onChange={e=>setFilter(e.target.value)}><option>All roles</option><option>Customer</option><option>Store owner</option><option>Admin</option></select><button className="button secondary" onClick={()=>{setQuery('');setFilter('All roles')}}><Icon name="filter" size={16}/> Clear filters</button></div><UserTable users={filteredUsers} sort={sort} toggleSort={toggleSort} onView={setSelectedUser}/><div className="pagination"><span>Showing <b>{filteredUsers.length?1:0}–{filteredUsers.length}</b> of <b>{filteredUsers.length}</b> users</span><div><button disabled>← Previous</button><button disabled>Next →</button></div></div></section>}
        {role==='Customer'&&(currentPage==='Discover stores'||currentPage==='My ratings')&&<><div className="customer-toolbar"><div className="searchbox"><Icon name="search"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by store name or neighborhood..."/></div><button className="button secondary" onClick={()=>flash('Showing Himalayan destination cafés')}><Icon name="pin" size={16}/> Himachal · Mussoorie · Kashmir</button></div><div className="customer-store-grid">{filteredStores.filter(s=>currentPage!=='My ratings'||s.myRating).map(s=><article className="store-card" key={s.id}><div className={`store-cover ${s.color}`}><span className="cover-pattern">✳</span><span className="category-pill">{s.category}</span><div className={`store-avatar card-avatar ${s.color}`}>{s.initials}</div></div><div className="store-card-body"><div className="store-card-title"><h3>{s.name}</h3><span className="rating-chip">★ {s.rating.toFixed(1)}</span></div><p className="store-address"><Icon name="pin" size={15}/>{s.address}</p><div className="store-card-foot"><span className="rating-count">{s.ratings} ratings</span><div className="your-rating">{s.myRating?<><span>Your rating</span><Stars value={s.myRating} interactive onChange={n=>submitRating(s.id,n)}/></>:<button className="rate-button" onClick={()=>setRatingStore(s.id)}>Rate this store <Icon name="arrow" size={13}/></button>}</div></div></div></article>)}</div>{filteredStores.length===0&&<div className="empty-state">No stores found. Try another search.</div>}</>}
        {role === 'Store owner' && <OwnerDashboard stores={ownerStores} query={query} setQuery={setQuery} onPassword={() => setModal('password')} />}
        <footer className="footer"><span>© 2025 StoreRate, Inc.</span><div><a href="#support" onClick={e=>{e.preventDefault();flash('Help center is coming soon')}}>Help center</a><a href="#privacy" onClick={e=>e.preventDefault()}>Privacy</a><a href="#terms" onClick={e=>e.preventDefault()}>Terms</a><span className="status-dot"/> All systems normal</div></footer>
      </div>
    </main>
    {ratingStore&&<div className="modal-backdrop" onClick={()=>setRatingStore(null)}><div className="modal rating-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setRatingStore(null)}><Icon name="close"/></button><div className="modal-kicker">SHARE YOUR EXPERIENCE</div><h2>How was your visit?</h2><p>Your feedback helps neighbors find their next favorite spot.</p><div className="big-stars"><Stars value={stores.find(s=>s.id===ratingStore)?.myRating||0} interactive onChange={n=>submitRating(ratingStore,n)}/></div><span className="modal-hint">Tap a star to rate this store</span></div></div>}
    {selectedUser&&<div className="modal-backdrop" onClick={()=>setSelectedUser(null)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="user-detail-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Close user details" onClick={()=>setSelectedUser(null)}><Icon name="close"/></button><div className="modal-kicker">USER PROFILE</div><h2 id="user-detail-title">{selectedUser.name}</h2><div className="profile-details"><p><b>Email</b><span>{selectedUser.email}</span></p><p><b>Address</b><span>{selectedUser.address}</span></p><p><b>Role</b><span>{selectedUser.role}</span></p><p><b>Joined</b><span>{selectedUser.joined}</span></p>{selectedUser.role==='Store owner'&&<p><b>Average store rating</b><span>{Number(selectedUser.owner_rating||0).toFixed(1)} / 5</span></p>}</div><div className="modal-actions"><button className="button primary" onClick={()=>setSelectedUser(null)}>Done</button></div></div></div>}
    {modal&&<div className="modal-backdrop" onClick={()=>setModal('')}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal('')}><Icon name="close"/></button>{modal==='user'?<><div className="modal-kicker">WORKSPACE MANAGEMENT</div><h2>Add a new user</h2><p>Create a profile and choose their access level.</p><form onSubmit={addUser} className="modal-form"><label>Full name<input minLength="20" maxLength="60" required value={userForm.name} onChange={e=>setUserForm({...userForm,name:e.target.value})} placeholder="e.g. Jordan Alexander Smith"/></label><label>Email address<input type="email" required value={userForm.email} onChange={e=>setUserForm({...userForm,email:e.target.value})} placeholder="name@example.com"/></label><label>Address<input maxLength="400" required value={userForm.address} onChange={e=>setUserForm({...userForm,address:e.target.value})} placeholder="Street, city, state"/></label><label>Temporary password<input type="password" minLength="8" maxLength="16" pattern="(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,16}" required value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})} placeholder="8–16 characters, uppercase & symbol"/></label><label>Role<select value={userForm.role} onChange={e=>setUserForm({...userForm,role:e.target.value})}><option value="customer">Customer</option><option value="store_owner">Store owner</option><option value="admin">Admin</option></select></label><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal('')}>Cancel</button><button className="button primary">Add user</button></div></form></>:modal==='password'?<><div className="modal-kicker">ACCOUNT SECURITY</div><h2>Update password</h2><p>Choose a secure password you haven’t used before.</p><form onSubmit={updatePassword} className="modal-form"><label>Current password<input name="currentPassword" type="password" required placeholder="Enter current password"/></label><label>New password<input name="newPassword" type="password" minLength="8" maxLength="16" pattern="(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,16}" required placeholder="8–16 characters, one uppercase & symbol"/></label><label>Confirm new password<input name="confirmPassword" type="password" required placeholder="Re-enter new password"/></label><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal('')}>Cancel</button><button className="button primary">Save password</button></div></form></>:modal==='store'?<><div className="modal-kicker">DIRECTORY MANAGEMENT</div><h2>Add a new store</h2><p>Bring a new neighborhood favorite to StoreRate.</p><form onSubmit={addStore} className="modal-form"><label>Store name<input name="name" minLength="20" maxLength="60" required placeholder="e.g. Northside Himalayan Coffee House"/></label><label>Email address<input name="email" type="email" required placeholder="hello@store.com"/></label><label>Address<input name="address" maxLength="400" required placeholder="Street, city, state"/></label><label>Store owner email (optional)<input name="ownerEmail" type="email" placeholder="owner@example.com"/></label><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal('')}>Cancel</button><button className="button primary">Add store</button></div></form></>:modal==='profile'?<><div className="modal-kicker">YOUR ACCOUNT</div><h2>{authUser.name}</h2><p className="profile-role">{role} account</p><div className="profile-details"><p><b>Email</b><span>{authUser.email}</span></p></div><div className="modal-actions"><button className="button secondary" onClick={()=>setModal('')}>Close</button><button className="button primary" onClick={()=>setModal('password')}>Update password</button></div></>:<><div className="modal-kicker">STORERATE</div><h2>Workspace settings</h2><p>Account details and password settings are available from your profile.</p><div className="modal-actions"><button className="button primary" onClick={()=>setModal('profile')}>Open profile</button></div></>}</div></div>}
    {toast&&<div className="toast"><span>✓</span>{toast}</div>}
  </div>;
}
function Stat({title,value,change,note,icon,tone,spark}) { return <div className="panel stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`}><Icon name={icon} size={18}/></span><button className="more-btn">···</button></div><span className="stat-label">{title}</span><div className="stat-bottom"><div><strong>{value}</strong>{change&&<div className="stat-note"><span className="positive">↑ {change}</span> {note}</div>}</div>{spark&&<svg className="spark" viewBox="0 0 100 35" preserveAspectRatio="none"><polyline points={spark} fill="none" stroke="#755ce5" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/></svg>}</div></div>; }
function RatingActivity({ daily = [] }) {
  const maximum = Math.max(1, ...daily.map(day => Number(day.count)));
  const total = daily.reduce((sum, day) => sum + Number(day.count), 0);
  return <section className="panel rating-panel"><div className="panel-head"><div><h2>Rating activity</h2><p>Ratings submitted over the last seven days</p></div><span className="activity-total">{total} ratings</span></div><div className="activity-chart" role="img" aria-label={`${total} ratings submitted over the last seven days`}>{daily.map((day,index)=><div className="activity-day" key={`${day.label}-${index}`}><div className="activity-track"><span className="activity-bar" style={{height:`${Math.max(4,Number(day.count)/maximum*100)}%`}} title={`${day.count} ratings`}/></div><small>{day.label}</small></div>)}</div></section>;
}
function SortHead({children,onClick,active}) { return <th><button className="sort-head" onClick={onClick}>{children}<span className={active?'sort-active':''}>↕</span></button></th>; }
function UserTable({users,sort,toggleSort,onView}) {
  return <div className="table-scroll user-table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select all users"/></th><SortHead active={sort.key==='name'} onClick={()=>toggleSort('name')}>Name</SortHead><SortHead active={sort.key==='email'} onClick={()=>toggleSort('email')}>Email</SortHead><th>Role</th><th>Address</th><th>Status</th><th/></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><input type="checkbox" aria-label={`Select ${u.name}`}/></td><td><div className="person-cell"><Avatar user={u} small/><b>{u.name}</b></div></td><td className="muted-cell">{u.email}</td><td><span className={`role-pill ${u.role==='Admin'?'admin-pill':u.role==='Store owner'?'owner-pill':''}`}>{u.role}</span></td><td><span className="address-cell"><Icon name="pin" size={13}/><span>{u.address}</span></span></td><td><span className="active-pill"><i/> {u.status}</span></td><td><button className="row-menu" aria-label={`View ${u.name}`} onClick={()=>onView(u)}>···</button></td></tr>)}</tbody></table>{users.length===0&&<div className="empty-state">No users match your search.</div>}</div>;
}
function StoreTable({stores,sort,toggleSort}) { return <div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select all stores"/></th><SortHead active={sort.key==='name'} onClick={()=>toggleSort('name')}>Store</SortHead><SortHead active={sort.key==='email'} onClick={()=>toggleSort('email')}>Email</SortHead><SortHead active={sort.key==='address'} onClick={()=>toggleSort('address')}>Address</SortHead><SortHead active={sort.key==='rating'} onClick={()=>toggleSort('rating')}>Rating</SortHead><th><span className="static-head">Reviews</span></th><th/></tr></thead><tbody>{stores.map(s=><tr key={s.id}><td><input type="checkbox" aria-label={`Select ${s.name}`}/></td><td><div className="person-cell"><span className={`store-avatar table-store ${s.color}`}>{s.initials}</span><div className="table-store-name"><b>{s.name}</b><small>{s.category}</small></div></div></td><td className="muted-cell">{s.email}</td><td className="muted-cell">{s.address}</td><td><span className="table-rating">★ {s.rating.toFixed(1)}</span></td><td className="muted-cell">{s.ratings}</td><td><button className="row-menu" aria-label={`More actions for ${s.name}`}>···</button></td></tr>)}</tbody></table>{stores.length===0&&<div className="empty-state">No stores found. Try another search.</div>}</div>; }

function OwnerDashboard({ stores, query, setQuery, onPassword }) {
  const store = stores[0];
  const ratings = (store?.ratings || []).filter(rating => `${rating.user_name} ${rating.user_email}`.toLowerCase().includes(query.toLowerCase()));
  const ratingsThisMonth = (store?.ratings || []).filter(rating => Date.now() - new Date(rating.updated_at).getTime() < 30 * 86400000).length;
  if (!store) return <section className="panel empty-owner"><span className="owner-rating-icon">✦</span><h2>No store assigned yet</h2><p>Ask your administrator to connect a store with this owner account.</p><button className="button secondary" onClick={onPassword}>Update password</button></section>;
  return <>
    <div className="owner-stats">
      <div className="panel owner-rating-card"><div className="owner-rating-icon">★</div><span className="stat-label">YOUR AVERAGE RATING</span><div className="owner-score">{Number(store.average_rating || 0).toFixed(2)} <Stars value={Math.round(store.average_rating || 0)}/></div><p>Based on {store.ratings_count} customer ratings</p></div>
      <div className="panel owner-stat"><div className="stat-label">TOTAL RATINGS</div><strong>{store.ratings_count}</strong><div className="owner-stat-bottom"><span>All time</span></div><div className="mini-bars">{[32,50,40,70,55,90,65,100,75,88,62,95].map((height,index)=><i key={index} style={{height:`${height}%`}}/>)}</div></div>
      <div className="panel owner-stat"><div className="stat-label">RATINGS THIS MONTH</div><strong>{ratingsThisMonth}</strong><div className="owner-stat-bottom"><span>Updated in the last 30 days</span></div><div className="mini-bars orange">{[55,65,35,75,45,80,60,95,52,77,70,100].map((height,index)=><i key={index} style={{height:`${height}%`}}/>)}</div></div>
    </div>
    <section className="panel table-panel directory-panel"><div className="panel-head owner-list-head"><div><h2>Customer ratings</h2><p>{store.name} · {store.address}</p></div><button className="button secondary" onClick={onPassword}>Update password</button></div><div className="toolbar"><div className="searchbox"><Icon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search customers..."/></div></div><div className="ratings-list">{ratings.map((rating,index)=>{const user={name:rating.user_name,initials:rating.user_name.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase(),color:['rose','peach','mint','sage'][index%4]};return <div className="rating-row" key={rating.id}><Avatar user={user}/><div className="rating-user"><b>{rating.user_name}</b><span>{rating.user_email}</span></div><div className="rating-quote"><Stars value={rating.rating}/><p>Customer rating: {rating.rating} out of 5</p></div><time>{new Date(rating.updated_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</time></div>;})}{ratings.length===0&&<div className="empty-state">No ratings match your search yet.</div>}</div></section>
  </>;
}

function AuthScreen({ onLogin }) {
  const [signup, setSignup] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', address: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api(signup ? '/auth/signup' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      onLogin(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };
  return <div className="auth-shell"><div className="auth-aside"><a className="brand" href="#" onClick={event => event.preventDefault()}><span className="brand-mark"><span/><span/><span/><span/></span><span>storerate</span></a><div className="auth-story"><span className="auth-kicker">GOOD STORES DESERVE GOOD WORDS</span><h1>Find your<br/>kind of local.</h1><p>Real ratings from real neighbors. Discover the little places that make a neighborhood feel like yours.</p><div className="auth-proof"><div className="proof-avatars"><Avatar user={{initials:'OR',color:'rose'}}/><Avatar user={{initials:'LS',color:'peach'}}/><Avatar user={{initials:'CW',color:'mint'}}/></div><span><b>Himalayan escapes</b><small>rated by real visitors</small></span><span className="proof-stars">★★★★★</span></div></div><div className="auth-aside-foot">Made for the places that make a place.</div></div><div className="auth-main"><div className="auth-card"><div className="auth-mobile-brand"><span className="brand-mark"><span/><span/><span/><span/></span> storerate</div><div className="auth-kicker">{signup?'JOIN YOUR NEIGHBORHOOD':'WELCOME BACK'}</div><h2>{signup?'Create your account':'Sign in to StoreRate'}</h2><p>{signup?'A better neighborhood starts with a recommendation.':'Pick up where you left off and find something good.'}</p><form onSubmit={submit} className="modal-form">{signup&&<label>Full name<input autoComplete="name" minLength="20" maxLength="60" required value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="e.g. Jordan Alexander Smith"/></label>}<label>Email address<input autoComplete="email" type="email" required value={form.email} onChange={event=>setForm({...form,email:event.target.value})} placeholder="you@example.com"/></label>{signup&&<label>Address<input autoComplete="street-address" maxLength="400" required value={form.address} onChange={event=>setForm({...form,address:event.target.value})} placeholder="Street, city, state"/></label>}<label>Password<input autoComplete={signup?'new-password':'current-password'} type="password" minLength={signup?'8':undefined} maxLength="16" pattern={signup?'(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,16}':undefined} required value={form.password} onChange={event=>setForm({...form,password:event.target.value})} placeholder={signup?'8–16 characters, uppercase & special character':'Enter your password'}/></label><button className="button primary auth-submit" disabled={busy}>{busy?'Please wait…':signup?'Create customer account':'Sign in'} <Icon name="arrow" size={15}/></button></form>{error&&<div className="auth-error" role="alert">{error}</div>}<div className="auth-switch">{signup?'Already have an account?':'New to StoreRate?'} <button onClick={()=>{setSignup(!signup);setError('');setForm({name:'',email:'',address:'',password:''})}}>{signup?'Sign in':'Create an account'}</button></div><div className="auth-legal">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</div></div><div className="auth-copyright">© 2025 StoreRate, Inc.</div></div></div>;
}

function LegacyAuthScreen({onLogin}) {
  const [signup,setSignup]=useState(false); const [role,setRole]=useState('Customer'); const [message,setMessage]=useState('');
  const submit=e=>{e.preventDefault(); onLogin(signup?'Customer':role);};
  return <div className="auth-shell"><div className="auth-aside"><a className="brand" href="#" onClick={e=>e.preventDefault()}><span className="brand-mark"><span/><span/><span/><span/></span><span>storerate</span></a><div className="auth-story"><span className="auth-kicker">GOOD STORES DESERVE GOOD WORDS</span><h1>Find your<br/>kind of local.</h1><p>Real ratings from real neighbors. Discover the little places that make a neighborhood feel like yours.</p><div className="auth-proof"><div className="proof-avatars"><Avatar user={{initials:'OR',color:'rose'}}/><Avatar user={{initials:'LS',color:'peach'}}/><Avatar user={{initials:'CW',color:'mint'}}/></div><span><b>8,500+</b><small>neighborly ratings</small></span><span className="proof-stars">★★★★★</span></div></div><div className="auth-aside-foot">Made for the places that make a place.</div></div><div className="auth-main"><div className="auth-card"><div className="auth-mobile-brand"><span className="brand-mark"><span/><span/><span/><span/></span> storerate</div><div className="auth-kicker">{signup?'JOIN YOUR NEIGHBORHOOD':'WELCOME BACK'}</div><h2>{signup?'Create your account':'Sign in to StoreRate'}</h2><p>{signup?'A better neighborhood starts with a recommendation.':'Pick up where you left off and find something good.'}</p><form onSubmit={submit} className="modal-form">{signup&&<label>Full name<input minLength="20" maxLength="60" required placeholder="e.g. Jordan Alexander Smith"/></label>}<label>Email address<input type="email" required placeholder="you@example.com"/></label>{signup&&<label>Address<input maxLength="400" required placeholder="Street, city, state"/></label>}<label>Password<input type="password" minLength="8" maxLength="16" pattern="(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,16}" required placeholder="8–16 characters, one uppercase & symbol"/></label>{!signup&&<label>Continue as<select value={role} onChange={e=>setRole(e.target.value)}><option>Customer</option><option>Store owner</option><option>Admin</option></select></label>}<button className="button primary auth-submit">{signup?'Create account':'Sign in'} <Icon name="arrow" size={15}/></button></form><div className="auth-switch">{signup?'Already have an account?':'New to StoreRate?'} <button onClick={()=>{setSignup(!signup);setRole('Customer');setMessage('')}}>{signup?'Sign in':'Create an account'}</button></div>{message&&<div className="auth-success">{message}</div>}<div className="auth-legal">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</div></div><div className="auth-copyright">© 2025 StoreRate, Inc.</div></div></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
