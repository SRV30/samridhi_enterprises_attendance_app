import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import statesAndDistricts from '../data/india-states-districts.json';

type StateItem = { name: string; districts: Array<{ name: string }> };
type Props = {
  state: string;
  district: string;
  onStateChange: (value: string) => void;
  onDistrictChange: (value: string) => void;
};

export default function IndiaAddressFields({ state, district, onStateChange, onDistrictChange }: Props) {
  const [picker, setPicker] = useState<'state' | 'district' | null>(null);
  const [search, setSearch] = useState('');
  const states = statesAndDistricts as StateItem[];
  const selectedState = states.find(item => item.name === state);
  const options = useMemo(() => {
    const source = picker === 'district' ? (selectedState?.districts || []).map(item => item.name) : states.map(item => item.name);
    const query = search.trim().toLowerCase();
    return source.filter(value => value.toLowerCase().includes(query));
  }, [picker, search, state]);
  const open = (kind: 'state' | 'district') => {
    if (kind === 'district' && !selectedState) return;
    setSearch('');
    setPicker(kind);
  };
  const choose = (value: string) => {
    if (picker === 'state') {
      onStateChange(value);
      onDistrictChange('');
    } else onDistrictChange(value);
    setPicker(null);
  };
  return <>
    <View style={styles.row}>
      <View style={styles.field}>
        <Text style={styles.label}>STATE / UT</Text>
        <Pressable onPress={() => open('state')} style={styles.select}>
          <Text numberOfLines={1} style={[styles.value, !state && styles.placeholder]}>{state || 'Select state / UT'}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>DISTRICT</Text>
        <Pressable onPress={() => open('district')} disabled={!selectedState} style={[styles.select, !selectedState && styles.disabled]}>
          <Text numberOfLines={1} style={[styles.value, !district && styles.placeholder]}>{district || (selectedState ? 'Select district' : 'Select state first')}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
      </View>
    </View>
    <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{picker === 'state' ? 'Select state / union territory' : 'Select district'}</Text>
            <Pressable onPress={() => setPicker(null)}><Text style={styles.close}>CLOSE</Text></Pressable>
          </View>
          <TextInput value={search} onChangeText={setSearch} placeholder={picker === 'state' ? 'Search all states and UTs' : 'Search district'} autoFocus style={styles.search}/>
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map(value => <Pressable key={value} onPress={() => choose(value)} style={styles.option}>
              <Text style={styles.optionText}>{value}</Text>
              {(picker === 'state' ? state : district) === value && <Text style={styles.selected}>SELECTED</Text>}
            </Pressable>)}
            {options.length === 0 && <Text style={styles.empty}>No matching options.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  row:{flexDirection:'row',gap:10,marginBottom:12},
  field:{flex:1},
  label:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:'#475569',marginBottom:7},
  select:{minHeight:44,borderWidth:1,borderColor:'#E2E8F0',borderRadius:10,paddingHorizontal:10,flexDirection:'row',alignItems:'center',backgroundColor:'#fff'},
  value:{flex:1,fontSize:11,color:'#1E293B'},
  placeholder:{color:'#94A3B8'},
  chevron:{fontSize:16,color:'#64748B',marginLeft:5},
  disabled:{backgroundColor:'#F1F5F9'},
  overlay:{flex:1,backgroundColor:'#0007',justifyContent:'flex-end'},
  sheet:{backgroundColor:'#fff',borderTopLeftRadius:18,borderTopRightRadius:18,padding:16,height:'78%'},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},
  title:{fontSize:14,fontWeight:'900',color:'#0F172A',flex:1},
  close:{fontSize:9,fontWeight:'900',color:'#2563EB',padding:8},
  search:{borderWidth:1,borderColor:'#E2E8F0',borderRadius:10,padding:11,fontSize:12,color:'#1E293B',marginBottom:10},
  option:{paddingVertical:13,borderBottomWidth:1,borderBottomColor:'#F1F5F9',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  optionText:{fontSize:12,color:'#1E293B'},
  selected:{fontSize:8,fontWeight:'900',color:'#2563EB'},
  empty:{fontSize:11,color:'#64748B',textAlign:'center',padding:20}
});
