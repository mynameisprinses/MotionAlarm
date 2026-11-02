package com.motionalarm.app;

import android.Manifest;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONException;

@CapacitorPlugin(name = "MotionAlarm", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class MotionAlarmPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private AlarmSound previewSound;
    private BroadcastReceiver receiver;
    private boolean appVisible = true;
    private PluginCall pendingStopCall;
    private String pendingSessionId;
    private CancellationSignal stopAuthentication;
    private final Runnable stopPreview = () -> {
        if (previewSound != null) {
            previewSound.stop();
        }
    };

    @Override
    public void load() {
        previewSound = new AlarmSound(getContext());
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (appVisible) {
                    notifyListeners("stateChanged", new JSObject());
                }
            }
        };
        ContextCompat.registerReceiver(getContext(), receiver,
            new IntentFilter(MotionAlarmService.STATE_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private JSObject snapshot() throws JSONException {
        MotionAlarmService service = MotionAlarmService.instance;
        JSObject result = new JSObject();
        if (service == null) {
            result.put("state", "idle");
            result.put("countdown", 5);
            result.put("strength", 0);
            result.put("message", MotionAlarmService.lastMessage);
        } else {
            result.put("state", service.state);
            result.put("countdown", service.countdown);
            result.put("strength", service.strength);
            result.put("message", service.message);
            if (!"idle".equals(service.state)) {
                result.put("threshold", service.threshold);
                result.put("soundEnabled", service.soundEnabled);
                result.put("vibrationEnabled", service.vibrationEnabled);
            }
        }
        AlertStore store = new AlertStore(getContext());
        JSONArray savedHistory = store.read();
        JSArray alerts = new JSArray(savedHistory.toString());
        result.put("alerts", alerts);
        return result;
    }

    @PluginMethod
    public void getState(PluginCall call) {
        handler.post(() -> resolveState(call));
    }

    private void resolveState(PluginCall call) {
        try {
            JSObject state = snapshot();
            call.resolve(state);
        } catch (Exception error) {
            call.reject("Could not read Android alert history: " + error.getMessage());
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionResult");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Allow notifications in Android settings so background monitoring stays visible.");
            return;
        }
        startService(call);
    }

    private void startService(PluginCall call) {
        handler.post(() -> {
            if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
                call.reject("Enable MotionAlarm notifications in Android settings before arming background monitoring.");
                return;
            }
            double threshold = call.getDouble("threshold", 1.8);
            if (!Double.isFinite(threshold) || threshold <= 0 || threshold > 20) {
                call.reject("Choose a valid movement sensitivity.");
                return;
            }
            try {
                previewSound.stop();
                handler.removeCallbacks(stopPreview);
                Intent intent = new Intent(getContext(), MotionAlarmService.class).setAction(MotionAlarmService.ACTION_START);
                intent.putExtra("threshold", threshold);
                intent.putExtra("soundEnabled", call.getBoolean("soundEnabled", true));
                intent.putExtra("vibrationEnabled", call.getBoolean("vibrationEnabled", true));
                ContextCompat.startForegroundService(getContext(), intent);
                call.resolve();
            } catch (Exception error) {
                call.reject("Could not start background monitoring: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        handler.post(() -> {
            if (pendingStopCall != null) {
                call.reject("Finish the current verification first.");
                return;
            }
            if (!appVisible || getActivity() == null || getActivity().isFinishing()) {
                call.reject("Open MotionAlarm to stop the alarm.");
                return;
            }
            MotionAlarmService service = MotionAlarmService.instance;
            if (service == null || "idle".equals(service.state)) {
                resolveState(call);
                return;
            }
            KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
            if (keyguard == null) {
                call.reject("Android could not check your screen lock. Try again.");
                return;
            }
            if (!keyguard.isDeviceSecure()) {
                service.stopMonitoring();
                resolveState(call);
                return;
            }

            pendingStopCall = call;
            pendingSessionId = service.sessionId;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    confirmScreenLock(call);
                } else {
                    confirmOlderScreenLock(call, keyguard);
                }
            } catch (Exception error) {
                rejectStop(call, "Could not open Android screen-lock verification. Try again.");
            }
        });
    }

    @android.annotation.TargetApi(Build.VERSION_CODES.R)
    private void confirmScreenLock(PluginCall call) {
        BiometricPrompt.Builder builder = new BiometricPrompt.Builder(getActivity());
        builder.setTitle("Stop MotionAlarm");
        builder.setDescription("Confirm your screen-lock PIN, pattern, or password to stop the motion alarm.");
        builder.setAllowedAuthenticators(BiometricManager.Authenticators.DEVICE_CREDENTIAL);
        BiometricPrompt prompt = builder.build();
        stopAuthentication = new CancellationSignal();
        prompt.authenticate(stopAuthentication, ContextCompat.getMainExecutor(getContext()),
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    if (result.getAuthenticationType() == BiometricPrompt.AUTHENTICATION_RESULT_TYPE_DEVICE_CREDENTIAL) {
                        finishStop(call);
                    } else {
                        rejectStop(call, "Use your screen-lock PIN, pattern, or password to stop the alarm.");
                    }
                }

                @Override
                public void onAuthenticationError(int code, CharSequence message) {
                    rejectStop(call, "Verification did not finish. Tap Motion alarm stop to try again. " + message);
                }
            });
    }

    @SuppressWarnings("deprecation")
    private void confirmOlderScreenLock(PluginCall call, KeyguardManager keyguard) {
        Intent confirmation = keyguard.createConfirmDeviceCredentialIntent(
            "Stop MotionAlarm", "Confirm your screen lock to stop the motion alarm.");
        if (confirmation == null) {
            rejectStop(call, "Android could not open screen-lock verification. Try again.");
            return;
        }
        startActivityForResult(call, confirmation, "screenLockResult");
    }

    @ActivityCallback
    private void screenLockResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (pendingStopCall != call) {
            call.reject("This confirmation expired. Tap Motion alarm stop again.");
            return;
        }
        if (result.getResultCode() == Activity.RESULT_OK) {
            finishStop(call);
        } else {
            rejectStop(call, "Verification canceled. Tap Motion alarm stop to try again.");
        }
    }

    private void finishStop(PluginCall call) {
        if (pendingStopCall != call) {
            return;
        }
        String verifiedSession = pendingSessionId;
        pendingStopCall = null;
        pendingSessionId = null;
        stopAuthentication = null;
        MotionAlarmService service = MotionAlarmService.instance;
        if (service != null && !"idle".equals(service.state)) {
            // A confirmation for an earlier session must never stop a newly armed session.
            if (!service.sessionId.equals(verifiedSession)) {
                call.reject("The monitoring session changed. Tap Motion alarm stop to verify again.");
                return;
            }
            service.stopMonitoring();
        }
        resolveState(call);
    }

    private void rejectStop(PluginCall call, String message) {
        if (pendingStopCall != call) {
            return;
        }
        pendingStopCall = null;
        pendingSessionId = null;
        CancellationSignal authentication = stopAuthentication;
        stopAuthentication = null;
        if (authentication != null) {
            authentication.cancel();
        }
        call.reject(message);
    }

    @PluginMethod
    public void importHistory(PluginCall call) {
        handler.post(() -> {
            try {
                AlertStore store = new AlertStore(getContext());
                JSArray oldAlerts = call.getArray("alerts", new JSArray());
                store.importHistory(oldAlerts);
                call.resolve();
            } catch (Exception error) {
                call.reject("Could not import previous alerts: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void createTestAlert(PluginCall call) {
        handler.post(() -> {
            try {
                AlertStore store = new AlertStore(getContext());
                store.create("Test", null);
                if (call.getBoolean("soundEnabled", true)) {
                    try {
                        handler.removeCallbacks(stopPreview);
                        previewSound.start();
                        handler.postDelayed(stopPreview, 2000);
                    } catch (Exception error) {
                        MotionAlarmService.lastMessage = "Test alert saved, but alarm sound is unavailable: " + error.getMessage();
                    }
                }
                resolveState(call);
            } catch (Exception error) {
                call.reject("Could not create the test alert: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void updateAlert(PluginCall call) {
        handler.post(() -> {
            String id = call.getString("id");
            String status = call.getString("status");
            if (id == null || (!"New".equals(status) && !"Reviewed".equals(status))) {
                call.reject("Choose an alert and a valid status.");
                return;
            }
            try {
                AlertStore store = new AlertStore(getContext());
                store.update(id, status);
                resolveState(call);
            } catch (Exception error) {
                call.reject("Could not update the alert: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void deleteAlert(PluginCall call) {
        handler.post(() -> {
            String id = call.getString("id");
            if (id == null) {
                call.reject("Choose an alert to delete.");
                return;
            }
            try {
                AlertStore store = new AlertStore(getContext());
                store.delete(id);
                resolveState(call);
            } catch (Exception error) {
                call.reject("Could not delete the alert: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void clearAlerts(PluginCall call) {
        handler.post(() -> {
            try {
                AlertStore store = new AlertStore(getContext());
                store.clear();
                resolveState(call);
            } catch (Exception error) {
                call.reject("Could not clear alert history: " + error.getMessage());
            }
        });
    }

    @Override
    protected void handleOnResume() {
        appVisible = true;
        notifyListeners("stateChanged", new JSObject());
    }

    @Override
    protected void handleOnPause() {
        appVisible = false;
    }

    @Override
    protected void handleOnDestroy() {
        if (pendingStopCall != null) {
            rejectStop(pendingStopCall, "Verification ended when the app closed. Reopen MotionAlarm to stop it.");
        }
        handler.removeCallbacksAndMessages(null);
        previewSound.stop();
        if (receiver != null) {
            getContext().unregisterReceiver(receiver);
        }
        // The foreground service belongs to the user-armed session, not to this activity.
    }
}
