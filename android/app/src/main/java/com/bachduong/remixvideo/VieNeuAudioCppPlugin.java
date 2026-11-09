package com.bachduong.remixvideo;

import android.content.Context;
import android.util.Base64;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

@CapacitorPlugin(name = "VieNeuAudioCpp")
public class VieNeuAudioCppPlugin extends Plugin {

    private static final String TAG = "VieNeuAudioCpp";
    private static boolean sNativeLibraryLoaded = false;
    private static String sModelFilePath = null;
    private static boolean sModelInitialized = false;

    static {
        try {
            System.loadLibrary("audio");
            sNativeLibraryLoaded = true;
            Log.i(TAG, "Native audio.cpp (ggml) library loaded successfully.");
        } catch (UnsatisfiedLinkError e1) {
            try {
                System.loadLibrary("vieneu");
                sNativeLibraryLoaded = true;
                Log.i(TAG, "Native vieneu C++ library loaded successfully.");
            } catch (UnsatisfiedLinkError e2) {
                Log.w(TAG, "Native audio.cpp / vieneu library not yet present in jniLibs. Will use network server fallback.");
                sNativeLibraryLoaded = false;
            }
        }
    }

    // Native JNI definitions (linked when libaudio.so or libvieneu.so is built via Android NDK)
    private static native boolean nativeInitModel(String modelPath);
    private static native byte[] nativeSynthesize(String text, String voice, float speed, byte[] refAudioBytes);
    private static native void nativeRelease();

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isNativeLibraryLoaded", sNativeLibraryLoaded);
        ret.put("isModelInitialized", sModelInitialized);
        ret.put("engine", "audio.cpp (ggml)");
        ret.put("modelFormat", "GGUF Q4_K/Q8_0");

        File defaultModel = new File(getContext().getFilesDir(), "models/vieneu_v3_turbo.gguf");
        ret.put("modelExistsOnDisk", defaultModel.exists());
        if (defaultModel.exists()) {
            ret.put("modelPath", defaultModel.getAbsolutePath());
            ret.put("modelSize", defaultModel.length());
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void getEngineInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("name", "audio.cpp VieNeu-TTS v3 Turbo Native");
        ret.put("version", "1.0.0-ggml");
        ret.put("isNative", sNativeLibraryLoaded);
        ret.put("sampleRate", 48000);
        ret.put("voiceCloningSupported", true);
        ret.put("defaultVoices", new String[]{
            "Hải Đăng", "Mai Anh", "Trúc Ly", "Thùy Dung", "Quang Sơn",
            "Ngọc Trân", "Thiện Minh", "Thiền Tâm Đức", "Adam bựa", "Ngọc Huyền"
        });
        call.resolve(ret);
    }

    @PluginMethod
    public void loadModel(PluginCall call) {
        String customPath = call.getString("modelPath");
        File modelFile = null;

        if (customPath != null && !customPath.trim().isEmpty()) {
            modelFile = new File(customPath);
        } else {
            // Check app internal storage models/
            File modelDir = new File(getContext().getFilesDir(), "models");
            if (!modelDir.exists()) {
                modelDir.mkdirs();
            }
            modelFile = new File(modelDir, "vieneu_v3_turbo.gguf");

            // If not found in internal storage, check if packed in APK assets
            if (!modelFile.exists()) {
                try {
                    InputStream is = getContext().getAssets().open("models/vieneu_v3_turbo.gguf");
                    FileOutputStream fos = new FileOutputStream(modelFile);
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = is.read(buffer)) != -1) {
                        fos.write(buffer, 0, read);
                    }
                    fos.flush();
                    fos.close();
                    is.close();
                    Log.i(TAG, "Copied vieneu_v3_turbo.gguf from assets to " + modelFile.getAbsolutePath());
                } catch (Exception ex) {
                    Log.d(TAG, "Asset copy skipped: " + ex.getMessage());
                }
            }
        }

        if (!modelFile.exists()) {
            JSObject res = new JSObject();
            res.put("success", false);
            res.put("error", "Model file not found: " + modelFile.getAbsolutePath() + ". Vui lòng tải file vieneu_v3_turbo.gguf hoặc dùng server audio.cpp.");
            call.resolve(res);
            return;
        }

        if (!sNativeLibraryLoaded) {
            JSObject res = new JSObject();
            res.put("success", false);
            res.put("error", "Native C++ library (libaudio.so) not yet compiled in APK.");
            call.resolve(res);
            return;
        }

        try {
            boolean ok = nativeInitModel(modelFile.getAbsolutePath());
            sModelInitialized = ok;
            sModelFilePath = modelFile.getAbsolutePath();

            JSObject res = new JSObject();
            res.put("success", ok);
            res.put("modelPath", sModelFilePath);
            call.resolve(res);
        } catch (Throwable t) {
            Log.e(TAG, "nativeInitModel error", t);
            call.reject("Failed to initialize native model: " + t.getMessage());
        }
    }

    @PluginMethod
    public void synthesize(PluginCall call) {
        String text = call.getString("text");
        String voice = call.getString("voice", "Hải Đăng");
        Double speedD = call.getDouble("speed", 1.0);
        float speed = speedD != null ? speedD.floatValue() : 1.0f;
        String refAudioB64 = call.getString("refAudioBase64");

        if (text == null || text.trim().isEmpty()) {
            call.reject("Text cannot be empty");
            return;
        }

        if (!sNativeLibraryLoaded || !sModelInitialized) {
            JSObject res = new JSObject();
            res.put("success", false);
            res.put("useFallback", true);
            res.put("message", "Native audio.cpp chưa được khởi tạo. Tự động chuyển qua audio.cpp HTTP server.");
            call.resolve(res);
            return;
        }

        try {
            byte[] refAudioBytes = null;
            if (refAudioB64 != null && !refAudioB64.isEmpty()) {
                String cleanB64 = refAudioB64.replaceFirst("^data:audio/[^;]+;base64,", "");
                refAudioBytes = Base64.decode(cleanB64, Base64.DEFAULT);
            }

            long startTime = System.currentTimeMillis();
            byte[] wavBytes = nativeSynthesize(text, voice, speed, refAudioBytes);
            long elapsed = System.currentTimeMillis() - startTime;

            if (wavBytes != null && wavBytes.length > 44) {
                String outB64 = Base64.encodeToString(wavBytes, Base64.NO_WRAP);
                JSObject res = new JSObject();
                res.put("success", true);
                res.put("base64Audio", outB64);
                res.put("mimeType", "audio/wav");
                res.put("durationMs", elapsed);
                res.put("provider", "VieNeu Turbo Native (audio.cpp)");
                call.resolve(res);
            } else {
                call.reject("Native synthesis returned empty audio buffer");
            }
        } catch (Throwable t) {
            Log.e(TAG, "nativeSynthesize failed", t);
            JSObject res = new JSObject();
            res.put("success", false);
            res.put("useFallback", true);
            res.put("error", t.getMessage());
            call.resolve(res);
        }
    }
}
