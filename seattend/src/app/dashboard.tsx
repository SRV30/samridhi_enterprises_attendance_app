import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { api, AppNotification, EmployeeAttendanceHistory, Shop, TodayResponse } from '../lib/api';
import { clearSession, getSession } from '../lib/session';

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

export default function DashboardScreen() {
  const [token,setToken] = useState<string|null>(null);
  const [name,setName] = useState('Employee');
  const [currentUserId,setCurrentUserId] = useState('');
  const [shops,setShops] = useState<Shop[]>([]);
  const [notifications,setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount,setUnreadCount] = useState(0);
  const [today,setToday] = useState<TodayResponse|null>(null);
  const [historyMonth,setHistoryMonth] = useState(new Date().toISOString().slice(0,7));
  const [attendanceHistory,setAttendanceHistory] = useState<EmployeeAttendanceHistory|null>(null);
  const [historyLoading,setHistoryLoading] = useState(false);
  const [query,setQuery] = useState('');
  const [busy,setBusy] = useState(true);
  const [checking,setChecking] = useState<string|null>(null);
  const [refreshing,setRefreshing] = useState(false);
  const [registering,setRegistering] = useState(false);
  const [mapVisible,setMapVisible] = useState(false);
  const mapWebView = useRef<WebView | null>(null);
  const [mapCenter,setMapCenter] = useState<{latitude:number;longitude:number}|null>(null);
  const [mapPin,setMapPin] = useState<{latitude:number;longitude:number}|null>(null);
  const [mapsLink,setMapsLink] = useState('');
  const [shopLocation,setShopLocation] = useState<{latitude:number;longitude:number}|null>(null);
  const [shopForm,setShopForm] = useState({name:'',address:'',pinCode:'',district:'',state:'Uttarakhand',mobileNumber:''});

  const load = useCallback(async (activeToken:string) => {
    const [shopResult, todayResult, notificationResult] = await Promise.all([api.shops(activeToken),api.today(activeToken),api.notifications(activeToken)]);
    setShops(shopResult.shops); setToday(todayResult); setNotifications(notificationResult.notifications); setUnreadCount(notificationResult.unreadCount);
  },[]);
  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (!session) { router.replace('/'); return; }
        if (session.user.role === 'admin') { router.replace('/admin'); return; }
        setToken(session.token); setName(session.user.name); setCurrentUserId(session.user.id);
        await load(session.token);
      } catch (error) {
        if (error instanceof Error && /token|account|auth/i.test(error.message)) {
          await clearSession(); router.replace('/'); return;
        }
        Alert.alert('Could not load dashboard', error instanceof Error ? error.message : 'Try again.');
      } finally { setBusy(false); }
    })();
  },[load]);

  const refresh = async () => {
    if (!token) return;
    setRefreshing(true);
    try { await load(token); } catch(e) { Alert.alert('Refresh failed',e instanceof Error?e.message:'Try again.'); }
    finally { setRefreshing(false); }
  };
  const mySubmissions = useMemo(() => shops.filter(s => s.createdBy?._id === currentUserId && s.verificationStatus !== 'VERIFIED'),[shops,currentUserId]);
  const filtered = useMemo(() => shops.filter(s => s.verificationStatus === 'VERIFIED' && `${s.name} ${s.address||''} ${s.district||''} ${s.pinCode||''}`.toLowerCase().includes(query.trim().toLowerCase())),[shops,query]);

  const markNotificationsRead = async () => {
    if (!token || unreadCount === 0) return;
    try {
      await api.markAllNotificationsRead(token);
      setNotifications(current => current.map(item => ({...item,readAt:item.readAt || new Date().toISOString()})));
      setUnreadCount(0);
    } catch(error) { Alert.alert('Could not update notifications',error instanceof Error?error.message:'Please try again.'); }
  };

  const registerShop = async () => {
    if (!token || registering) return;
    if (!shopForm.name.trim() || !shopForm.address.trim() || !/^\d{6}$/.test(shopForm.pinCode.trim()) ||
        !shopForm.district.trim() || !shopForm.state.trim() ||
        !/^\+?\d{7,15}$/.test(shopForm.mobileNumber.trim().replace(/[\s().-]/g,''))) {
      Alert.alert('Check shop details','Enter the shop name, full address, valid 6-digit PIN code, district, state and mobile number.');
      return;
    }
    if (!shopLocation) {
      Alert.alert('Shop location required','Select the exact shop entrance using the map, current GPS or a Google Maps link.');
      return;
    }
    setRegistering(true);
    try {
      const result = await api.createShop(token,{...shopForm,name:shopForm.name.trim(),address:shopForm.address.trim(),pinCode:shopForm.pinCode.trim(),district:shopForm.district.trim(),state:shopForm.state.trim(),mobileNumber:shopForm.mobileNumber.trim(),latitude:shopLocation.latitude,longitude:shopLocation.longitude});
      Alert.alert('Shop submitted',result.message || 'Your shop registration is waiting for admin verification.');
      setShopForm({name:'',address:'',pinCode:'',district:'',state:'Uttarakhand',mobileNumber:''});
      setShopLocation(null);
      setMapsLink('');
      await load(token);
    } catch(error) { Alert.alert('Could not register shop',error instanceof Error?error.message:'Please try again.'); }
    finally { setRegistering(false); }
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
    setMapPin(shopLocation);
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
    if (mapPin) mapWebView.current?.injectJavaScript('choosePoint(' + mapPin.latitude + ',' + mapPin.longitude + ',"Previously selected shop pin"); true;');
  };

  const acceptMapPin = () => {
    if (!mapPin) { Alert.alert('Select a point','Tap the map at the shop entrance to place a pin.'); return; }
    setShopLocation(mapPin);
    setMapVisible(false);
    Alert.alert('Location selected','Map pin saved. Please confirm it is exactly at the shop entrance.');
  };

  const useMapsLink = () => {
    const input = mapsLink.trim();
    if (!input) { Alert.alert('Paste a map link','Paste the Google Maps Share link first.'); return; }
    const coordinates = coordinatesFromMapLink(input);
    if (!coordinates) {
      Alert.alert('Could not read coordinates','This link does not contain coordinates we can read. Open the map picker, search for the shop or tap its exact entrance on the map.');
      return;
    }
    setShopLocation(coordinates);
    setMapCenter(coordinates);
    setMapPin(coordinates);
    Alert.alert('Location read from link','Coordinates: ' + coordinates.latitude.toFixed(5) + ', ' + coordinates.longitude.toFixed(5) + '. Confirm the pin is at the shop entrance.');
  };

  const checkIn = async (shop:Shop) => {
    if (!token || checking) return;
    setChecking(shop._id);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Location permission is needed only to verify a shop visit. Enable it to check in.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const accuracy = position.coords.accuracy ?? 9999;
      if (accuracy > 50) throw new Error(`GPS accuracy is currently about ${Math.round(accuracy)}m. Move to an open area and try again.`);
      const result = await api.checkIn(token,shop._id,{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracyMeters:accuracy});
      Alert.alert(result.alreadyVisited?'Already recorded':'Visit verified',result.message);
      await load(token);
    } catch(error) { Alert.alert('Check-in unsuccessful',error instanceof Error?error.message:'Please try again.'); }
    finally { setChecking(null); }
  };

  const loadAttendanceHistory = async () => {
    if (!token || historyLoading) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(historyMonth)) {
      Alert.alert('Invalid month','Enter the month as YYYY-MM, for example 2026-11.');
      return;
    }
    const [year, month] = historyMonth.split('-').map(Number);
    const from = historyMonth + '-01';
    const to = historyMonth + '-' + String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0');
    setHistoryLoading(true);
    try {
      const result = await api.attendanceHistory(token, from, to);
      setAttendanceHistory(result);
    } catch(error) {
      Alert.alert('Could not load attendance history', error instanceof Error ? error.message : 'Please try again.');
    } finally { setHistoryLoading(false); }
  };

  const logout = async () => { await clearSession(); router.replace('/'); };
  if (busy) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563EB"/><Text style={styles.muted}>Loading your attendance…</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safeArea}><StatusBar style="dark"/><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>}>
    <View style={styles.header}><View><Text style={styles.kicker}>SAMRIDHI ENTERPRISES</Text><Text style={styles.heading}>Hello, {name.split(' ')[0]}</Text><Text style={styles.subheading}>Your field activity at a glance.</Text></View><Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>LOG OUT</Text></Pressable></View>
    <View style={styles.summaryCard}><Text style={styles.summaryLabel}>TODAY'S ATTENDANCE · {today?.date||'—'}</Text><Text style={styles.summaryStatus}>{today?.attendance||'Not marked'}</Text><View style={styles.summaryDivider}/><View style={styles.metrics}><View><Text style={styles.metricValue}>{today?.visitCount??0}</Text><Text style={styles.metricLabel}>Verified visits</Text></View><View><Text style={styles.metricValue}>50 m</Text><Text style={styles.metricLabel}>Check-in radius</Text></View></View></View>
    {notifications.length > 0 && <View style={styles.notificationPanel}>
      <View style={styles.notificationHeader}><View style={{flex:1}}><Text style={styles.notificationTitle}>Notifications {unreadCount > 0 ? '('+unreadCount+' new)' : ''}</Text><Text style={styles.notificationHint}>Shop registration updates</Text></View>{unreadCount > 0 && <Pressable onPress={markNotificationsRead}><Text style={styles.notificationAction}>MARK ALL READ</Text></Pressable>}</View>
      {notifications.slice(0,5).map(item=><View key={item._id} style={[styles.notificationItem,!item.readAt&&styles.notificationUnread]}><Text style={styles.notificationItemTitle}>{item.title}</Text><Text style={styles.notificationMessage}>{item.message}</Text><Text style={styles.notificationDate}>{new Date(item.createdAt).toLocaleString('en-IN')}</Text></View>)}
    </View>}

    <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Register a shop</Text><Text style={styles.sectionHint}>Submit a new shop for admin verification</Text></View></View>
    <View style={styles.registerCard}>
      <TextInput value={shopForm.name} onChangeText={v=>setShopForm({...shopForm,name:v})} placeholder="Shop name" placeholderTextColor="#94A3B8" style={styles.search}/>
      <TextInput value={shopForm.address} onChangeText={v=>setShopForm({...shopForm,address:v})} placeholder="Full address" placeholderTextColor="#94A3B8" style={styles.search}/>
      <View style={styles.formRow}>
        <TextInput value={shopForm.pinCode} onChangeText={v=>setShopForm({...shopForm,pinCode:v.replace(/\D/g,'').slice(0,6)})} placeholder="PIN code" keyboardType="number-pad" placeholderTextColor="#94A3B8" style={[styles.search,{flex:1}]}/>
        <TextInput value={shopForm.district} onChangeText={v=>setShopForm({...shopForm,district:v})} placeholder="District" placeholderTextColor="#94A3B8" style={[styles.search,{flex:1}]}/>
      </View>
      <TextInput value={shopForm.state} onChangeText={v=>setShopForm({...shopForm,state:v})} placeholder="State" placeholderTextColor="#94A3B8" style={styles.search}/>
      <TextInput value={shopForm.mobileNumber} onChangeText={v=>setShopForm({...shopForm,mobileNumber:v})} placeholder="Shop mobile number" keyboardType="phone-pad" placeholderTextColor="#94A3B8" style={styles.search}/>
      <View style={styles.locationBox}>
        <Text style={styles.locationTitle}>SHOP GPS LOCATION</Text>
        <Text style={styles.locationHint}>{shopLocation ? `Selected: ${shopLocation.latitude.toFixed(5)}, ${shopLocation.longitude.toFixed(5)}` : 'No location selected yet'}</Text>
        <Pressable onPress={openMapPicker} style={styles.locationButton}><Text style={styles.locationButtonText}>1. Select on map</Text></Pressable>
        <Pressable onPress={useCurrentLocation} style={styles.locationButton}><Text style={styles.locationButtonText}>2. Use current location</Text></Pressable>
        <Text style={styles.fieldLabel}>3. PASTE GOOGLE MAPS LINK</Text>
        <TextInput value={mapsLink} onChangeText={setMapsLink} placeholder="https://maps.app.goo.gl/..." placeholderTextColor="#94A3B8" autoCapitalize="none" autoCorrect={false} style={styles.search}/>
        <Pressable onPress={useMapsLink} style={styles.linkButton}><Text style={styles.linkButtonText}>Read location from link</Text></Pressable>
        {shopLocation && <Pressable onPress={()=>{setShopLocation(null);setMapsLink('');setMapPin(null);}}><Text style={styles.clearLocation}>Clear selected location</Text></Pressable>}
      </View>
      <Text style={styles.registrationHint}>Select the exact shop entrance on the map, use accurate GPS while standing there, or paste a Google Maps link. Admin verification is required before check-ins are enabled.</Text>
      <Pressable disabled={registering} onPress={registerShop} style={[styles.registerButton,registering&&{opacity:.6}]}>{registering?<ActivityIndicator color="#fff"/>:<Text style={styles.registerButtonText}>SUBMIT SHOP FOR APPROVAL</Text>}</Pressable>
    </View>
    {mySubmissions.length > 0 && <>
      <View style={styles.historyHeader}><Text style={styles.sectionTitle}>My shop submissions</Text><Text style={styles.shopCount}>{mySubmissions.length} SUBMITTED</Text></View>
      {mySubmissions.map(shop=><View key={shop._id} style={styles.submissionCard}>
        <View style={{flex:1}}>
          <Text style={styles.shopName}>{shop.name}</Text>
          <Text style={styles.shopArea}>{shop.address} · {shop.district}, {shop.state} - {shop.pinCode}</Text>
          {shop.verificationStatus === 'REJECTED' && <Text style={styles.rejectionReason}>Reason: {shop.rejectionReason || 'Please contact your admin for details.'}</Text>}
          <Text style={styles.submissionDate}>Submitted {new Date(shop.createdAt || Date.now()).toLocaleDateString('en-IN')}</Text>
        </View>
        <Text style={[styles.pendingLabel,shop.verificationStatus === 'REJECTED'&&styles.rejectedLabel]}>{shop.verificationStatus === 'REJECTED' ? 'REJECTED' : 'PENDING'}</Text>
      </View>)}
    </>}
    <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Find a shop</Text><Text style={styles.sectionHint}>Check in at any approved registered shop</Text></View><Text style={styles.shopCount}>{shops.length} SHOPS</Text></View>
    <TextInput accessibilityLabel="Search registered shops" value={query} onChangeText={setQuery} placeholder="Search shop name, area or ID" placeholderTextColor="#9AA5B4" style={styles.search}/>
    {filtered.map(shop=><View key={shop._id} style={styles.shopCard}><View style={styles.shopInfo}><Text style={styles.shopName}>{shop.name}</Text><Text style={styles.shopArea}>{shop.address || 'Address not available'} · {[shop.district, shop.state].filter(Boolean).join(', ')} {shop.pinCode || ''}</Text></View><Pressable disabled={!!checking} onPress={()=>checkIn(shop)} style={({pressed})=>[styles.checkButton,pressed&&{opacity:.8},checking===shop._id&&{opacity:.6}]}>{checking===shop._id?<ActivityIndicator color="#fff"/>:<Text style={styles.checkText}>CHECK IN</Text>}</Pressable></View>)}
    {filtered.length===0&&<Text style={styles.empty}>No approved shops match your search.</Text>}
    <View style={styles.historyHeader}><Text style={styles.sectionTitle}>Today's visits</Text><Text style={styles.shopCount}>{today?.visits.length||0} RECORDED</Text></View>
    {(today?.visits||[]).map(v=><View key={v._id} style={styles.visitCard}><View style={{flex:1}}><Text style={styles.shopName}>{v.shop?.name||'Shop visit'}</Text><Text style={styles.shopArea}>{v.shop?.shopCode||''} · {new Date(v.checkedInAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</Text></View><Text style={styles.verified}>VERIFIED</Text></View>)}
    {(!today?.visits||today.visits.length===0)&&<Text style={styles.empty}>Your verified shop visits will appear here.</Text>}
    <View style={styles.historyPanel}>
      <Text style={styles.sectionTitle}>Monthly attendance history</Text>
      <Text style={styles.sectionHint}>Review your verified attendance days and shop visits.</Text>
      <View style={styles.historyControls}>
        <TextInput value={historyMonth} onChangeText={setHistoryMonth} placeholder="YYYY-MM" maxLength={7} keyboardType="numbers-and-punctuation" placeholderTextColor="#94A3B8" style={[styles.search,{flex:1,marginBottom:0}]}/>
        <Pressable disabled={historyLoading} onPress={loadAttendanceHistory} style={[styles.historyButton,historyLoading&&{opacity:.6}]}>
          {historyLoading?<ActivityIndicator color="#fff"/>:<Text style={styles.historyButtonText}>VIEW</Text>}
        </Pressable>
      </View>
      {attendanceHistory && <>
        <View style={styles.historyStats}>
          <View><Text style={styles.historyStatValue}>{attendanceHistory.presentDays}</Text><Text style={styles.historyStatLabel}>Present days</Text></View>
          <View><Text style={styles.historyStatValue}>{attendanceHistory.visitCount}</Text><Text style={styles.historyStatLabel}>Verified visits</Text></View>
        </View>
        {attendanceHistory.days.length===0 ? <Text style={styles.empty}>No verified attendance for this month.</Text> : attendanceHistory.days.map(day=><View key={day.date} style={styles.historyDay}>
          <View style={styles.historyDayHeader}><Text style={styles.historyDayDate}>{new Date(day.date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',weekday:'short'})}</Text><Text style={styles.historyDayCount}>{day.visitCount} {day.visitCount===1?'visit':'visits'}</Text></View>
          {day.visits.map(visit=><View key={visit._id} style={styles.historyVisit}>
            <View style={{flex:1}}><Text style={styles.shopName}>{visit.shop?.name||'Shop visit'}</Text><Text style={styles.shopArea}>{visit.shop?.address||''}</Text></View>
            <View style={{alignItems:'flex-end'}}><Text style={styles.historyTime}>{new Date(visit.checkedInAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</Text><Text style={styles.verified}>VERIFIED</Text></View>
          </View>)}
        </View>)}
      </>}
    </View>
    <Text style={styles.footer}>Location is requested only when you press Check In. The server verifies the 50-metre distance using registered shop coordinates.</Text>
  </ScrollView>
    <Modal visible={mapVisible} animationType="slide" onRequestClose={()=>setMapVisible(false)}>
      <SafeAreaView style={styles.mapModal}>
        <View style={styles.mapHeader}>
          <View style={{flex:1}}><Text style={styles.sectionTitle}>Select shop on map</Text><Text style={styles.sectionHint}>Search for the shop, select a result, then tap the exact entrance.</Text></View>
          <Pressable onPress={()=>setMapVisible(false)}><Text style={styles.closeMap}>CLOSE</Text></Pressable>
        </View>
        <WebView ref={mapWebView} originWhitelist={['*']} source={{html:MAP_HTML}} javaScriptEnabled domStorageEnabled onLoadEnd={onMapLoaded} onError={()=>Alert.alert('Map loading failed','Check your internet connection and try again.')} onMessage={(event:WebViewMessageEvent)=>{try{const point=JSON.parse(event.nativeEvent.data);if(validCoordinates(point.latitude,point.longitude))setMapPin(point);}catch{}}}/>
        <View style={styles.mapFooter}><Text style={styles.mapSelected}>{mapPin ? `Pin: ${mapPin.latitude.toFixed(5)}, ${mapPin.longitude.toFixed(5)}` : 'Tap the map to choose a location'}</Text><Pressable disabled={!mapPin} onPress={acceptMapPin} style={[styles.registerButton,!mapPin&&{opacity:.45}]}><Text style={styles.registerButtonText}>USE THIS MAP LOCATION</Text></Pressable></View>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
const styles=StyleSheet.create({safeArea:{flex:1,backgroundColor:'#F8FAFC'},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:'#F8FAFC'},content:{padding:20,paddingBottom:36},historyPanel:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E2E8F0',borderRadius:14,padding:14,marginTop:20},historyControls:{flexDirection:'row',alignItems:'center',gap:8},historyButton:{height:45,minWidth:74,backgroundColor:'#2563EB',borderRadius:10,alignItems:'center',justifyContent:'center'},historyButtonText:{fontSize:10,fontWeight:'900',color:'#fff'},historyStats:{flexDirection:'row',gap:28,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#F1F5F9',marginBottom:5},historyStatValue:{fontSize:20,fontWeight:'900',color:'#1D4ED8'},historyStatLabel:{fontSize:9,color:'#64748B',marginTop:3},historyDay:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#F1F5F9'},historyDayHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:5},historyDayDate:{fontSize:11,fontWeight:'900',color:'#1E293B'},historyDayCount:{fontSize:9,color:'#64748B'},historyVisit:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:7},historyTime:{fontSize:10,fontWeight:'800',color:'#334155'},historyPanelDummy:{},notificationPanel:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E2E8F0',borderRadius:13,padding:13,marginBottom:20},notificationHeader:{flexDirection:'row',alignItems:'center',marginBottom:8},notificationTitle:{fontSize:13,fontWeight:'900',color:'#0F172A'},notificationHint:{fontSize:10,color:'#64748B',marginTop:3},notificationAction:{fontSize:8,fontWeight:'900',color:'#1D4ED8'},notificationItem:{paddingVertical:9,borderTopWidth:1,borderTopColor:'#F1F5F9'},notificationUnread:{backgroundColor:'#EFF6FF',paddingHorizontal:7,borderRadius:7},notificationItemTitle:{fontSize:10,fontWeight:'800',color:'#1E293B'},notificationMessage:{fontSize:10,color:'#475569',lineHeight:15,marginTop:3},notificationDate:{fontSize:8,color:'#94A3B8',marginTop:4},submissionCard:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E2E8F0',borderRadius:12,padding:13,flexDirection:'row',alignItems:'center',gap:10,marginBottom:9},rejectionReason:{fontSize:10,color:'#B91C1C',marginTop:5},submissionDate:{fontSize:9,color:'#94A3B8',marginTop:5},rejectedLabel:{color:'#991B1B',backgroundColor:'#FEE2E2'},registerCard:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E2E8F0',borderRadius:14,padding:14,marginBottom:22},formRow:{flexDirection:'row',gap:8},registrationHint:{fontSize:10,color:'#64748B',lineHeight:15,marginBottom:12},locationBox:{backgroundColor:'#F8FAFC',borderRadius:12,padding:13,borderWidth:1,borderColor:'#E2E8F0',marginBottom:12},locationTitle:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:'#1E293B'},locationHint:{fontSize:10,color:'#64748B',marginTop:5,marginBottom:10},locationButton:{backgroundColor:'#EFF6FF',padding:11,borderRadius:9,alignItems:'center',marginBottom:8},locationButtonText:{fontSize:11,fontWeight:'800',color:'#1D4ED8'},fieldLabel:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:'#475569',marginBottom:7},linkButton:{alignSelf:'flex-start',paddingVertical:10},linkButtonText:{fontSize:10,fontWeight:'900',color:'#1D4ED8'},clearLocation:{fontSize:10,color:'#DC2626',fontWeight:'800',marginTop:4},mapModal:{flex:1,backgroundColor:'#F8FAFC'},mapHeader:{paddingHorizontal:16,paddingVertical:13,flexDirection:'row',alignItems:'center'},closeMap:{fontSize:10,fontWeight:'900',color:'#1D4ED8',padding:8},mapFooter:{padding:14,backgroundColor:'#fff'},mapSelected:{fontSize:10,color:'#64748B',marginBottom:9},registerButton:{height:43,backgroundColor:'#0F766E',borderRadius:10,alignItems:'center',justifyContent:'center'},registerButtonText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:.4},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:22},kicker:{color:'#64748B',fontSize:9,fontWeight:'800',letterSpacing:1.3},heading:{color:'#0F172A',fontSize:26,fontWeight:'800',marginTop:6},subheading:{color:'#64748B',fontSize:12,marginTop:4},logout:{padding:10,backgroundColor:'#F1F5F9',borderRadius:9},logoutText:{fontSize:9,fontWeight:'800',color:'#1D4ED8'},summaryCard:{backgroundColor:'#2563EB',borderRadius:18,padding:18,marginBottom:25},summaryLabel:{color:'#DBEAFE',fontSize:9,fontWeight:'800',letterSpacing:1},summaryStatus:{color:'#fff',fontSize:21,fontWeight:'800',marginTop:8},summaryDivider:{height:1,backgroundColor:'#FFFFFF30',marginVertical:16},metrics:{flexDirection:'row',gap:55},metricValue:{color:'#fff',fontSize:19,fontWeight:'800'},metricLabel:{color:'#DBEAFE',fontSize:10,marginTop:4},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',marginBottom:12},sectionTitle:{color:'#0F172A',fontSize:17,fontWeight:'800'},sectionHint:{color:'#64748B',fontSize:11,marginTop:4},shopCount:{color:'#64748B',fontSize:9,fontWeight:'800'},search:{height:47,borderRadius:11,borderWidth:1,borderColor:'#E2E8F0',backgroundColor:'#fff',paddingHorizontal:13,color:'#1E293B',marginBottom:12},shopCard:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E2E8F0',borderRadius:13,padding:13,flexDirection:'row',alignItems:'center',marginBottom:9,gap:10},shopInfo:{flex:1},shopName:{color:'#1E293B',fontSize:12,fontWeight:'800'},shopArea:{color:'#64748B',fontSize:10,marginTop:5},checkButton:{minWidth:84,height:36,backgroundColor:'#2563EB',borderRadius:9,alignItems:'center',justifyContent:'center',paddingHorizontal:10},checkText:{color:'#fff',fontSize:9,fontWeight:'800'},pendingLabel:{fontSize:8,fontWeight:'900',color:'#92400E',backgroundColor:'#FEF3C7',paddingHorizontal:8,paddingVertical:7,borderRadius:8,overflow:'hidden'},historyHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:20,marginBottom:11},visitCard:{backgroundColor:'#fff',borderRadius:12,padding:13,flexDirection:'row',alignItems:'center',marginBottom:8},verified:{fontSize:8,color:'#1D4ED8',fontWeight:'800'},empty:{color:'#64748B',fontSize:11,textAlign:'center',padding:18,backgroundColor:'#fff',borderRadius:12},footer:{color:'#94A3B8',fontSize:9,lineHeight:15,textAlign:'center',marginTop:22},muted:{color:'#64748B',fontSize:12}});
