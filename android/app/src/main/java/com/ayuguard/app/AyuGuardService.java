package com.ayuguard.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.telephony.SmsManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.OnSuccessListener;

public class AyuGuardService extends Service {
    private static final String TAG = "AyuGuardService";
    private static final String CHANNEL_ID = "ayuguard_channel_01";
    private static final int NOTIFICATION_ID = 1001;

    private PowerManager.WakeLock wakeLock;
    private FusedLocationProviderClient fusedLocationClient;
    private Handler handler;
    private Runnable runnable;

    private String type; // "sos" or "journey"
    private long endTime;
    
    // Preferences cache passed from JS
    private String savedContacts = "[]";
    private boolean alarmSoundEnabled = true;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Service Created");
        
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AyuGuard::ForegroundWakeLock");
            wakeLock.acquire(10 * 60 * 1000L /*10 minutes*/); // safeguard timeout
        }

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        handler = new Handler(Looper.getMainLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createNotificationChannel();

        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this,
                0, notificationIntent, PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("AyuGuard Active")
                .setContentText("Keeping you safe in the background")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();

        try {
            if (Build.VERSION.SDK_INT >= 29) { // Build.VERSION_CODES.Q
                startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "startForeground failed", e);
        }

        if (intent != null) {
            type = intent.getStringExtra("type");
            endTime = intent.getLongExtra("endTime", -1);
            savedContacts = intent.getStringExtra("contacts");
            alarmSoundEnabled = intent.getBooleanExtra("alarmSoundEnabled", true);
            
            if (savedContacts == null) savedContacts = "[]";
        }

        startTimer();

        return START_STICKY;
    }

    private void startTimer() {
        if (runnable != null) handler.removeCallbacks(runnable);
        
        runnable = new Runnable() {
            @Override
            public void run() {
                long now = System.currentTimeMillis();
                
                if (endTime > 0 && now >= (endTime - 13000) && !alarmPlayed && alarmSoundEnabled) {
                    playAlarmSound();
                }

                if (endTime > 0 && now >= endTime) {
                    triggerEmergency();
                } else {
                    handler.postDelayed(this, 1000);
                }
            }
        };
        handler.post(runnable);
    }

    private android.media.MediaPlayer mediaPlayer;
    private boolean alarmPlayed = false;

    private void playAlarmSound() {
        if (!alarmSoundEnabled || alarmPlayed) return;
        alarmPlayed = true;
        try {
            mediaPlayer = android.media.MediaPlayer.create(this, R.raw.sos_alarm);
            if (mediaPlayer != null) {
                mediaPlayer.setLooping(false);
                mediaPlayer.start();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error playing alarm sound", e);
        }
    }

    private void stopAlarmSound() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception e) {}
            mediaPlayer = null;
        }
    }

    private boolean isTriggered = false;

    private void triggerEmergency() {
        if (isTriggered) return;
        isTriggered = true;
        Log.d(TAG, "Triggering Emergency SOS");
        // Only trigger once
        if (runnable != null) handler.removeCallbacks(runnable);
        
        if (AyuGuardServicePlugin.hasDispatchedRecently(this)) {
            Log.d(TAG, "Already dispatched recently, skipping");
            stopSelf();
            return;
        }

        try {
            CancellationTokenSource cts = new CancellationTokenSource();
            Task<Location> locationTask = fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.getToken());
            
            handler.postDelayed(() -> cts.cancel(), 10000); // 10s timeout

            locationTask.addOnSuccessListener(location -> {
                if (location != null) {
                    dispatchSMS(location);
                } else {
                    fallbackToLastLocation();
                }
            }).addOnFailureListener(e -> {
                fallbackToLastLocation();
            });
            
        } catch (SecurityException e) {
            Log.e(TAG, "Location permission denied", e);
            dispatchSMS(null);
        }
    }

    private void fallbackToLastLocation() {
        try {
            fusedLocationClient.getLastLocation().addOnSuccessListener(location -> {
                dispatchSMS(location);
            }).addOnFailureListener(e -> {
                dispatchSMS(null);
            });
        } catch (SecurityException e) {
            dispatchSMS(null);
        }
    }

    private void dispatchSMS(Location location) {
        AyuGuardServicePlugin.markDispatched(this);
        String msg = "[EMERGENCY - AyuGuard]\nI need help immediately.";
        if (location != null) {
            msg += "\nLoc: https://maps.google.com/?q=" + location.getLatitude() + "," + location.getLongitude();
        } else {
            msg += "\nLoc: Unavailable (No GPS access)";
        }
        
        try {
            org.json.JSONArray contacts = new org.json.JSONArray(savedContacts);
            android.telephony.SmsManager smsManager = null;
            if (Build.VERSION.SDK_INT >= 31) {
                smsManager = getSystemService(android.telephony.SmsManager.class);
            } else {
                smsManager = android.telephony.SmsManager.getDefault();
            }
            if (smsManager != null) {
                for (int i = 0; i < contacts.length(); i++) {
                    org.json.JSONObject contact = contacts.getJSONObject(i);
                    String phone = contact.getString("phone");
                    if (phone != null && !phone.isEmpty()) {
                        java.util.ArrayList<String> parts = smsManager.divideMessage(msg);
                        if (parts.size() > 1) {
                            smsManager.sendMultipartTextMessage(phone, null, parts, null, null);
                        } else {
                            smsManager.sendTextMessage(phone, null, msg, null, null);
                        }
                        Log.d(TAG, "SMS Sent to " + phone);
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error sending SMS", e);
        }
        stopSelf();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "Service Destroyed");
        stopAlarmSound();
        if (runnable != null) handler.removeCallbacks(runnable);
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "AyuGuard Foreground Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }
}
