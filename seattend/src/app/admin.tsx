import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { api, ManagedUser, Shop, TeamEmployee, UserDetails } from '../lib/api';
import { clearSession, getSession } from '../lib/session';

type Tab = 'overview' | 'people' | 'shops';

const MAP_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;width:100%;margin:0;padding:0}#searchPanel{position:absolute;z-index:1000;top:10px;left:10px;right:10px;background:#fff;padding:10px;border-radius:12px;box-shadow:0 2px 10px #0003;font:14px Arial}#searchRow{display:flex;gap:6px}#placeQuery{min-width:0;flex:1;border:1px solid #CBD5E1;border-radius:8px;padding:11px;font-size:14px}#searchBtn{border:0;border-radius:8px;background:#2563EB;color:#fff;padding:0 14px;font-weight:bold}#hint{font-size:11px;color:#64748B;margin-top:7px}#results{max-height:155px;overflow:auto;margin-top:5px}#results button{display:block;width:100%;text-align:left;background:white;border:0;border-top:1px solid #E2E8F0;padding:10px 5px;font-size:12px;color:#1E293B}</style></head><body><div id="map"></div><div id="searchPanel"><div id="searchRow"><input id="placeQuery" placeholder="Search shop, address or landmark" autocomplete="off"><button id="searchBtn" onclick="searchPlaces()">SEARCH</button></div><div id="hint">Search for a place, select a result, then fine-tune the pin by tapping the map.</div><div id="results"></div></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const map=L.map('map').setView([29.8543,77.8880],13);setTimeout(()=>map.invalidateSize(),350);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);let marker=null;function choosePoint(lat,lon,label){if(marker)map.removeLayer(marker);marker=L.marker([lat,lon]).addTo(map);map.setView([lat,lon],18);document.getElementById('hint').textContent=label||'Pin selected. Tap the exact shop entrance to adjust it.';window.ReactNativeWebView.postMessage(JSON.stringify({latitude:lat,longitude:lon}));}map.on('click',function(e){choosePoint(e.latlng.lat,e.latlng.lng,'Pin selected. Tap again to adjust the shop entrance location.');});window.addEventListener('resize',()=>map.invalidateSize());async function searchPlaces(){const q=document.getElementById('placeQuery').value.trim();const results=document.getElementById('results');if(!q){document.getElementById('hint').textContent='Enter a shop name, address or nearby landmark.';return;}results.innerHTML='';document.getElementById('hint').textContent='Searching places…';try{const response=await fetch('https://photon.komoot.io/api/?limit=6&q='+encodeURIComponent(q));if(!response.ok)throw new Error('Search service unavailable');const data=await response.json();if(!data.features||!data.features.length){document.getElementById('hint').textContent='No results found. Try a fuller address or nearby landmark.';return;}document.getElementById('hint').textContent='Select the correct result, then adjust the pin to the shop entrance.';data.features.forEach(feature=>{const p=feature.properties||{};const label=[p.name,p.street,p.city||p.locality,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ')||'Unnamed place';const button=document.createElement('button');button.textContent=label;button.onclick=()=>{const coords=feature.geometry.coordinates;choosePoint(coords[1],coords[0],label);results.innerHTML='';};results.appendChild(button);});}catch(e){document.getElementById('hint').textContent='Could not search right now. Check internet and try again, or tap the map manually.';}}document.getElementById('placeQuery').addEventListener('keydown',e=>{if(e.key==='Enter')searchPlaces();});</script></body></html>`;

function validCoordinates(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function coordinatesFromMapLink(raw: string): { latitude: number; longitude: number } | null {
  const text = raw.trim().replace(/&amp;/g, '&');
  if (!text) return null;
  const patterns: RegExp[] = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /[?&](?:q|query|ll|center|destination)=(-?\d+(?:\.\d+)?)(?:%2C|,)(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const latitude = Number(match[1]), longitude = Number(match[2]);
      if (validCoordinates(latitude, longitude)) return { latitude, longitude };
    }
  }
  try {
    const url = new URL(text);
    for (const key of ['q', 'query', 'll', 'center', 'destination']) {
      const value = url.searchParams.get(key);
      const match = value?.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
      if (match) {
        const latitude = Number(match[1]), longitude = Number(match[2]);
        if (validCoordinates(latitude, longitude)) return { latitude, longitude };
      }
    }
  } catch {}
  return null;
}

export default function AdminScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [adminName, setAdminName] = useState('Administrator');
  const [adminId, setAdminId] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [team, setTeam] = useState<TeamEmployee[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const mapWebView = useRef<WebView | null>(null);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapPin, setMapPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapsLink, setMapsLink] = useState('');
  const [shopLocation, setShopLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', phone: '', password: '', role: 'employee' as 'admin' | 'employee' });
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [profileVisible, setProfileVisible] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [shopForm, setShopForm] = useState({ name: '', address: '', pinCode: '', district: '', state: 'Uttarakhand', mobileNumber: '' });
  const [editingShopId, setEditingShopId] = useState<string | null>(null);

  const load = useCallback(async (activeToken: string) => {
    const [userResult, shopResult, teamResult] = await Promise.all([
      api.users(activeToken), api.shops(activeToken), api.teamToday(activeToken)
    ]);
    setUsers(userResult.users);
    setShops(shopResult.shops);
    setTeam(teamResult.employees);
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

  const archiveAccount = (person: ManagedUser) => {
    if (!token) return;
    if ((person._id || person.id) === adminId) {
      Alert.alert('Current admin account', 'You cannot remove the admin account you are currently using.');
      return;
    }
    Alert.alert(
      'Archive account?',
      'This account will lose sign-in access and disappear from the active account directory. Existing attendance and shop visit history will be retained for company records.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive account', style: 'destructive', onPress: async () => {
          setSaving(true);
          try {
            await api.archiveUser(token, person._id || person.id || '');
            if (selectedUser?._id === person._id) {
              setProfileVisible(false);
              setSelectedUser(null);
            }
            await load(token);
            Alert.alert('Account archived', 'Sign-in access has been removed. Historical attendance has been retained.');
          } catch (error) { Alert.alert('Could not archive account', error instanceof Error ? error.message : 'Please try again.'); }
          finally { setSaving(false); }
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
      setShopLocation({ latitude: reading.latitude, longitude: reading.longitude });
      Alert.alert('Location captured', 'Accuracy: about ' + Math.round(reading.accuracy) + 'm. Confirm you are standing at the shop entrance.');
    } catch (error) { Alert.alert('Could not get accurate GPS', error instanceof Error ? error.message : 'Please try again.'); }
  };

  const openMapPicker = async () => {
    setMapPin(null);
    if (shopLocation) setMapCenter(shopLocation);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted && await Location.hasServicesEnabledAsync()) {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: true });
        setMapCenter(shopLocation || { latitude: position.coords.latitude, longitude: position.coords.longitude });
      } else setMapCenter(shopLocation);
    } catch { setMapCenter(shopLocation); }
    setMapVisible(true);
  };

  const onMapLoaded = () => {
    if (mapCenter) mapWebView.current?.injectJavaScript('map.setView([' + mapCenter.latitude + ',' + mapCenter.longitude + '],17); true;');
  };

  const acceptMapPin = () => {
    if (!mapPin) { Alert.alert('Select a point', 'Tap the map at the shop entrance to place a pin.'); return; }
    setShopLocation(mapPin);
    setMapVisible(false);
    Alert.alert('Location selected', 'Map pin saved. Please confirm it is exactly at the shop entrance.');
  };

  const useMapsLink = async () => {
    const input = mapsLink.trim();
    if (!input) { Alert.alert('Paste a map link', 'Paste the Google Maps Share link first.'); return; }
    let coordinates = coordinatesFromMapLink(input);
    if (!coordinates && /^https?:\/\//i.test(input)) {
      try {
        const response = await fetch(input, { method: 'GET' });
        coordinates = coordinatesFromMapLink(response.url || input);
      } catch {}
    }
    if (!coordinates) {
      Alert.alert('Could not extract shop pin', 'This Maps link did not expose coordinates. In Google Maps, open the exact shop place, tap Share, and copy the full link. If a shortened link cannot be resolved, use Search on Map and select the shop address, then fine-tune the pin.');
      return;
    }
    setShopLocation(coordinates);
    Alert.alert('Location extracted', 'A map coordinate was found. Please verify it is the exact shop entrance before registering.');
  };

  const resetShopForm = () => {
    setShopForm({ name: '', address: '', pinCode: '', district: '', state: 'Uttarakhand', mobileNumber: '' });
    setShopLocation(null);
    setMapsLink('');
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
    setShopLocation(shop.location || null);
    setMapsLink('');
    setTab('shops');
  };

  const createShop = async () => {
    if (!token) return;
    if (!shopForm.name.trim() || !shopForm.address.trim() || !/^\\d{6}$/.test(shopForm.pinCode.trim()) || !shopForm.district.trim() || !shopForm.state.trim() || !/^\\+?\\d{7,15}$/.test(shopForm.mobileNumber.trim().replace(/[\\s().-]/g, ''))) {
      Alert.alert('Missing shop details', 'Enter shop name, full address, valid 6-digit PIN code, district, state and mobile number.'); return;
    }
    if (!shopLocation) {
      Alert.alert('Shop location required', 'Choose one of the three location options before saving this shop.'); return;
    }
    setSaving(true);
    try {
      const payload = {
        name: shopForm.name.trim(), address: shopForm.address.trim(),
        pinCode: shopForm.pinCode.trim(), district: shopForm.district.trim(),
        state: shopForm.state.trim(), mobileNumber: shopForm.mobileNumber.trim(),
        latitude: shopLocation.latitude, longitude: shopLocation.longitude
      };
      if (editingShopId) {
        await api.updateShop(token, editingShopId, payload);
        Alert.alert('Shop updated', 'Shop details and its trusted GPS coordinates have been updated.');
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
      <View style={styles.headerActions}><Pressable onPress={() => router.push('/reports')} style={styles.reportsLink}><Text style={styles.reportsLinkText}>REPORTS</Text></Pressable><Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>LOG OUT</Text></Pressable></View>
    </View>
    <View style={styles.tabs}>
      {(['overview','people','shops'] as Tab[]).map(item => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item === 'overview' ? 'Overview' : item === 'people' ? 'People' : 'Shops'}</Text></Pressable>)}
    </View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>}>
      {tab === 'overview' && <>
        <View style={styles.welcome}><Text style={styles.welcomeEyebrow}>ADMINISTRATION</Text><Text style={styles.welcomeTitle}>Hello, {adminName.split(' ')[0]}.</Text><Text style={styles.welcomeText}>Manage your field team and shop attendance.</Text></View>
        <View style={styles.stats}>
          <Stat label="Employees" value={employees.filter(x=>x.active).length}/><Stat label="Inactive staff" value={employees.filter(x=>!x.active).length}/>
          <Stat label="Active shops" value={shops.filter(shop=>shop.active !== false).length}/><Stat label="Today's visits" value={visits}/>
        </View>
        <Section title="Today's team attendance" hint="Attendance is marked by the first verified shop visit.">
          {team.length === 0 ? <Empty text="No employees have been created yet."/> : team.map(person => <View key={person._id} style={styles.listRow}><View style={{flex:1}}><Pressable disabled={saving} onPress={()=>viewUserDetails(person)}><Text style={styles.rowTitle}>{person.name}</Text></Pressable><Text style={styles.rowSub}>{person.employeeId} · {person.visitCount} visits</Text></View><Text style={[styles.status, person.attendance === 'Present' ? styles.present : styles.absent]}>{person.attendance}</Text></View>)}
        </Section>
        <Section title="Recent verified visits" hint="Today's employee visit totals.">
          {team.flatMap(person => person.visits.map(visit => ({...visit, employeeName: person.name}))).length === 0 ? <Empty text="No verified visits recorded today."/> : team.flatMap(person => person.visits.map(visit => ({...visit, employeeName: person.name}))).map(visit => <View key={visit._id} style={styles.listRow}><View style={{flex:1}}><Text style={styles.rowTitle}>{visit.shop?.name || 'Shop'}</Text><Text style={styles.rowSub}>{visit.employeeName} · {new Date(visit.checkedInAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</Text></View><Text style={styles.distance}>{Math.round(visit.distanceMeters)} m</Text></View>)}
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
        <Section title="Account directory" hint="View account profiles, deactivate employees or archive accounts.">
          {users.length===0 ? <Empty text="No accounts found."/> : users.map(person=><View key={person._id} style={styles.listRow}>
            <View style={{flex:1}}>
              <Text style={styles.rowTitle}>{person.name}</Text>
              <Text style={styles.rowSub}>{person.employeeId} · {person.role === 'admin' ? 'Admin' : 'Employee'} · {person.active ? 'Active' : 'Inactive'}</Text>
            </View>
            <Pressable disabled={saving} onPress={()=>viewUserDetails(person)} style={styles.smallAction}><Text style={styles.smallActionText}>View profile</Text></Pressable>
            {person.role === 'employee'
              ? <Pressable disabled={saving} onPress={()=>toggleAccount(person)} style={styles.smallAction}><Text style={styles.smallActionText}>{person.active?'Deactivate':'Reactivate'}</Text></Pressable>
              : <Text style={styles.adminAccountTag}>ADMIN</Text>}
            <Pressable disabled={saving || (person._id || person.id) === adminId} onPress={archiveAccount.bind(null, person)} style={styles.smallAction}><Text style={styles.smallActionText}>Archive</Text></Pressable>
          </View>)}
        </Section>
      </>}
      {tab === 'shops' && <>
        <Section title={editingShopId ? 'Edit shop' : 'Register a shop'} hint={editingShopId ? 'Update the shop address, contact details or trusted GPS pin.' : 'Register a shop with complete address and verified GPS coordinates.'}>
          <Field label="SHOP NAME" value={shopForm.name} onChange={v=>setShopForm({...shopForm,name:v})} placeholder="Shop name"/>
          <Field label="FULL ADDRESS" value={shopForm.address} onChange={v=>setShopForm({...shopForm,address:v})} placeholder="House / building, street and locality"/>
          <View style={styles.twoCol}>
            <View style={{flex:1}}><Field label="PIN CODE" value={shopForm.pinCode} onChange={v=>setShopForm({...shopForm,pinCode:v.replace(/\\D/g,'').slice(0,6)})} placeholder="247667" keyboardType="number-pad"/></View>
            <View style={{flex:1}}><Field label="DISTRICT" value={shopForm.district} onChange={v=>setShopForm({...shopForm,district:v})} placeholder="Haridwar"/></View>
          </View>
          <Field label="STATE" value={shopForm.state} onChange={v=>setShopForm({...shopForm,state:v})} placeholder="Uttarakhand"/>
          <Field label="SHOP MOBILE NUMBER" value={shopForm.mobileNumber} onChange={v=>setShopForm({...shopForm,mobileNumber:v})} placeholder="+91 9876543210" keyboardType="phone-pad"/>
          <View style={styles.locationBox}>
            <Text style={styles.locationTitle}>SHOP GPS LOCATION</Text>
            <Text style={styles.locationHint}>{shopLocation ? `Selected: ${shopLocation.latitude.toFixed(5)}, ${shopLocation.longitude.toFixed(5)}` : 'No location selected yet'}</Text>
            <Pressable onPress={openMapPicker} style={styles.locationButton}><Text style={styles.locationButtonText}>1. Select on map</Text></Pressable>
            <Pressable onPress={useCurrentLocation} style={styles.locationButton}><Text style={styles.locationButtonText}>2. Use current location</Text></Pressable>
            <Text style={styles.fieldLabel}>3. PASTE GOOGLE MAPS LINK</Text>
            <TextInput value={mapsLink} onChangeText={setMapsLink} placeholder="https://maps.app.goo.gl/..." placeholderTextColor="#94A3B8" autoCapitalize="none" autoCorrect={false} style={styles.input}/>
            <Pressable onPress={useMapsLink} style={styles.linkButton}><Text style={styles.linkButtonText}>Read location from link</Text></Pressable>
            {shopLocation && <Pressable onPress={()=>{setShopLocation(null);setMapsLink('');}}><Text style={styles.clearLocation}>Clear selected location</Text></Pressable>}
          </View>
          <Text style={styles.note}>Coordinates are captured automatically and sent to the server. Check-ins are verified against the registered shop pin within 50 metres.</Text>
          <Primary label={saving ? (editingShopId ? 'Saving…' : 'Registering…') : (editingShopId ? 'Save shop changes' : 'Register shop')} onPress={createShop} disabled={saving}/>
          {editingShopId && <Pressable disabled={saving} onPress={resetShopForm} style={styles.cancelEdit}><Text style={styles.cancelEditText}>Cancel editing</Text></Pressable>}
        </Section>
        <Section title="Shop directory" hint="Review registered shops, approve employee submissions, edit details or remove shops.">
          {shops.length===0 ? <Empty text="No shops registered yet."/> : shops.map(shop=><View key={shop._id} style={styles.shopAdminCard}>
            <View style={styles.listRow}>
              <View style={{flex:1}}>
                <Text style={styles.rowTitle}>{shop.name}</Text>
                <Text style={styles.rowSub}>{shop.address} · {shop.district}, {shop.state} - {shop.pinCode}</Text>
                <Text style={styles.rowSub}>Mobile: {shop.mobileNumber} · Submitted by: {shop.createdBy?.name || 'Legacy / Admin'}</Text>
                <Text style={styles.shopCoordinate}>{shop.location ? shop.location.latitude.toFixed(5) + ', ' + shop.location.longitude.toFixed(5) : 'GPS missing'}</Text>
              </View>
              <Text style={[styles.shopState, shop.verificationStatus === 'VERIFIED' ? styles.shopVerified : shop.verificationStatus === 'REJECTED' ? styles.shopRejected : styles.shopPending]}>{shop.verificationStatus || 'VERIFIED'}</Text>
            </View>
            <View style={styles.shopActions}>
              {shop.verificationStatus !== 'VERIFIED' && <Pressable disabled={saving} onPress={async()=>{if(!token)return;setSaving(true);try{await api.updateShop(token,shop._id,{verificationStatus:'VERIFIED'});await load(token);}catch(error){Alert.alert('Approval failed',error instanceof Error?error.message:'Please try again.');}finally{setSaving(false);}}} style={styles.smallAction}><Text style={styles.smallActionText}>Approve</Text></Pressable>}
              {shop.verificationStatus !== 'REJECTED' && <Pressable disabled={saving} onPress={()=>Alert.alert('Reject shop?','The employee will need to correct the submitted shop details before resubmitting.',[{text:'Cancel',style:'cancel'},{text:'Reject',style:'destructive',onPress:async()=>{if(!token)return;setSaving(true);try{await api.updateShop(token,shop._id,{verificationStatus:'REJECTED',rejectionReason:'Details require correction'});await load(token);}catch(error){Alert.alert('Rejection failed',error instanceof Error?error.message:'Please try again.');}finally{setSaving(false);}}}])}
              <Pressable disabled={saving} onPress={()=>startEditShop(shop)} style={styles.smallAction}><Text style={styles.smallActionText}>Edit</Text></Pressable>
              <Pressable disabled={saving} onPress={()=>toggleShop(shop)} style={[styles.smallAction,shop.active !== false && styles.deactivateAction]}><Text style={[styles.smallActionText,shop.active !== false && styles.deactivateText]}>{shop.active === false ? 'Reactivate' : 'Deactivate'}</Text></Pressable>
              <Pressable disabled={saving} onPress={()=>Alert.alert('Delete shop?','This permanently removes the shop from the directory. Existing visit history is retained.',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{if(!token)return;setSaving(true);try{await api.deleteShop(token,shop._id);await load(token);}catch(error){Alert.alert('Delete failed',error instanceof Error?error.message:'Please try again.');}finally{setSaving(false);}}}])} style={styles.smallAction}><Text style={[styles.smallActionText,styles.deactivateText]}>Delete</Text></Pressable>
            </View>
          </View>)}
        </Section>
      </>}
      <Text style={styles.footer}>Admin access only. Employee location is requested only when they initiate a shop check-in.</Text>
    </ScrollView>
    <Modal visible={mapVisible} animationType="slide" onRequestClose={()=>setMapVisible(false)}>
      <SafeAreaView style={styles.mapModal}>
        <View style={styles.mapHeader}><View style={{flex:1}}><Text style={styles.sectionTitle}>Select shop on map</Text><Text style={styles.sectionHint}>Tap the exact shop entrance to place a pin.</Text></View><Pressable onPress={()=>setMapVisible(false)}><Text style={styles.closeMap}>CLOSE</Text></Pressable></View>
        <WebView ref={mapWebView} originWhitelist={['*']} source={{html:MAP_HTML}} javaScriptEnabled domStorageEnabled onLoadEnd={onMapLoaded} onError={()=>Alert.alert('Map loading failed','Check your internet connection and try again.')} onMessage={(event:WebViewMessageEvent)=>{try{const point=JSON.parse(event.nativeEvent.data);if(Number.isFinite(point.latitude)&&Number.isFinite(point.longitude))setMapPin(point);}catch{}}}/>
        <View style={styles.mapFooter}><Text style={styles.mapSelected}>{mapPin ? `Pin: ${mapPin.latitude.toFixed(5)}, ${mapPin.longitude.toFixed(5)}` : 'Tap the map to choose a location'}</Text><Primary label="Use this map location" onPress={acceptMapPin} disabled={!mapPin}/></View>
      </SafeAreaView>
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
                <Text style={styles.rowTitle}>{visit.shop?.name || 'Registered shop'}</Text>
                <Text style={styles.rowSub}>{visit.shop?.shopCode || '—'} · {new Date(visit.checkedInAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</Text>
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
function Field({label,value,onChange,placeholder,secureTextEntry,keyboardType,autoCapitalize}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string;secureTextEntry?:boolean;keyboardType?:'default'|'email-address'|'decimal-pad'|'phone-pad';autoCapitalize?:'none'|'sentences'|'words'|'characters'}) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#94A3B8" secureTextEntry={secureTextEntry} keyboardType={keyboardType||'default'} autoCapitalize={autoCapitalize||'none'} autoCorrect={false} style={styles.input}/></View>; }
function Primary({label,onPress,disabled}:{label:string;onPress:()=>void;disabled:boolean}) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.primary,disabled&&{opacity:.6}]}><Text style={styles.primaryText}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
 safe:{flex:1,backgroundColor:'#F8FAFC'},center:{flex:1,alignItems:'center',justifyContent:'center',gap:10,backgroundColor:'#F8FAFC'},muted:{fontSize:12,color:'#64748B'},
 header:{paddingHorizontal:18,paddingTop:12,paddingBottom:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},headerActions:{flexDirection:'row',alignItems:'center',gap:7},reportsLink:{backgroundColor:'#EFF6FF',paddingHorizontal:10,paddingVertical:9,borderRadius:9},reportsLinkText:{fontSize:9,fontWeight:'900',color:'#1D4ED8'},brandRow:{flexDirection:'row',alignItems:'center',gap:10},brandMark:{width:39,height:39,borderRadius:12,backgroundColor:'#2563EB',alignItems:'center',justifyContent:'center'},brandLetter:{color:'#fff',fontSize:18,fontWeight:'900'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:'#64748B'},heading:{fontSize:18,fontWeight:'900',color:'#0F172A',marginTop:3},logout:{backgroundColor:'#F1F5F9',paddingHorizontal:11,paddingVertical:9,borderRadius:9},logoutText:{fontSize:9,fontWeight:'900',color:'#1D4ED8'},
 tabs:{flexDirection:'row',marginHorizontal:18,backgroundColor:'#F1F5F9',borderRadius:11,padding:4},tab:{flex:1,paddingVertical:10,borderRadius:8,alignItems:'center'},tabActive:{backgroundColor:'#fff',elevation:1},tabText:{fontSize:11,fontWeight:'700',color:'#64748B'},tabTextActive:{color:'#1D4ED8'},
 content:{padding:18,paddingBottom:34},welcome:{backgroundColor:'#1D4ED8',borderRadius:16,padding:20,marginBottom:13},welcomeEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.3,color:'#DBEAFE'},welcomeTitle:{fontSize:24,fontWeight:'900',color:'#fff',marginTop:9},welcomeText:{fontSize:11,color:'#DBEAFE',marginTop:5},
 stats:{flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:13},stat:{width:'48%',flexGrow:1,backgroundColor:'#fff',borderRadius:13,padding:15,borderWidth:1,borderColor:'#E2E8F0'},statValue:{fontSize:24,fontWeight:'900',color:'#1D4ED8'},statLabel:{fontSize:10,color:'#64748B',marginTop:4},
 section:{backgroundColor:'#fff',borderRadius:15,padding:16,marginBottom:13,borderWidth:1,borderColor:'#E2E8F0'},sectionTitle:{fontSize:14,fontWeight:'900',color:'#0F172A'},sectionHint:{fontSize:10,color:'#64748B',marginTop:4,marginBottom:13},listRow:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderTopWidth:1,borderTopColor:'#F1F5F9',gap:8},rowTitle:{fontSize:11,fontWeight:'800',color:'#1E293B'},rowSub:{fontSize:9,color:'#64748B',marginTop:4},status:{fontSize:9,fontWeight:'900',paddingHorizontal:8,paddingVertical:5,borderRadius:20,overflow:'hidden'},present:{backgroundColor:'#EFF6FF',color:'#1D4ED8'},absent:{backgroundColor:'#F1F5F9',color:'#64748B'},distance:{fontSize:9,color:'#64748B',fontVariant:['tabular-nums']},empty:{fontSize:11,color:'#64748B',textAlign:'center',paddingVertical:20},
 rolePicker:{flexDirection:'row',gap:9,marginBottom:12},roleOption:{flex:1,borderWidth:1,borderColor:'#E2E8F0',borderRadius:11,padding:12,backgroundColor:'#FFFFFF'},roleOptionSelected:{borderColor:'#2563EB',backgroundColor:'#EFF6FF'},roleOptionTitle:{fontSize:11,fontWeight:'900',color:'#334155'},roleOptionTitleSelected:{color:'#1D4ED8'},roleOptionHint:{fontSize:8,lineHeight:13,color:'#64748B',marginTop:5},adminAccountTag:{fontSize:8,fontWeight:'900',color:'#1D4ED8',paddingHorizontal:9,paddingVertical:6,backgroundColor:'#EFF6FF',borderRadius:10,overflow:'hidden'},field:{marginBottom:12},fieldLabel:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:'#475569',marginBottom:7},input:{borderWidth:1,borderColor:'#E2E8F0',borderRadius:10,paddingHorizontal:12,paddingVertical:11,fontSize:12,color:'#1E293B',backgroundColor:'#FFFFFF'},twoCol:{flexDirection:'row',gap:10},note:{fontSize:9,lineHeight:14,color:'#64748B',marginBottom:12},primary:{backgroundColor:'#2563EB',paddingVertical:13,borderRadius:10,alignItems:'center',marginTop:3},primaryText:{fontSize:11,fontWeight:'900',color:'#fff'},smallAction:{paddingHorizontal:10,paddingVertical:7,backgroundColor:'#EFF6FF',borderRadius:8},smallActionText:{fontSize:9,fontWeight:'800',color:'#1D4ED8'},footer:{fontSize:9,color:'#94A3B8',textAlign:'center',lineHeight:14,marginTop:6},
 locationBox:{backgroundColor:'#F8FAFC',borderRadius:12,padding:13,borderWidth:1,borderColor:'#E2E8F0',marginBottom:12},locationTitle:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:'#1E293B'},locationHint:{fontSize:10,color:'#64748B',marginTop:5,marginBottom:10},locationButton:{backgroundColor:'#EFF6FF',padding:11,borderRadius:9,alignItems:'center',marginBottom:8},locationButtonText:{fontSize:11,fontWeight:'800',color:'#1D4ED8'},linkButton:{alignSelf:'flex-start',paddingVertical:10},linkButtonText:{fontSize:10,fontWeight:'900',color:'#1D4ED8'},clearLocation:{fontSize:10,color:'#DC2626',fontWeight:'800',marginTop:4},mapModal:{flex:1,backgroundColor:'#F8FAFC'},mapHeader:{paddingHorizontal:16,paddingVertical:13,flexDirection:'row',alignItems:'center'},closeMap:{fontSize:10,fontWeight:'900',color:'#1D4ED8',padding:8},mapFooter:{padding:14,backgroundColor:'#fff'},mapSelected:{fontSize:10,color:'#64748B',marginBottom:9},profileModal:{flex:1,backgroundColor:'#F8FAFC'},profileContent:{padding:18,paddingBottom:36,gap:12},profileCard:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E2E8F0',borderRadius:14,padding:15},profileName:{color:'#0F172A',fontSize:20,fontWeight:'900',marginBottom:4},profileRole:{color:'#1D4ED8',fontSize:9,fontWeight:'900',letterSpacing:1,marginBottom:14},profileLine:{paddingVertical:9,borderTopWidth:1,borderTopColor:'#F1F5F9'},profileLabel:{fontSize:8,fontWeight:'900',color:'#64748B',letterSpacing:.8},profileValue:{fontSize:11,fontWeight:'700',color:'#1E293B',marginTop:4},profileStats:{flexDirection:'row',gap:9}
});
