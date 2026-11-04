import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { api, TeamEmployee } from '../lib/api';
import { clearSession, getSession } from '../lib/session';

export default function ManagerScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [managerName, setManagerName] = useState('Manager');
  const [team, setTeam] = useState<TeamEmployee[]>([]);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (activeToken: string) => {
    const result = await api.teamToday(activeToken);
    setTeam(result.employees);
    setDate(result.date);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (!session) {
          router.replace('/');
          return;
        }
        if (session.user.role !== 'manager') {
          router.replace(session.user.role === 'admin' ? '/admin' : '/dashboard');
          return;
        }
        setToken(session.token);
        setManagerName(session.user.name);
        await load(session.token);
      } catch (error) {
        if (error instanceof Error && /token|account|auth/i.test(error.message)) {
          await clearSession();
          router.replace('/');
          return;
        }
        Alert.alert('Could not load team', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        setBusy(false);
      }
    })();
  }, [load]);

  const refresh = async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      await load(token);
    } catch (error) {
      Alert.alert('Refresh failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const logout = async () => {
    await clearSession();
    router.replace('/');
  };

  const activeTeam = team.filter(employee => employee.active);
  const presentCount = activeTeam.filter(employee => employee.attendance === 'Present').length;
  const visitCount = activeTeam.reduce((total, employee) => total + employee.visitCount, 0);

  if (busy) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.muted}>Loading your team…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#2563EB" />}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandLetter}>S</Text></View>
            <View>
              <Text style={styles.kicker}>SAMRIDHI ENTERPRISES</Text>
              <Text style={styles.heading}>Manager workspace</Text>
            </View>
          </View>
          <Pressable onPress={logout} style={styles.logout}>
            <Text style={styles.logoutText}>LOG OUT</Text>
          </Pressable>
        </View>

        <View style={styles.welcome}>
          <Text style={styles.welcomeEyebrow}>TEAM OVERVIEW</Text>
          <Text style={styles.welcomeTitle}>Hello, {managerName.split(' ')[0]}.</Text>
          <Text style={styles.welcomeText}>Here is your team's attendance and verified field activity.</Text>
        </View>

        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>TODAY'S REPORT</Text>
          <Text style={styles.dateValue}>{date ? date.split('-').reverse().join('/') : '—'}</Text>
        </View>

        <View style={styles.stats}>
          <Stat label="Assigned employees" value={activeTeam.length} />
          <Stat label="Present today" value={presentCount} />
          <Stat label="Not marked" value={Math.max(activeTeam.length - presentCount, 0)} />
          <Stat label="Verified visits" value={visitCount} />
        </View>

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>My employees</Text>
            <Text style={styles.sectionHint}>Only employees assigned to your manager account are shown.</Text>
          </View>
          <Text style={styles.count}>{team.length} TOTAL</Text>
        </View>

        {team.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No employees assigned yet</Text>
            <Text style={styles.emptyText}>Ask the administrator to assign employees to your manager account.</Text>
          </View>
        ) : (
          team.map(employee => (
            <View key={employee._id} style={[styles.employeeCard, !employee.active && styles.inactiveCard]}>
              <View style={styles.employeeHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{employee.name.trim().charAt(0).toUpperCase() || 'E'}</Text>
                </View>
                <View style={styles.employeeInfo}>
                  <Text style={styles.employeeName}>{employee.name}</Text>
                  <Text style={styles.employeeId}>{employee.employeeId}</Text>
                </View>
                <View style={[
                  styles.statusPill,
                  employee.active
                    ? employee.attendance === 'Present' ? styles.presentPill : styles.pendingPill
                    : styles.inactivePill
                ]}>
                  <Text style={[
                    styles.statusText,
                    employee.active
                      ? employee.attendance === 'Present' ? styles.presentText : styles.pendingText
                      : styles.inactiveText
                  ]}>
                    {!employee.active ? 'Inactive' : employee.attendance === 'Present' ? 'Present' : 'Not marked'}
                  </Text>
                </View>
              </View>

              <View style={styles.employeeMetrics}>
                <View>
                  <Text style={styles.metricValue}>{employee.visitCount}</Text>
                  <Text style={styles.metricLabel}>Verified visits today</Text>
                </View>
                <View style={styles.metricDivider} />
                <View>
                  <Text style={styles.metricValue}>{employee.active ? 'Active' : 'Disabled'}</Text>
                  <Text style={styles.metricLabel}>Account status</Text>
                </View>
              </View>

              {employee.visits.length > 0 && (
                <View style={styles.visitsSection}>
                  <Text style={styles.visitsTitle}>TODAY'S SHOP VISITS</Text>
                  {employee.visits.map(visit => (
                    <View key={visit._id} style={styles.visitRow}>
                      <View style={styles.visitDot} />
                      <View style={styles.visitInfo}>
                        <Text style={styles.visitShop}>{visit.shop?.name || 'Registered shop'}</Text>
                        <Text style={styles.visitMeta}>
                          {visit.shop?.shopCode || '—'} · {new Date(visit.checkedInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <Text style={styles.distance}>{Math.round(visit.distanceMeters)} m</Text>
                    </View>
                  ))}
                </View>
              )}

              {employee.active && employee.visits.length === 0 && (
                <Text style={styles.noVisits}>No verified shop visits recorded today.</Text>
              )}
            </View>
          ))
        )}

        <Text style={styles.footer}>
          Team information is restricted to employees assigned to your manager account. Pull down to refresh today's report.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F8FAFC' },
  muted: { color: '#64748B', fontSize: 12 },
  content: { padding: 18, paddingBottom: 36 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 39, height: 39, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  brandLetter: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  kicker: { color: '#64748B', fontSize: 8, fontWeight: '900', letterSpacing: 1.15 },
  heading: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 3 },
  logout: { backgroundColor: '#F1F5F9', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9 },
  logoutText: { color: '#1D4ED8', fontSize: 9, fontWeight: '900' },
  welcome: { backgroundColor: '#2563EB', borderRadius: 17, padding: 20, marginBottom: 17 },
  welcomeEyebrow: { color: '#DBEAFE', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  welcomeTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 8 },
  welcomeText: { color: '#DBEAFE', fontSize: 11, lineHeight: 17, marginTop: 5 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  dateLabel: { color: '#64748B', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  dateValue: { color: '#1E293B', fontSize: 11, fontWeight: '800' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 23 },
  statCard: { width: '48%', flexGrow: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 13, padding: 14 },
  statValue: { color: '#1D4ED8', fontSize: 23, fontWeight: '900' },
  statLabel: { color: '#64748B', fontSize: 10, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, gap: 8 },
  sectionTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  sectionHint: { color: '#64748B', fontSize: 10, lineHeight: 15, marginTop: 4 },
  count: { color: '#64748B', fontSize: 8, fontWeight: '900' },
  emptyCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, padding: 22, alignItems: 'center' },
  emptyTitle: { color: '#0F172A', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 7, textAlign: 'center' },
  employeeCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 14, marginBottom: 11 },
  inactiveCard: { opacity: 0.72 },
  employeeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#1D4ED8', fontSize: 15, fontWeight: '900' },
  employeeInfo: { flex: 1 },
  employeeName: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  employeeId: { color: '#64748B', fontSize: 10, marginTop: 3 },
  statusPill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  presentPill: { backgroundColor: '#EFF6FF' },
  pendingPill: { backgroundColor: '#F1F5F9' },
  inactivePill: { backgroundColor: '#F1F5F9' },
  statusText: { fontSize: 8, fontWeight: '900' },
  presentText: { color: '#1D4ED8' },
  pendingText: { color: '#64748B' },
  inactiveText: { color: '#64748B' },
  employeeMetrics: { flexDirection: 'row', gap: 24, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  metricValue: { color: '#1E293B', fontSize: 13, fontWeight: '900' },
  metricLabel: { color: '#64748B', fontSize: 9, marginTop: 3 },
  metricDivider: { width: 1, backgroundColor: '#E2E8F0' },
  visitsSection: { marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  visitsTitle: { color: '#64748B', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  visitDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2563EB' },
  visitInfo: { flex: 1 },
  visitShop: { color: '#1E293B', fontSize: 10, fontWeight: '800' },
  visitMeta: { color: '#64748B', fontSize: 9, marginTop: 3 },
  distance: { color: '#64748B', fontSize: 9, fontVariant: ['tabular-nums'] },
  noVisits: { color: '#64748B', fontSize: 10, marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  footer: { color: '#94A3B8', fontSize: 9, lineHeight: 15, textAlign: 'center', marginTop: 16 },
});
