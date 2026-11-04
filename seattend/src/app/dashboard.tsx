import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

const SAMPLE_SHOPS = [
  { id: '1', name: 'Shree Balaji Auto Parts', area: 'Civil Lines', code: 'SHOP-001' },
  { id: '2', name: 'National Motor Store', area: 'Roorkee Road', code: 'SHOP-002' },
  { id: '3', name: 'Agarwal Spare Centre', area: 'Main Bazaar', code: 'SHOP-003' },
  { id: '4', name: 'Modern Auto Traders', area: 'Industrial Area', code: 'SHOP-004' },
];

export default function DashboardScreen() {
  const [query, setQuery] = useState('');
  const [selectedShop, setSelectedShop] = useState<string | null>(null);

  const shops = useMemo(
    () => SAMPLE_SHOPS.filter((shop) =>
      `${shop.name} ${shop.area} ${shop.code}`.toLowerCase().includes(query.trim().toLowerCase()),
    ),
    [query],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>SAMRIDHI ENTERPRISES</Text>
            <Text style={styles.heading}>Good morning</Text>
            <Text style={styles.subheading}>Your field activity at a glance.</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>SE</Text></View>
        </View>

        <View style={styles.previewNotice}>
          <Text style={styles.previewTitle}>Preview mode</Text>
          <Text style={styles.previewText}>Sample shops and figures are shown. Sign-in, live shop data and attendance submission are not connected yet.</Text>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.summaryLabel}>TODAY'S ATTENDANCE</Text>
              <Text style={styles.summaryStatus}>Not marked yet</Text>
            </View>
            <View style={styles.pendingPill}><View style={styles.pendingDot}/><Text style={styles.pendingText}>PENDING</Text></View>
          </View>
          <View style={styles.summaryDivider}/>
          <View style={styles.summaryBottom}>
            <View><Text style={styles.metricValue}>0</Text><Text style={styles.metricLabel}>Verified visits</Text></View>
            <View style={styles.metricDivider}/>
            <View><Text style={styles.metricValue}>50 m</Text><Text style={styles.metricLabel}>Check-in radius</Text></View>
            <View style={styles.metricDivider}/>
            <View><Text style={styles.metricValue}>Today</Text><Text style={styles.metricLabel}>Visit date</Text></View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Find a shop</Text><Text style={styles.sectionHint}>Visit any registered shop</Text></View>
          <Text style={styles.shopCount}>{shops.length} SHOPS</Text>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Search registered shops"
            onChangeText={setQuery}
            placeholder="Search shop name, area or ID"
            placeholderTextColor="#9AA5B4"
            style={styles.searchInput}
            value={query}
          />
          {query.length > 0 && <Pressable onPress={() => setQuery('')}><Text style={styles.clearSearch}>×</Text></Pressable>}
        </View>

        {shops.map((shop) => (
          <Pressable
            key={shop.id}
            onPress={() => setSelectedShop(selectedShop === shop.id ? null : shop.id)}
            style={({ pressed }) => [styles.shopCard, selectedShop === shop.id && styles.shopCardSelected, pressed && styles.pressed]}>
            <View style={styles.shopIcon}><Text style={styles.shopIconText}>⌂</Text></View>
            <View style={styles.shopInfo}>
              <Text style={styles.shopName}>{shop.name}</Text>
              <Text style={styles.shopArea}>{shop.area}  ·  {shop.code}</Text>
              {selectedShop === shop.id && (
                <View style={styles.shopDetail}>
                  <Text style={styles.shopDetailText}>GPS check-in will verify that you are within 50 metres of this shop.</Text>
                  <View style={styles.locationButton}><Text style={styles.locationButtonText}>GPS check-in not connected yet</Text></View>
                </View>
              )}
            </View>
            <Text style={styles.chevron}>{selectedShop === shop.id ? '−' : '›'}</Text>
          </Pressable>
        ))}

        {shops.length === 0 && (
          <View style={styles.emptyState}><Text style={styles.emptyTitle}>No shops found</Text><Text style={styles.emptyText}>Try another shop name or area.</Text></View>
        )}

        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <Text style={styles.historyLink}>VIEW ALL</Text>
        </View>
        <View style={styles.historyCard}>
          <View style={styles.historyIcon}><Text style={styles.historyIconText}>↗</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.historyTitle}>No visits recorded today</Text><Text style={styles.historySubtitle}>Your verified shop visits will appear here.</Text></View>
          <View style={styles.historyStatus}><Text style={styles.historyStatusText}>—</Text></View>
        </View>
        <Text style={styles.footer}>Location is requested only when you check in. Attendance is confirmed by the server.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { paddingHorizontal: 21, paddingTop: 15, paddingBottom: 35 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  kicker: { color: '#718096', fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  heading: { color: '#142B49', fontSize: 27, fontWeight: '800', letterSpacing: -0.7, marginTop: 7 },
  subheading: { color: '#7C8796', fontSize: 12, marginTop: 5 },
  avatar: { width: 43, height: 43, borderRadius: 15, backgroundColor: '#E5ECF5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#23466F', fontSize: 13, fontWeight: '800' },
  previewNotice: { backgroundColor: '#FFF8E9', borderColor: '#F1E2BD', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  previewTitle: { color: '#8B641C', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  previewText: { color: '#8B744B', fontSize: 10, lineHeight: 15 },
  summaryCard: { backgroundColor: '#173B68', borderRadius: 19, padding: 18, marginBottom: 27 },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: '#B9CBE0', fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  summaryStatus: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', marginTop: 7 },
  pendingPill: { backgroundColor: '#FFFFFF1A', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pendingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F2C66D' },
  pendingText: { color: '#F4D99F', fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  summaryDivider: { height: 1, backgroundColor: '#FFFFFF25', marginVertical: 17 },
  summaryBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  metricValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  metricLabel: { color: '#B9CBE0', fontSize: 9, marginTop: 5 },
  metricDivider: { width: 1, backgroundColor: '#FFFFFF30' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#1B304B', fontSize: 17, fontWeight: '800' },
  sectionHint: { color: '#8A95A3', fontSize: 11, marginTop: 4 },
  shopCount: { color: '#7B8A9D', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  searchBox: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E4E9EF', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, marginBottom: 12 },
  searchIcon: { color: '#718096', fontSize: 24, marginRight: 9 },
  searchInput: { flex: 1, color: '#243B58', fontSize: 12, height: '100%' },
  clearSearch: { color: '#7B8796', fontSize: 22, paddingHorizontal: 4 },
  shopCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EDF2', borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 9 },
  shopCardSelected: { borderColor: '#6D8FB8', backgroundColor: '#FBFDFF' },
  pressed: { opacity: 0.82 },
  shopIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EDF2F8', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  shopIconText: { color: '#31577F', fontSize: 21, fontWeight: '700' },
  shopInfo: { flex: 1, paddingTop: 2 },
  shopName: { color: '#243A56', fontSize: 12, fontWeight: '800' },
  shopArea: { color: '#8792A1', fontSize: 10, marginTop: 5 },
  chevron: { color: '#8391A2', fontSize: 22, paddingHorizontal: 4 },
  shopDetail: { marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E9EEF4' },
  shopDetailText: { color: '#788697', fontSize: 10, lineHeight: 15 },
  locationButton: { alignSelf: 'flex-start', backgroundColor: '#EDF2F8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 9 },
  locationButtonText: { color: '#466487', fontSize: 9, fontWeight: '800' },
  emptyState: { backgroundColor: '#FFFFFF', borderRadius: 13, padding: 22, alignItems: 'center', marginBottom: 12 },
  emptyTitle: { color: '#263D5A', fontSize: 13, fontWeight: '800' },
  emptyText: { color: '#8792A1', fontSize: 11, marginTop: 5 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 12 },
  historyLink: { color: '#56769B', fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  historyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E9EDF2', padding: 13 },
  historyIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#EFF3F7', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  historyIconText: { color: '#5E7898', fontSize: 18, fontWeight: '800' },
  historyTitle: { color: '#344A64', fontSize: 11, fontWeight: '800' },
  historySubtitle: { color: '#929DAB', fontSize: 9, marginTop: 4 },
  historyStatus: { width: 25, height: 25, borderRadius: 8, backgroundColor: '#F3F5F7', alignItems: 'center', justifyContent: 'center' },
  historyStatusText: { color: '#8995A3', fontSize: 13 },
  footer: { color: '#9AA4B0', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 22, paddingHorizontal: 10 },
});
