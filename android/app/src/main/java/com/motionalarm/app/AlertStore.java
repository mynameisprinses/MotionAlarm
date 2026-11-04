package com.motionalarm.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

// Android saves alerts here even when the Angular screen is not running.
final class AlertStore {
    private final SharedPreferences preferences;

    AlertStore(Context context) {
        preferences = context.getSharedPreferences("motion_alarm", Context.MODE_PRIVATE);
    }

    JSONArray read() throws JSONException {
        String savedHistory = preferences.getString(historyKey(), "[]");
        JSONArray saved = new JSONArray(savedHistory);
        JSONArray movement = new JSONArray();
        for (int i = 0; i < saved.length(); i++) {
            JSONObject alert = saved.getJSONObject(i);
            if ("Movement".equals(alert.optString("source"))) movement.put(alert);
        }
        return movement;
    }

    String owner() {
        return preferences.getString("history_owner", "");
    }

    void setOwner(String userId) {
        if (!preferences.edit().putString("history_owner", userId).commit()) {
            throw new IllegalStateException("Could not select the account for Android alerts.");
        }
    }

    private String historyKey() {
        return owner().isEmpty() ? "alerts" : "alerts_user_" + owner();
    }

    private void save(JSONArray alerts) {
        SharedPreferences.Editor editor = preferences.edit();
        editor.putString(historyKey(), alerts.toString());
        boolean saved = editor.commit();
        if (!saved) {
            throw new IllegalStateException("Android could not save the alert history. Check available storage.");
        }
    }

    void create(String source, Double strength) throws JSONException {
        if (!"Movement".equals(source)) return;
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        JSONObject alert = new JSONObject();
        alert.put("id", UUID.randomUUID().toString());
        alert.put("createdAt", format.format(new Date()));
        alert.put("source", source);
        alert.put("status", "New");
        if (strength == null) {
            alert.put("strength", JSONObject.NULL);
        } else {
            alert.put("strength", strength);
        }

        JSONArray saved = read();
        JSONArray updated = new JSONArray();
        updated.put(alert);
        for (int i = 0; i < saved.length(); i++) {
            updated.put(saved.getJSONObject(i));
        }
        save(updated);
    }

    void update(String id, String status) throws JSONException {
        JSONArray alerts = read();
        for (int i = 0; i < alerts.length(); i++) {
            JSONObject alert = alerts.getJSONObject(i);
            if (id.equals(alert.getString("id"))) {
                alert.put("status", status);
                save(alerts);
                return;
            }
        }
    }

    void delete(String id) throws JSONException {
        JSONArray alerts = read();
        for (int i = 0; i < alerts.length(); i++) {
            if (id.equals(alerts.getJSONObject(i).getString("id"))) {
                alerts.remove(i);
                save(alerts);
                return;
            }
        }
    }

    void clear() {
        save(new JSONArray());
    }

    void importHistory(JSONArray oldAlerts) throws JSONException {
        if (preferences.getBoolean("history_imported", false)) {
            return;
        }
        JSONArray alerts = read();
        for (int i = 0; i < oldAlerts.length(); i++) {
            JSONObject oldAlert = oldAlerts.getJSONObject(i);
            boolean exists = false;
            for (int j = 0; j < alerts.length(); j++) {
                if (oldAlert.getString("id").equals(alerts.getJSONObject(j).getString("id"))) {
                    exists = true;
                }
            }
            if (!exists) {
                alerts.put(oldAlert);
            }
        }
        save(alerts);
        SharedPreferences.Editor editor = preferences.edit();
        editor.putBoolean("history_imported", true);
        boolean saved = editor.commit();
        if (!saved) {
            throw new IllegalStateException("Could not finish importing the previous alert history.");
        }
    }
}
