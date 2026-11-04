import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { api, ManagedUser, Shop, TeamEmployee } from '../lib/api';
import { clearSession, getSession } from '../lib/session';

type Tab = 'overview' | 'people' | 'shops';

const MAP_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;width:100%;margin:0;padding:0}#searchPanel{position:absolute;z-index:1000;top:10px;left:10px;right:10px;background:#fff;padding:10px;border-radius:12px;box-shadow:0 2px 10px #0003;font:14px Arial}#searchRow{display:flex;gap:6px}#placeQuery{min-width:0;flex:1;border:1px solid #ccd5ce;border-radius:8px;padding:11px;font-size:14px}#searchBtn{border:0;border-radius:8px;background:#176344;color:#fff;padding:0 14px;font-weight:bold}#hint{font-size:11px;color:#64756a;margin-top:7px}#results{max-height:155px;overflow:auto;margin-top:5px}#results button{display:block;width:100%;text-align:left;background:white;border:0;border-top:1px solid #edf0ed;padding:10px 5px;font-size:12px;color:#203b2d}</style></head><body><div id="map"></div><div id="searchPanel"><div id="searchRow"><input id="placeQuery" placeholder="Search shop, address or landmark" autocomplete="off"><button id="searchBtn" onclick="searchPlaces()">SEARCH</button></div><div id="hint">Search for a place, select a result, then fine-tune the pin by tapping the map.</div><div id="results"></div></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const map=L.map('map').setView([22.5,78.9],5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);let marker=null;function choosePoint(lat,lon,label){if(marker)map.removeLayer(marker);marker=L.marker([lat,lon]).addTo(map);map.setView([lat,lon],18);document.getElementById('hint').textContent=label||'Pin selected. Tap the exact shop entrance to adjust it.';window.ReactNativeWebView.postMessage(JSON.stringify({latitude:lat,longitude:lon}));}map.on('click',function(e){choosePoint(e.latlng.lat,e.latlng.lng,'Pin selected. Tap again to adjust the shop entrance location.');});async function searchPlaces(){const q=document.getElementById('placeQuery').value.trim();const results=document.getElementById('results');if(!q){document.getElementById('hint').textContent='Enter a shop name, address or nearby landmark.';return;}results.innerHTML='';document.getElementById('hint').textContent='Searching places…';try{const response=await fetch('https://photon.komoot.io/api/?limit=6&q='+encodeURIComponent(q));if(!response.ok)throw new Error('Search service unavailable');const data=await response.json();if(!data.features||!data.features.length){document.getElementById('hint').textContent='No results found. Try a fuller address or nearby landmark.';return;}document.getElementById('hint').textContent='Select the correct result, then adjust the pin to the shop entrance.';data.features.forEach(feature=>{const p=feature.properties||{};const label=[p.name,p.street,p.city||p.locality,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ')||'Unnamed place';const button=document.createElement('button');button.textContent=label;button.onclick=()=>{const coords=feature.geometry.coordinates;choosePoint(coords[1],coords[0],label);results.innerHTML='';};results.appendChild(button);});}catch(e){document.getElementById('hint').textContent='Could not search right now. Check internet and try again, or tap the map manually.';}}document.getElementById('placeQuery').addEventListener('keydown',e=>{if(e.key==='Enter')searchPlaces();});</script></body></html>`;

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
  const [userForm, setUserForm] = useState({ name: '', employeeId: '', email: '', password: '', role: 'employee' as 'employee' | 'manager', managerId: '' });
  const [shopForm, setShopForm] = useState({ name: '', shopCode: '', address: '', area: '' });

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
    if (!userForm.name.trim() || !userForm.employeeId.trim() || !userForm.password) {
      Alert.alert('Missing details', 'Name, employee ID and password are required.'); return;
    }
    setSaving(true);
    try {
      await api.createUser(token, {
        name: userForm.name.trim(), employeeId: userForm.employeeId.trim(),
        ...(userForm.email.trim() ? { email: userForm.email.trim() } : {}),
        password: userForm.password, role: userForm.role,
        ...(userForm.role === 'employee' && userForm.managerId ? { managerId: userForm.managerId } : {})
      });
      Alert.alert('Account created', `${userForm.role} account ${userForm.employeeId} created.`);
      setUserForm({ name: '', employeeId: '', email: '', password: '', role: 'employee', managerId: '' });
      await load(token);
    } catch (error) { Alert.alert('Could not create account', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
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
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted && await Location.hasServicesEnabledAsync()) {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: true });
        setMapCenter({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      } else setMapCenter(null);
    } catch { setMapCenter(null); }
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

  const createShop = async () => {
    if (!token) return;
    if (!shopForm.name.trim() || !shopForm.shopCode.trim()) {
      Alert.alert('Missing shop details', 'Enter a shop name and unique shop code.'); return;
    }
    if (!shopLocation) {
      Alert.alert('Shop location required', 'Choose one of the three location options before registering this shop.'); return;
    }
    setSaving(true);
    try {
      await api.createShop(token, {
        name: shopForm.name.trim(), shopCode: shopForm.shopCode.trim(),
        address: shopForm.address.trim(), area: shopForm.area.trim(),
        latitude: shopLocation.latitude, longitude: shopLocation.longitude
      });
      Alert.alert('Shop registered', 'The shop and its verified reference coordinates are saved.');
      setShopForm({ name: '', shopCode: '', address: '', area: '' });
      setShopLocation(null);
      setMapsLink('');
      await load(token);
    } catch (error) { Alert.alert('Could not register shop', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
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

  if (busy) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#176344"/><Text style={styles.muted}>Loading admin workspace…</Text></SafeAreaView>;

  const employees = users.filter(u => u.role === 'employee');
  const managers = users.filter(u => u.role === 'manager');
  const visits = team.reduce((sum, employee) => sum + employee.visitCount, 0);

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark"/>
    <View style={styles.header}>
      <View style={styles.brandRow}><View style={styles.brandMark}><Text style={styles.brandLetter}>S</Text></View><View><Text style={styles.kicker}>SAMRIDHI ENTERPRISES</Text><Text style={styles.heading}>Admin workspace</Text></View></View>
      <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>LOG OUT</Text></Pressable>
    </View>
    <View style={styles.tabs}>
      {(['overview','people','shops'] as Tab[]).map(item => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item === 'overview' ? 'Overview' : item === 'people' ? 'People' : 'Shops'}</Text></Pressable>)}
    </View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>}>
      {tab === 'overview' && <>
        <View style={styles.welcome}><Text style={styles.welcomeEyebrow}>ADMINISTRATION</Text><Text style={styles.welcomeTitle}>Hello, {adminName.split(' ')[0]}.</Text><Text style={styles.welcomeText}>Manage your field team and shop attendance.</Text></View>
        <View style={styles.stats}>
          <Stat label="Employees" value={employees.filter(x=>x.active).length}/><Stat label="Managers" value={managers.filter(x=>x.active).length}/>
          <Stat label="Shops" value={shops.length}/><Stat label="Today's visits" value={visits}/>
        </View>
        <Section title="Today's team attendance" hint="Attendance is marked by the first verified shop visit.">
          {team.length === 0 ? <Empty text="No employees have been created yet."/> : team.map(person => <View key={person._id} style={styles.listRow}><View style={{flex:1}}><Text style={styles.rowTitle}>{person.name}</Text><Text style={styles.rowSub}>{person.employeeId} · {person.visitCount} visits</Text></View><Text style={[styles.status, person.attendance === 'Present' ? styles.present : styles.absent]}>{person.attendance}</Text></View>)}
        </Section>
        <Section title="Recent verified visits" hint="Today's employee visit totals.">
          {team.flatMap(person => person.visits.map(visit => ({...visit, employeeName: person.name}))).length === 0 ? <Empty text="No verified visits recorded today."/> : team.flatMap(person => person.visits.map(visit => ({...visit, employeeName: person.name}))).map(visit => <View key={visit._id} style={styles.listRow}><View style={{flex:1}}><Text style={styles.rowTitle}>{visit.shop?.name || 'Shop'}</Text><Text style={styles.rowSub}>{visit.employeeName} · {new Date(visit.checkedInAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</Text></View><Text style={styles.distance}>{Math.round(visit.distanceMeters)} m</Text></View>)}
        </Section>
      </>}
      {tab === 'people' && <>
        <Section title="Create an account" hint="Add a manager or a field employee.">
          <Field label="FULL NAME" value={userForm.name} onChange={v=>setUserForm({...userForm,name:v})} placeholder="Full name"/>
          <Field label="EMPLOYEE ID" value={userForm.employeeId} onChange={v=>setUserForm({...userForm,employeeId:v})} placeholder="e.g. EMP001" autoCapitalize="characters"/>
          <Field label="EMAIL (OPTIONAL)" value={userForm.email} onChange={v=>setUserForm({...userForm,email:v})} placeholder="name@example.com" keyboardType="email-address"/>
          <Field label="TEMPORARY PASSWORD" value={userForm.password} onChange={v=>setUserForm({...userForm,password:v})} placeholder="Set initial password" secureTextEntry/>
          <Text style={styles.fieldLabel}>ROLE</Text><View style={styles.roleRow}><Choice label="Employee" selected={userForm.role==='employee'} onPress={()=>setUserForm({...userForm,role:'employee',managerId:''})}/><Choice label="Manager" selected={userForm.role==='manager'} onPress={()=>setUserForm({...userForm,role:'manager',managerId:''})}/></View>
          {userForm.role === 'employee' && managers.filter(m=>m.active).length > 0 && <>
            <Text style={styles.fieldLabel}>ASSIGN MANAGER (OPTIONAL)</Text>
            <View style={styles.managerChoices}><Choice label="Unassigned" selected={!userForm.managerId} onPress={()=>setUserForm({...userForm,managerId:''})}/>{managers.filter(m=>m.active).map(m=><Choice key={m._id} label={m.name} selected={userForm.managerId===m._id} onPress={()=>setUserForm({...userForm,managerId:m._id})}/>)}</View>
          </>}
          <Primary label={saving?'Creating…':'Create account'} onPress={createAccount} disabled={saving}/>
        </Section>
        <Section title="Team accounts" hint="Deactivate access or reactivate an account.">
          {users.filter(u=>u.role!=='admin').length===0 ? <Empty text="No managers or employees yet."/> : users.filter(u=>u.role!=='admin').map(person=><View key={person._id} style={styles.listRow}><View style={{flex:1}}><Text style={styles.rowTitle}>{person.name}</Text><Text style={styles.rowSub}>{person.employeeId} · {person.role}</Text></View><Pressable disabled={saving} onPress={()=>toggleAccount(person)} style={styles.smallAction}><Text style={styles.smallActionText}>{person.active?'Deactivate':'Reactivate'}</Text></Pressable></View>)}
        </Section>
      </>}
      {tab === 'shops' && <>
        <Section title="Register a shop" hint="Choose any one of the three ways to set its location.">
          <Field label="SHOP NAME" value={shopForm.name} onChange={v=>setShopForm({...shopForm,name:v})} placeholder="Shop name"/>
          <Field label="SHOP CODE" value={shopForm.shopCode} onChange={v=>setShopForm({...shopForm,shopCode:v})} placeholder="SHOP001" autoCapitalize="characters"/>
          <Field label="ADDRESS" value={shopForm.address} onChange={v=>setShopForm({...shopForm,address:v})} placeholder="Full address"/>
          <Field label="AREA" value={shopForm.area} onChange={v=>setShopForm({...shopForm,area:v})} placeholder="Area / city"/>
          <View style={styles.locationBox}>
            <Text style={styles.locationTitle}>SHOP GPS LOCATION</Text>
            <Text style={styles.locationHint}>{shopLocation ? `Selected: ${shopLocation.latitude.toFixed(5)}, ${shopLocation.longitude.toFixed(5)}` : 'No location selected yet'}</Text>
            <Pressable onPress={openMapPicker} style={styles.locationButton}><Text style={styles.locationButtonText}>1. Select on map</Text></Pressable>
            <Pressable onPress={useCurrentLocation} style={styles.locationButton}><Text style={styles.locationButtonText}>2. Use current location</Text></Pressable>
            <Text style={styles.fieldLabel}>3. PASTE GOOGLE MAPS LINK</Text>
            <TextInput value={mapsLink} onChangeText={setMapsLink} placeholder="https://maps.app.goo.gl/..." placeholderTextColor="#98A59D" autoCapitalize="none" autoCorrect={false} style={styles.input}/>
            <Pressable onPress={useMapsLink} style={styles.linkButton}><Text style={styles.linkButtonText}>Read location from link</Text></Pressable>
            {shopLocation && <Pressable onPress={()=>{setShopLocation(null);setMapsLink('');}}><Text style={styles.clearLocation}>Clear selected location</Text></Pressable>}
          </View>
          <Text style={styles.note}>Coordinates are captured automatically and sent to the server. Check-ins are verified against the registered shop pin within 50 metres.</Text>
          <Primary label={saving?'Registering…':'Register shop'} onPress={createShop} disabled={saving}/>
        </Section>
        <Section title="Registered shops" hint="Active shop locations available to employees.">
          {shops.length===0 ? <Empty text="No shops registered yet."/> : shops.map(shop=><View key={shop._id} style={styles.listRow}><View style={{flex:1}}><Text style={styles.rowTitle}>{shop.name}</Text><Text style={styles.rowSub}>{shop.shopCode} · {shop.area || shop.address || 'Address not added'}</Text></View><Text style={styles.distance}>{shop.location ? 'GPS saved' : 'Location missing'}</Text></View>)}
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
  </SafeAreaView>;
}

function Stat({label,value}:{label:string;value:number}) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function Section({title,hint,children}:{title:string;hint:string;children:React.ReactNode}) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionHint}>{hint}</Text>{children}</View>; }
function Empty({text}:{text:string}) { return <Text style={styles.empty}>{text}</Text>; }
function Field({label,value,onChange,placeholder,secureTextEntry,keyboardType,autoCapitalize}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string;secureTextEntry?:boolean;keyboardType?:'default'|'email-address'|'decimal-pad';autoCapitalize?:'none'|'sentences'|'words'|'characters'}) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#98A59D" secureTextEntry={secureTextEntry} keyboardType={keyboardType||'default'} autoCapitalize={autoCapitalize||'none'} autoCorrect={false} style={styles.input}/></View>; }
function Primary({label,onPress,disabled}:{label:string;onPress:()=>void;disabled:boolean}) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.primary,disabled&&{opacity:.6}]}><Text style={styles.primaryText}>{label}</Text></Pressable>; }
function Choice({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}) { return <Pressable onPress={onPress} style={[styles.choice,selected&&styles.choiceSelected]}><Text style={[styles.choiceText,selected&&styles.choiceTextSelected]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
 safe:{flex:1,backgroundColor:'#F3F6F3'},center:{flex:1,alignItems:'center',justifyContent:'center',gap:10,backgroundColor:'#F3F6F3'},muted:{fontSize:12,color:'#7A8A80'},
 header:{paddingHorizontal:18,paddingTop:12,paddingBottom:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brandRow:{flexDirection:'row',alignItems:'center',gap:10},brandMark:{width:39,height:39,borderRadius:12,backgroundColor:'#164D38',alignItems:'center',justifyContent:'center'},brandLetter:{color:'#fff',fontSize:18,fontWeight:'900'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:'#718278'},heading:{fontSize:18,fontWeight:'900',color:'#18372A',marginTop:3},logout:{backgroundColor:'#E7EEE8',paddingHorizontal:11,paddingVertical:9,borderRadius:9},logoutText:{fontSize:9,fontWeight:'900',color:'#385A48'},
 tabs:{flexDirection:'row',marginHorizontal:18,backgroundColor:'#E7EEE8',borderRadius:11,padding:4},tab:{flex:1,paddingVertical:10,borderRadius:8,alignItems:'center'},tabActive:{backgroundColor:'#fff',elevation:1},tabText:{fontSize:11,fontWeight:'700',color:'#748278'},tabTextActive:{color:'#17583D'},
 content:{padding:18,paddingBottom:34},welcome:{backgroundColor:'#174B37',borderRadius:16,padding:20,marginBottom:13},welcomeEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.3,color:'#B8D6C2'},welcomeTitle:{fontSize:24,fontWeight:'900',color:'#fff',marginTop:9},welcomeText:{fontSize:11,color:'#D2E5D8',marginTop:5},
 stats:{flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:13},stat:{width:'48%',flexGrow:1,backgroundColor:'#fff',borderRadius:13,padding:15,borderWidth:1,borderColor:'#E5ECE6'},statValue:{fontSize:24,fontWeight:'900',color:'#1A543B'},statLabel:{fontSize:10,color:'#7C8B81',marginTop:4},
 section:{backgroundColor:'#fff',borderRadius:15,padding:16,marginBottom:13,borderWidth:1,borderColor:'#E5ECE6'},sectionTitle:{fontSize:14,fontWeight:'900',color:'#1E3A2B'},sectionHint:{fontSize:10,color:'#89968D',marginTop:4,marginBottom:13},listRow:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderTopWidth:1,borderTopColor:'#EEF2EE',gap:8},rowTitle:{fontSize:11,fontWeight:'800',color:'#2B4235'},rowSub:{fontSize:9,color:'#8A978E',marginTop:4},status:{fontSize:9,fontWeight:'900',paddingHorizontal:8,paddingVertical:5,borderRadius:20,overflow:'hidden'},present:{backgroundColor:'#E4F3E8',color:'#247047'},absent:{backgroundColor:'#F1F2EF',color:'#7D8980'},distance:{fontSize:9,color:'#718177',fontVariant:['tabular-nums']},empty:{fontSize:11,color:'#8A978E',textAlign:'center',paddingVertical:20},
 field:{marginBottom:12},fieldLabel:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:'#627268',marginBottom:7},input:{borderWidth:1,borderColor:'#E1E9E2',borderRadius:10,paddingHorizontal:12,paddingVertical:11,fontSize:12,color:'#213B2D',backgroundColor:'#FCFDFC'},roleRow:{flexDirection:'row',gap:8,marginBottom:12},managerChoices:{flexDirection:'row',flexWrap:'wrap',gap:7,marginBottom:12},choice:{paddingHorizontal:12,paddingVertical:9,borderWidth:1,borderColor:'#DCE6DE',borderRadius:9,backgroundColor:'#fff'},choiceSelected:{borderColor:'#28744E',backgroundColor:'#EAF4ED'},choiceText:{fontSize:10,color:'#6E7D73',fontWeight:'700'},choiceTextSelected:{color:'#1D6843'},twoCol:{flexDirection:'row',gap:10},note:{fontSize:9,lineHeight:14,color:'#7D8B81',marginBottom:12},primary:{backgroundColor:'#176344',paddingVertical:13,borderRadius:10,alignItems:'center',marginTop:3},primaryText:{fontSize:11,fontWeight:'900',color:'#fff'},smallAction:{paddingHorizontal:10,paddingVertical:7,backgroundColor:'#EDF4EE',borderRadius:8},smallActionText:{fontSize:9,fontWeight:'800',color:'#286B49'},footer:{fontSize:9,color:'#929D94',textAlign:'center',lineHeight:14,marginTop:6},
 locationBox:{backgroundColor:'#F5F8F5',borderRadius:12,padding:13,borderWidth:1,borderColor:'#E2EBE3',marginBottom:12},locationTitle:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:'#315642'},locationHint:{fontSize:10,color:'#7D8B81',marginTop:5,marginBottom:10},locationButton:{backgroundColor:'#E6F1E8',padding:11,borderRadius:9,alignItems:'center',marginBottom:8},locationButtonText:{fontSize:11,fontWeight:'800',color:'#1E6945'},linkButton:{alignSelf:'flex-start',paddingVertical:10},linkButtonText:{fontSize:10,fontWeight:'900',color:'#1D6946'},clearLocation:{fontSize:10,color:'#A04D42',fontWeight:'800',marginTop:4},mapModal:{flex:1,backgroundColor:'#F3F6F3'},mapHeader:{paddingHorizontal:16,paddingVertical:13,flexDirection:'row',alignItems:'center'},closeMap:{fontSize:10,fontWeight:'900',color:'#246B49',padding:8},mapFooter:{padding:14,backgroundColor:'#fff'},mapSelected:{fontSize:10,color:'#718177',marginBottom:9}
});
