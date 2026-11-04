import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { api, Shop, TodayResponse } from '../lib/api';
import { clearSession, getSession } from '../lib/session';

export default function DashboardScreen() {
  const [token,setToken] = useState<string|null>(null);
  const [name,setName] = useState('Employee');
  const [shops,setShops] = useState<Shop[]>([]);
  const [today,setToday] = useState<TodayResponse|null>(null);
  const [query,setQuery] = useState('');
  const [busy,setBusy] = useState(true);
  const [checking,setChecking] = useState<string|null>(null);
  const [refreshing,setRefreshing] = useState(false);

  const load = useCallback(async (activeToken:string) => {
    const [shopResult, todayResult] = await Promise.all([api.shops(activeToken),api.today(activeToken)]);
    setShops(shopResult.shops); setToday(todayResult);
  },[]);
  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (!session) { router.replace('/'); return; }
        if (session.user.role === 'admin') { router.replace('/admin'); return; }
        setToken(session.token); setName(session.user.name);
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
  const filtered = useMemo(() => shops.filter(s => `${s.name} ${s.area||''} ${s.shopCode}`.toLowerCase().includes(query.trim().toLowerCase())),[shops,query]);

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

  const logout = async () => { await clearSession(); router.replace('/'); };
  if (busy) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563EB"/><Text style={styles.muted}>Loading your attendance…</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safeArea}><StatusBar style="dark"/><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>}>
    <View style={styles.header}><View><Text style={styles.kicker}>SAMRIDHI ENTERPRISES</Text><Text style={styles.heading}>Hello, {name.split(' ')[0]}</Text><Text style={styles.subheading}>Your field activity at a glance.</Text></View><Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>LOG OUT</Text></Pressable></View>
    <View style={styles.summaryCard}><Text style={styles.summaryLabel}>TODAY'S ATTENDANCE · {today?.date||'—'}</Text><Text style={styles.summaryStatus}>{today?.attendance||'Not marked'}</Text><View style={styles.summaryDivider}/><View style={styles.metrics}><View><Text style={styles.metricValue}>{today?.visitCount??0}</Text><Text style={styles.metricLabel}>Verified visits</Text></View><View><Text style={styles.metricValue}>50 m</Text><Text style={styles.metricLabel}>Check-in radius</Text></View></View></View>
    <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Find a shop</Text><Text style={styles.sectionHint}>Check in at any registered shop</Text></View><Text style={styles.shopCount}>{shops.length} SHOPS</Text></View>
    <TextInput accessibilityLabel="Search registered shops" value={query} onChangeText={setQuery} placeholder="Search shop name, area or ID" placeholderTextColor="#9AA5B4" style={styles.search}/>
    {filtered.map(shop=><View key={shop._id} style={styles.shopCard}><View style={styles.shopInfo}><Text style={styles.shopName}>{shop.name}</Text><Text style={styles.shopArea}>{shop.area||shop.address||'Registered shop'} · {shop.shopCode}</Text></View><Pressable disabled={!!checking} onPress={()=>checkIn(shop)} style={({pressed})=>[styles.checkButton,pressed&&{opacity:.8},checking===shop._id&&{opacity:.6}]}>{checking===shop._id?<ActivityIndicator color="#fff"/>:<Text style={styles.checkText}>CHECK IN</Text>}</Pressable></View>)}
    {filtered.length===0&&<Text style={styles.empty}>No registered shops match your search.</Text>}
    <View style={styles.historyHeader}><Text style={styles.sectionTitle}>Today's visits</Text><Text style={styles.shopCount}>{today?.visits.length||0} RECORDED</Text></View>
    {(today?.visits||[]).map(v=><View key={v._id} style={styles.visitCard}><View style={{flex:1}}><Text style={styles.shopName}>{v.shop?.name||'Shop visit'}</Text><Text style={styles.shopArea}>{v.shop?.shopCode||''} · {new Date(v.checkedInAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</Text></View><Text style={styles.verified}>VERIFIED</Text></View>)}
    {(!today?.visits||today.visits.length===0)&&<Text style={styles.empty}>Your verified shop visits will appear here.</Text>}
    <Text style={styles.footer}>Location is requested only when you press Check In. The server verifies the 50-metre distance using registered shop coordinates.</Text>
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safeArea:{flex:1,backgroundColor:'#F8FAFC'},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:'#F8FAFC'},content:{padding:20,paddingBottom:36},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:22},kicker:{color:'#64748B',fontSize:9,fontWeight:'800',letterSpacing:1.3},heading:{color:'#0F172A',fontSize:26,fontWeight:'800',marginTop:6},subheading:{color:'#64748B',fontSize:12,marginTop:4},logout:{padding:10,backgroundColor:'#F1F5F9',borderRadius:9},logoutText:{fontSize:9,fontWeight:'800',color:'#1D4ED8'},summaryCard:{backgroundColor:'#2563EB',borderRadius:18,padding:18,marginBottom:25},summaryLabel:{color:'#DBEAFE',fontSize:9,fontWeight:'800',letterSpacing:1},summaryStatus:{color:'#fff',fontSize:21,fontWeight:'800',marginTop:8},summaryDivider:{height:1,backgroundColor:'#FFFFFF30',marginVertical:16},metrics:{flexDirection:'row',gap:55},metricValue:{color:'#fff',fontSize:19,fontWeight:'800'},metricLabel:{color:'#DBEAFE',fontSize:10,marginTop:4},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',marginBottom:12},sectionTitle:{color:'#0F172A',fontSize:17,fontWeight:'800'},sectionHint:{color:'#64748B',fontSize:11,marginTop:4},shopCount:{color:'#64748B',fontSize:9,fontWeight:'800'},search:{height:47,borderRadius:11,borderWidth:1,borderColor:'#E2E8F0',backgroundColor:'#fff',paddingHorizontal:13,color:'#1E293B',marginBottom:12},shopCard:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E2E8F0',borderRadius:13,padding:13,flexDirection:'row',alignItems:'center',marginBottom:9,gap:10},shopInfo:{flex:1},shopName:{color:'#1E293B',fontSize:12,fontWeight:'800'},shopArea:{color:'#64748B',fontSize:10,marginTop:5},checkButton:{minWidth:84,height:36,backgroundColor:'#2563EB',borderRadius:9,alignItems:'center',justifyContent:'center',paddingHorizontal:10},checkText:{color:'#fff',fontSize:9,fontWeight:'800'},historyHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:20,marginBottom:11},visitCard:{backgroundColor:'#fff',borderRadius:12,padding:13,flexDirection:'row',alignItems:'center',marginBottom:8},verified:{fontSize:8,color:'#1D4ED8',fontWeight:'800'},empty:{color:'#64748B',fontSize:11,textAlign:'center',padding:18,backgroundColor:'#fff',borderRadius:12},footer:{color:'#94A3B8',fontSize:9,lineHeight:15,textAlign:'center',marginTop:22},muted:{color:'#64748B',fontSize:12}});
