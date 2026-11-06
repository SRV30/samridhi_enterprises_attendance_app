import { useCallback, useEffect, useMemo, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { api, AppNotification, EmployeeAttendanceHistory, Shop, TodayResponse } from '../lib/api';
import IndiaAddressFields from '../components/IndiaAddressFields';
import CalendarDatePicker from '../components/CalendarDatePicker';
import BrandLogo from '../components/BrandLogo';
import { clearSession, getSession } from '../lib/session';


export default function DashboardScreen() {
  const [token,setToken] = useState<string|null>(null);
  const [name,setName] = useState('Employee');
  const [currentUserId,setCurrentUserId] = useState('');
  const [shops,setShops] = useState<Shop[]>([]);
  const [notifications,setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount,setUnreadCount] = useState(0);
  const [notificationsVisible,setNotificationsVisible] = useState(false);
  const [activePage,setActivePage] = useState<'visits'|'register'>('visits');
  const [passwordVisible,setPasswordVisible] = useState(false);
  const [currentPassword,setCurrentPassword] = useState('');
  const [newPassword,setNewPassword] = useState('');
  const [confirmPassword,setConfirmPassword] = useState('');
  const [today,setToday] = useState<TodayResponse|null>(null);
  const [historyMonth,setHistoryMonth] = useState(new Date().toISOString().slice(0,7));
  const [attendanceHistory,setAttendanceHistory] = useState<EmployeeAttendanceHistory|null>(null);
  const [historyLoading,setHistoryLoading] = useState(false);
  const [query,setQuery] = useState('');
  const [busy,setBusy] = useState(true);
  const [checking,setChecking] = useState<string|null>(null);
  const [refreshing,setRefreshing] = useState(false);
  const [registering,setRegistering] = useState(false);
  const [shopLocation,setShopLocation] = useState<{latitude:number;longitude:number;placeName:string}|null>(null);
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
        const verifiedUser = await api.me(session.token);
        if (verifiedUser.role !== 'employee') { router.replace('/admin'); return; }
        setToken(session.token); setName(verifiedUser.name); setCurrentUserId(verifiedUser.id);
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
    if (!shopLocation || !shopLocation.placeName.trim()) {
      Alert.alert('Shop location required','Select the shop on the map or use GPS so its proper place name can be saved.');
      return;
    }
    setRegistering(true);
    try {
      const result = await api.createShop(token,{...shopForm,name:shopForm.name.trim(),address:shopForm.address.trim(),pinCode:shopForm.pinCode.trim(),district:shopForm.district.trim(),state:shopForm.state.trim(),mobileNumber:shopForm.mobileNumber.trim(),latitude:shopLocation.latitude,longitude:shopLocation.longitude,placeName:shopLocation.placeName});
      Alert.alert('Shop submitted',result.message || 'Your shop registration is waiting for admin verification.');
      setShopForm({name:'',address:'',pinCode:'',district:'',state:'Uttarakhand',mobileNumber:''});
      setShopLocation(null);
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
      const places = await Location.reverseGeocodeAsync({ latitude: reading.latitude, longitude: reading.longitude });
      const place = places[0];
      const placeName = place ? [place.name, place.street, place.district, place.city, place.region].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ') : '';
      if (!placeName) throw new Error('Could not identify a readable place name. Check your GPS signal and try again.');
      setShopLocation({ latitude: reading.latitude, longitude: reading.longitude, placeName });
      Alert.alert('Place identified', placeName + '. GPS accuracy: about ' + Math.round(reading.accuracy) + 'm.');
    } catch (error) { Alert.alert('Could not get accurate GPS', error instanceof Error ? error.message : 'Please try again.'); }
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


  const submitPasswordChange = async () => {
    if (!token || registering) return;
    if (!currentPassword || !newPassword || !confirmPassword) { Alert.alert('Missing details', 'Enter all three password fields.'); return; }
    if (newPassword.length < 8) { Alert.alert('Weak password', 'Use at least 8 characters for your new password.'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Passwords do not match', 'Confirm the new password correctly.'); return; }
    setRegistering(true);
    try {
      const result = await api.changePassword(token, currentPassword, newPassword);
      setPasswordVisible(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      Alert.alert('Password updated', result.message);
    } catch (error) {
      Alert.alert('Password update failed', error instanceof Error ? error.message : 'Please try again.');
    } finally { setRegistering(false); }
  };

  const logout = async () => { await clearSession(); router.replace('/'); };
  if (busy) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563EB"/><Text style={styles.muted}>Loading your attendance…</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safeArea}><StatusBar style="dark"/><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>}>
    <View style={styles.header}><View style={styles.brandHeader}><BrandLogo width={112} height={42}/><View style={{flex:1,minWidth:0}}><Text style={styles.heading}>Hello, {name.split(' ')[0]}</Text><Text style={styles.subheading}>Your field activity at a glance.</Text></View></View><View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="Change password" onPress={()=>setPasswordVisible(true)} style={styles.bellButton}><Text style={styles.bellIcon}>🔑</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unreadCount} unread`} onPress={()=>setNotificationsVisible(true)} style={styles.bellButton}><Text style={styles.bellIcon}>🔔</Text>{unreadCount>0&&<View style={styles.bellBadge}><Text style={styles.bellBadgeText}>{unreadCount>99?'99+':unreadCount}</Text></View>}</Pressable><Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>LOG OUT</Text></Pressable></View></View>
    <View style={styles.pageTabs}>
      <Pressable onPress={()=>setActivePage('visits')} style={[styles.pageTab,activePage==='visits'&&styles.pageTabActive]}><Text style={[styles.pageTabText,activePage==='visits'&&styles.pageTabTextActive]}>FIND SHOP & VISITS</Text></Pressable>
      <Pressable onPress={()=>setActivePage('register')} style={[styles.pageTab,activePage==='register'&&styles.pageTabActive]}><Text style={[styles.pageTabText,activePage==='register'&&styles.pageTabTextActive]}>REGISTER SHOP</Text></Pressable>
    </View>
    {activePage === 'visits' && <Animated.View entering={FadeInDown.duration(320)}>
    <Animated.View entering={FadeInDown.duration(380)} style={styles.summaryCard}><Text style={styles.summaryLabel}>TODAY'S ATTENDANCE · {today?.date||'—'}</Text><Text style={styles.summaryStatus}>{today?.attendance||'Not marked'}</Text><View style={styles.summaryDivider}/><View style={styles.metrics}><View><Text style={styles.metricValue}>{today?.visitCount??0}</Text><Text style={styles.metricLabel}>Verified visits</Text></View><View><Text style={styles.metricValue}>50 m</Text><Text style={styles.metricLabel}>Check-in radius</Text></View></View></Animated.View>
    </Animated.View>}
    {activePage === 'register' && <Animated.View entering={FadeInDown.duration(320)}>
    <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Register a shop</Text><Text style={styles.sectionHint}>Submit a new shop for admin verification</Text></View></View>
    <View style={styles.registerCard}>
      <TextInput value={shopForm.name} onChangeText={v=>setShopForm({...shopForm,name:v})} placeholder="Shop name" placeholderTextColor="#94A3B8" style={styles.search}/>
      <TextInput value={shopForm.address} onChangeText={v=>setShopForm({...shopForm,address:v})} placeholder="Full address" placeholderTextColor="#94A3B8" style={styles.search}/>
      <TextInput value={shopForm.pinCode} onChangeText={v=>setShopForm({...shopForm,pinCode:v.replace(/\D/g,'').slice(0,6)})} placeholder="PIN code" keyboardType="number-pad" placeholderTextColor="#94A3B8" style={styles.search}/>
      <IndiaAddressFields state={shopForm.state} district={shopForm.district} onStateChange={state=>setShopForm(current=>({...current,state}))} onDistrictChange={district=>setShopForm(current=>({...current,district}))}/>
      <TextInput value={shopForm.mobileNumber} onChangeText={v=>setShopForm({...shopForm,mobileNumber:v})} placeholder="Shop mobile number" keyboardType="phone-pad" placeholderTextColor="#94A3B8" style={styles.search}/>
      <View style={styles.locationBox}>
        <Text style={styles.locationTitle}>SHOP PLACE</Text>
        <Text style={styles.locationHint}>{shopLocation?.placeName || 'No named place selected yet'}</Text>
        <Pressable onPress={useCurrentLocation} style={styles.locationButton}><Text style={styles.locationButtonText}>USE CURRENT GPS LOCATION</Text></Pressable>
        {shopLocation && <Pressable onPress={()=>setShopLocation(null)}><Text style={styles.clearLocation}>Clear selected location</Text></Pressable>}
      </View>
      <Text style={styles.registrationHint}>Use the device GPS at the shop to identify its place name and save its coordinates. Coordinates remain internal for 50-metre attendance verification. Admin verification is required before check-ins are enabled.</Text>
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
    </Animated.View>}
    {activePage === 'visits' && <Animated.View entering={FadeInDown.duration(320)}>
    <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Find a shop</Text><Text style={styles.sectionHint}>Check in at any approved registered shop</Text></View><Text style={styles.shopCount}>{shops.length} SHOPS</Text></View>
    <TextInput accessibilityLabel="Search registered shops" value={query} onChangeText={setQuery} placeholder="Search shop name, area or ID" placeholderTextColor="#9AA5B4" style={styles.search}/>
    {filtered.map(shop=><View key={shop._id} style={styles.shopCard}><View style={styles.shopInfo}><Text style={styles.shopName}>{shop.name}</Text><Text style={styles.shopArea}>{shop.location?.placeName || shop.address || 'Place name unavailable'} · {[shop.district, shop.state].filter(Boolean).join(', ')} {shop.pinCode || ''}</Text></View><Pressable disabled={!!checking} onPress={()=>checkIn(shop)} style={({pressed})=>[styles.checkButton,pressed&&{opacity:.8},checking===shop._id&&{opacity:.6}]}>{checking===shop._id?<ActivityIndicator color="#fff"/>:<Text style={styles.checkText}>CHECK IN</Text>}</Pressable></View>)}
    {filtered.length===0&&<Text style={styles.empty}>No approved shops match your search.</Text>}
    <View style={styles.historyHeader}><Text style={styles.sectionTitle}>Today's visits</Text><Text style={styles.shopCount}>{today?.visits.length||0} RECORDED</Text></View>
    {(today?.visits||[]).map(v=><View key={v._id} style={styles.visitCard}><View style={{flex:1}}><Text style={styles.shopName}>{v.shop?.name || v.shopName || 'Shop visit'}</Text><Text style={styles.shopArea}>{v.shop?.location?.placeName || v.shopPlaceName || v.shop?.address || v.shopAddress || 'Place name unavailable'} · {new Date(v.checkedInAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</Text></View><Text style={styles.verified}>VERIFIED</Text></View>)}
    {(!today?.visits||today.visits.length===0)&&<Text style={styles.empty}>Your verified shop visits will appear here.</Text>}
    <View style={styles.historyPanel}>
      <Text style={styles.sectionTitle}>Monthly attendance history</Text>
      <Text style={styles.sectionHint}>Review your verified attendance days and shop visits.</Text>
      <View style={styles.historyControls}>
        <View style={{flex:1}}><CalendarDatePicker label="ATTENDANCE MONTH" value={historyMonth} onChange={setHistoryMonth} mode="month"/></View>
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
            <View style={{flex:1}}><Text style={styles.shopName}>{visit.shop?.name || visit.shopName || 'Shop visit'}</Text><Text style={styles.shopArea}>{visit.shop?.location?.placeName || visit.shopPlaceName || visit.shop?.address || visit.shopAddress || 'Place name unavailable'}</Text></View>
            <View style={{alignItems:'flex-end'}}><Text style={styles.historyTime}>{new Date(visit.checkedInAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</Text><Text style={styles.verified}>VERIFIED</Text></View>
          </View>)}
        </View>)}
      </>}
    </View>
    <Text style={styles.footer}>{activePage === 'visits' ? 'Location is requested only when you press Check In. The server verifies the 50-metre distance using registered shop coordinates.' : 'Submitted shops require admin verification before employees can check in.'}</Text>
    </Animated.View>}
  </ScrollView>

    <Modal visible={passwordVisible} animationType="slide" transparent onRequestClose={()=>setPasswordVisible(false)}>
      <View style={styles.notificationOverlay}>
        <View style={styles.notificationSheet}>
          <View style={styles.notificationSheetHeader}>
            <View style={{flex:1}}><Text style={styles.notificationTitle}>Change password</Text><Text style={styles.notificationHint}>Update your employee login password</Text></View>
            <Pressable onPress={()=>setPasswordVisible(false)} style={styles.notificationClose}><Text style={styles.notificationCloseText}>CLOSE</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.passwordForm}>
            <Text style={styles.passwordLabel}>CURRENT PASSWORD</Text>
            <TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Enter current password" placeholderTextColor="#94A3B8" style={styles.passwordInput}/>
            <Text style={styles.passwordLabel}>NEW PASSWORD</Text>
            <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="At least 8 characters" placeholderTextColor="#94A3B8" style={styles.passwordInput}/>
            <Text style={styles.passwordLabel}>CONFIRM NEW PASSWORD</Text>
            <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Enter new password again" placeholderTextColor="#94A3B8" style={styles.passwordInput}/>
            <Pressable disabled={registering} onPress={submitPasswordChange} style={[styles.passwordSubmit,registering&&{opacity:.6}]}><Text style={styles.passwordSubmitText}>{registering?'UPDATING…':'UPDATE PASSWORD'}</Text></Pressable>
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
  </SafeAreaView>;
}
const styles=StyleSheet.create({safeArea:{flex:1,backgroundColor:'#F8FAFC'},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:'#F8FAFC'},content:{padding:18,paddingBottom:40,width:'100%',maxWidth:980,alignSelf:'center'},pageTabs:{flexDirection:'row',backgroundColor:'#EAF0F8',padding:4,borderRadius:14,marginBottom:18,gap:4},pageTab:{flex:1,minHeight:42,alignItems:'center',justifyContent:'center',borderRadius:9,paddingHorizontal:6},pageTabActive:{backgroundColor:'#fff',shadowColor:'#0F172A',shadowOpacity:.08,shadowRadius:4,elevation:2},pageTabText:{fontSize:9,fontWeight:'900',letterSpacing:.3,color:'#64748B',textAlign:'center'},pageTabTextActive:{color:'#1D4ED8'},historyPanel:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E2E8F0',borderRadius:14,padding:14,marginTop:20},historyControls:{flexDirection:'row',alignItems:'center',gap:8},historyButton:{height:45,minWidth:74,backgroundColor:'#2563EB',borderRadius:10,alignItems:'center',justifyContent:'center'},historyButtonText:{fontSize:10,fontWeight:'900',color:'#fff'},historyStats:{flexDirection:'row',gap:28,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#F1F5F9',marginBottom:5},historyStatValue:{fontSize:20,fontWeight:'900',color:'#1D4ED8'},historyStatLabel:{fontSize:9,color:'#64748B',marginTop:3},historyDay:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#F1F5F9'},historyDayHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:5},historyDayDate:{fontSize:11,fontWeight:'900',color:'#1E293B'},historyDayCount:{fontSize:9,color:'#64748B'},historyVisit:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:7},historyTime:{fontSize:10,fontWeight:'800',color:'#334155'},historyPanelDummy:{},notificationPanel:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E2E8F0',borderRadius:13,padding:13,marginBottom:20},notificationHeader:{flexDirection:'row',alignItems:'center',marginBottom:8},notificationTitle:{fontSize:13,fontWeight:'900',color:'#0F172A'},notificationHint:{fontSize:10,color:'#64748B',marginTop:3},notificationAction:{fontSize:8,fontWeight:'900',color:'#1D4ED8'},notificationItem:{paddingVertical:9,borderTopWidth:1,borderTopColor:'#F1F5F9'},notificationUnread:{backgroundColor:'#EFF6FF',paddingHorizontal:7,borderRadius:7},notificationItemTitle:{fontSize:10,fontWeight:'800',color:'#1E293B'},notificationMessage:{fontSize:10,color:'#475569',lineHeight:15,marginTop:3},notificationDate:{fontSize:8,color:'#94A3B8',marginTop:4},submissionCard:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E2E8F0',borderRadius:12,padding:13,flexDirection:'row',alignItems:'center',gap:10,marginBottom:9},rejectionReason:{fontSize:10,color:'#B91C1C',marginTop:5},submissionDate:{fontSize:9,color:'#94A3B8',marginTop:5},rejectedLabel:{color:'#991B1B',backgroundColor:'#FEE2E2'},registerCard:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E6ECF4',borderRadius:18,padding:16,marginBottom:22,shadowColor:'#0F172A',shadowOpacity:.04,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:1},formRow:{flexDirection:'row',gap:8},registrationHint:{fontSize:10,color:'#64748B',lineHeight:15,marginBottom:12},locationBox:{backgroundColor:'#F8FAFC',borderRadius:12,padding:13,borderWidth:1,borderColor:'#E2E8F0',marginBottom:12},locationTitle:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:'#1E293B'},locationHint:{fontSize:10,color:'#64748B',marginTop:5,marginBottom:10},locationButton:{backgroundColor:'#EFF6FF',padding:11,borderRadius:9,alignItems:'center',marginBottom:8},locationButtonText:{fontSize:11,fontWeight:'800',color:'#1D4ED8'},clearLocation:{fontSize:10,color:'#DC2626',fontWeight:'800',marginTop:4},closeMap:{fontSize:10,fontWeight:'900',color:'#1D4ED8',padding:8},registerButton:{height:43,backgroundColor:'#0F766E',borderRadius:10,alignItems:'center',justifyContent:'center'},registerButtonText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:.4},header:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',rowGap:12,columnGap:10,marginBottom:20},headerActions:{flexDirection:'row',alignItems:'center',gap:7,flexShrink:0},brandHeader:{flexDirection:'row',alignItems:'center',gap:10,flex:1,minWidth:220},bellButton:{width:40,height:40,borderRadius:11,backgroundColor:'#EFF6FF',alignItems:'center',justifyContent:'center',position:'relative'},bellIcon:{fontSize:18},bellBadge:{position:'absolute',right:-4,top:-4,minWidth:17,height:17,borderRadius:9,backgroundColor:'#DC2626',alignItems:'center',justifyContent:'center',paddingHorizontal:3,borderWidth:1,borderColor:'#fff'},bellBadgeText:{fontSize:8,fontWeight:'900',color:'#fff'},notificationOverlay:{flex:1,backgroundColor:'#0F172A66',justifyContent:'flex-end'},notificationSheet:{maxHeight:'78%',backgroundColor:'#fff',borderTopLeftRadius:20,borderTopRightRadius:20,padding:18},notificationSheetHeader:{flexDirection:'row',alignItems:'center',gap:10,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'#E2E8F0'},notificationClose:{paddingHorizontal:9,paddingVertical:7,backgroundColor:'#F1F5F9',borderRadius:8},notificationCloseText:{fontSize:9,fontWeight:'900',color:'#475569'},notificationList:{paddingBottom:24},notificationEmpty:{paddingVertical:35,textAlign:'center',fontSize:12,color:'#64748B'},passwordForm:{paddingTop:16,paddingBottom:10},passwordLabel:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:'#475569',marginBottom:6,marginTop:10},passwordInput:{height:46,borderWidth:1,borderColor:'#CBD5E1',borderRadius:10,paddingHorizontal:12,backgroundColor:'#fff',color:'#0F172A',marginBottom:8},passwordSubmit:{height:46,backgroundColor:'#1D4ED8',borderRadius:10,alignItems:'center',justifyContent:'center',marginTop:14},passwordSubmitText:{fontSize:10,fontWeight:'900',color:'#fff'},kicker:{color:'#64748B',fontSize:9,fontWeight:'800',letterSpacing:1.3},heading:{color:'#0F172A',fontSize:26,fontWeight:'800',marginTop:6},subheading:{color:'#64748B',fontSize:12,marginTop:4},logout:{paddingHorizontal:9,paddingVertical:10,backgroundColor:'#F1F5F9',borderRadius:9,flexShrink:0},logoutText:{fontSize:9,fontWeight:'800',color:'#1D4ED8'},summaryCard:{backgroundColor:'#173B75',borderRadius:20,padding:20,marginBottom:22,shadowColor:'#173B75',shadowOpacity:.16,shadowRadius:14,shadowOffset:{width:0,height:7},elevation:3},summaryLabel:{color:'#DBEAFE',fontSize:9,fontWeight:'800',letterSpacing:1},summaryStatus:{color:'#fff',fontSize:21,fontWeight:'800',marginTop:8},summaryDivider:{height:1,backgroundColor:'#FFFFFF30',marginVertical:16},metrics:{flexDirection:'row',gap:55},metricValue:{color:'#fff',fontSize:19,fontWeight:'800'},metricLabel:{color:'#DBEAFE',fontSize:10,marginTop:4},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',marginBottom:12},sectionTitle:{color:'#0F172A',fontSize:17,fontWeight:'800'},sectionHint:{color:'#64748B',fontSize:11,marginTop:4},shopCount:{color:'#64748B',fontSize:9,fontWeight:'800'},search:{height:47,borderRadius:11,borderWidth:1,borderColor:'#E2E8F0',backgroundColor:'#fff',paddingHorizontal:13,color:'#1E293B',marginBottom:12},shopCard:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E6ECF4',borderRadius:16,padding:15,flexDirection:'row',alignItems:'center',marginBottom:10,gap:10,shadowColor:'#0F172A',shadowOpacity:.035,shadowRadius:9,shadowOffset:{width:0,height:3},elevation:1},shopInfo:{flex:1},shopName:{color:'#1E293B',fontSize:12,fontWeight:'800'},shopArea:{color:'#64748B',fontSize:10,marginTop:5},checkButton:{minWidth:84,height:36,backgroundColor:'#2563EB',borderRadius:9,alignItems:'center',justifyContent:'center',paddingHorizontal:10},checkText:{color:'#fff',fontSize:9,fontWeight:'800'},pendingLabel:{fontSize:8,fontWeight:'900',color:'#92400E',backgroundColor:'#FEF3C7',paddingHorizontal:8,paddingVertical:7,borderRadius:8,overflow:'hidden'},historyHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:20,marginBottom:11},visitCard:{backgroundColor:'#fff',borderRadius:12,padding:13,flexDirection:'row',alignItems:'center',marginBottom:8},verified:{fontSize:8,color:'#1D4ED8',fontWeight:'800'},empty:{color:'#64748B',fontSize:11,textAlign:'center',padding:18,backgroundColor:'#fff',borderRadius:12},footer:{color:'#94A3B8',fontSize:9,lineHeight:15,textAlign:'center',marginTop:22},muted:{color:'#64748B',fontSize:12}});
