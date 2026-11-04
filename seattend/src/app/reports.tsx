import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, AttendanceReport } from '../lib/api';
import CalendarDatePicker from '../components/CalendarDatePicker';
import { clearSession, getSession } from '../lib/session';

function kolkataDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values: Record<string, string> = {};
  parts.forEach(part => { values[part.type] = part.value; });
  return values.year + '-' + values.month + '-' + values.day;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function displayDate(value: string) {
  const parts = value.split('-');
  return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : value;
}

export default function ReportsScreen() {
  const today = kolkataDate();
  const [token, setToken] = useState<string | null>(null);
  const [from, setFrom] = useState(today.slice(0, 7) + '-01');
  const [to, setTo] = useState(today);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [employeeOptions, setEmployeeOptions] = useState<AttendanceReport['employees']>([]);
  const [busy, setBusy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (!session) {
          router.replace('/');
          return;
        }
        if (session.user.role !== 'admin') {
          router.replace('/dashboard');
          return;
        }
        setToken(session.token);
        const initial = await api.attendanceReport(session.token, today.slice(0, 7) + '-01', today);
        setReport(initial);
        setEmployeeOptions(initial.employees);
      } catch (error) {
        if (error instanceof Error && /token|account|auth/i.test(error.message)) {
          await clearSession();
          router.replace('/');
          return;
        }
        Alert.alert('Could not load reports', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const runReport = async (employeeId = selectedEmployeeId) => {
    if (!token) return;
    if (!validDate(from) || !validDate(to)) {
      Alert.alert('Invalid dates', 'Select both dates using the calendar.');
      return;
    }
    if (from > to) {
      Alert.alert('Invalid date range', 'The end date must be on or after the start date.');
      return;
    }
    const rangeDays = Math.floor((new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86400000) + 1;
    if (rangeDays > 92) {
      Alert.alert('Date range too large', 'Choose a date range of 92 days or less.');
      return;
    }
    setLoading(true);
    try {
      const result = await api.attendanceReport(token, from, to, employeeId || undefined);
      setSelectedEmployeeId(employeeId);
      setReport(result);
      setExpandedEmployee('');
    } catch (error) {
      Alert.alert('Report failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const chooseEmployee = async (employeeId: string) => {
    await runReport(employeeId);
  };

  const exportReport = async () => {
    if (!token || !report) return;
    setExporting(true);
    try {
      const csv = await api.attendanceReportCsv(token, report.from, report.to, selectedEmployeeId || undefined);
      const suffix = selectedEmployeeId ? '-employee' : '-all-employees';
      const fileName = 'samridhi-attendance-' + report.from + '-to-' + report.to + suffix + '.csv';
      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true });
      await file.write(csv);
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('File sharing is not available on this device. The report was generated but could not be shared.');
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Share Samridhi attendance report',
        UTI: 'public.comma-separated-values-text'
      });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const logout = async () => {
    await clearSession();
    router.replace('/');
  };

  if (busy) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.muted}>Preparing attendance reports…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => runReport()} tintColor="#2563EB" />}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/admin')} style={styles.backButton}>
            <Text style={styles.backText}>‹  ADMIN</Text>
          </Pressable>
          <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>LOG OUT</Text></Pressable>
        </View>

        <Text style={styles.kicker}>SAMRIDHI ENTERPRISES</Text>
        <Text style={styles.title}>Attendance reports</Text>
        <Text style={styles.subtitle}>Review employee attendance and verified shop visits. Dates follow India Standard Time.</Text>

        <View style={styles.filterCard}>
          <Text style={styles.cardTitle}>Report period</Text>
          <View style={styles.dateFields}>
            <CalendarDatePicker label="FROM DATE" value={from} onChange={setFrom} mode="date" maxDate={to}/>
            <CalendarDatePicker label="TO DATE" value={to} onChange={setTo} mode="date" minDate={from} maxDate={today}/>
          </View>
          <Text style={styles.helper}>Maximum range: 92 days. The monthly report opens by default.</Text>
          <Pressable disabled={loading} onPress={() => runReport()} style={[styles.primaryButton, loading && styles.disabled]}>
            {loading ? <ActivityIndicator color="#FFFFFF"/> : <Text style={styles.primaryText}>Generate report</Text>}
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Employee filter</Text>
        <Text style={styles.sectionHint}>Choose an employee or view everyone.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <FilterChip label="All employees" selected={!selectedEmployeeId} onPress={() => chooseEmployee('')}/>
          {employeeOptions.map(employee => (
            <FilterChip key={employee.id} label={employee.name} selected={selectedEmployeeId === employee.id} onPress={() => chooseEmployee(employee.id)}/>
          ))}
        </ScrollView>

        {report && <>
          <View style={styles.reportHeader}>
            <View style={{flex:1}}>
              <Text style={styles.sectionTitle}>Report summary</Text>
              <Text style={styles.sectionHint}>{displayDate(report.from)} – {displayDate(report.to)}</Text>
            </View>
            <Pressable disabled={exporting || loading} onPress={exportReport} style={[styles.exportButton, (exporting || loading) && styles.disabled]}>
              {exporting ? <ActivityIndicator size="small" color="#FFFFFF"/> : <Text style={styles.exportText}>↓  Excel / CSV</Text>}
            </Pressable>
          </View>

          <View style={styles.stats}>
            <Stat label="Employees" value={report.totals.employeeCount}/>
            <Stat label="Present employees" value={report.totals.employeesWithAttendance}/>
            <Stat label="Employee present-days" value={report.totals.presentDays}/>
            <Stat label="Verified visits" value={report.totals.visitCount}/>
          </View>

          <Text style={styles.sectionTitle}>Employee breakdown</Text>
          <Text style={styles.sectionHint}>Tap an employee to expand day-wise attendance and shop visits.</Text>

          {report.employees.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>No employees found for this report.</Text></View>
          ) : report.employees.map(employee => {
            const expanded = expandedEmployee === employee.id;
            return (
              <View key={employee.id} style={styles.employeeCard}>
                <Pressable onPress={() => setExpandedEmployee(expanded ? '' : employee.id)} style={styles.employeeTop}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{employee.name.trim().charAt(0).toUpperCase() || 'E'}</Text></View>
                  <View style={styles.employeeInfo}>
                    <Text style={styles.employeeName}>{employee.name}</Text>
                    <Text style={styles.employeeId}>{employee.employeeId} · {employee.active ? 'Active' : 'Inactive'}</Text>
                  </View>
                  <View style={styles.summaryNumbers}>
                    <Text style={styles.presentDays}>{employee.presentDays} days</Text>
                    <Text style={styles.visitTotal}>{employee.visitCount} visits</Text>
                  </View>
                  <Text style={styles.chevron}>{expanded ? '−' : '+'}</Text>
                </Pressable>
                {expanded && (
                  <View style={styles.attendanceDetails}>
                    {employee.attendance.length === 0 ? (
                      <Text style={styles.noAttendance}>No attendance marked in this period.</Text>
                    ) : employee.attendance.map(day => (
                      <View key={day.date} style={styles.dayBlock}>
                        <View style={styles.dayHeader}>
                          <Text style={styles.dayDate}>{displayDate(day.date)}</Text>
                          <Text style={styles.dayCount}>{day.visitCount} verified {day.visitCount === 1 ? 'visit' : 'visits'}</Text>
                        </View>
                        {day.visits.map(visit => (
                          <View key={visit.id} style={styles.visitRow}>
                            <View style={{flex:1}}>
                              <Text style={styles.shopName}>{visit.shopName}</Text>
                              <Text style={styles.visitMeta}>{visit.shopCode} · {new Date(visit.checkedInAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'})}</Text>
                            </View>
                            <Text style={styles.distance}>{Math.round(visit.distanceMeters)} m</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
          <Text style={styles.generated}>Generated {new Date(report.generatedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} · Time zone: Asia/Kolkata</Text>
        </>}
        <Text style={styles.footer}>Admin-only report. Exported CSV files can be opened in Microsoft Excel or Google Sheets.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <View style={styles.statCard}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F8FAFC' },
  muted: { color: '#64748B', fontSize: 12 },
  content: { padding: 18, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  backButton: { paddingVertical: 8, paddingRight: 14 },
  backText: { color: '#1D4ED8', fontSize: 10, fontWeight: '900' },
  logout: { backgroundColor: '#F1F5F9', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9 },
  logoutText: { color: '#1D4ED8', fontSize: 9, fontWeight: '900' },
  kicker: { color: '#64748B', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#0F172A', fontSize: 27, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 6, marginBottom: 18 },
  filterCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 15, padding: 15, marginBottom: 20 },
  cardTitle: { color: '#0F172A', fontSize: 14, fontWeight: '900', marginBottom: 13 },
  dateFields: { flexDirection: 'row', gap: 9 },
  dateField: { flex: 1 },
  label: { color: '#64748B', fontSize: 8, fontWeight: '900', marginBottom: 6 },
  input: { height: 43, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 9, paddingHorizontal: 10, color: '#1E293B', fontSize: 11 },
  helper: { color: '#94A3B8', fontSize: 9, marginTop: 8 },
  primaryButton: { backgroundColor: '#2563EB', borderRadius: 10, minHeight: 45, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  primaryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.65 },
  sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  sectionHint: { color: '#64748B', fontSize: 10, lineHeight: 15, marginTop: 3, marginBottom: 10 },
  chipRow: { gap: 7, paddingBottom: 18 },
  chip: { maxWidth: 170, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  chipSelected: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  chipText: { color: '#64748B', fontSize: 9, fontWeight: '800' },
  chipTextSelected: { color: '#1D4ED8' },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  exportButton: { backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, minWidth: 112, alignItems: 'center' },
  exportText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 22 },
  statCard: { width: '48%', flexGrow: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 13 },
  statValue: { color: '#1D4ED8', fontSize: 22, fontWeight: '900' },
  statLabel: { color: '#64748B', fontSize: 9, marginTop: 4 },
  employeeCard: { backgroundColor: '#FFFFFF', borderRadius: 13, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 9, overflow: 'hidden' },
  employeeTop: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12 },
  avatar: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#1D4ED8', fontSize: 14, fontWeight: '900' },
  employeeInfo: { flex: 1 },
  employeeName: { color: '#0F172A', fontSize: 11, fontWeight: '900' },
  employeeId: { color: '#64748B', fontSize: 8, marginTop: 3 },
  summaryNumbers: { alignItems: 'flex-end' },
  presentDays: { color: '#1D4ED8', fontSize: 10, fontWeight: '900' },
  visitTotal: { color: '#64748B', fontSize: 8, marginTop: 3 },
  chevron: { color: '#64748B', fontSize: 18, fontWeight: '700', marginLeft: 2 },
  attendanceDetails: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingHorizontal: 13, paddingBottom: 8 },
  noAttendance: { color: '#64748B', fontSize: 10, paddingVertical: 14 },
  dayBlock: { paddingTop: 11, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  dayDate: { color: '#0F172A', fontSize: 10, fontWeight: '900' },
  dayCount: { color: '#64748B', fontSize: 8 },
  visitRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 7 },
  shopName: { color: '#1E293B', fontSize: 10, fontWeight: '800' },
  visitMeta: { color: '#64748B', fontSize: 8, marginTop: 3 },
  distance: { color: '#64748B', fontSize: 9, fontVariant: ['tabular-nums'] },
  emptyCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 13, padding: 20, alignItems: 'center' },
  emptyText: { color: '#64748B', fontSize: 10 },
  generated: { color: '#94A3B8', fontSize: 8, marginTop: 10, textAlign: 'center' },
  footer: { color: '#94A3B8', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 23 }
});
