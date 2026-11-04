import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type CalendarDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  mode?: 'date' | 'month';
  minDate?: string;
  maxDate?: string;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseValue(value: string, mode: 'date' | 'month') {
  const parts = value.split('-').map(Number);
  if (parts.length < 2 || !parts[0] || !parts[1]) return new Date();
  return new Date(parts[0], parts[1] - 1, mode === 'date' && parts[2] ? parts[2] : 1);
}

function dateKey(date: Date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function displayValue(value: string, mode: 'date' | 'month') {
  if (!value) return 'Select ' + (mode === 'month' ? 'month' : 'date');
  const date = parseValue(value, mode);
  return date.toLocaleDateString('en-IN', mode === 'month'
    ? { month: 'long', year: 'numeric' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CalendarDatePicker({ value, onChange, label, mode = 'date', minDate, maxDate }: CalendarDatePickerProps) {
  const [visible, setVisible] = useState(false);
  const [shownMonth, setShownMonth] = useState(() => parseValue(value, mode));
  const firstDay = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 0).getDate();
  const cells = useMemo(() => [
    ...Array.from({ length: firstDay }, (_, index) => ({ key: 'blank-' + index, day: 0 })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ key: 'day-' + (index + 1), day: index + 1 }))
  ], [firstDay, daysInMonth]);
  const selectedKey = mode === 'month' ? value + '-01' : value;

  const open = () => {
    setShownMonth(parseValue(value, mode));
    setVisible(true);
  };
  const moveMonth = (amount: number) => setShownMonth(current => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  const selectDay = (day: number) => {
    const chosen = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), day);
    const key = dateKey(chosen);
    if ((minDate && key < minDate) || (maxDate && key > maxDate)) return;
    onChange(mode === 'month' ? key.slice(0, 7) : key);
    setVisible(false);
  };

  return <>
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label + ': ' + displayValue(value, mode)} onPress={open} style={styles.trigger}>
        <Text style={[styles.value, !value && styles.placeholder]}>{displayValue(value, mode)}</Text>
        <Text style={styles.icon}>▦</Text>
      </Pressable>
    </View>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.topRow}>
            <Text style={styles.title}>{mode === 'month' ? 'Select month' : 'Select date'}</Text>
            <Pressable onPress={() => setVisible(false)} hitSlop={10}><Text style={styles.close}>CLOSE</Text></Pressable>
          </View>
          <View style={styles.monthRow}>
            <Pressable onPress={() => moveMonth(-1)} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></Pressable>
            <Text style={styles.monthTitle}>{shownMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text>
            <Pressable onPress={() => moveMonth(1)} style={styles.arrow}><Text style={styles.arrowText}>›</Text></Pressable>
          </View>
          <View style={styles.grid}>
            {WEEKDAYS.map(day => <View key={day} style={styles.cell}><Text style={styles.weekday}>{day}</Text></View>)}
            {cells.map(cell => {
              if (!cell.day) return <View key={cell.key} style={styles.cell}/>;
              const key = dateKey(new Date(shownMonth.getFullYear(), shownMonth.getMonth(), cell.day));
              const disabled = (!!minDate && key < minDate) || (!!maxDate && key > maxDate);
              const selected = mode === 'month' ? value === key.slice(0, 7) : selectedKey === key;
              return <Pressable key={cell.key} disabled={disabled} onPress={() => selectDay(cell.day)} style={[styles.cell, styles.dayCell, selected && styles.selectedDay, disabled && styles.disabledDay]}>
                <Text style={[styles.dayText, selected && styles.selectedDayText, disabled && styles.disabledDayText]}>{cell.day}</Text>
              </Pressable>;
            })}
          </View>
          <Text style={styles.footer}>{mode === 'month' ? 'Select any day in the month to choose that month.' : 'Choose a date from the calendar.'}</Text>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  field: { flex: 1 },
  label: { color: '#64748B', fontSize: 8, fontWeight: '900', marginBottom: 6 },
  trigger: { minHeight: 46, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  value: { color: '#1E293B', fontSize: 11, fontWeight: '700', flexShrink: 1 },
  placeholder: { color: '#94A3B8' },
  icon: { color: '#2563EB', fontSize: 17, fontWeight: '900' },
  overlay: { flex: 1, backgroundColor: '#0F172A88', justifyContent: 'center', padding: 18 },
  dialog: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, width: '100%', maxWidth: 390, alignSelf: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  title: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
  close: { color: '#2563EB', fontSize: 9, fontWeight: '900' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthTitle: { color: '#1E293B', fontSize: 13, fontWeight: '900' },
  arrow: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: '#1D4ED8', fontSize: 24, lineHeight: 27 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.2857%', height: 40, alignItems: 'center', justifyContent: 'center' },
  weekday: { color: '#64748B', fontSize: 9, fontWeight: '800' },
  dayCell: { borderRadius: 10 },
  dayText: { color: '#1E293B', fontSize: 11, fontWeight: '600' },
  selectedDay: { backgroundColor: '#2563EB' },
  selectedDayText: { color: '#FFFFFF', fontWeight: '900' },
  disabledDay: { opacity: 0.3 },
  disabledDayText: { color: '#94A3B8' },
  footer: { color: '#64748B', fontSize: 9, textAlign: 'center', marginTop: 12, lineHeight: 14 }
});
