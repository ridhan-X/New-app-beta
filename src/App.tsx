import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

// ─── THEMES ──────────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    id: "dark", bg: "#000000", surface: "#0a0a0a", card: "#111111", cardHover: "#181818",
    border: "#1e1e1e", borderStrong: "#2a2a2a", red: "#E53935", redDim: "#b71c1c",
    green: "#4CAF50", text1: "#FFFFFF", text2: "#9e9e9e", text3: "#3a3a3a",
    blue: "#42A5F5", inputBg: "#0d0d0d", drawerBg: "#080808",
    overlayBg: "rgba(0,0,0,0.82)", scrollThumb: "#2a2a2a", tagBg: "rgba(229,57,53,0.12)",
    tagBorder: "rgba(229,57,53,0.25)", segBg: "#0d0d0d",
  },
  day: {
    id: "day", bg: "#F5F5F7", surface: "#FFFFFF", card: "#FFFFFF", cardHover: "#F0F0F2",
    border: "#E8E8EC", borderStrong: "#D0D0D6", red: "#D32F2F", redDim: "#B71C1C",
    green: "#2E7D32", text1: "#111111", text2: "#666666", text3: "#BBBBBB",
    blue: "#1565C0", inputBg: "#F5F5F7", drawerBg: "#FFFFFF",
    overlayBg: "rgba(0,0,0,0.5)", scrollThumb: "#C0C0C6", tagBg: "rgba(211,47,47,0.08)",
    tagBorder: "rgba(211,47,47,0.22)", segBg: "#EBEBED",
  }
};

const ThemeCtx = createContext(THEMES.dark);
const useTheme = () => useContext(ThemeCtx);

const S = {
  SETUP_WIZARD: "SETUP_WIZARD", TUTORIAL:"TUTORIAL", HOME:"HOME", JOURNEY_SETUP:"JOURNEY_SETUP",
  JOURNEY_ACTIVE:"JOURNEY_ACTIVE", CONTACTS:"CONTACTS", SETTINGS:"SETTINGS",
  ABOUT:"ABOUT", SOS_COUNTDOWN:"SOS_COUNTDOWN",
  SOS_ALARM:"SOS_ALARM", FEEDBACK:"FEEDBACK",
  TEST_SOS:"TEST_SOS",
  TEST_COUNTDOWN:"TEST_COUNTDOWN", TEST_ALARM:"TEST_ALARM",
};

// ─── NATIVE BRIDGE ───────────────────────────────────────────────────────────
const Native = {
  async getItem(key) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key });
      return value;
    } catch { return localStorage.getItem(key); }
  },
  async setItem(key, value) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key, value });
    } catch { localStorage.setItem(key, value); }
  },
  async openAppSettings() {
    try {
      const { NativeSettings, AndroidSettings, IOSSettings } = await import("capacitor-native-settings");
      await NativeSettings.open({
        optionAndroid: AndroidSettings.ApplicationDetails,
        optionIOS: IOSSettings.App
      });
    } catch {
      alert("In the Android APK, this opens the System App Settings.");
    }
  },
  async openBatterySettings() {
    try {
      const { NativeSettings, AndroidSettings, IOSSettings } = await import("capacitor-native-settings");
      await NativeSettings.open({
        optionAndroid: AndroidSettings.BatteryOptimization,
        optionIOS: IOSSettings.App
      });
    } catch {
      alert("In the Android APK, this opens the System Battery Settings.");
    }
  },
  async startForegroundService(type, data) {
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const AyuGuardService = registerPlugin<any>("AyuGuardService");
      if (AyuGuardService) {
        const contactsStr = await Native.getItem("ayuguard_contacts");
        const settingsStr = await Native.getItem("ayuguard_settings");
        let alarmSoundEnabled = true;
        try { if (settingsStr) alarmSoundEnabled = JSON.parse(settingsStr).alarmSoundEnabled !== false; } catch {}
        await AyuGuardService.start({ type, contacts: contactsStr || "[]", alarmSoundEnabled, ...data });
      }
    } catch {}
  },
  async stopForegroundService() {
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const AyuGuardService = registerPlugin<any>("AyuGuardService");
      if (AyuGuardService) await AyuGuardService.stop();
    } catch {}
  },
  async markDispatched() {
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const AyuGuardService = registerPlugin<any>("AyuGuardService");
      if (AyuGuardService && AyuGuardService.markDispatchedJS) {
        await AyuGuardService.markDispatchedJS();
      }
    } catch {}
  },
  async hasDispatchedRecently() {
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const AyuGuardService = registerPlugin<any>("AyuGuardService");
      if (AyuGuardService && AyuGuardService.hasDispatchedRecentlyJS) {
        const { value } = await AyuGuardService.hasDispatchedRecentlyJS();
        return value;
      }
    } catch {}
    return false;
  },
  async getLocation() {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, accurate: true };
    } catch {
      try {
        const cached = await Native.getItem("ayuguard_last_location");
        if (cached) return { ...JSON.parse(cached), accurate: false };
      } catch {}
      return null;
    }
  },
  async sendSMS(numbers, message) {
    let success = false;
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const AyuGuardService = registerPlugin<any>("AyuGuardService");
      const uniqueNumbers = [...new Set(numbers.filter(Boolean))];
      if (AyuGuardService) {
        await AyuGuardService.sendSMS({ numbersStr: uniqueNumbers.join(","), message });
        success = true;
      }
      return success;
    } catch {
      console.log("SMS:", message, "→", numbers);
      return false;
    }
  },
  async showJourneyNotification(timeLeft) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const mins = Math.floor(timeLeft / 60), secs = String(timeLeft % 60).padStart(2, "0");
      await LocalNotifications.schedule({ notifications: [{ id: 1001, title: "🛡️ AyuGuard — Journey Active", body: `${mins}:${secs} remaining — Tap to open`, ongoing: true, autoCancel: false }] });
    } catch {}
  },
  async cancelJourneyNotification() {
    try { const { LocalNotifications } = await import("@capacitor/local-notifications"); await LocalNotifications.cancel({ notifications: [{ id: 1001 }] }); } catch {}
  },
  async checkAndRequestPermissions() {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const g = await Geolocation.checkPermissions();
      if (g.location === "prompt" || g.location === "prompt-with-rationale") await Geolocation.requestPermissions();
    } catch {}
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const l = await LocalNotifications.checkPermissions();
      if (l.display === "prompt") await LocalNotifications.requestPermissions();
    } catch {}
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const AyuGuardService = registerPlugin("AyuGuardService") as any;
      if (AyuGuardService && AyuGuardService.requestNativePermissions) {
        await AyuGuardService.requestNativePermissions();
      }
    } catch {}
  },
  async vibrate(pattern = "MEDIUM") {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle[pattern] });
    } catch { if (navigator.vibrate) navigator.vibrate(pattern === "HEAVY" ? [300, 100, 300] : [100]); }
  },
  async getBattery() {
    try { const b = await (navigator as any).getBattery(); return Math.round(b.level * 100); } catch { return null; }
  },
};

// ─── LOCATION MANAGER ────────────────────────────────────────────────────────
class LocationManager {
  lastLocation: any;
  cacheInterval: any;
  constructor() { this.lastLocation = null; this.cacheInterval = null; this.loadCache(); }
  async loadCache() { try { const c = await Native.getItem("ayuguard_last_location"); if (c) this.lastLocation = JSON.parse(c); } catch {} }
  async saveCache(loc) { this.lastLocation = loc; try { await Native.setItem("ayuguard_last_location", JSON.stringify(loc)); } catch {} }
  async fetchForSOS() {
    const fresh = await Native.getLocation();
    if (fresh && fresh.accurate) { await this.saveCache(fresh); return fresh; }
    if (this.lastLocation) return { ...this.lastLocation, accurate: false };
    return null;
  }
  startJourneyTracking() {
    this.stopTracking();
    Native.getLocation().then(loc => { if (loc) this.saveCache(loc); });
    this.cacheInterval = setInterval(async () => { const loc = await Native.getLocation(); if (loc) this.saveCache(loc); }, 900000);
  }
  stopTracking() { if (this.cacheInterval) { clearInterval(this.cacheInterval); this.cacheInterval = null; } }
}
const locationManager = new LocationManager();

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Ic = {
  shield: (c,s=22) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z"/></svg>,
  menu: (c,s=22) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  location: (c,s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>,
  offline: (c,s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>,
  journey: (c,s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  map: (c,s=24) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>,
  contacts: (c,s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  settings: (c,s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  info: (c,s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  trash: (c,s=17) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  edit: (c,s=17) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  chevron: (c,s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  check: (c,s=20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  bell: (c,s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  vibrate: (c,s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><line x1="2" y1="8" x2="2" y2="16"/><line x1="6" y1="5" x2="6" y2="19"/><rect x="10" y="3" width="8" height="18" rx="2"/><line x1="22" y1="8" x2="22" y2="16"/><line x1="18" y1="5" x2="18" y2="19"/></svg>,
  clock: (c,s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  car: (c,s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H3v-5l2-5h14l2 5v5h-2M5 17h14M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0"/></svg>,
  music: (c,s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  beaker: (c,s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><path d="M9 3h6M9 3v7l-4 9a1 1 0 0 0 .9 1.4h12.2a1 1 0 0 0 .9-1.4L15 10V3"/><line x1="6.2" y1="16" x2="17.8" y2="16"/></svg>,
  battery: (c,s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="7" width="18" height="10" rx="2"/><line x1="20" y1="11" x2="22" y2="11"/><line x1="20" y1="13" x2="22" y2="13"/></svg>,
  refresh: (c,s=18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.82"/></svg>,
};

// ─── GLOBAL CSS ──────────────────────────────────────────────────────────────
const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  body{font-family:'Inter',sans-serif;}
  .fade-in{animation:fadeIn 0.22s ease;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  .slide-up{animation:slideUp 0.32s cubic-bezier(0.16,1,0.3,1);}
  @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
  .pop-in{animation:popIn 0.22s cubic-bezier(0.16,1,0.3,1);}
  @keyframes popIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
  .sos-pulse{animation:sosPulse 2.2s ease-in-out infinite;}
  @keyframes sosPulse{0%,100%{box-shadow:0 0 0 0 rgba(229,57,53,0.5),0 0 0 0 rgba(229,57,53,0.2),0 8px 32px rgba(229,57,53,0.35)}50%{box-shadow:0 0 0 28px rgba(229,57,53,0),0 0 0 56px rgba(229,57,53,0),0 8px 40px rgba(229,57,53,0.5)}}
  .alarm-pulse{animation:alarmPulse 1.1s ease-in-out infinite;}
  @keyframes alarmPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
  .menu-overlay{position:fixed;inset:0;z-index:200;display:flex;}
  @keyframes drawerIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
  @keyframes bounceRight{0%,100%{transform:translateX(0) rotate(-45deg);}50%{transform:translateX(-6px) rotate(-45deg);}}
  .drum-col{height:220px;overflow:hidden;position:relative;flex:1;cursor:ns-resize;}
  .drum-list{transition:transform 0.2s cubic-bezier(0.25,0.46,0.45,0.94);}
  .drum-item{height:44px;display:flex;align-items:center;justify-content:center;font-weight:600;transition:opacity 0.12s,font-size 0.12s;}
  .drum-fade-top{position:absolute;top:0;left:0;right:0;height:80px;pointer-events:none;z-index:2;}
  .drum-fade-bot{position:absolute;bottom:0;left:0;right:0;height:80px;pointer-events:none;z-index:2;}
  .drum-selector{position:absolute;top:50%;transform:translateY(-50%);left:0;right:0;height:44px;pointer-events:none;z-index:3;}
  ::-webkit-scrollbar{width:3px;}
  ::-webkit-scrollbar-thumb{border-radius:4px;}
  button,input,textarea{font-family:'Inter',sans-serif;}
`;

// ─── DRUM PICKER ─────────────────────────────────────────────────────────────
function DrumPicker({ items, selectedIndex, onChange }) {
  const T = useTheme();
  const ITEM_H = 44;
  const startY = useRef(0);
  const startIdx = useRef(selectedIndex);
  const clamp = v => Math.max(0, Math.min(items.length - 1, v));
  const offset = -(selectedIndex * ITEM_H) + (220 / 2 - ITEM_H / 2);
  return (
    <div className="drum-col"
      onTouchStart={e => { startY.current = e.touches[0].clientY; startIdx.current = selectedIndex; }}
      onTouchMove={e => onChange(clamp(startIdx.current + Math.round((startY.current - e.touches[0].clientY) / ITEM_H)))}
      onWheel={e => { e.preventDefault(); onChange(clamp(selectedIndex + (e.deltaY > 0 ? 1 : -1))); }}>
      <div className="drum-fade-top" /><div className="drum-selector" /><div className="drum-fade-bot" />
      <div className="drum-list" style={{ transform: `translateY(${offset}px)` }}>
        {items.map((item, i) => {
          const dist = Math.abs(i - selectedIndex);
          return (
            <div key={i} className="drum-item" onClick={() => onChange(i)}
              style={{ color: i === selectedIndex ? T.text1 : T.text3, fontSize: dist === 0 ? 22 : dist === 1 ? 17 : 13, opacity: dist > 2 ? 0.15 : dist === 2 ? 0.4 : 1 }}>
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// maxHours=0 → shows min+sec (for manual SOS 4–60s)
// maxHours>0 → shows hr+min (for journey duration)
function TimePickerModal({ title, value, onConfirm, onCancel, maxHours = 0, minSec = 0, maxSec = 0 }) {
  const T = useTheme();
  const [hIdx, setHIdx] = useState(Math.floor(value / 3600));
  const [mIdx, setMIdx] = useState(Math.floor((value % 3600) / 60));
  const [sIdx, setSIdx] = useState(value % 60);
  const hours = Array.from({ length: maxHours + 1 }, (_, i) => String(i).padStart(2, "0"));
  const mins = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
  const secs = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
  const result = maxHours > 0 ? hIdx * 3600 + mIdx * 60 : mIdx * 60 + sIdx;

  const handleSet = () => {
    let v = Math.max(minSec || 10, result);
    if (maxSec > 0) v = Math.min(maxSec, v);
    onConfirm(v);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: T.overlayBg, backdropFilter: "blur(8px)", zIndex: 300, display: "flex", alignItems: "flex-end" }}
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="pop-in" style={{ background: T.card, width: "100%", maxWidth: 420, borderRadius: "24px 24px 0 0", paddingBottom: 40, border: `1px solid ${T.border}`, borderBottom: "none" }}>
        <div style={{ padding: "18px 24px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}` }}>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: T.text2, fontSize: 15 }}>Cancel</button>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.text1 }}>{title}</span>
          <button onClick={handleSet} style={{ background: "none", border: "none", cursor: "pointer", color: T.red, fontSize: 15, fontWeight: 700 }}>Set</button>
        </div>
        {minSec > 0 && maxSec > 0 && (
          <p style={{ textAlign: "center", fontSize: 12, color: T.text3, paddingTop: 10 }}>{minSec}s – {maxSec}s</p>
        )}
        <div style={{ display: "flex", alignItems: "center", padding: "8px 28px", userSelect: "none" }}>
          {maxHours > 0 && <><DrumPicker items={hours} selectedIndex={hIdx} onChange={setHIdx} /><span style={{ color: T.text3, fontSize: 15, padding: "0 8px" }}>hr</span></>}
          <DrumPicker items={mins} selectedIndex={mIdx} onChange={setMIdx} />
          <span style={{ color: T.text3, fontSize: 15, padding: "0 8px" }}>{maxHours > 0 ? "min" : "min"}</span>
          {maxHours === 0 && <><DrumPicker items={secs} selectedIndex={sIdx} onChange={setSIdx} /><span style={{ color: T.text3, fontSize: 15, padding: "0 8px" }}>sec</span></>}
        </div>
      </div>
    </div>
  );
}

// ─── SETUP WIZARD (FIRST LAUNCH) ─────────────────────────────────────────────
function SetupWizardScreen({ T, onComplete }) {
  const [step, setStep] = useState(0);

  const nextStep = () => setStep(s => s + 1);

  const handlePermissions = async () => {
    await Native.checkAndRequestPermissions();
    nextStep();
  };

  const handleAppInfo = async () => {
    await Native.openAppSettings();
  };

  const handleBattery = async () => {
    await Native.openBatterySettings();
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: T.bg, padding: "40px 24px" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        
        {step === 0 && (
          <div className="fade-in" style={{ textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: 24, background: T.card, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              {Ic.shield(T.red, 36)}
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: T.text1, letterSpacing: "-0.02em", marginBottom: 12 }}>Welcome to AyuGuard</h1>
            <p style={{ fontSize: 16, color: T.text2, lineHeight: 1.6, marginBottom: 32 }}>Let's configure your device for maximum emergency protection.</p>
            <button className="btn-primary" onClick={nextStep}>Start Setup</button>
          </div>
        )}

        {step === 1 && (
          <div className="fade-in">
            <h2 style={{ fontSize: 24, fontWeight: 800, color: T.text1, marginBottom: 12 }}>Core Permissions</h2>
            <p style={{ fontSize: 15, color: T.text2, lineHeight: 1.6, marginBottom: 32 }}>AyuGuard requires Location to send your coordinates, and Notifications to display emergency countdowns.</p>
            <div style={{ background: T.card, borderRadius: 16, padding: "16px 20px", border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {Ic.map(T.blue, 24)}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: T.text1 }}>Location</p>
                  <p style={{ fontSize: 13, color: T.text3 }}>Required for SOS messages.</p>
                </div>
              </div>
              <div style={{ height: 1, background: T.border }} />
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {Ic.bell(T.green, 24)}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: T.text1 }}>Notifications</p>
                  <p style={{ fontSize: 13, color: T.text3 }}>Required for countdowns.</p>
                </div>
              </div>
            </div>
            <button className="btn-primary" onClick={handlePermissions}>Grant Permissions</button>
          </div>
        )}

        {step === 2 && (
          <div className="fade-in">
            <h2 style={{ fontSize: 24, fontWeight: 800, color: T.text1, marginBottom: 12 }}>Background Reliability</h2>
            <p style={{ fontSize: 15, color: T.text2, lineHeight: 1.6, marginBottom: 24 }}>To ensure SOS works even when your phone is locked, you must allow restricted settings.</p>
            <div style={{ background: T.cardHover, border: `1px solid ${T.borderStrong}`, borderRadius: 16, padding: "20px", marginBottom: 32, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 16, background: T.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>1</div>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 600, color: T.text1, marginBottom: 4 }}>Tap the 3 dots ⋮</p>
                  <p style={{ fontSize: 14, color: T.text3 }}>In the top right corner of the App Info screen.</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 16, background: T.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>2</div>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 600, color: T.text1, marginBottom: 4 }}>Select "Allow restricted settings"</p>
                  <p style={{ fontSize: 14, color: T.text3 }}>Confirm if prompted by Android.</p>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={handleAppInfo}>Open App Info</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={nextStep}>Done</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="fade-in">
            <h2 style={{ fontSize: 24, fontWeight: 800, color: T.text1, marginBottom: 12 }}>Battery Optimization</h2>
            <p style={{ fontSize: 15, color: T.text2, lineHeight: 1.6, marginBottom: 24 }}>Prevent Android from killing AyuGuard during emergencies.</p>
            <div style={{ background: T.cardHover, border: `1px solid ${T.borderStrong}`, borderRadius: 16, padding: "20px", marginBottom: 32, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 16, background: T.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>1</div>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 600, color: T.text1, marginBottom: 4 }}>Select "Unrestricted"</p>
                  <p style={{ fontSize: 14, color: T.text3 }}>In the Battery settings screen to allow background SOS.</p>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={handleBattery}>Open Settings</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={nextStep}>Done</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="fade-in" style={{ textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: `${T.green}20`, border: `2px solid ${T.green}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: `0 8px 32px ${T.green}40` }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: T.text1, letterSpacing: "-0.02em", marginBottom: 12 }}>AyuGuard is Ready</h1>
            <p style={{ fontSize: 16, color: T.text2, lineHeight: 1.6, marginBottom: 32 }}>Your device is now configured for maximum emergency protection.</p>
            <button className="btn-primary" onClick={onComplete}>Continue</button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── TUTORIAL ────────────────────────────────────────────────────────────────
function TutorialScreen({ onDone, T }) {
  const [step, setStep] = useState(0);
  const steps = [
    { icon: "🛡️", title: "Your Personal Safety Shield", body: "AyuGuard works 100% offline. No cloud, no login, no tracking. Everything stays on your device." },
    { icon: "🆘", title: "Hold 4 Seconds for SOS", body: "Press and hold the SOS button for 4 seconds to trigger an emergency alert to your trusted contacts." },
    { icon: "📍", title: "Smart Location — Battery Friendly", body: "GPS only activates when SOS is triggered. During Journey Mode it caches every 15 min. In basements, your last known location is sent automatically." },
    {
      icon: "🚗", title: "Journey Mode",
      body: "Set a timer before any trip. If you don't check in on time, your contacts get auto-alerted with your location.",
      extra: (
        <div style={{ marginTop: 20, background: "rgba(229,57,53,0.08)", border: "1px solid rgba(229,57,53,0.2)", borderRadius: 14, padding: "14px 16px", textAlign: "left" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: T.red, letterSpacing: "1px", marginBottom: 8, textTransform: "uppercase" }}>Setup Tips</p>
          <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.6 }}>
            Tap the <strong style={{ color: T.text1 }}>⋮ menu</strong> → <strong style={{ color: T.text1 }}>Settings</strong> → <strong style={{ color: T.text1 }}>Optimize Battery</strong> → set AyuGuard to <strong style={{ color: T.text1 }}>Unrestricted</strong> for reliable background SOS.
            <br /><br />
            Also enable <strong style={{ color: T.text1 }}>Allow Restricted Settings</strong> if your Android version asks.
          </p>
        </div>
      )
    },
  ];
  const s = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div style={{ minHeight: "100dvh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 28px" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", maxWidth: 340, textAlign: "center" }} className="fade-in" key={step}>
        <div style={{ fontSize: 72, marginBottom: 28 }}>{s.icon}</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text1, letterSpacing: "-0.03em", marginBottom: 14, lineHeight: 1.2 }}>{s.title}</h1>
        <p style={{ fontSize: 15, color: T.text2, lineHeight: 1.7 }}>{s.body}</p>
        {s.extra && s.extra}
      </div>
      <div style={{ width: "100%", maxWidth: 340 }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 28 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ width: i === step ? 24 : 8, height: 8, borderRadius: 4, background: i === step ? T.red : T.border, transition: "width .3s,background .3s" }} />
          ))}
        </div>
        <button className="btn-primary" onClick={isLast ? onDone : () => setStep(s => s + 1)}>
          {isLast ? "Get Started" : "Next →"}
        </button>
        {!isLast && (
          <button onClick={onDone} style={{ background: "none", border: "none", color: T.text3, fontSize: 14, cursor: "pointer", marginTop: 14, width: "100%", padding: "8px 0" }}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

// ─── NAVBAR ──────────────────────────────────────────────────────────────────
function Navbar({ screen, onMenu, onBack, onJourneyBack, T }) {
  const isHome = screen === S.HOME;
  const handleBack = screen === S.JOURNEY_ACTIVE ? onJourneyBack : onBack;
  const labelMap = {
    [S.JOURNEY_SETUP]: "Journey Setup", [S.JOURNEY_ACTIVE]: "Journey Active",
    [S.CONTACTS]: "Trusted Contacts", [S.SETTINGS]: "Settings",
    [S.ABOUT]: "About", [S.FEEDBACK]: "Feedback",
    [S.TEST_SOS]: "Test SOS",
  };
  const label = labelMap[screen] || screen.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  return (
    <div style={{ padding: "18px 18px 10px", display: "flex", alignItems: "center", gap: 12 }}>
      {isHome ? (
        <button aria-label="Open Menu" onClick={onMenu} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>{Ic.menu(T.text1)}</button>
      ) : (
        <button aria-label="Go Back" onClick={handleBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", gap: 6, color: T.text2, fontSize: 14, fontWeight: 500 }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          {label}
        </button>
      )}
      {isHome && (
        <div style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
          {Ic.shield(T.red, 19)}
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em", color: T.text1 }}>AyuGuard</span>
          <span className="tag">BETA</span>
        </div>
      )}
    </div>
  );
}

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────
function HomeScreen({ startSOS, T, onJourney, onContacts, journey }) {
  const [progress, setProgress] = useState(0);
  const holdTimer = useRef(null);

  const startHold = () => {
    Native.vibrate("LIGHT");
    let tick = 0;
    holdTimer.current = setInterval(() => {
      tick += 50;
      setProgress(tick);
      if (tick >= 4000) { clearInterval(holdTimer.current); setProgress(0); startSOS({ type: "manual" }); }
    }, 50);
  };
  const stopHold = () => { clearInterval(holdTimer.current); setProgress(0); };
  const scale = 1 + (progress / 4000) * 0.12;
  const pct = progress / 4000;
  const secsLeft = Math.ceil((4000 - progress) / 1000);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", margin: "36px 0 12px" }}>
        <svg width={240} height={240} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)", pointerEvents: "none" }}>
          <circle cx={120} cy={120} r={110} fill="none" stroke={T.border} strokeWidth={3} />
          <circle cx={120} cy={120} r={110} fill="none" stroke={T.red} strokeWidth={3}
            strokeDasharray={2 * Math.PI * 110} strokeDashoffset={2 * Math.PI * 110 * (1 - pct)}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.05s linear", opacity: pct > 0 ? 1 : 0 }} />
        </svg>
        <div style={{ width: 240, height: 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <button
            onMouseDown={startHold} onMouseUp={stopHold} onMouseLeave={stopHold}
            onTouchStart={startHold} onTouchEnd={stopHold}
            className="sos-pulse"
            style={{ width: 190, height: 190, borderRadius: "50%", background: `radial-gradient(circle at 38% 32%, #ff5252, ${T.red} 60%, ${T.redDim})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 900, color: "#fff", cursor: "pointer", userSelect: "none", border: "none", transform: `scale(${scale})`, transition: "transform 0.06s", letterSpacing: "0.05em", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
            SOS
            {progress > 0 && <span style={{ fontSize: 14, fontWeight: 600, marginTop: 4, opacity: 0.85 }}>{secsLeft}s</span>}
          </button>
        </div>
      </div>

      <p style={{ color: progress > 0 ? T.red : T.text3, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 32, transition: "color .2s" }}>
        {progress > 0 ? "HOLD TO CONFIRM..." : "HOLD 4 SECONDS TO TRIGGER"}
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: "7px 14px" }}>
          {Ic.location(T.green, 14)}
          <span style={{ fontSize: 11, fontWeight: 700, color: T.green, letterSpacing: "0.5px" }}>OFFLINE READY</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: "7px 14px" }}>
          {Ic.offline(T.text3, 14)}
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text3, letterSpacing: "0.5px" }}>NO CLOUD</span>
        </div>
      </div>

      {journey.active && (
        <div style={{ width: "100%", background: `${T.green}12`, border: `1px solid ${T.green}30`, borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          {Ic.journey(T.green, 16)}
          <span style={{ fontSize: 13, color: T.green, fontWeight: 600 }}>Journey Mode Active</span>
        </div>
      )}

      <div style={{ width: "100%", display: "flex", gap: 12 }}>
        <button onClick={onJourney} style={{ flex: 1, background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, padding: "18px 12px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "background .15s" }}
          onMouseEnter={e => e.currentTarget.style.background = T.cardHover} onMouseLeave={e => e.currentTarget.style.background = T.card}>
          {Ic.journey(T.text2, 24)}
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>Journey Mode</span>
        </button>
        <button onClick={onContacts} style={{ flex: 1, background: T.card, border: `1px solid ${T.border}`, borderRadius: 18, padding: "18px 12px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "background .15s" }}
          onMouseEnter={e => e.currentTarget.style.background = T.cardHover} onMouseLeave={e => e.currentTarget.style.background = T.card}>
          {Ic.contacts(T.text2, 24)}
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>Contacts</span>
        </button>
      </div>
    </div>
  );
}

// ─── JOURNEY SETUP ───────────────────────────────────────────────────────────
function JourneySetupScreen({ T, journey, onStart }) {
  const initType = journey?.durationSec === 1800 ? "30" : journey?.durationSec === 3600 ? "60" : "custom";
  const initCustom = initType === "custom" ? (journey?.durationSec || 3600) : 3600;
  const [durationType, setDurationType] = useState(initType);
  const [customSec, setCustomSec] = useState(initCustom);
  const [showPicker, setShowPicker] = useState(false);
  const [vehicle, setVehicle] = useState(journey?.vehicle || "");
  const [plate, setPlate] = useState(journey?.plate || "");
  const vehicles = ["Auto Rickshaw", "Uber", "Cab", "Eco", "Bus", "Walk"];

  const getDurationSec = () => durationType === "30" ? 1800 : durationType === "60" ? 3600 : Math.max(60, customSec);
  const fmtCustom = () => { const h = Math.floor(customSec / 3600), m = Math.floor((customSec % 3600) / 60); return h > 0 ? `${h}h ${m > 0 ? m + "m" : ""}` : `${m}m`; };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {showPicker && (
        <TimePickerModal title="Custom Duration" value={customSec} maxHours={12}
          onConfirm={v => { setCustomSec(v); setDurationType("custom"); setShowPicker(false); }}
          onCancel={() => setShowPicker(false)} />
      )}

      <div>
        <p style={{ fontSize: 11, color: T.text3, fontWeight: 700, letterSpacing: "1px", marginBottom: 10, textTransform: "uppercase" }}>Duration</p>
        <div className="card" style={{ overflow: "hidden" }}>
          {[{ id: "30", label: "30 Minutes" }, { id: "60", label: "1 Hour" }, { id: "custom", label: "Custom Time", action: true }].map((opt, i) => (
            <div key={opt.id} onClick={() => opt.action ? setShowPicker(true) : setDurationType(opt.id)}
              style={{ display: "flex", alignItems: "center", padding: "16px 18px", borderTop: i > 0 ? `1px solid ${T.border}` : "none", cursor: "pointer", gap: 14 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${durationType === opt.id ? T.red : T.borderStrong}`, background: durationType === opt.id ? T.red : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", flexShrink: 0 }}>
                {durationType === opt.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
              </div>
              <span style={{ flex: 1, fontSize: 15, fontWeight: durationType === opt.id ? 600 : 400, color: T.text1 }}>{opt.label}</span>
              {opt.action && <span style={{ fontSize: 13, color: durationType === "custom" ? T.red : T.text3 }}>{durationType === "custom" ? fmtCustom() : "tap to set"} ›</span>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p style={{ fontSize: 11, color: T.text3, fontWeight: 700, letterSpacing: "1px", marginBottom: 10, textTransform: "uppercase" }}>Vehicle (Optional)</p>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {vehicles.map(v => (
              <button key={v} onClick={() => setVehicle(vehicle === v ? "" : v)}
                style={{ background: vehicle === v ? T.red : T.inputBg, color: vehicle === v ? "#fff" : T.text2, border: `1px solid ${vehicle === v ? T.red : T.border}`, borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all .15s" }}>
                {v}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Number plate (optional — shown in SOS)" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} />
        </div>
      </div>

      <div className="card" style={{ padding: 16, background: `${T.red}08`, borderColor: `${T.red}20` }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: T.red, letterSpacing: "1px", marginBottom: 10, textTransform: "uppercase" }}>How Journey Mode Works</p>
        {["GPS cached every 15 min — minimal battery use", "Basement/indoors: last known location is sent", "Auto-SOS triggers if timer expires without check-in", "Live countdown shown in notification bar"].map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: i < 3 ? 8 : 0 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: T.red, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
            <span style={{ fontSize: 13, color: T.text2, lineHeight: 1.5 }}>{s}</span>
          </div>
        ))}
      </div>

      <button className="btn-primary" onClick={() => onStart({ durationSec: getDurationSec(), vehicle, plate })}>
        ➤ &nbsp; Start Journey
      </button>
    </div>
  );
}

// ─── JOURNEY ACTIVE ──────────────────────────────────────────────────────────
function JourneyActiveScreen({ T, journey, onUpdate, onStop, onSOS, onAutoSOS }) {
  const notifThrottle = useRef(0);
  const onAutoSOSRef = useRef(onAutoSOS);
  const isTriggered = useRef(false);
  useEffect(() => { onAutoSOSRef.current = onAutoSOS; }, [onAutoSOS]);

  useEffect(() => {
    let intervalId;

    const tick = () => {
      const now = Date.now();
      const remainingSec = journey.endTime 
        ? Math.max(0, Math.ceil((journey.endTime - now) / 1000)) 
        : journey.timeLeft - 1;
      
      if (remainingSec <= 0 && !isTriggered.current) {
        isTriggered.current = true;
        onAutoSOSRef.current();
        return;
      }
      
      onUpdate(j => ({ ...j, timeLeft: remainingSec }));
      notifThrottle.current += 1;
      if (notifThrottle.current >= 30) {
        notifThrottle.current = 0;
        Native.showJourneyNotification(remainingSec);
      }
    };

    intervalId = setInterval(tick, 1000);
    Native.showJourneyNotification(journey.timeLeft);
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [journey.endTime, onUpdate]);


  const fmt = s => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };
  const pct = journey.timeLeft / journey.durationSec;
  const urgent = journey.timeLeft < 300;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20 }}>
      <div style={{ position: "relative", width: 210, height: 210, marginBottom: 20 }}>
        <svg width={210} height={210} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
          <circle cx={105} cy={105} r={95} fill="none" stroke={T.border} strokeWidth={7} />
          <circle cx={105} cy={105} r={95} fill="none" stroke={urgent ? T.red : T.green} strokeWidth={7}
            strokeDasharray={2 * Math.PI * 95} strokeDashoffset={2 * Math.PI * 95 * (1 - pct)}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear, stroke .5s" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 38, fontWeight: 900, color: urgent ? T.red : T.text1, letterSpacing: "-0.03em", transition: "color .5s" }}>{fmt(journey.timeLeft)}</span>
          <span style={{ fontSize: 11, color: T.text3, fontWeight: 700, letterSpacing: "1px", marginTop: 6 }}>REMAINING</span>
        </div>
      </div>

      {journey.vehicle && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 16px", marginBottom: 16 }}>
          {Ic.car(T.text2, 15)}
          <span style={{ fontSize: 14, color: T.text2 }}>{journey.vehicle}{journey.plate ? ` · ${journey.plate}` : ""}</span>
        </div>
      )}

      <div style={{ width: "100%", paddingBottom: 8 }}>
        <div className="card" style={{ padding: "12px 16px", marginBottom: 16, background: `${T.green}0a`, borderColor: `${T.green}20`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: T.text2 }}>GPS caching active · Countdown in notification bar</span>
        </div>
      </div>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <button className="btn-primary" onClick={onSOS}>🚨 &nbsp; Trigger SOS Now</button>
        <button className="btn-ghost" onClick={onStop}>✓ &nbsp; I've Arrived Safely</button>
      </div>
    </div>
  );
}

// ─── CONTACTS ────────────────────────────────────────────────────────────────
function ContactsScreen({ T, contacts, setContacts }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editingId, setEditingId] = useState(null);

  const saveContact = () => {
    const n = name.trim();
    const p = phone.trim();
    if (!n) return alert("Please enter a valid name.");
    if (p.replace(/[^\d+]/g, "").length < 5) return alert("Please enter a valid phone number.");

    const isDuplicate = contacts.some(c => c.phone.replace(/[^\d+]/g, "") === p.replace(/[^\d+]/g, "") && c.id !== editingId);
    if (isDuplicate) return alert("This phone number is already in your emergency contacts.");

    if (editingId) {
      setContacts(contacts.map(c => c.id === editingId ? { ...c, name: n, phone: p } : c));
      setEditingId(null);
    } else {
      if (contacts.length >= 5) return;
      setContacts([...contacts, { id: Date.now(), name: n, phone: p }]);
    }
    setName(""); setPhone("");
  };

  const editContact = (c) => {
    setEditingId(c.id);
    setName(c.name);
    setPhone(c.phone);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName(""); setPhone("");
  };

  return (
    <div>
      <p style={{ fontSize: 14, color: T.text2, marginBottom: 6, lineHeight: 1.6 }}>Emergency SMS goes to these contacts. Stored only on your device — survives app updates.</p>
      <p style={{ fontSize: 12, color: T.text3, marginBottom: 20 }}>Only "Clear Storage" removes them — not Clear Cache.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {contacts.map(c => (
          <div key={c.id} className="card" style={{ display: "flex", alignItems: "center", padding: "14px 16px", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: `${T.red}15`, display: "flex", alignItems: "center", justifyContent: "center", color: T.red, fontWeight: 800, fontSize: 17, flexShrink: 0 }}>
              {c.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: T.text1 }}>{c.name}</p>
              <p style={{ fontSize: 13, color: T.text2, marginTop: 2 }}>{c.phone}</p>
            </div>
            <button onClick={() => editContact(c)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
              {Ic.edit(T.text3)}
            </button>
            <button onClick={() => setContacts(contacts.filter(ct => ct.id !== c.id))} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
              {Ic.trash(T.text3)}
            </button>
          </div>
        ))}
      </div>

      {(contacts.length < 5 || editingId) ? (
        <div className="card" style={{ padding: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: T.text3, letterSpacing: "1px", marginBottom: 14, textTransform: "uppercase" }}>
            {editingId ? "Edit Contact" : `Add Contact (${contacts.length}/5)`}
          </p>
          <input type="text" placeholder="Name" value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: 10 }} />
          <input type="tel" placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} style={{ marginBottom: 16 }} />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={saveContact}>
              {editingId ? "Update Contact" : "+ Add Contact"}
            </button>
            {editingId && (
              <button className="btn-primary" style={{ flex: 1, background: T.borderStrong, color: T.text1 }} onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 16, textAlign: "center" }}>
          <p style={{ color: T.text3, fontSize: 14 }}>Maximum 5 contacts reached</p>
        </div>
      )}
    </div>
  );
}

// ─── TOGGLE ──────────────────────────────────────────────────────────────────
function Toggle({ on, onToggle }) {
  const T = useTheme();
  return (
    <button className="toggle" onClick={onToggle} style={{ background: on ? T.red : T.border }}>
      <div className="toggle-thumb" style={{ left: on ? 22 : 2 }} />
    </button>
  );
}

function SRow({ icon, label, sub, right, onClick, borderTop, T }: { icon?: any, label?: any, sub?: any, right?: any, onClick?: any, borderTop?: any, T?: any }) {
  return (
    <div className="srow" onClick={onClick} style={{ borderTop: borderTop ? `1px solid ${T.border}` : "none", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: T.inputBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 500, color: T.text1 }}>{label}</p>
        {sub && <p style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function SettingsScreen({ T, themeId, setThemeId, emergencySettings, setEmergencySettings, onTestSOS }) {
  const [showJourneyTimer, setShowJourneyTimer] = useState(false);
  const [showManualTimer, setShowManualTimer] = useState(false);
  const fmtSec = s => { if (s < 60) return `${s}s`; const m = Math.floor(s / 60), sec = s % 60; return sec > 0 ? `${m}m ${sec}s` : `${m} min`; };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {showJourneyTimer && (
        <TimePickerModal title="Journey Mode Timer" value={emergencySettings.journeyTimerSec || 120} maxHours={0}
          minSec={10}
          onConfirm={v => { setEmergencySettings(s => ({ ...s, journeyTimerSec: v })); setShowJourneyTimer(false); }}
          onCancel={() => setShowJourneyTimer(false)} />
      )}
      {showManualTimer && (
        <TimePickerModal title="Manual SOS Timer" value={emergencySettings.manualSOSSec || 13} maxHours={0}
          minSec={4} maxSec={60}
          onConfirm={v => { setEmergencySettings(s => ({ ...s, manualSOSSec: Math.min(60, Math.max(4, v)) })); setShowManualTimer(false); }}
          onCancel={() => setShowManualTimer(false)} />
      )}

      {/* Theme */}
      <div>
        <p style={{ fontSize: 11, color: T.text3, fontWeight: 700, letterSpacing: "1px", marginBottom: 10, textTransform: "uppercase" }}>Appearance</p>
        <div className="card" style={{ padding: 16 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: T.text1, marginBottom: 3 }}>Theme</p>
          <p style={{ fontSize: 13, color: T.text2, marginBottom: 14 }}>Choose how AyuGuard looks on your device</p>
          <div style={{ display: "flex", background: T.segBg, borderRadius: 12, padding: 3, gap: 3 }}>
            {[["system", "📱 System Default"], ["dark", "🌑 AMOLED Black"], ["day", "☀️ Light"]].map(([id, label]) => (
              <button key={id} onClick={() => setThemeId(id)}
                style={{ flex: 1, padding: "10px 4px", borderRadius: 10, border: "none", background: themeId === id ? T.card : "transparent", color: themeId === id ? T.text1 : T.text2, fontWeight: themeId === id ? 700 : 400, fontSize: 12, cursor: "pointer", transition: "all .2s" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Emergency Settings */}
      <div>
        <p style={{ fontSize: 11, color: T.text3, fontWeight: 700, letterSpacing: "1px", marginBottom: 10, textTransform: "uppercase" }}>Emergency Settings</p>
        <div className="card" style={{ overflow: "hidden" }}>
          <SRow T={T} icon={Ic.music(T.text2)} label="Alarm Sound"
            sub="Play loud alarm during SOS"
            right={<Toggle on={emergencySettings.alarmSoundEnabled !== false} onToggle={() => setEmergencySettings(s => ({ ...s, alarmSoundEnabled: s.alarmSoundEnabled === false ? true : false }))} />} />
          <SRow T={T} borderTop icon={Ic.clock(T.text2)} label="Journey Mode Timer"
            sub="Countdown time when auto-SOS triggers from journey"
            onClick={() => setShowJourneyTimer(true)}
            right={<span style={{ color: T.red, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtSec(emergencySettings.journeyTimerSec || 120)} ›</span>} />
          <SRow T={T} borderTop icon={Ic.bell(T.text2)} label="Manual SOS Timer"
            sub="Homescreen hold → timer before SMS (4–60s)"
            onClick={() => setShowManualTimer(true)}
            right={<span style={{ color: T.red, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtSec(emergencySettings.manualSOSSec || 13)} ›</span>} />
        </div>
      </div>

      {/* Test SOS */}
      <div>
        <p style={{ fontSize: 11, color: T.text3, fontWeight: 700, letterSpacing: "1px", marginBottom: 10, textTransform: "uppercase" }}>Testing</p>
        <div className="card" style={{ overflow: "hidden" }}>
          <SRow T={T} icon={Ic.beaker(T.text2)} label="Test SOS"
            sub="Run full SOS flow with a test message to your number"
            onClick={onTestSOS} right={Ic.chevron(T.text3)} />
        </div>
      </div>

      {/* System */}
      <div>
        <p style={{ fontSize: 11, color: T.text3, fontWeight: 700, letterSpacing: "1px", marginBottom: 10, textTransform: "uppercase" }}>System</p>
        <div className="card" style={{ overflow: "hidden" }}>
          <SRow T={T} icon={Ic.battery(T.text2)} label="Optimize Battery"
            sub="Set to Unrestricted for reliable background SOS"
            onClick={async () => {
              await Native.openBatterySettings();
            }}
            right={Ic.chevron(T.text3)} />
          <SRow T={T} borderTop icon={Ic.refresh(T.text2)} label="Check for Updates"
            sub="V1 BETA — You're on the latest version"
            onClick={() => alert("✅ AyuGuard V1 BETA\nYou are on the latest version.")}
            right={Ic.chevron(T.text3)} />
        </div>
      </div>

      <div className="card" style={{ padding: 14, background: `${T.red}08`, borderColor: `${T.red}15` }}>
        <p style={{ fontSize: 12, color: T.text2, textAlign: "center", lineHeight: 1.6 }}>
          Emergency settings affect all SOS triggers — manual hold, journey mode auto-trigger, and future hardware button trigger.
        </p>
      </div>
    </div>
  );
}

// ─── SOS COUNTDOWN ───────────────────────────────────────────────────────────
// Manual SOS: direct timer with alarm sound throughout (if enabled)
// Journey SOS: 2min timer, alarm sound plays in last 13s (if enabled)
function SOSCountdownScreen({ T, countdownSec, onCancel, onAlarm, isTest, sosType, alarmSoundEnabled }: { T?: any, countdownSec?: any, onCancel?: any, onAlarm?: any, isTest?: any, sosType?: any, alarmSoundEnabled?: any }) {
  const [timeLeft, setTimeLeft] = useState(countdownSec);
  const onAlarmRef = useRef(onAlarm);
  const alarmPlayedRef = useRef(false);
  const audioRef = useRef(null);
  useEffect(() => { onAlarmRef.current = onAlarm; }, [onAlarm]);

  // Play alarm sound in last 13 seconds (for journey) or from start (for manual)
  useEffect(() => {
    if (!alarmPlayedRef.current && alarmSoundEnabled !== false && timeLeft > 0) {
      if (sosType === "manual" || (sosType === "journey" && timeLeft <= 13)) {
        alarmPlayedRef.current = true;
        try {
          const src = "/sos_alarm.mp3";
          const audio = new Audio(src);
          audio.loop = false;
          audioRef.current = audio;
          audio.play().catch(() => {});
        } catch {}
      }
    }
  }, [timeLeft, alarmSoundEnabled, sosType]);

  useEffect(() => {
    locationManager.fetchForSOS().catch(() => {});
    const endTime = Date.now() + countdownSec * 1000;
    let intervalId;

    const tick = () => {
      const now = Date.now();
      const remainingSec = Math.max(0, Math.ceil((endTime - now) / 1000));
      
      if (remainingSec <= 0) {
        setTimeLeft(0);
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        if (intervalId) clearInterval(intervalId);
        onAlarmRef.current();
        return;
      }
      
      setTimeLeft(remainingSec);
    };
    
    intervalId = setInterval(tick, 1000);
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, [countdownSec]);

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secs = String(timeLeft % 60).padStart(2, "0");
  const pct = timeLeft / countdownSec;
  const alarmPhase = timeLeft <= 13;

  return (
    <div style={{ minHeight: "100dvh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", color: isTest ? T.blue : "#ff5252", marginBottom: 40, textTransform: "uppercase" }}>
        {isTest ? "🧪 TEST SOS — NO EMERGENCY" : alarmPhase ? "🔔 SENDING SOON" : "🚨 SOS ACTIVATED"}
      </p>

      <div style={{ position: "relative", width: 230, height: 230, marginBottom: 32 }}>
        <svg width={230} height={230} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
          <circle cx={115} cy={115} r={104} fill="none" stroke={T.border} strokeWidth={8} />
          <circle cx={115} cy={115} r={104} fill="none" stroke={isTest ? T.blue : T.red} strokeWidth={8}
            strokeDasharray={2 * Math.PI * 104} strokeDashoffset={2 * Math.PI * 104 * (1 - pct)}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 58, fontWeight: 900, color: T.text1, letterSpacing: "-0.04em", lineHeight: 1 }}>{mins}:{secs}</span>
          <span style={{ fontSize: 11, color: isTest ? T.blue : T.red, fontWeight: 700, letterSpacing: "1.5px", marginTop: 8, textTransform: "uppercase" }}>Until Dispatch</span>
        </div>
      </div>

      <p style={{ fontSize: 16, color: isTest ? T.blue : (alarmPhase ? T.red : T.text2), fontWeight: 600, marginBottom: 6, textAlign: "center" }}>
        {isTest ? "Test message will be sent" : alarmPhase ? "Sending in " + timeLeft + " seconds..." : "Emergency message will be sent"}
      </p>
      <p style={{ fontSize: 14, color: T.text3, marginBottom: 44, textAlign: "center" }}>Fetching your location now...</p>

      <button onClick={onAlarm} style={{ background: isTest ? T.blue : T.red, color: "#fff", border: "none", borderRadius: 14, padding: "15px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", marginBottom: 12 }}>
        {isTest ? "Send Test Now — Skip" : "Send Now — Skip Countdown"}
      </button>
      <button onClick={onCancel} style={{ background: "transparent", color: T.text3, border: `1px solid ${T.border}`, borderRadius: 14, padding: "15px 24px", fontSize: 15, fontWeight: 500, cursor: "pointer", width: "100%" }}>
        ✕ Cancel — {isTest ? "Stop Test" : "I'm Safe"}
      </button>
    </div>
  );
}

// ─── SOS ALARM (sends SMS immediately) ───────────────────────────────────────
function SOSAlarmScreen({ T, onStop, onDispatch, isTest }: { T?: any, onStop?: any, onDispatch?: any, isTest?: any }) {
  const [smsSent, setSmsSent] = useState(false);
  const dispatchedRef = useRef(false);

  useEffect(() => {
    if (!dispatchedRef.current) {
      dispatchedRef.current = true;
      onDispatch().then(() => setSmsSent(true));
    }
  }, [onDispatch]);

  return (
    <div style={{ minHeight: "100dvh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
      <div className="alarm-pulse" style={{ fontSize: 80, marginBottom: 32 }}>🚨</div>

      {smsSent ? (
        <>
          <p style={{ fontSize: 24, fontWeight: 900, color: T.text1, marginBottom: 12, textAlign: "center", letterSpacing: "-0.02em" }}>
            {isTest ? "Test Message Sent" : "Help is on the way"}
          </p>
          <p style={{ fontSize: 15, color: isTest ? T.blue : T.red, marginBottom: 16, textAlign: "center", lineHeight: 1.7 }}>
            {isTest ? "Test SMS sent to your number. You'll receive the exact message your contacts would get." : "Emergency SMS sent to all trusted contacts with your location."}
          </p>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "12px 20px", marginBottom: 44, textAlign: "center" }}>
            <p style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>
              {isTest ? "This was a test — no real emergency triggered." : "Stay calm · Help is coming · Keep your phone on"}
            </p>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 24, fontWeight: 900, color: T.text1, marginBottom: 10, textAlign: "center" }}>Sending message...</p>
          <p style={{ fontSize: 15, color: T.text3, marginBottom: 44, textAlign: "center" }}>Contacting your trusted contacts now.</p>
        </>
      )}

      <button onClick={onStop} style={{ background: "transparent", color: T.text3, border: `1px solid ${T.border}`, borderRadius: 14, padding: "15px 24px", fontSize: 15, fontWeight: 500, cursor: "pointer", width: "100%" }}>
        {smsSent ? (isTest ? "Done" : "I'm Safe Now") : "✕ Cancel — I'm Safe"}
      </button>
    </div>
  );
}

// ─── TEST SOS SETUP ──────────────────────────────────────────────────────────
function TestSOSSetupScreen({ T, testPhone, setTestPhone, onStart, onBack }) {
  const [progress, setProgress] = useState(0);
  const holdTimer = useRef(null);
  const canHold = testPhone.replace(/\s/g, "").length >= 10;

  const startHold = () => {
    if (!canHold) return;
    Native.vibrate("LIGHT");
    let tick = 0;
    holdTimer.current = setInterval(() => {
      tick += 50;
      setProgress(tick);
      if (tick >= 4000) { clearInterval(holdTimer.current); setProgress(0); onStart(); }
    }, 50);
  };
  const stopHold = () => { clearInterval(holdTimer.current); setProgress(0); };
  const scale = 1 + (progress / 4000) * 0.10;
  const pct = progress / 4000;
  const secsLeft = Math.ceil((4000 - progress) / 1000);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card" style={{ padding: 18, background: `${T.blue}08`, borderColor: `${T.blue}20` }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 6 }}>🧪 Test Mode</p>
        <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.6 }}>Full SOS flow — countdown, alarm, sound — but sends TEST message only to your number.</p>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: T.text1, marginBottom: 4 }}>Your phone number</p>
        <p style={{ fontSize: 13, color: T.text2, marginBottom: 14, lineHeight: 1.5 }}>Enter your own number so the test SMS arrives on this device.</p>
        <input type="tel" placeholder="+91 98765 43210 (your own number)" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
        {testPhone.length > 0 && !canHold && <p style={{ fontSize: 12, color: T.red, marginTop: 8 }}>Enter a valid phone number to enable test</p>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8 }}>
        <div style={{ position: "relative", margin: "0 0 12px" }}>
          <svg width={200} height={200} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)", pointerEvents: "none" }}>
            <circle cx={100} cy={100} r={92} fill="none" stroke={T.border} strokeWidth={3} />
            <circle cx={100} cy={100} r={92} fill="none" stroke={T.red} strokeWidth={3}
              strokeDasharray={2 * Math.PI * 92} strokeDashoffset={2 * Math.PI * 92 * (1 - pct)}
              strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.05s linear", opacity: pct > 0 ? 1 : 0 }} />
          </svg>
          <div style={{ width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button onMouseDown={startHold} onMouseUp={stopHold} onMouseLeave={stopHold} onTouchStart={startHold} onTouchEnd={stopHold}
              disabled={!canHold}
              style={{ width: 158, height: 158, borderRadius: "50%", background: canHold ? `radial-gradient(circle at 38% 32%, #ff5252, ${T.red} 60%, ${T.redDim})` : T.border, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: canHold ? "#fff" : T.text3, cursor: canHold ? "pointer" : "not-allowed", userSelect: "none", border: "none", transform: `scale(${scale})`, transition: "transform 0.06s", letterSpacing: "0.05em", opacity: canHold ? 1 : 0.45 }}>
              TEST
              {progress > 0 && <span style={{ fontSize: 13, fontWeight: 600, marginTop: 4, opacity: 0.85 }}>{secsLeft}s</span>}
            </button>
          </div>
        </div>
      </div>
      <p style={{ color: progress > 0 ? T.red : T.text3, fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 8, textAlign: "center" }}>
        {!canHold ? "ENTER NUMBER FIRST" : progress > 0 ? "HOLD TO CONFIRM..." : "HOLD 4 SECONDS TO TEST"}
      </p>
      <button onClick={onBack} className="btn-ghost">← Back to Settings</button>
    </div>
  );
}

// ─── FEEDBACK SCREEN ─────────────────────────────────────────────────────────
const FEEDBACK_URL = "https://github.com/ridhan-X/AyuGuard/discussions/1";

function FeedbackScreen({ T, onClose }) {
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = () => {
    if (rating === 0 && !note.trim()) {
      alert("Please provide a rating or some feedback before submitting.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try { window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer"); } catch {}
    setTimeout(() => { onClose(); }, 300);
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", padding: "60px 24px 40px", background: T.bg }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 52, marginBottom: 18 }}>🙏</div>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: T.text1, letterSpacing: "-0.03em", marginBottom: 10 }}>Glad you're safe</h2>
        <p style={{ fontSize: 15, color: T.text2, lineHeight: 1.6, marginBottom: 28 }}>How did AyuGuard perform? Share your feedback — it helps make it better for everyone.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          {[1,2,3,4,5].map(s => (
            <button key={s} onClick={() => setRating(s)} style={{ flex: 1, aspectRatio: "1", borderRadius: 14, border: `1.5px solid ${s <= rating ? T.red : T.border}`, background: s <= rating ? `${T.red}12` : T.card, cursor: "pointer", fontSize: 22, transition: "all .2s" }}>
              {s <= rating ? "★" : "☆"}
            </button>
          ))}
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Any bugs or suggestions? (optional)"
          style={{ background: T.inputBg, border: `1.5px solid ${T.border}`, borderRadius: 14, color: T.text1, fontSize: 14, padding: "14px 16px", width: "100%", height: 110, outline: "none", resize: "none", lineHeight: 1.5 }} />
        <p style={{ fontSize: 12, color: T.text3, marginTop: 10, lineHeight: 1.5 }}>Tapping "Share Feedback" opens GitHub Discussions where you can post your experience.</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
        <button className="btn-primary" onClick={handleSubmit}>Share Feedback on GitHub</button>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.text3, fontSize: 14, cursor: "pointer", padding: "8px 0" }}>Skip</button>
      </div>
    </div>
  );
}

// ─── ABOUT ───────────────────────────────────────────────────────────────────
function BottomSheet({ children, onClose, T }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }} />
      <div className="slide-up" style={{ position: "relative", zIndex: 1, background: T.card, borderRadius: "20px 20px 0 0", padding: "10px 16px 36px", maxHeight: "82vh", overflowY: "auto" }}>
        <div style={{ width: 32, height: 4, borderRadius: 2, background: T.borderStrong, margin: "0 auto 14px" }} />
        {children}
      </div>
    </div>
  );
}

function PrivacySheet({ T, onClose }) {
  const items = [
    { icon: "🚫", title: "No Servers", sub: "Zero cloud infrastructure" },
    { icon: "💾", title: "Local Storage", sub: "All data stays on your device" },
    { icon: "🔕", title: "No Tracking", sub: "We don't collect analytics" },
    { icon: "📍", title: "Location Only on SOS", sub: "GPS fetched only during emergencies" },
    { icon: "🔒", title: "Minimal Permissions", sub: "We ask for only what's needed" },
  ];
  return (
    <BottomSheet T={T} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 17, fontWeight: 700, color: T.text1, letterSpacing: "-0.02em" }}>Your Data is Yours.</p>
          <p style={{ fontSize: 12, color: T.text2, marginTop: 2 }}>Privacy Policy</p>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.text2, fontSize: 18, padding: 4 }}>✕</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(({ icon, title, sub }) => (
          <div key={title} style={{ background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.text1 }}>{title}</p>
              <p style={{ fontSize: 11, color: T.text2, marginTop: 1 }}>{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

function BetaChecklistSheet({ T, onClose }) {
  const checks = ["Did the SOS hold work?", "Was the emergency message delivered?", "Was the location accurate?", "Did Journey Mode count down correctly?", "Any bugs or issues?"];
  const [checked, setChecked] = useState({});
  const anyChecked = Object.values(checked).some(Boolean);
  const linkLock = useRef(false);

  const handleLink = (e) => {
    e.preventDefault();
    if (linkLock.current) return;
    linkLock.current = true;
    try { window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer"); } catch {}
    setTimeout(() => { linkLock.current = false; }, 1000);
  };

  return (
    <BottomSheet T={T} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 17, fontWeight: 700, color: T.text1, letterSpacing: "-0.02em" }}>Beta Testing</p>
          <p style={{ fontSize: 12, color: T.text2, marginTop: 2 }}>Help us improve AyuGuard</p>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.text2, fontSize: 18, padding: 4 }}>✕</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {checks.map((label, i) => {
          const on = !!checked[i];
          return (
            <div key={i} onClick={() => setChecked(ch => ({ ...ch, [i]: !ch[i] }))}
              style={{ background: T.inputBg, border: `1px solid ${on ? T.green : T.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "border-color 0.15s" }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${on ? T.green : T.borderStrong}`, background: on ? T.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                {on && Ic.check("#fff", 12)}
              </div>
              <p style={{ fontSize: 13, fontWeight: 500, color: T.text1 }}>{label}</p>
            </div>
          );
        })}
      </div>
      <div style={{ overflow: "hidden", maxHeight: anyChecked ? 90 : 0, opacity: anyChecked ? 1 : 0, transition: "max-height 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease", marginTop: anyChecked ? 12 : 0 }}>
        <a href={FEEDBACK_URL} onClick={handleLink}
          style={{ display: "flex", alignItems: "center", gap: 12, background: T.cardHover, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", color: T.text1, textDecoration: "none" }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill={T.text1}><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.14 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Share Feedback on GitHub</p>
            <p style={{ fontSize: 11, color: T.text2, marginTop: 1 }}>Opens GitHub Discussions</p>
          </div>
        </a>
      </div>
    </BottomSheet>
  );
}

function AboutScreen({ T }) {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showBeta, setShowBeta] = useState(false);

  const linkLock = useRef(false);
  const handleExternalLink = (e, url) => {
    e.preventDefault();
    if (linkLock.current) return;
    linkLock.current = true;
    try { window.open(url, "_blank", "noopener,noreferrer"); } catch {}
    setTimeout(() => { linkLock.current = false; }, 1000);
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 20px 40px" }}>
        <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(145deg, #1a0505, #2a0808)", border: "1px solid #2a0808", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, boxShadow: "0 6px 24px rgba(0,0,0,0.5)" }}>
          {Ic.shield(T.red, 34)}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text1, letterSpacing: "-0.03em", marginBottom: 4 }}>AyuGuard</h1>
        <p style={{ fontSize: 11, fontWeight: 700, color: T.red, letterSpacing: "2.5px", marginBottom: 20, textTransform: "uppercase" }}>V1 BETA</p>

        <div style={{ width: "100%", background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 18px 0", marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: T.text1, fontWeight: 500, textAlign: "center", lineHeight: 1.6, marginBottom: 14 }}>
            AyuGuard is a fast, lightweight, and offline-first personal safety shield.
          </p>
          <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 0", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: T.text2, lineHeight: 1.5 }}>100% Privacy Focused — we don't collect, track, or store any personal data.</p>
          </div>
        </div>

        <button onClick={() => setShowPrivacy(true)} style={{ width: "100%", background: "none", border: "none", padding: "10px 0", marginBottom: 4, fontSize: 15, fontWeight: 600, color: T.text1, cursor: "pointer", textAlign: "center" }}>
          Privacy Policy
        </button>
        <button onClick={() => setShowBeta(true)} style={{ width: "100%", background: "none", border: "none", padding: "10px 0", marginBottom: 20, fontSize: 15, fontWeight: 600, color: T.text1, cursor: "pointer", textAlign: "center" }}>
          Beta Testing Checklist
        </button>

        <div style={{ width: "100%", background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 18px", textAlign: "center" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: T.text3, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 8 }}>MADE WITH ❤️ BY</p>
          <a href="https://github.com/ridhan-X" onClick={(e) => handleExternalLink(e, "https://github.com/ridhan-X")} style={{ display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill={T.blue}><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.14 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
            <span style={{ fontSize: 20, fontWeight: 800, color: T.blue, letterSpacing: "-0.02em" }}>Ridhan</span>
          </a>
        </div>
        <p style={{ fontSize: 11, color: T.text3, marginTop: 20 }}>AyuGuard V1 BETA · Build 1.0.0</p>
      </div>
      {showPrivacy && <PrivacySheet T={T} onClose={() => setShowPrivacy(false)} />}
      {showBeta && <BetaChecklistSheet T={T} onClose={() => setShowBeta(false)} />}
    </>
  );
}

// ─── ROOT APP ────────────────────────────────────────────────────────────────
export default function AyuGuard() {
  // Theme: "system" | "dark" | "day"
  const [themeId, setThemeId] = useState("system");
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = e => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedThemeId = themeId === "system" ? (systemDark ? "dark" : "day") : themeId;
  const T = THEMES[resolvedThemeId] || THEMES.dark;

  const [screen, setScreen] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [contacts, setContacts] = useState([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [emergencySettings, setEmergencySettings] = useState({
    vibration: true,
    alarmSoundEnabled: true,
    journeyTimerSec: 120,
    manualSOSSec: 13,
  });

  // Initialization
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const theme = await Native.getItem("ayuguard_theme");
        if (theme && mounted) setThemeId(theme);

        const settings = await Native.getItem("ayuguard_settings");
        if (settings && mounted) setEmergencySettings(prev => ({ ...prev, ...JSON.parse(settings) }));

        const cons = await Native.getItem("ayuguard_contacts");
        if (mounted) {
          setContacts(cons ? JSON.parse(cons) : [{ id: 1, name: "Mom", phone: "+91 98765 43210" }, { id: 2, name: "Rahul", phone: "+91 91234 56789" }]);
          setContactsLoaded(true);
          setSettingsLoaded(true);
        }

        const jrn = await Native.getItem("ayuguard_journey");
        if (mounted) {
          if (jrn) {
            const parsedJrn = JSON.parse(jrn);
            if (parsedJrn.active && parsedJrn.endTime) {
              const now = Date.now();
              if (now >= parsedJrn.endTime) {
                // Journey expired while backgrounded - wait to trigger SOS in screen
                setJourney(parsedJrn);
              } else {
                setJourney(parsedJrn);
                locationManager.startJourneyTracking();
              }
            } else {
              setJourney(parsedJrn);
            }
          }
          setJourneyLoaded(true);
        }

        const setupDone = await Native.getItem("ayuguard_setup_done");
        const tutDone = await Native.getItem("ayuguard_tutorial_done");
        if (mounted) {
          if (setupDone !== "1") {
            setScreen(S.SETUP_WIZARD);
          } else if (tutDone !== "1") {
            setScreen(S.TUTORIAL);
          } else {
            Native.checkAndRequestPermissions();
            setScreen(jrn && JSON.parse(jrn).active ? S.JOURNEY_ACTIVE : S.HOME);
          }
        }
      } catch (e) {
        if (mounted) setScreen(S.HOME); // fallback
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  const completeTutorial = useCallback(async () => {
    await Native.setItem("ayuguard_tutorial_done", "1");
    // Request permissions after tutorial
    Native.checkAndRequestPermissions();
    setScreen(S.HOME);
  }, []);

  useEffect(() => { if (contactsLoaded) Native.setItem("ayuguard_contacts", JSON.stringify(contacts)); }, [contacts, contactsLoaded]);

  useEffect(() => { if (settingsLoaded) Native.setItem("ayuguard_settings", JSON.stringify(emergencySettings)); }, [emergencySettings, settingsLoaded]);

  const updateTheme = useCallback((id) => { setThemeId(id); Native.setItem("ayuguard_theme", id); }, []);

  const [journey, setJourney] = useState({ durationSec: 1800, vehicle: "", plate: "", active: false, timeLeft: 0 });
  const [journeyLoaded, setJourneyLoaded] = useState(false);

  useEffect(() => {
    if (journeyLoaded) Native.setItem("ayuguard_journey", JSON.stringify(journey));
  }, [journey, journeyLoaded]);

  const [sosState, setSosState] = useState({ type: "manual" });
  const [testPhone, setTestPhone] = useState("");
  const [appResumed, setAppResumed] = useState(0);

  useEffect(() => {
    let sub;
    async function setupAppListener() {
      try {
        const { App } = await import("@capacitor/app");
        sub = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            setAppResumed(Date.now());
          }
        });
      } catch {}
    }
    setupAppListener();
    return () => { if (sub) sub.remove(); };
  }, []);

  const navigate = useCallback((sc) => { setScreen(sc); setMenuOpen(false); }, []);

  // Manual SOS: just the timer (13s or custom), alarm plays throughout
  // Journey SOS: 2min journey timer (set from settings), alarm in last 13s
  const startSOS = useCallback((opts: any = {}) => {
    setSosState({ type: opts.type || "manual" });
    Native.vibrate("HEAVY");
    const sec = opts.type === "journey" ? (emergencySettings.journeyTimerSec || 120) : (emergencySettings.manualTimerSec || 13);
    Native.startForegroundService("sos", { endTime: Date.now() + sec * 1000 });
    navigate(S.SOS_COUNTDOWN);
  }, [navigate, emergencySettings]);

  const getSosCountdownSec = useCallback(() => {
    return sosState.type === "journey"
      ? (emergencySettings.journeyTimerSec || 120)
      : (emergencySettings.manualSOSSec || 13);
  }, [sosState.type, emergencySettings]);

  const dispatchEmergency = useCallback(async () => {
    // Stop native timer immediately to prevent duplicate
    await Native.stopForegroundService();

    if (await Native.hasDispatchedRecently()) {
      return; // Already dispatched by native service
    }

    await Native.markDispatched();

    const loc = await locationManager.fetchForSOS();
    const mapLink = loc ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : null;
    const battery = await Native.getBattery();
    const numbers = contacts.map(c => c.phone.replace(/\s/g, ""));

    let locLine;
    if (!loc) locLine = "📍 Location: unavailable (GPS failed)";
    else if (!loc.accurate) locLine = `📍 Location (last known — GPS unavailable):\n${mapLink}`;
    else locLine = `📍 Location:\n${mapLink}`;

    const batteryLine = battery !== null ? `🔋 Battery: ${battery}%` : "";
    const vehicleLine = journey.vehicle
      ? `🚗 Vehicle: ${journey.vehicle}${journey.plate ? ` · ${journey.plate}` : ""}`
      : "";

    const msg = [
      "🚨 Emergency SOS — I need immediate help!",
      "🚨 ઇમરજન્સી SOS — મને તાત્કાલિક મદદની જરૂર છે!",
      "",
      locLine,
      batteryLine,
      vehicleLine,
      "— Sent via AyuGuard",
    ].filter(Boolean).join("\n");

    await Native.sendSMS(numbers, msg);
    if (emergencySettings.vibration) Native.vibrate("HEAVY");

    // Background retry for GPS update (max 2 min, 12 tries)
    if (!loc || !loc.accurate) {
      let retryCount = 0;
      const retryMax = 12;
      const retryId = setInterval(async () => {
        retryCount++;
        const fresh = await Native.getLocation();
        if (fresh && fresh.accurate) {
          clearInterval(retryId);
          await locationManager.saveCache(fresh);
          const freshLink = `https://maps.google.com/?q=${fresh.lat},${fresh.lng}`;
          const updateMsg = [
            "📍 AyuGuard — Live Location (GPS lock acquired):",
            freshLink,
            batteryLine,
            "— Sent via AyuGuard",
          ].filter(Boolean).join("\n");
          await Native.sendSMS(numbers, updateMsg);
          if (emergencySettings.vibration) Native.vibrate("MEDIUM");
        } else if (retryCount >= retryMax) { clearInterval(retryId); }
      }, 10000);
    }
  }, [contacts, emergencySettings, journey]);

  const dispatchTestSOS = useCallback(async () => {
    const loc = await locationManager.fetchForSOS();
    const mapLink = loc ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : null;
    const battery = await Native.getBattery();
    const number = testPhone.replace(/\s/g, "");
    let locLine;
    if (!loc) locLine = "📍 Location: unavailable (GPS failed)";
    else if (!loc.accurate) locLine = `📍 Location (last known — GPS unavailable):\n${mapLink}`;
    else locLine = `📍 Location:\n${mapLink}`;
    const batteryLine = battery !== null ? `🔋 Battery: ${battery}%` : "";
    const msg = [
      "TEST SOS — This is a test alert from AyuGuard. No emergency assistance is required.",
      "ટેસ્ટ SOS — આ AyuGuard તરફથી ટેસ્ટ એલર્ટ છે. કોઈ ઇમરજન્સી મદદની જરૂર નથી.",
      "",
      locLine,
      batteryLine,
      "— Test message sent via AyuGuard",
    ].filter(Boolean).join("\n");
    await Native.sendSMS([number], msg);
    if (emergencySettings.vibration) Native.vibrate("HEAVY");
  }, [testPhone, emergencySettings]);

  const shouldShowFeedback = useCallback(async () => {
    const raw = await Native.getItem("ayuguard_sos_use_count");
    const count = (parseInt(raw) || 0) + 1;
    await Native.setItem("ayuguard_sos_use_count", String(count));
    const shownRaw = await Native.getItem("ayuguard_feedback_shown");
    const shownCount = parseInt(shownRaw) || 0;
    // Show on 1st and 5th use, not more
    if ((count === 1 || count === 5) && shownCount < 2) {
      await Native.setItem("ayuguard_feedback_shown", String(shownCount + 1));
      return true;
    }
    return false;
  }, []);

  const stopSOS = useCallback(async () => {
    if (journey.active) {
      setJourney(j => ({ ...j, active: false }));
    }
    locationManager.stopTracking();
    Native.cancelJourneyNotification();
    Native.stopForegroundService();
    const show = await shouldShowFeedback();
    if (show) navigate(S.FEEDBACK);
    else navigate(S.HOME);
  }, [journey.active, navigate, shouldShowFeedback]);

  const dynCSS = `
    body { background: ${T.bg}; color: ${T.text1}; }
    .btn-primary{background:${T.red};color:#fff;border:none;border-radius:14px;padding:15px 24px;font-size:15px;font-weight:700;cursor:pointer;width:100%;letter-spacing:.01em;transition:opacity .15s,transform .1s;}
    .btn-primary:active{opacity:.85;transform:scale(0.98);}
    .btn-ghost{background:transparent;color:${T.text2};border:1px solid ${T.border};border-radius:14px;padding:14px 24px;font-size:14px;font-weight:500;cursor:pointer;width:100%;transition:background .15s;}
    .btn-ghost:active{background:${T.cardHover};}
    .card{background:${T.card};border:1px solid ${T.border};border-radius:20px;}
    .tag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.1em;color:${T.red};background:${T.tagBg};border:1px solid ${T.tagBorder};border-radius:6px;padding:2px 7px;text-transform:uppercase;}
    input[type=text],input[type=tel]{background:${T.inputBg};border:1.5px solid ${T.border};border-radius:12px;color:${T.text1};font-size:14px;padding:13px 15px;width:100%;outline:none;transition:border-color .2s;}
    input[type=text]:focus,input[type=tel]:focus{border-color:${T.red};}
    input::placeholder,textarea::placeholder{color:${T.text3};}
    ::-webkit-scrollbar-track{background:${T.bg};}
    ::-webkit-scrollbar-thumb{background:${T.scrollThumb};}
    .drum-fade-top{background:linear-gradient(to bottom,${T.card},transparent);}
    .drum-fade-bot{background:linear-gradient(to top,${T.card},transparent);}
    .drum-selector{border-top:1px solid ${T.border};border-bottom:1px solid ${T.border};}
    .srow{display:flex;align-items:center;padding:15px 18px;gap:14px;cursor:pointer;transition:background .15s;}
    .srow:active{background:${T.cardHover};}
    .toggle{width:51px;height:31px;border-radius:16px;position:relative;cursor:pointer;border:none;transition:background .25s;flex-shrink:0;}
    .toggle-thumb{width:27px;height:27px;border-radius:50%;background:#fff;position:absolute;top:2px;transition:left .22s cubic-bezier(0.34,1.56,0.64,1);box-shadow:0 2px 6px rgba(0,0,0,0.25);}
  `;

  const isFullScreen = [S.SOS_COUNTDOWN, S.SOS_ALARM, S.TEST_COUNTDOWN, S.TEST_ALARM].includes(screen);
  const isTutorial = screen === S.TUTORIAL || screen === S.SETUP_WIZARD;

  const completeSetup = useCallback(async () => {
    await Native.setItem("ayuguard_setup_done", "1");
    setScreen(S.TUTORIAL);
  }, []);

  if (screen === null) return <div style={{ background: T.bg, minHeight: "100dvh" }} />;

  return (
    <ThemeCtx.Provider value={T}>
      <style>{globalCSS + dynCSS}</style>
      <div style={{ background: T.bg, color: T.text1, minHeight: "100dvh", maxWidth: 420, margin: "0 auto", position: "relative", overflowX: "hidden", fontFamily: "'Inter',sans-serif", transition: "background 0.25s" }}>
        
        {screen === S.SETUP_WIZARD && <SetupWizardScreen T={T} onComplete={completeSetup} />}
        {screen === S.TUTORIAL && <TutorialScreen onDone={completeTutorial} T={T} />}

        {!isTutorial && !isFullScreen && (
          <Navbar screen={screen} onMenu={() => setMenuOpen(true)} onBack={() => navigate(S.HOME)}
            onJourneyBack={() => {
              if (window.confirm("Journey is still active. Stop journey and go home?")) {
                setJourney(j => ({ ...j, active: false }));
                locationManager.stopTracking();
                Native.cancelJourneyNotification();
                navigate(S.HOME);
              }
            }} T={T} />
        )}

        <div style={{ padding: isTutorial || isFullScreen ? "0" : "0 18px 36px" }} className="fade-in" key={screen}>

          {screen === S.HOME && (
            <HomeScreen startSOS={startSOS} T={T} journey={journey}
              onJourney={() => navigate(journey.active ? S.JOURNEY_ACTIVE : S.JOURNEY_SETUP)}
              onContacts={() => navigate(S.CONTACTS)} />
          )}

          {screen === S.JOURNEY_SETUP && (
            <JourneySetupScreen T={T} journey={journey} onStart={(j) => {
              const jData = { ...j, active: true, timeLeft: j.durationSec, endTime: Date.now() + j.durationSec * 1000 };
              setJourney(jData);
              locationManager.startJourneyTracking();
              const sosSec = emergencySettings.journeyTimerSec || 120;
              Native.startForegroundService("journey", { endTime: jData.endTime + sosSec * 1000 });
              navigate(S.JOURNEY_ACTIVE);
            }} />
          )}

          {screen === S.JOURNEY_ACTIVE && (
            <JourneyActiveScreen T={T} journey={journey} onUpdate={setJourney}
              onStop={() => { setJourney(j => ({ ...j, active: false })); locationManager.stopTracking(); Native.cancelJourneyNotification(); Native.stopForegroundService(); navigate(S.HOME); }}
              onSOS={() => startSOS({ type: "journey" })}
              onAutoSOS={() => startSOS({ type: "journey" })} />
          )}

          {screen === S.CONTACTS && <ContactsScreen T={T} contacts={contacts} setContacts={setContacts} />}

          {screen === S.SETTINGS && (
            <SettingsScreen T={T} themeId={themeId} setThemeId={updateTheme}
              emergencySettings={emergencySettings} setEmergencySettings={setEmergencySettings}
              onTestSOS={() => navigate(S.TEST_SOS)} />
          )}

          {screen === S.ABOUT && <AboutScreen T={T} />}

          {screen === S.SOS_COUNTDOWN && (
            <SOSCountdownScreen T={T}
              countdownSec={getSosCountdownSec()}
              sosType={sosState.type}
              alarmSoundEnabled={emergencySettings.alarmSoundEnabled !== false}
              onCancel={() => { 
                if (sosState.type === "journey") {
                  setJourney(j => ({ ...j, active: false }));
                }
                locationManager.stopTracking(); 
                Native.cancelJourneyNotification();
                Native.stopForegroundService();
                navigate(S.HOME); 
              }}
              onAlarm={() => navigate(S.SOS_ALARM)} />
          )}

          {screen === S.SOS_ALARM && (
            <SOSAlarmScreen T={T} onStop={stopSOS} onDispatch={dispatchEmergency} />
          )}

          {screen === S.FEEDBACK && <FeedbackScreen T={T} onClose={() => navigate(S.HOME)} />}

          {screen === S.TEST_SOS && (
            <TestSOSSetupScreen T={T} testPhone={testPhone} setTestPhone={setTestPhone}
              onStart={() => navigate(S.TEST_COUNTDOWN)} onBack={() => navigate(S.SETTINGS)} />
          )}

          {screen === S.TEST_COUNTDOWN && (
            <SOSCountdownScreen T={T}
              countdownSec={emergencySettings.manualSOSSec || 13}
              sosType="manual"
              alarmSoundEnabled={emergencySettings.alarmSoundEnabled !== false}
              onCancel={() => { navigate(S.TEST_SOS); }}
              onAlarm={() => navigate(S.TEST_ALARM)}
              isTest />
          )}

          {screen === S.TEST_ALARM && (
            <SOSAlarmScreen T={T} onStop={() => navigate(S.HOME)} onDispatch={dispatchTestSOS} isTest />
          )}
        </div>

        {menuOpen && (
          <div className="menu-overlay">
            <div style={{ background: T.drawerBg, width: "72%", maxWidth: 300, height: "100%", display: "flex", flexDirection: "column", borderRight: `1px solid ${T.border}`, animation: "drawerIn 0.28s cubic-bezier(0.16,1,0.3,1)" }}>
              <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 10 }}>
                {Ic.shield(T.red, 22)}
                <span style={{ fontSize: 18, fontWeight: 800, color: T.text1, letterSpacing: "-0.02em" }}>AyuGuard</span>
                <span className="tag" style={{ marginLeft: 4 }}>BETA</span>
              </div>
              <div style={{ flex: 1, padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                {[
                  { label: "Home", icon: Ic.shield(T.text2, 18), sc: S.HOME },
                  { label: "Journey Mode", icon: Ic.journey(T.text2, 18), sc: journey.active ? S.JOURNEY_ACTIVE : S.JOURNEY_SETUP },
                  { label: "Trusted Contacts", icon: Ic.contacts(T.text2, 18), sc: S.CONTACTS },
                  { label: "Settings", icon: Ic.settings(T.text2, 18), sc: S.SETTINGS },
                  { label: "About", icon: Ic.info(T.text2, 18), sc: S.ABOUT },
                ].map(item => (
                  <button key={item.sc} onClick={() => { setScreen(item.sc); setMenuOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", background: screen === item.sc ? T.card : "none", border: "none", color: screen === item.sc ? T.text1 : T.text2, padding: "13px 14px", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: screen === item.sc ? 600 : 400, transition: "background .15s" }}>
                    {item.icon}{item.label}
                  </button>
                ))}
              </div>
              <div style={{ padding: "16px 24px 40px" }}>
                <div style={{ fontSize: 12, color: T.text3, display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
                  Shield Active
                </div>
              </div>
            </div>
            <div style={{ flex: 1, background: "rgba(0,0,0,0.5)" }} onClick={() => setMenuOpen(false)} />
          </div>
        )}
      </div>
    </ThemeCtx.Provider>
  );
}
