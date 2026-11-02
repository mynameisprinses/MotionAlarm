package com.motionalarm.app;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import java.util.UUID;

public class MotionAlarmService extends Service implements SensorEventListener {
    static final String ACTION_START = "com.motionalarm.app.START";
    static final String STATE_CHANGED = "com.motionalarm.app.STATE_CHANGED";
    private static final String MONITOR_CHANNEL = "motion_monitor";
    private static final String ALARM_CHANNEL = "motion_alarm";
    private static final int NOTIFICATION_ID = 1001;
    static MotionAlarmService instance;
    static String lastMessage = "";

    String state = "idle";
    String sessionId = "";
    String message = "";
    int countdown = 5;
    double strength;
    double threshold = 1.8;
    boolean soundEnabled;
    boolean vibrationEnabled;
    private boolean sensorReady;
    private float baselineX;
    private float baselineY;
    private float baselineZ;
    private long armAt;
    private long lastReadingBroadcast;
    private SensorManager sensors;
    private PowerManager.WakeLock wakeLock;
    private AlarmSound alarmSound;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        sensors = (SensorManager) getSystemService(SENSOR_SERVICE);
        alarmSound = new AlarmSound(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(new NotificationChannel(MONITOR_CHANNEL, "Motion monitoring", NotificationManager.IMPORTANCE_LOW));
            NotificationChannel alarm = new NotificationChannel(ALARM_CHANNEL, "Movement alerts", NotificationManager.IMPORTANCE_HIGH);
            alarm.setSound(null, null);
            alarm.enableVibration(false);
            manager.createNotificationChannel(alarm);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopMonitoring();
            return START_NOT_STICKY;
        }
        if (!ACTION_START.equals(intent.getAction())) {
            return START_NOT_STICKY;
        }
        if (!"idle".equals(state)) {
            return START_NOT_STICKY;
        }

        threshold = intent.getDoubleExtra("threshold", 1.8);
        soundEnabled = intent.getBooleanExtra("soundEnabled", true);
        vibrationEnabled = intent.getBooleanExtra("vibrationEnabled", true);
        state = "countdown";
        sessionId = UUID.randomUUID().toString();
        message = "";
        lastMessage = "";
        countdown = 5;
        strength = 0;
        sensorReady = false;

        try {
            int type = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                type = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
            }
            ServiceCompat.startForeground(this, NOTIFICATION_ID, createNotification(), type);
            Sensor accelerometer = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (accelerometer == null) {
                throw new IllegalStateException("This phone has no accelerometer.");
            }
            keepCpuAwake();
            if (!sensors.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL)) {
                throw new IllegalStateException("Android could not start the accelerometer.");
            }
            armAt = SystemClock.elapsedRealtime() + 5000;
            broadcastState();
            handler.postDelayed(countdownTick, 1000);
        } catch (Exception error) {
            lastMessage = "Could not start background monitoring: " + error.getMessage();
            stopMonitoring();
        }
        // Swiping away the activity leaves this service running. System/user stops are respected.
        return START_NOT_STICKY;
    }

    private final Runnable countdownTick = new Runnable() {
        @Override
        public void run() {
            if (!"countdown".equals(state)) {
                return;
            }
            long millisecondsLeft = armAt - SystemClock.elapsedRealtime();
            double secondsLeft = millisecondsLeft / 1000.0;
            countdown = (int) Math.ceil(secondsLeft);
            if (countdown < 0) {
                countdown = 0;
            }
            if (countdown == 0) {
                if (!sensorReady) {
                    lastMessage = "No accelerometer readings arrived. Check the phone's Sensors Off setting and arm again.";
                    stopMonitoring();
                    return;
                }
                state = "armed";
            } else {
                handler.postDelayed(this, 1000);
            }
            updateNotification();
            broadcastState();
        }
    };

    @SuppressLint("WakelockTimeout")
    private void keepCpuAwake() {
        // Non-wakeup accelerometers need an awake CPU while the screen is locked.
        // This lock belongs to the user-armed service and is released when monitoring stops.
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MotionAlarm:MotionMonitor");
        wakeLock.acquire();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        boolean countingDown = "countdown".equals(state);
        boolean monitoring = "armed".equals(state);
        if (!countingDown && !monitoring) {
            return;
        }
        if (!Float.isFinite(event.values[0]) || !Float.isFinite(event.values[1]) || !Float.isFinite(event.values[2])) {
            return;
        }
        sensorReady = true;
        if (countingDown) {
            baselineX = event.values[0];
            baselineY = event.values[1];
            baselineZ = event.values[2];
            return;
        }

        double x = event.values[0] - baselineX;
        double y = event.values[1] - baselineY;
        double z = event.values[2] - baselineZ;
        strength = Math.sqrt(x * x + y * y + z * z);
        if (strength >= threshold) {
            triggerAlarm();
        } else if (SystemClock.elapsedRealtime() - lastReadingBroadcast >= 500) {
            lastReadingBroadcast = SystemClock.elapsedRealtime();
            broadcastState();
        }
    }

    private void triggerAlarm() {
        state = "alert";
        sensors.unregisterListener(this);
        try {
            AlertStore store = new AlertStore(this);
            store.create("Movement", strength);
        } catch (Exception error) {
            message = "Movement detected, but the alert could not be saved: " + error.getMessage();
        }
        if (soundEnabled) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
                    }
                    ServiceCompat.startForeground(this, NOTIFICATION_ID, createNotification(), type);
                }
                alarmSound.start();
            } catch (Exception error) {
                message += " Alarm sound could not start: " + error.getMessage();
            }
        }
        if (vibrationEnabled) {
            Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(1000, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(1000);
                }
            }
        }
        updateNotification();
        broadcastState();
    }

    private Notification createNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openApp = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        boolean alert = "alert".equals(state);
        String channel = MONITOR_CHANNEL;
        String category = NotificationCompat.CATEGORY_SERVICE;
        int priority = NotificationCompat.PRIORITY_LOW;
        String title = "MotionAlarm is watching for movement";
        String text = "Monitoring continues with the screen locked.";
        if ("countdown".equals(state)) {
            title = "MotionAlarm arms in " + countdown + " seconds";
            text = "Place the phone on a still surface.";
        } else if (alert) {
            channel = ALARM_CHANNEL;
            category = NotificationCompat.CATEGORY_ALARM;
            priority = NotificationCompat.PRIORITY_HIGH;
            title = "Phone movement detected";
            text = "Open MotionAlarm to verify your screen lock and stop the alarm.";
        }
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, channel);
        notification.setSmallIcon(android.R.drawable.ic_lock_idle_alarm);
        notification.setContentTitle(title);
        notification.setContentText(text);
        notification.setContentIntent(openApp);
        notification.setOngoing(true);
        notification.setOnlyAlertOnce(true);
        notification.setCategory(category);
        notification.setPriority(priority);
        return notification.build();
    }

    private void updateNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            lastMessage = "Notification permission was removed. Enable notifications and arm MotionAlarm again.";
            stopMonitoring();
            return;
        }
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, createNotification());
    }

    void broadcastState() {
        sendBroadcast(new Intent(STATE_CHANGED).setPackage(getPackageName()));
    }

    void stopMonitoring() {
        handler.removeCallbacksAndMessages(null);
        if (sensors != null) {
            sensors.unregisterListener(this);
        }
        if (alarmSound != null) {
            alarmSound.stop();
        }
        Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator != null) {
            vibrator.cancel();
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
        state = "idle";
        strength = 0;
        broadcastState();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopMonitoring();
        instance = null;
        super.onDestroy();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
