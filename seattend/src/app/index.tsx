import { useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, apiConfigured } from '../lib/api';
import { saveSession } from '../lib/session';
import BrandLogo from '../components/BrandLogo';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email address and password.');
      return;
    }
    if (!apiConfigured()) {
      Alert.alert('Server not configured', 'Set EXPO_PUBLIC_API_URL in seattend/.env to your computer’s LAN IP and port 5000.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.login(email.trim(), password);
      await saveSession(result.token, result.user);
      router.replace(result.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (error) {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.topLine}><BrandLogo width={190} height={66}/></View>
          <Animated.View entering={FadeInDown.duration(420)} style={styles.hero}>
            <View style={styles.eyebrow}><View style={styles.eyebrowDot}/><Text style={styles.eyebrowText}>SALES ATTENDANCE PORTAL</Text></View>
            <Text style={styles.title}>Welcome{ '\n' }back.</Text>
            <Text style={styles.subtitle}>Sign in to manage attendance, people and registered shop visits.</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(100).duration(450)} style={styles.formCard}>
            <Text style={styles.formTitle}>Sign in</Text>
            <Text style={styles.formSubtitle}>Use the account credentials provided by your administrator.</Text>
            <View style={styles.fieldGroup}><Text style={styles.label}>EMAIL ADDRESS</Text><TextInput accessibilityLabel="Email address" autoCapitalize="none" keyboardType="email-address" autoCorrect={false} onChangeText={setEmail} placeholder="Enter your email address" placeholderTextColor="#9AA4B2" returnKeyType="next" style={styles.input} value={email}/></View>
            <View style={styles.fieldGroup}><Text style={styles.label}>PASSWORD</Text><View style={styles.passwordWrap}><TextInput accessibilityLabel="Password" autoCapitalize="none" autoCorrect={false} onChangeText={setPassword} onSubmitEditing={handleLogin} placeholder="Enter your password" placeholderTextColor="#9AA4B2" returnKeyType="go" secureTextEntry={!showPassword} style={styles.passwordInput} value={password}/><Pressable accessibilityRole="button" onPress={() => setShowPassword(v => !v)}><Text style={styles.showPassword}>{showPassword ? 'HIDE' : 'SHOW'}</Text></Pressable></View></View>
            <Pressable accessibilityRole="button" disabled={busy} onPress={handleLogin} style={({pressed}) => [styles.loginButton, pressed && styles.loginButtonPressed, busy && {opacity:0.7}]}>{busy ? <ActivityIndicator color="#FFFFFF"/> : <><Text style={styles.loginButtonText}>Sign in</Text><Text style={styles.loginArrow}>→</Text></>}</Pressable>
            <Text style={styles.helpText}>Your role determines which attendance workspace opens.</Text>
          </Animated.View>
          <View style={styles.footer}><View style={styles.footerRule}/><Text style={styles.footerText}>LOCATION-VERIFIED FIELD ATTENDANCE</Text><Text style={styles.versionText}>SAMRIDHI ATTENDANCE • VERSION 1.0</Text></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
 flex:{flex:1},safeArea:{flex:1,backgroundColor:'#F8FAFC'},scrollContent:{flexGrow:1,paddingHorizontal:22,paddingTop:18,paddingBottom:24,width:'100%',maxWidth:560,alignSelf:'center'},topLine:{flexDirection:'row',alignItems:'center',justifyContent:'center',paddingVertical:8},brandMark:{width:42,height:42,borderRadius:13,backgroundColor:'#2563EB',alignItems:'center',justifyContent:'center'},brandMarkText:{color:'#FFFFFF',fontSize:19,fontWeight:'800'},brandCaption:{color:'#0F172A',fontSize:11,fontWeight:'800',letterSpacing:1.35},hero:{marginTop:34,marginBottom:25},eyebrow:{flexDirection:'row',alignItems:'center',alignSelf:'flex-start',backgroundColor:'#EFF6FF',borderRadius:20,paddingHorizontal:11,paddingVertical:7,gap:7},eyebrowDot:{width:7,height:7,borderRadius:4,backgroundColor:'#2563EB'},eyebrowText:{color:'#1D4ED8',fontSize:9,fontWeight:'800',letterSpacing:1.2},title:{color:'#0F172A',fontSize:43,lineHeight:48,fontWeight:'800',letterSpacing:-1.6,marginTop:17},subtitle:{color:'#64748B',fontSize:14,lineHeight:22,marginTop:12,maxWidth:300},formCard:{backgroundColor:'#FFFFFF',borderRadius:22,padding:21,borderWidth:1,borderColor:'#E6ECF4',elevation:3,shadowColor:'#0F172A',shadowOpacity:.06,shadowRadius:18,shadowOffset:{width:0,height:8}},formTitle:{color:'#0F172A',fontSize:19,fontWeight:'800'},formSubtitle:{color:'#64748B',fontSize:12,lineHeight:18,marginTop:6,marginBottom:23},fieldGroup:{marginBottom:18},label:{color:'#475569',fontSize:10,fontWeight:'800',letterSpacing:1,marginBottom:9},input:{height:52,borderWidth:1,borderColor:'#E2E8F0',borderRadius:12,paddingHorizontal:14,color:'#1E293B',fontSize:14,backgroundColor:'#FFFFFF'},passwordWrap:{height:52,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#E2E8F0',borderRadius:12,paddingHorizontal:14,backgroundColor:'#FFFFFF'},passwordInput:{flex:1,color:'#1E293B',fontSize:14,height:'100%'},showPassword:{color:'#2563EB',fontSize:9,fontWeight:'800',paddingLeft:8},loginButton:{height:54,backgroundColor:'#2563EB',borderRadius:13,marginTop:5,paddingHorizontal:18,alignItems:'center',justifyContent:'center'},loginButtonPressed:{backgroundColor:'#1D4ED8'},loginButtonText:{color:'#FFFFFF',fontSize:14,fontWeight:'800'},loginArrow:{color:'#FFFFFF',fontSize:20,position:'absolute',right:19,top:13},helpText:{color:'#64748B',fontSize:11,lineHeight:17,textAlign:'center',marginTop:17},footer:{alignItems:'center',marginTop:'auto',paddingTop:35},footerRule:{width:38,height:3,borderRadius:2,backgroundColor:'#D5DEE9',marginBottom:13},footerText:{color:'#64748B',fontSize:8,fontWeight:'800',letterSpacing:1.15},versionText:{color:'#94A3B8',fontSize:8,marginTop:8}
});
