package com.motionalarm.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

final class AlarmSound implements AudioManager.OnAudioFocusChangeListener {
    private final Context context;
    private final AudioManager audioManager;
    private MediaPlayer player;
    private AudioFocusRequest focusRequest;
    private boolean prepared;

    AlarmSound(Context context) {
        this.context = context;
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }

    void start() throws Exception {
        stop();
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attributes)
                .setOnAudioFocusChangeListener(this)
                .build();
            result = audioManager.requestAudioFocus(focusRequest);
        } else {
            result = audioManager.requestAudioFocus(this, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
        if (result != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            stop();
            throw new IllegalStateException("Another audio source prevented the alarm sound from starting.");
        }

        try {
            Uri tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (tone == null) {
                tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            if (tone == null) {
                throw new IllegalStateException("Choose a default alarm sound in Android settings.");
            }
            player = new MediaPlayer();
            player.setAudioAttributes(attributes);
            player.setDataSource(context, tone);
            player.setLooping(true);
            player.prepare();
            prepared = true;
            player.start();
        } catch (Exception error) {
            stop();
            throw error;
        }
    }

    void stop() {
        prepared = false;
        if (player != null) {
            player.release();
            player = null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
            focusRequest = null;
        } else {
            audioManager.abandonAudioFocus(this);
        }
    }

    @Override
    public void onAudioFocusChange(int change) {
        if (player == null || !prepared) {
            return;
        }
        if (change == AudioManager.AUDIOFOCUS_GAIN) {
            player.start();
        } else if (change == AudioManager.AUDIOFOCUS_LOSS) {
            stop();
        } else {
            player.pause();
        }
    }
}
