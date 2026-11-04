import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { api, AppNotification, AuditLog, ManagedUser, Shop, TeamEmployee, UserDetails } from '../lib/api';
import IndiaAddressFields from '../components/IndiaAddressFields';
import { clearSession, getSession } from '../lib/session';

type Tab = 'overview' | 'people' | 'shops' | 'audit';


export default function AdminScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [adminName, setAdminName] = useState('Administrator');
  const [adminId, setAdminId] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPages, setAuditPages] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [team, setTeam] = useState<TeamEmployee[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shopLocation, setShopLocation] = useState<{ latitude: number; longitude: number; placeName: string } | null>(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', phone: '', password: '', role: 'employee' as 'admin' | 'employee' });
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [profileVisible, setProfileVisible] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [shopForm, setShopForm] = useState({ name: '', address: '', pinCode: '', district: '', state: 'Uttarakhand', mobileNumber: '' });
  const [editingShopId, setEditingShopId] = useState<string | null>(null);

  const load = useCallback(async (activeToken: string) => {
    const [userResult, shopResult, teamResult, notificationResult, auditResult] = await Promise.all([
      api.users(activeToken), api.shops(activeToken), api.teamToday(activeToken), api.notifications(activeToken), api.auditLogs(activeToken)
    ]);
    setUsers(userResult.users);
    setShops(shopResult.shops);
    setTeam(teamResult.employees);
    setNotifications(notificationResult.notifications);
    setUnreadCount(notificationResult.unreadCount);
    setAuditLogs(auditResult.logs);
    setAuditPage(auditResult.pagination.page);
    setAuditPages(auditResult.pagination.pages);
    setAuditTotal(auditResult.pagination.total);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (!session) { router.replace('/'); return; }
        if (session.user.role !== 'admin') { router.replace('/dashboard'); return; }
        setToken(session.token);
        setAdminName(session.user.name);
        setAdminId(session.user.id);
        await load(session.token);
      } catch (error) {
        Alert.alert('Admin dashboard error', error instanceof Error ? error.message : 'Please try again.');
      } finally { setBusy(false); }
    })();
  }, [load]);

  const refresh = async () => {
    if (!token) return;
    setRefreshing(true);
    try { await load(token); }
    catch (error) { Alert.alert('Refresh failed', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setRefreshing(false); }
  };

  const markNotificationsRead = async () => {
    if (!token || unreadCount === 0) return;
    try {
      await api.markAllNotificationsRead(token);
      setNotifications(current => current.map(item => ({...item,readAt:item.readAt || new Date().toISOString()})));
      setUnreadCount(0);
    } catch(error) { Alert.alert('Could not update notifications',error instanceof Error?error.message:'Please try again.'); }
  };


  const submitPasswordChange = async () => {
    if (!token || saving) return;
    if (!currentPassword || !newPassword || !confirmPassword) { Alert.alert('Missing details', 'Enter all three password fields.'); return; }
    if (newPassword.length < 8) { Alert.alert('Weak password', 'Use at least 8 characters for your new password.'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Passwords do not match', 'Confirm the new password correctly.'); return; }
    setSaving(true);
    try {
      const result = await api.changePassword(token, currentPassword, newPassword);
      setPasswordVisible(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      Alert.alert('Password updated', result.message);
    } catch (error) {
      Alert.alert('Password update failed', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSaving(false); }
  };

  const logout = async () => { await clearSession(); router.replace('/'); };

  const createAccount = async () => {
    if (!token) return;
    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.password) {
      Alert.alert('Missing details', 'Name, email address and password are required.'); return;
    }
    setSaving(true);
    try {
      await api.createUser(token, {
        name: userForm.name.trim(),
        email: userForm.email.trim(),
        ...(userForm.phone.trim() ? { phone: userForm.phone.trim() } : {}),
        password: userForm.password,
        role: userForm.role
      });
      Alert.alert('Account created', `${userForm.role === 'admin' ? 'Admin' : 'Employee'} account created for ${userForm.email.trim()}.`);
      setUserForm({ name: '', email: '', phone: '', password: '', role: 'employee' });
      await load(token);
    } catch (error) { Alert.alert('Could not create account', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  };

  const viewUserDetails = async (person: ManagedUser) => {
    if (!token) return;
    setProfileLoading(true);
    setProfileVisible(true);
    try {
      const result = await api.userDetails(token, person._id || person.id || '');
      setSelectedUser(result.profile);
    } catch (error) {
      setProfileVisible(false);
      Alert.alert('Could not load account profile', error instanceof Error ? error.message : 'Please try again.');
    } finally { setProfileLoading(false); }
  };

  const permanentlyDeleteAccount = (person: ManagedUser) => {
    if (!token) return;
    const personId = person._id || person.id || '';
    if (personId === adminId) {
      Alert.alert('Current admin account', 'You cannot permanently delete the admin account you are currently using.');
      return;
    }
    Alert.alert(
      'Permanently delete account?',
      'This action cannot be undone. The account, login credentials, attendance visits and personal notifications will be permanently removed. Company shop records will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Permanently delete', style: 'destructive', onPress: async () => {
          setSaving(true);
          try {
            const result = await api.deleteUser(token, personId);
            if (selectedUser?._id === personId) {
              setProfileVisible(false);
              setSelectedUser(null);
            }
            await load(token);
            Alert.alert('Account permanently deleted', result.message);
          } catch (error) {
            Alert.alert('Could not delete account', error instanceof Error ? error.message : 'Please try again.');
          } finally { setSaving(false); }
        } }
      ]
    );
  };

  const readAccurateLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('Allow location access while using the app, then try again.');
    if (!(await Location.hasServicesEnabledAsync())) throw new Error('Turn on Location/GPS in Android quick settings and try again.');
    let best: Location.LocationObject | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reading = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        mayShowUserSettingsDialog: true
      });
      if (!best || (reading.coords.accuracy ?? 9999) < (best.coords.accuracy ?? 9999)) best = reading;
      if ((best.coords.accuracy ?? 9999) <= 25) break;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1800));
    }
    if (!best) throw new Error('GPS did not return a location. Try again outdoors.');
    const accuracy = best.coords.accuracy ?? 9999;
    if (accuracy > 50) throw new Error('GPS accuracy is still about ' + Math.round(accuracy) + 'm after 3 attempts. Go outdoors, enable Google Location Accuracy, wait briefly, and retry.');
    return { latitude: best.coords.latitude, longitude: best.coords.longitude, accuracy };
  };

  const useCurrentLocation = async () => {
    try {
      const reading = await readAccurateLocation();
      const places = await Location.reverseGeocodeAsync({ latitude: reading.latitude, longitude: reading.longitude });
      const place = places[0];
      const placeName = place ? [place.name, place.street, place.district, place.city, place.region].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ') : '';
      if (!placeName) throw new Error('Could not identify a readable place name. Check your GPS signal and try again.');
      setShopLocation({ latitude: reading.latitude, longitude: reading.longitude, placeName });
      Alert.alert('Place identified', placeName + '. GPS accuracy: about ' + Math.round(reading.accuracy) + 'm.');
    } catch (error) { Alert.alert('Could not get accurate GPS', error instanceof Error ? error.message : 'Please try again.'); }
  };

  const resetShopForm = () => {
    setShopForm({ name: '', address: '', pinCode: '', district: '', state: 'Uttarakhand', mobileNumber: '' });
    setShopLocation(null);
    setEditingShopId(null);
  };

  const startEditShop = (shop: Shop) => {
    setEditingShopId(shop._id);
    setShopForm({
      name: shop.name,
      address: shop.address || '',
      pinCode: shop.pinCode || '',
      district: shop.district || '',
      state: shop.state || 'Uttarakhand',
      mobileNumber: shop.mobileNumber || ''
    });
    setShopLocation(shop.location ? { ...shop.location, placeName: shop.location.placeName || '' } : null);
    setMapsLink('');
    setTab('shops');
  };

  const createShop = async () => {
    if (!token) return;
    if (!shopForm.name.trim() || !shopForm.address.trim() || !/^\d{6}$/.test(shopForm.pinCode.trim()) || !shopForm.district.trim() || !shopForm.state.trim() || !/^\+?\d{7,15}$/.test(shopForm.mobileNumber.trim().replace(/[\s().-]/g, ''))) {
      Alert.alert('Missing shop details', 'Enter shop name, full address, valid 6-digit PIN code, district, state and mobile number.'); return;
    }
    if (!shopLocation || !shopLocation.placeName.trim()) {
      Alert.alert('Shop location required', 'Choose a named place on the map or identify it with GPS before saving.'); return;
    }
    setSaving(true);
    try {
      const payload = {
        name: shopForm.name.trim(), address: shopForm.address.trim(),
        pinCode: shopForm.pinCode.trim(), district: shopForm.district.trim(),
        state: shopForm.state.trim(), mobileNumber: shopForm.mobileNumber.trim(),
        latitude: shopLocation.latitude, longitude: shopLocation.longitude, placeName: shopLocation.placeName
      };
      if (editingShopId) {
        await api.updateShop(token, editingShopId, payload);
        Alert.alert('Shop updated', 'Shop details and its named place have been updated.');
      } else {
        await api.createShop(token, payload);
        Alert.alert('Shop registered', 'The shop is registered and available for employee check-ins.');
      }
      resetShopForm();
      await load(token);
    } catch (error) { Alert.alert(editingShopId ? 'Could not update shop' : 'Could not register shop', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  };

  const toggleShop = async (shop: Shop) => {
    if (!token) return;
    const nextActive = shop.active === false;
    Alert.alert(
      nextActive ? 'Reactivate shop?' : 'Deactivate shop?',
      nextActive
        ? 'This shop will become available for employee check-ins again.'
        : 'Employees will no longer see this shop or check in to it. Existing visit history will be retained.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: nextActive ? 'Reactivate' : 'Deactivate', style: nextActive ? 'default' : 'destructive', onPress: async () => {
          setSaving(true);
          try { await api.updateShop(token, shop._id, { active: nextActive }); await load(token); }
          catch (error) { Alert.alert('Shop update failed', error instanceof Error ? error.message : 'Please try again.'); }
          finally { setSaving(false); }
        } }
      ]
    );
  };

  const toggleAccount = async (account: ManagedUser) => {
    if (!token) return;
    setSaving(true);
    try {
      await api.updateUser(token, account._id || account.id || '', { active: !account.active });
      await load(token);
    } catch (error) { Alert.alert('Account update failed', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  };

  if (busy) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563EB"/><Text style={styles.muted}>Loading admin workspace…</Text></SafeAreaView>;

  const employees = users.filter(u => u.role === 'employee');
  const visits = team.reduce((sum, employee) => sum + employee.visitCount, 0);

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark"/>
    <View style={styles.header}>
      <View style={styles.brandRow}><View style={styles.brandMark}><Text style={styles.brandLetter}>S</Text></View><View><Text style={styles.kicker}>SAMRIDHI ENTERPRISES</Text><Text style={styles.heading}>Admin workspace</Text></View></View>
      <View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="Change password" onPress={()=>setPasswordVisible(true)} style={styles.bellButton}><Text style={styles.bellIcon}>🔑</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unreadCount} unread`} onPress={()=>setNotificationsVisible(true)} style={styles.bellButton}><Text style={styles.bellIcon}>🔔</Text>{unreadCount>0&&<View style={styles.bellBadge}><Text style={styles.bellBadgeText}>{unreadCount>99?'99+':unreadCount}</Text></View>}</Pressable><Pressable onPress={() => router.push('/reports')} style={styles.reportsLink}><Text style={styles.reportsLinkText}>REPORTS</Text></Pressable><Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>LOG OUT</Text></Pressable></View>
    </View>
    <View style={styles.tabs}>
      {(['overview','people','shops','audit'] as Tab[]).map(item => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item === 'overview' ? 'Overview' : item === 'people' ? 'People' : item === 'shops' ? 'Shops' : 'Audit'}</Text></Pressable>)}
    </View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>}>
      {tab === 'overview' && <>
        <View style={styles.welcome}><Text style={styles.welcomeEyebrow}>ADMINISTRATION</Text><Text style={styles.welcomeTitle}>Hello, {adminName.split(' ')[0]}.</Text><Text style={styles.welcomeText}>Manage your field team and shop attendance.</Text></View>
        <View style={styles.stats}>
          <Stat label="Employees" value={employees.filter(x=>x.active).length}/><Stat label="Inactive staff" value={employees.filter(x=>!x.active).length}/>
          <Stat label="Active shops" value={shops.filter(shop=>shop.active !== false && shop.verificationStatus === 'VERIFIED').length}/><Stat label="Pending approvals" value={shops.filter(shop=>shop.verificationStatus === 'PENDING').length}/><Stat label="Today's visits" value={visits}/>
        </View>
        <Section title="Today's team attendance" hint="Select an employee to view complete account details and today's verified shop visits.">
          {team.length === 0 ? <Empty text="No employees have been created yet."/> : team.map(person => <View key={person._id} style={styles.teamAttendanceCard}>
            <View style={styles.teamAttendanceHeader}>
              <Pressable disabled={saving} onPress={()=>viewUserDetails(person)} style={{flex:1}}>
                <Text style={styles.rowTitle}>{person.name}</Text>
                <Text style={styles.rowSub}>{person.employeeId} · {person.role === 'admin' ? 'Administrator' : 'Employee'}</Text>
              </Pressable>
              <Text style={[styles.status, person.attendance === 'Present' ? styles.present : styles.absent]}>{person.attendance}</Text>
            </View>
            <View style={styles.teamDetailsGrid}>
              <View style={styles.teamDetail}><Text style={styles.teamDetailLabel}>EMAIL</Text><Text style={styles.teamDetailValue}>{person.email || 'Not provided'}</Text></View>
              <View style={styles.teamDetail}><Text style={styles.teamDetailLabel}>PHONE</Text><Text style={styles.teamDetailValue}>{person.phone || 'Not provided'}</Text></View>
              <View style={styles.teamDetail}><Text style={styles.teamDetailLabel}>TODAY'S VISITS</Text><Text style={styles.teamDetailValue}>{person.visitCount}</Text></View>
              <View style={styles.teamDetail}><Text style={styles.teamDetailLabel}>ACCOUNT</Text><Text style={styles.teamDetailValue}>{person.active ? 'Active' : 'Inactive'}</Text></View>
            </View>
            <View style={styles.teamVisitList}>
              <Text style={styles.teamVisitHeading}>TODAY'S SHOP VISITS</Text>
              {person.visits.length === 0 ? <Text style={styles.rowSub}>No verified shop visits today.</Text> : person.visits.map(visit=><View key={visit._id} style={styles.teamVisitCard}>
                <Text style={styles.rowTitle}>{visit.shop?.name || visit.shopName || 'Shop details unavailable'}</Text>
                <Text style={styles.rowSub}>{visit.shop?.location?.placeName || visit.shopPlaceName || visit.shop?.address || visit.shopAddress || 'Place name unavailable'}</Text>
                <Text style={styles.rowSub}>{[visit.shop?.address, visit.shop?.area, visit.shop?.district, visit.shop?.state, visit.shop?.pinCode].filter(Boolean).join(', ') || 'Full address unavailable'}</Text>
                <View style={styles.teamDetailsGrid}>
                  <View style={styles.teamDetail}><Text style={styles.teamDetailLabel}>SHOP CODE</Text><Text style={styles.teamDetailValue}>{visit.shop?.shopCode || 'Not available'}</Text></View>
                  <View style={styles.teamDetail}><Text style={styles.teamDetailLabel}>CONTACT</Text><Text style={styles.teamDetailValue}>{visit.shop?.mobileNumber || 'Not available'}</Text></View>
                  <View style={styles.teamDetail}><Text style={styles.teamDetailLabel}>CHECK-IN</Text><Text style={styles.teamDetailValue}>{new Date(visit.checkedInAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</Text></View>
                  <View style={styles.teamDetail}><Text style={styles.teamDetailLabel}>GPS DISTANCE</Text><Text style={styles.teamDetailValue}>{Math.round(visit.distanceMeters)} metres</Text></View>
                  <View style={styles.teamDetail}><Text style={styles.teamDetailLabel}>VERIFICATION</Text><Text style={styles.teamDetailValue}>{visit.shop?.verificationStatus || 'Verified visit'}</Text></View>
                </View>
              </View>)}
            </View>
          </View>)}
        </Section>
      </>}
      {tab === 'people' && <>
        <Section title="Create an account" hint="Create an Admin or Employee account with a unique email address.">
          <Field label="FULL NAME" value={userForm.name} onChange={v=>setUserForm({...userForm,name:v})} placeholder="Full name"/>
          
          <Field label="EMAIL ADDRESS (REQUIRED)" value={userForm.email} onChange={v=>setUserForm({...userForm,email:v})} placeholder="name@example.com" keyboardType="email-address"/>
          <Field label="PHONE NUMBER (OPTIONAL)" value={userForm.phone} onChange={v=>setUserForm({...userForm,phone:v})} placeholder="+91 9876543210" keyboardType="phone-pad"/>
          <Field label="TEMPORARY PASSWORD" value={userForm.password} onChange={v=>setUserForm({...userForm,password:v})} placeholder="Set initial password" secureTextEntry/>
          <Text style={styles.fieldLabel}>ACCOUNT ROLE</Text>
          <View style={styles.rolePicker}>
            <Pressable disabled={saving} onPress={()=>setUserForm({...userForm,role:'employee'})} style={[styles.roleOption,userForm.role==='employee'&&styles.roleOptionSelected]}>
              <Text style={[styles.roleOptionTitle,userForm.role==='employee'&&styles.roleOptionTitleSelected]}>Employee</Text>
              <Text style={styles.roleOptionHint}>Shop check-in and personal attendance</Text>
            </Pressable>
            <Pressable disabled={saving} onPress={()=>setUserForm({...userForm,role:'admin'})} style={[styles.roleOption,userForm.role==='admin'&&styles.roleOptionSelected]}>
              <Text style={[styles.roleOptionTitle,userForm.role==='admin'&&styles.roleOptionTitleSelected]}>Admin</Text>
              <Text style={styles.roleOptionHint}>Manage accounts, shops and reports</Text>
            </Pressable>
          </View>
          <Text style={styles.note}>Admin accounts have full administrative access, including the ability to create other admin accounts.</Text>
          <Primary label={saving?'Creating…':`Create ${userForm.role === 'admin' ? 'admin' : 'employee'} account`} onPress={createAccount} disabled={saving}/>
        </Section>
        <Section title="Account directory" hint="View profiles, deactivate employees, and permanently delete active or previously archived accounts.">
          {users.length===0 ? <Empty text="No accounts found."/> : users.map(person=><View key={person._id} style={styles.listRow}>
            <View style={{flex:1}}>
              <Text style={styles.rowTitle}>{person.name}</Text>
              <Text style={styles.rowSub}>{person.employeeId} · {person.role === 'admin' ? 'Admin' : 'Employee'} · {person.isDeleted ? 'Archived · awaiting permanent deletion' : person.active ? 'Active' : 'Inactive'}</Text>
            </View>
            <Pressable disabled={saving} onPress={()=>viewUserDetails(person)} style={styles.smallAction}><Text style={styles.smallActionText}>View profile</Text></Pressable>
            {person.isDeleted
              ? <Text style={styles.adminAccountTag}>ARCHIVED</Text>
              : person.role === 'employee'
                ? <Pressable disabled={saving} onPress={()=>toggleAccount(person)} style={styles.smallAction}><Text style={styles.smallActionText}>{person.active?'Deactivate':'Reactivate'}</Text></Pressable>
                : <Text style={styles.adminAccountTag}>ADMIN</Text>}
            <Pressable disabled={saving || (person._id || person.id) === adminId} onPress={permanentlyDeleteAccount.bind(null, person)} style={styles.smallAction}><Text style={[styles.smallActionText,styles.deactivateText]}>Delete permanently</Text></Pressable>
          </View>)}
        </Section>
      </>}
      {tab === 'shops' && <>
        <Section title={editingShopId ? 'Edit shop' : 'Register a shop'} hint={editingShopId ? 'Update the shop address, contact details or trusted GPS pin.' : 'Register a shop with complete address and verified GPS coordinates.'}>
          <Field label="SHOP NAME" value={shopForm.name} onChange={v=>setShopForm({...shopForm,name:v})} placeholder="Shop name"/>
          <Field label="FULL ADDRESS" value={shopForm.address} onChange={v=>setShopForm({...shopForm,address:v})} placeholder="House / building, street and locality"/>
          <Field label="PIN CODE" value={shopForm.pinCode} onChange={v=>setShopForm({...shopForm,pinCode:v.replace(/\D/g,'').slice(0,6)})} placeholder="247667" keyboardType="number-pad"/>
          <IndiaAddressFields state={shopForm.state} district={shopForm.district} onStateChange={state=>setShopForm(current=>({...current,state}))} onDistrictChange={district=>setShopForm(current=>({...current,district}))}/>
          <Field label="SHOP MOBILE NUMBER" value={shopForm.mobileNumber} onChange={v=>setShopForm({...shopForm,mobileNumber:v})} placeholder="+91 9876543210" keyboardType="phone-pad"/>
          <View style={styles.locationBox}>
            <Text style={styles.locationTitle}>SHOP PLACE</Text>
            <Text style={styles.locationHint}>{shopLocation?.placeName || 'No named place selected yet'}</Text>
            <Pressable onPress={useCurrentLocation} style={styles.locationButton}><Text style={styles.locationButtonText}>Use current GPS location</Text></Pressable>
            {shopLocation && <Pressable onPress={()=>setShopLocation(null)}><Text style={styles.clearLocation}>Clear selected location</Text></Pressable>}
          </View>
          <Text style={styles.note}>The readable place name is shown here. Coordinates remain internal for 50-metre check-in verification and are never displayed.</Text>
          <Primary label={saving ? (editingShopId ? 'Saving…' : 'Registering…') : (editingShopId ? 'Save shop changes' : 'Register shop')} onPress={createShop} disabled={saving}/>
          {editingShopId && <Pressable disabled={saving} onPress={resetShopForm} style={styles.cancelEdit}><Text style={styles.cancelEditText}>Cancel editing</Text></Pressable>}
        </Section>
        <Section title="Shop directory" hint="Review registered shops, approve employee submissions, edit details or remove shops.">
          {shops.length===0 ? <Empty text="No shops registered yet."/> : shops.map(shop=><View key={shop._id} style={styles.shopAdminCard}>
            <View style={styles.listRow}>
              <View style={{flex:1}}>
                <Text style={styles.rowTitle}>{shop.name}</Text>
                <Text style={styles.rowSub}>{shop.address || 'Address not available'} · {[shop.district, shop.state].filter(Boolean).join(', ') || 'Location details pending'} {shop.pinCode ? '- ' + shop.pinCode : ''}</Text>
                <Text style={styles.rowSub}>Mobile: {shop.mobileNumber || 'Not available'} · Submitted by: {shop.createdBy?.name || 'Legacy / Admin'}</Text>
                {shop.verificationStatus === 'REJECTED' && <Text style={styles.rejectionReason}>Rejection reason: {shop.rejectionReason || 'Details require correction'}</Text>}
                <Text style={styles.rowSub}>Place: {shop.location?.placeName || shop.address || 'Place name unavailable'}</Text>
              </View>
              <Text style={[styles.shopState, shop.verificationStatus === 'VERIFIED' ? styles.shopVerified : shop.verificationStatus === 'REJECTED' ? styles.shopRejected : styles.shopPending]}>{shop.verificationStatus || 'VERIFIED'}</Text>
            </View>
            <View style={styles.shopActions}>
              {shop.verificationStatus !== 'VERIFIED' && <Pressable disabled={saving} onPress={async()=>{if(!token)return;setSaving(true);try{await api.updateShop(token,shop._id,{verificationStatus:'VERIFIED'});await load(token);}catch(error){Alert.alert('Approval failed',error instanceof Error?error.message:'Please try again.');}finally{setSaving(false);}}} style={styles.smallAction}><Text style={styles.smallActionText}>Approve</Text></Pressable>}
              {shop.verificationStatus !== 'REJECTED' && <Pressable disabled={saving} onPress={()=>Alert.alert('Reject shop?','The employee will need to correct the submitted shop details before resubmitting.',[{text:'Cancel',style:'cancel'},{text:'Reject',style:'destructive',onPress:async()=>{if(!token)return;setSaving(true);try{await api.updateShop(token,shop._id,{verificationStatus:'REJECTED',rejectionReason:'Details require correction'});await load(token);}catch(error){Alert.alert('Rejection failed',error instanceof Error?error.message:'Please try again.');}finally{setSaving(false);}}}])} style={styles.smallAction}><Text style={styles.smallActionText}>Reject</Text></Pressable>}
              <Pressable disabled={saving} onPress={()=>startEditShop(shop)} style={styles.smallAction}><Text style={styles.smallActionText}>Edit</Text></Pressable>
              <Pressable disabled={saving} onPress={()=>toggleShop(shop)} style={[styles.smallAction,shop.active !== false && styles.deactivateAction]}><Text style={[styles.smallActionText,shop.active !== false && styles.deactivateText]}>{shop.active === false ? 'Reactivate' : 'Deactivate'}</Text></Pressable>
              <Pressable disabled={saving} onPress={()=>Alert.alert('Permanently delete shop?','This deletes the shop record from the database and removes its linked notifications. Historical attendance visits are retained for reports.',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{if(!token)return;setSaving(true);try{await api.deleteShop(token,shop._id);await load(token);}catch(error){Alert.alert('Delete failed',error instanceof Error?error.message:'Please try again.');}finally{setSaving(false);}}}])} style={styles.smallAction}><Text style={[styles.smallActionText,styles.deactivateText]}>Delete</Text></Pressable>
            </View>
          </View>)}
        </Section>
      </>}
      {tab === 'audit' && <>
        <Section title="Audit history" hint={auditTotal + ' recorded actions · Newest activity appears first.'}>
          {auditLogs.length === 0 ? <Empty text="No activity has been recorded yet."/> : auditLogs.map(item=><View key={item._id} style={styles.auditItem}>
            <View style={styles.auditTop}><Text style={styles.auditAction}>{item.action.replace(/_/g,' ')}</Text><Text style={styles.auditRole}>{item.actorRole.toUpperCase()}</Text></View>
            <Text style={styles.auditEntity}>{item.entityLabel || item.entityType} · {item.entityType}</Text>
            <Text style={styles.auditActor}>By {item.actorName} · {new Date(item.createdAt).toLocaleString('en-IN')}</Text>
            {item.details?.distanceMeters !== undefined && <Text style={styles.auditMeta}>GPS distance: {String(item.details.distanceMeters)} m</Text>}
            {item.details?.changedFields && <Text style={styles.auditMeta}>Changed: {(item.details.changedFields as string[]).join(', ')}</Text>}
            {item.details?.rejectionReason && <Text style={styles.auditMeta}>Reason: {String(item.details.rejectionReason)}</Text>}
          </View>)}
          <View style={styles.auditPagination}>
            <Pressable disabled={auditPage <= 1 || saving} onPress={async()=>{if(!token)return;setSaving(true);try{const result=await api.auditLogs(token,auditPage-1);setAuditLogs(result.logs);setAuditPage(result.pagination.page);}catch(error){Alert.alert('Could not load audit history',error instanceof Error?error.message:'Please try again.');}finally{setSaving(false);}}} style={[styles.smallAction,(auditPage<=1)&&{opacity:.4}]}><Text style={styles.smallActionText}>Previous</Text></Pressable>
            <Text style={styles.auditPageText}>Page {auditPage} of {Math.max(1,auditPages)}</Text>
            <Pressable disabled={auditPage >= auditPages || saving} onPress={async()=>{if(!token)return;setSaving(true);try{const result=await api.auditLogs(token,auditPage+1);setAuditLogs(result.logs);setAuditPage(result.pagination.page);}catch(error){Alert.alert('Could not load audit history',error instanceof Error?error.message:'Please try again.');}finally{setSaving(false);}}} style={[styles.smallAction,(auditPage>=auditPages)&&{opacity:.4}]}><Text style={styles.smallActionText}>Next</Text></Pressable>
          </View>
        </Section>
      </>}
      <Text style={styles.footer}>Admin access only. Employee location is requested only when they initiate a shop check-in.</Text>
    </ScrollView>

    <Modal visible={passwordVisible} animationType="slide" transparent onRequestClose={()=>setPasswordVisible(false)}>
      <View style={styles.notificationOverlay}>
        <View style={styles.notificationSheet}>
          <View style={styles.notificationSheetHeader}>
            <View style={{flex:1}}><Text style={styles.notificationTitle}>Change password</Text><Text style={styles.notificationHint}>Update your administrator login password</Text></View>
            <Pressable onPress={()=>setPasswordVisible(false)} style={styles.notificationClose}><Text style={styles.notificationCloseText}>CLOSE</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.passwordForm}>
            <Text style={styles.passwordLabel}>CURRENT PASSWORD</Text>
            <TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Enter current password" style={styles.passwordInput}/>
            <Text style={styles.passwordLabel}>NEW PASSWORD</Text>
            <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="At least 8 characters" style={styles.passwordInput}/>
            <Text style={styles.passwordLabel}>CONFIRM NEW PASSWORD</Text>
            <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Enter new password again" style={styles.passwordInput}/>
            <Pressable disabled={saving} onPress={submitPasswordChange} style={[styles.passwordSubmit,saving&&{opacity:.6}]}><Text style={styles.passwordSubmitText}>{saving?'UPDATING…':'UPDATE PASSWORD'}</Text></Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
    <Modal visible={notificationsVisible} animationType="slide" transparent onRequestClose={()=>setNotificationsVisible(false)}>
      <View style={styles.notificationOverlay}>
        <View style={styles.notificationSheet}>
          <View style={styles.notificationSheetHeader}>
            <View style={{flex:1}}><Text style={styles.notificationTitle}>Notifications</Text><Text style={styles.notificationHint}>{unreadCount>0?`${unreadCount} unread`:'You are all caught up'}</Text></View>
            {unreadCount>0&&<Pressable onPress={markNotificationsRead}><Text style={styles.notificationAction}>MARK ALL READ</Text></Pressable>}
            <Pressable onPress={()=>setNotificationsVisible(false)} style={styles.notificationClose}><Text style={styles.notificationCloseText}>CLOSE</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.notificationList}>
            {notifications.length===0?<Text style={styles.notificationEmpty}>No notifications yet.</Text>:notifications.map(item=><View key={item._id} style={[styles.notificationItem,!item.readAt&&styles.notificationUnread]}><Text style={styles.notificationItemTitle}>{item.title}</Text><Text style={styles.notificationMessage}>{item.message}</Text><Text style={styles.notificationDate}>{new Date(item.createdAt).toLocaleString('en-IN')}</Text></View>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
    <Modal visible={profileVisible} animationType="slide" onRequestClose={()=>setProfileVisible(false)}>
      <SafeAreaView style={styles.profileModal}>
        <View style={styles.mapHeader}>
          <View style={{flex:1}}>
            <Text style={styles.sectionTitle}>Account profile</Text>
            <Text style={styles.sectionHint}>Private account and attendance details</Text>
          </View>
          <Pressable onPress={()=>setProfileVisible(false)}><Text style={styles.closeMap}>CLOSE</Text></Pressable>
        </View>
        {profileLoading ? <View style={styles.center}><ActivityIndicator size="large" color="#2563EB"/><Text style={styles.muted}>Loading account details…</Text></View> : selectedUser ? <ScrollView contentContainerStyle={styles.profileContent}>
          <View style={styles.profileCard}>
            <Text style={styles.profileName}>{selectedUser.name}</Text>
            <Text style={styles.profileRole}>{selectedUser.role === 'admin' ? 'ADMINISTRATOR' : 'EMPLOYEE'} · {selectedUser.active ? 'ACTIVE' : 'INACTIVE'}</Text>
            <ProfileLine label="EMAIL ADDRESS" value={selectedUser.email || 'Not provided'}/>
            <ProfileLine label="PHONE NUMBER" value={selectedUser.phone || 'Not provided'}/>
            <ProfileLine label="INTERNAL REFERENCE" value={selectedUser.employeeId}/>
            <ProfileLine label="ACCOUNT CREATED" value={selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString('en-IN') : 'Not available'}/>
          </View>
          <View style={styles.profileStats}>
            <Stat label="Present days" value={selectedUser.presentDays}/>
            <Stat label="Verified visits" value={selectedUser.totalVisits}/>
          </View>
          <View style={styles.profileCard}>
            <Text style={styles.sectionTitle}>Recent shop visits</Text>
            <Text style={styles.sectionHint}>Showing up to {selectedUser.recentVisitsLimit} most recent visits.</Text>
            {selectedUser.recentVisits.length === 0 ? <Empty text="No verified visits recorded for this account."/> : selectedUser.recentVisits.map(visit=><View key={visit._id} style={styles.listRow}>
              <View style={{flex:1}}>
                <Text style={styles.rowTitle}>{visit.shop?.name || visit.shopName || 'Registered shop'}</Text>
                <Text style={styles.rowSub}>{visit.shop?.location?.placeName || visit.shop?.address || 'Place name unavailable'}</Text><Text style={styles.rowSub}>{visit.shop?.shopCode || '—'} · {new Date(visit.checkedInAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</Text>
              </View>
              <Text style={styles.distance}>{Math.round(visit.distanceMeters)} m</Text>
            </View>)}
          </View>
        </ScrollView> : <Empty text="No account details available."/>}
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

function ProfileLine({label,value}:{label:string;value:string}) { return <View style={styles.profileLine}><Text style={styles.profileLabel}>{label}</Text><Text style={styles.profileValue}>{value}</Text></View>; }
function Stat({label,value}:{label:string;value:number}) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function Section({title,hint,children}:{title:string;hint:string;children:React.ReactNode}) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionHint}>{hint}</Text>{children}</View>; }
function Empty({text}:{text:string}) { return <Text style={styles.empty}>{text}</Text>; }
function Field({label,value,onChange,placeholder,secureTextEntry,keyboardType,autoCapitalize}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string;secureTextEntry?:boolean;keyboardType?:'default'|'email-address'|'decimal-pad'|'number-pad'|'phone-pad';autoCapitalize?:'none'|'sentences'|'words'|'characters'}) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#94A3B8" secureTextEntry={secureTextEntry} keyboardType={keyboardType||'default'} autoCapitalize={autoCapitalize||'none'} autoCorrect={false} style={styles.input}/></View>; }
function Primary({label,onPress,disabled}:{label:string;onPress:()=>void;disabled:boolean}) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.primary,disabled&&{opacity:.6}]}><Text style={styles.primaryText}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
 safe:{flex:1,backgroundColor:'#F8FAFC'},center:{flex:1,alignItems:'center',justifyContent:'center',gap:10,backgroundColor:'#F8FAFC'},muted:{fontSize:12,color:'#64748B'},
 header:{paddingHorizontal:18,paddingTop:12,paddingBottom:14,flexDirection:'row',flexWrap:'wrap',rowGap:10,alignItems:'center',justifyContent:'space-between'},headerActions:{flexDirection:'row',alignItems:'center',gap:7,flexShrink:0},bellButton:{width:38,height:38,borderRadius:11,backgroundColor:'#EFF6FF',alignItems:'center',justifyContent:'center',position:'relative'},bellIcon:{fontSize:22,color:'#1D4ED8'},bellBadge:{position:'absolute',right:-4,top:-4,minWidth:17,height:17,borderRadius:9,backgroundColor:'#DC2626',alignItems:'center',justifyContent:'center',paddingHorizontal:3,borderWidth:1,borderColor:'#fff'},bellBadgeText:{fontSize:8,fontWeight:'900',color:'#fff'},notificationOverlay:{flex:1,backgroundColor:'#0F172A66',justifyContent:'flex-end'},notificationSheet:{maxHeight:'78%',backgroundColor:'#fff',borderTopLeftRadius:20,borderTopRightRadius:20,padding:18},notificationSheetHeader:{flexDirection:'row',alignItems:'center',gap:10,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'#E2E8F0'},notificationClose:{paddingHorizontal:9,paddingVertical:7,backgroundColor:'#F1F5F9',borderRadius:8},notificationCloseText:{fontSize:9,fontWeight:'900',color:'#475569'},notificationList:{paddingBottom:24},notificationEmpty:{paddingVertical:35,textAlign:'center',fontSize:12,color:'#64748B'},passwordForm:{paddingTop:16,paddingBottom:10},passwordLabel:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:'#475569',marginBottom:6,marginTop:10},passwordInput:{height:46,borderWidth:1,borderColor:'#CBD5E1',borderRadius:10,paddingHorizontal:12,backgroundColor:'#fff',color:'#0F172A',marginBottom:8},passwordSubmit:{height:46,backgroundColor:'#1D4ED8',borderRadius:10,alignItems:'center',justifyContent:'center',marginTop:14},passwordSubmitText:{fontSize:10,fontWeight:'900',color:'#fff'},reportsLink:{backgroundColor:'#EFF6FF',paddingHorizontal:10,paddingVertical:9,borderRadius:9},reportsLinkText:{fontSize:9,fontWeight:'900',color:'#1D4ED8'},brandRow:{flexDirection:'row',alignItems:'center',gap:10,flexShrink:1},brandMark:{width:39,height:39,borderRadius:12,backgroundColor:'#2563EB',alignItems:'center',justifyContent:'center'},brandLetter:{color:'#fff',fontSize:18,fontWeight:'900'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:'#64748B'},heading:{fontSize:18,fontWeight:'900',color:'#0F172A',marginTop:3},logout:{backgroundColor:'#F1F5F9',paddingHorizontal:9,paddingVertical:9,borderRadius:9,flexShrink:0},logoutText:{fontSize:9,fontWeight:'900',color:'#1D4ED8'},
 tabs:{flexDirection:'row',marginHorizontal:18,backgroundColor:'#F1F5F9',borderRadius:11,padding:4},tab:{flex:1,paddingVertical:10,borderRadius:8,alignItems:'center'},tabActive:{backgroundColor:'#fff',elevation:1},tabText:{fontSize:11,fontWeight:'700',color:'#64748B'},tabTextActive:{color:'#1D4ED8'},
 content:{padding:18,paddingBottom:34},auditItem:{paddingVertical:11,borderTopWidth:1,borderTopColor:'#F1F5F9'},auditTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},auditAction:{fontSize:10,fontWeight:'900',color:'#1E293B'},auditRole:{fontSize:8,fontWeight:'900',color:'#1D4ED8',backgroundColor:'#EFF6FF',paddingHorizontal:7,paddingVertical:4,borderRadius:7,overflow:'hidden'},auditEntity:{fontSize:10,color:'#334155',marginTop:5},auditActor:{fontSize:9,color:'#64748B',marginTop:4},auditMeta:{fontSize:9,color:'#475569',marginTop:3},auditPagination:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingTop:12,borderTopWidth:1,borderTopColor:'#E2E8F0'},auditPageText:{fontSize:9,fontWeight:'700',color:'#64748B'},notificationPanel:{marginHorizontal:18,marginBottom:10,backgroundColor:'#fff',borderWidth:1,borderColor:'#E2E8F0',borderRadius:13,padding:13},notificationHeader:{flexDirection:'row',alignItems:'center',marginBottom:8},notificationTitle:{fontSize:13,fontWeight:'900',color:'#0F172A'},notificationHint:{fontSize:10,color:'#64748B',marginTop:3},notificationAction:{fontSize:8,fontWeight:'900',color:'#1D4ED8'},notificationItem:{paddingVertical:9,borderTopWidth:1,borderTopColor:'#F1F5F9'},notificationUnread:{backgroundColor:'#EFF6FF',paddingHorizontal:7,borderRadius:7},notificationItemTitle:{fontSize:10,fontWeight:'800',color:'#1E293B'},notificationMessage:{fontSize:10,color:'#475569',lineHeight:15,marginTop:3},notificationDate:{fontSize:8,color:'#94A3B8',marginTop:4},welcome:{backgroundColor:'#1D4ED8',borderRadius:16,padding:20,marginBottom:13},welcomeEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.3,color:'#DBEAFE'},welcomeTitle:{fontSize:24,fontWeight:'900',color:'#fff',marginTop:9},welcomeText:{fontSize:11,color:'#DBEAFE',marginTop:5},
 stats:{flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:13},stat:{width:'48%',flexGrow:1,backgroundColor:'#fff',borderRadius:13,padding:15,borderWidth:1,borderColor:'#E2E8F0'},statValue:{fontSize:24,fontWeight:'900',color:'#1D4ED8'},statLabel:{fontSize:10,color:'#64748B',marginTop:4},
 section:{backgroundColor:'#fff',borderRadius:15,padding:16,marginBottom:13,borderWidth:1,borderColor:'#E2E8F0'},sectionTitle:{fontSize:14,fontWeight:'900',color:'#0F172A'},sectionHint:{fontSize:10,color:'#64748B',marginTop:4,marginBottom:13},teamAttendanceCard:{backgroundColor:'#F8FAFC',borderWidth:1,borderColor:'#E2E8F0',borderRadius:12,padding:12,marginTop:10},teamAttendanceHeader:{flexDirection:'row',alignItems:'center',gap:8,paddingBottom:10,borderBottomWidth:1,borderBottomColor:'#E2E8F0'},teamDetailsGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:10},teamDetail:{width:'47%',flexGrow:1,minWidth:110},teamDetailLabel:{fontSize:8,fontWeight:'900',letterSpacing:.5,color:'#64748B'},teamDetailValue:{fontSize:10,fontWeight:'700',color:'#1E293B',marginTop:3},teamVisitList:{marginTop:13},teamVisitHeading:{fontSize:8,fontWeight:'900',letterSpacing:.8,color:'#475569',marginBottom:7},teamVisitCard:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E2E8F0',borderRadius:10,padding:10,marginTop:7},listRow:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderTopWidth:1,borderTopColor:'#F1F5F9',gap:8},rowTitle:{fontSize:11,fontWeight:'800',color:'#1E293B'},rowSub:{fontSize:9,color:'#64748B',marginTop:4},status:{fontSize:9,fontWeight:'900',paddingHorizontal:8,paddingVertical:5,borderRadius:20,overflow:'hidden'},present:{backgroundColor:'#EFF6FF',color:'#1D4ED8'},absent:{backgroundColor:'#F1F5F9',color:'#64748B'},distance:{fontSize:9,color:'#64748B',fontVariant:['tabular-nums']},empty:{fontSize:11,color:'#64748B',textAlign:'center',paddingVertical:20},
 rolePicker:{flexDirection:'row',gap:9,marginBottom:12},roleOption:{flex:1,borderWidth:1,borderColor:'#E2E8F0',borderRadius:11,padding:12,backgroundColor:'#FFFFFF'},roleOptionSelected:{borderColor:'#2563EB',backgroundColor:'#EFF6FF'},roleOptionTitle:{fontSize:11,fontWeight:'900',color:'#334155'},roleOptionTitleSelected:{color:'#1D4ED8'},roleOptionHint:{fontSize:8,lineHeight:13,color:'#64748B',marginTop:5},adminAccountTag:{fontSize:8,fontWeight:'900',color:'#1D4ED8',paddingHorizontal:9,paddingVertical:6,backgroundColor:'#EFF6FF',borderRadius:10,overflow:'hidden'},field:{marginBottom:12},input:{borderWidth:1,borderColor:'#E2E8F0',borderRadius:10,paddingHorizontal:12,paddingVertical:11,fontSize:12,color:'#1E293B',backgroundColor:'#FFFFFF'},twoCol:{flexDirection:'row',gap:10},note:{fontSize:9,lineHeight:14,color:'#64748B',marginBottom:12},primary:{backgroundColor:'#2563EB',paddingVertical:13,borderRadius:10,alignItems:'center',marginTop:3},primaryText:{fontSize:11,fontWeight:'900',color:'#fff'},smallAction:{paddingHorizontal:10,paddingVertical:7,backgroundColor:'#EFF6FF',borderRadius:8},smallActionText:{fontSize:9,fontWeight:'800',color:'#1D4ED8'},footer:{fontSize:9,color:'#94A3B8',textAlign:'center',lineHeight:14,marginTop:6},
 locationBox:{backgroundColor:'#F8FAFC',borderRadius:12,padding:13,borderWidth:1,borderColor:'#E2E8F0',marginBottom:12},locationTitle:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:'#1E293B'},locationHint:{fontSize:10,color:'#64748B',marginTop:5,marginBottom:10},locationButton:{backgroundColor:'#EFF6FF',padding:11,borderRadius:9,alignItems:'center',marginBottom:8},locationButtonText:{fontSize:11,fontWeight:'800',color:'#1D4ED8'},clearLocation:{fontSize:10,color:'#DC2626',fontWeight:'800',marginTop:4},closeMap:{fontSize:10,fontWeight:'900',color:'#1D4ED8',padding:8},profileModal:{flex:1,backgroundColor:'#F8FAFC'},profileContent:{padding:18,paddingBottom:36,gap:12},profileCard:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E2E8F0',borderRadius:14,padding:15},profileName:{color:'#0F172A',fontSize:20,fontWeight:'900',marginBottom:4},profileRole:{color:'#1D4ED8',fontSize:9,fontWeight:'900',letterSpacing:1,marginBottom:14},profileLine:{paddingVertical:9,borderTopWidth:1,borderTopColor:'#F1F5F9'},profileLabel:{fontSize:8,fontWeight:'900',color:'#64748B',letterSpacing:.8},profileValue:{fontSize:11,fontWeight:'700',color:'#1E293B',marginTop:4},profileStats:{flexDirection:'row',gap:9}
});
