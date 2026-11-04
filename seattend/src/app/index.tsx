import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
    if (!employeeId.trim() || !password) {
      Alert.alert('Missing details', 'Enter your Employee ID and password to continue.');
      return;
    }

    Alert.alert(
      'Setup in progress',
      'The login interface is ready. Secure employee authentication will be connected when the backend is implemented.',
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.topLine}>
            <View style={styles.brandMark}>
              <View style={styles.brandMarkInner}>
                <Text style={styles.brandMarkText}>S</Text>
              </View>
            </View>
            <Text style={styles.brandCaption}>SAMRIDHI ENTERPRISES</Text>
          </View>

          <View style={styles.hero}>
            <View style={styles.eyebrow}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrowText}>FIELD TEAM PORTAL</Text>
            </View>
            <Text style={styles.title}>Welcome{ '\n' }back.</Text>
            <Text style={styles.subtitle}>
              Sign in to manage your shop visits and daily attendance.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Employee login</Text>
            <Text style={styles.formSubtitle}>Use the credentials provided by your administrator.</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>EMPLOYEE ID</Text>
              <TextInput
                accessibilityLabel="Employee ID"
                autoCapitalize="characters"
                autoCorrect={false}
                onChangeText={setEmployeeId}
                placeholder="e.g. SE-001"
                placeholderTextColor="#9AA4B2"
                returnKeyType="next"
                style={styles.input}
                value={employeeId}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  accessibilityLabel="Password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setPassword}
                  onSubmitEditing={handleLogin}
                  placeholder="Enter your password"
                  placeholderTextColor="#9AA4B2"
                  returnKeyType="go"
                  secureTextEntry={!showPassword}
                  style={styles.passwordInput}
                  value={password}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  hitSlop={10}
                  onPress={() => setShowPassword((visible) => !visible)}>
                  <Text style={styles.showPassword}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleLogin}
              style={({ pressed }) => [styles.loginButton, pressed && styles.loginButtonPressed]}>
              <Text style={styles.loginButtonText}>Sign in</Text>
              <Text style={styles.loginArrow}>→</Text>
            </Pressable>

            <Text style={styles.helpText}>
              Need help accessing your account? Contact your manager.
            </Text>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerRule} />
            <Text style={styles.footerText}>LOCATION-VERIFIED FIELD ATTENDANCE</Text>
            <Text style={styles.versionText}>SAMRIDHI ATTENDANCE  •  VERSION 1.0</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F5F7FA' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 25, paddingTop: 18, paddingBottom: 24 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#E8EEF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkInner: {
    width: 29,
    height: 29,
    borderRadius: 9,
    backgroundColor: '#17345C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  brandCaption: { color: '#263B58', fontSize: 11, fontWeight: '800', letterSpacing: 1.35 },
  hero: { marginTop: 49, marginBottom: 28 },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EAF3EF',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
    gap: 7,
  },
  eyebrowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#26966B' },
  eyebrowText: { color: '#247653', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#142B49', fontSize: 43, lineHeight: 48, fontWeight: '800', letterSpacing: -1.6, marginTop: 17 },
  subtitle: { color: '#6D7888', fontSize: 14, lineHeight: 22, marginTop: 12, maxWidth: 300 },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 21,
    borderWidth: 1,
    borderColor: '#E9EDF2',
    shadowColor: '#172B45',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  formTitle: { color: '#172E4D', fontSize: 19, fontWeight: '800' },
  formSubtitle: { color: '#8490A0', fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 23 },
  fieldGroup: { marginBottom: 18 },
  label: { color: '#526176', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 9 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#E1E7EE',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#1C304B',
    fontSize: 14,
    backgroundColor: '#FBFCFE',
  },
  passwordWrap: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E7EE',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FBFCFE',
  },
  passwordInput: { flex: 1, color: '#1C304B', fontSize: 14, height: '100%' },
  showPassword: { color: '#527096', fontSize: 9, fontWeight: '800', letterSpacing: 0.8, paddingLeft: 8 },
  loginButton: {
    height: 54,
    backgroundColor: '#173B68',
    borderRadius: 13,
    marginTop: 5,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonPressed: { backgroundColor: '#102D51', transform: [{ scale: 0.99 }] },
  loginButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  loginArrow: { color: '#FFFFFF', fontSize: 20, position: 'absolute', right: 19, top: 13 },
  helpText: { color: '#8792A1', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 17 },
  footer: { alignItems: 'center', marginTop: 'auto', paddingTop: 35 },
  footerRule: { width: 38, height: 3, borderRadius: 2, backgroundColor: '#D5DEE9', marginBottom: 13 },
  footerText: { color: '#758398', fontSize: 8, fontWeight: '800', letterSpacing: 1.15 },
  versionText: { color: '#A1AAB6', fontSize: 8, letterSpacing: 0.6, marginTop: 8 },
});
