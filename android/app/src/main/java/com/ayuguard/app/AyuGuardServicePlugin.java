package com.ayuguard.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import android.widget.LinearLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "AyuGuardService",
    permissions = {
        @Permission(
            strings = {Manifest.permission.SEND_SMS},
            alias = "sms"
        ),
        @Permission(
            strings = {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
            alias = "location"
        ),
        @Permission(
            strings = {Manifest.permission.POST_NOTIFICATIONS},
            alias = "notifications"
        )
    }
)
public class AyuGuardServicePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String type = call.getString("type", "manual");
        Long endTime = call.getLong("endTime");
        String contacts = call.getString("contacts", "[]");
        Boolean alarmSoundEnabled = call.getBoolean("alarmSoundEnabled", true);

        if (endTime == null) {
            call.reject("endTime is required");
            return;
        }

        Context context = getContext();
        Intent intent = new Intent(context, AyuGuardService.class);
        intent.putExtra("type", type);
        intent.putExtra("endTime", endTime);
        intent.putExtra("contacts", contacts);
        intent.putExtra("alarmSoundEnabled", alarmSoundEnabled);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent);
        } else {
            context.startService(intent);
        }

        call.resolve();
    }

    public static boolean hasDispatchedRecently(Context context) {
        android.content.SharedPreferences prefs = context.getSharedPreferences("AyuGuardPrefs", Context.MODE_PRIVATE);
        long last = prefs.getLong("last_dispatch", 0);
        return (System.currentTimeMillis() - last < 5 * 60 * 1000); // 5 minutes
    }

    public static void markDispatched(Context context) {
        android.content.SharedPreferences prefs = context.getSharedPreferences("AyuGuardPrefs", Context.MODE_PRIVATE);
        prefs.edit().putLong("last_dispatch", System.currentTimeMillis()).apply();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, AyuGuardService.class);
        context.stopService(intent);
        call.resolve();
    }

    @PluginMethod
    public void markDispatchedJS(PluginCall call) {
        markDispatched(getContext());
        call.resolve();
    }

    @PluginMethod
    public void hasDispatchedRecentlyJS(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", hasDispatchedRecently(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void sendSMS(PluginCall call) {
        JSObject numbers = call.getObject("numbers", new JSObject());
        // capacitor arrays are sent differently, usually JSArray.
        // let's just accept a string of numbers separated by comma.
        String numbersStr = call.getString("numbersStr", "");
        String message = call.getString("message", "");

        if (message.isEmpty() || numbersStr.isEmpty()) {
            call.reject("Missing numbers or message");
            return;
        }

        try {
            android.telephony.SmsManager smsManager = null;
            if (Build.VERSION.SDK_INT >= 31) {
                smsManager = getContext().getSystemService(android.telephony.SmsManager.class);
            } else {
                smsManager = android.telephony.SmsManager.getDefault();
            }
            if (smsManager == null) {
                call.reject("SmsManager is null");
                return;
            }
            String[] nums = numbersStr.split(",");
            for (String num : nums) {
                if (!num.trim().isEmpty()) {
                    java.util.ArrayList<String> parts = smsManager.divideMessage(message);
                    if (parts.size() > 1) {
                        smsManager.sendMultipartTextMessage(num.trim(), null, parts, null, null);
                    } else {
                        smsManager.sendTextMessage(num.trim(), null, message, null, null);
                    }
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("SMS failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestNativePermissions(PluginCall call) {
        if (getPermissionState("sms") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "permissionsCallback");
        } else {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void permissionsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("sms") == com.getcapacitor.PermissionState.GRANTED);
        call.resolve(ret);
    }
}

