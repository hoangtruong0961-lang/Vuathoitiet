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
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;

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

    private HttpURLConnection openConnectionWithRedirects(String urlStr) throws Exception {
        int redirects = 0;
        while (redirects < 10) {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14)");
            conn.setRequestProperty("Accept", "*/*");
            conn.setConnectTimeout(30000);
            conn.setReadTimeout(60000);
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_TEMP || 
                code == HttpURLConnection.HTTP_MOVED_PERM || 
                code == 307 || 
                code == 308 ||
                code == 303) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location != null && !location.isEmpty()) {
                    if (!location.startsWith("http://") && !location.startsWith("https://")) {
                        location = new URL(url, location).toString();
                    }
                    Log.i(TAG, "Redirect " + code + " -> " + location);
                    urlStr = location;
                    redirects++;
                    continue;
                }
            }
            return conn;
        }
        throw new IOException("Too many redirects: " + urlStr);
    }

    private void downloadSingleFile(String urlStr, File destFile) {
        try {
            HttpURLConnection conn = openConnectionWithRedirects(urlStr);
            if (conn.getResponseCode() == HttpURLConnection.HTTP_OK) {
                InputStream in = conn.getInputStream();
                FileOutputStream out = new FileOutputStream(destFile);
                byte[] buf = new byte[8192];
                int r;
                while ((r = in.read(buf)) != -1) {
                    out.write(buf, 0, r);
                }
                out.flush();
                out.close();
                in.close();
                Log.i(TAG, "Downloaded " + destFile.getName() + " (" + destFile.length() + " bytes)");
            }
            conn.disconnect();
        } catch (Throwable t) {
            Log.w(TAG, "Failed downloading " + destFile.getName() + ": " + t.getMessage());
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isNativeLibraryLoaded", sNativeLibraryLoaded);
        ret.put("isModelInitialized", sModelInitialized);
        ret.put("engine", "audio.cpp (ggml)");
        ret.put("modelFormat", "GGUF Q4_K/Q8_0");

        File turboModel = new File(getContext().getFilesDir(), "models/VieNeu-TTS-v3-Turbo/model.gguf");
        File defaultModel = new File(getContext().getFilesDir(), "models/vieneu_v3_turbo.gguf");
        File altModel = new File(getContext().getFilesDir(), "models/model.gguf");
        File foundModel = null;
        if (turboModel.exists() && turboModel.length() > 10000000) {
            foundModel = turboModel;
        } else if (defaultModel.exists() && defaultModel.length() > 10000000) {
            foundModel = defaultModel;
        } else if (altModel.exists() && altModel.length() > 10000000) {
            foundModel = altModel;
        }

        boolean exists = (foundModel != null);
        ret.put("modelExistsOnDisk", exists);
        ret.put("ready", exists);
        if (exists) {
            ret.put("modelPath", foundModel.getAbsolutePath());
            ret.put("modelSize", foundModel.length());
            double mb = Math.round((foundModel.length() / (1024.0 * 1024.0)) * 10.0) / 10.0;
            ret.put("modelSizeMb", mb);
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
            File turboModel = new File(modelDir, "VieNeu-TTS-v3-Turbo/model.gguf");
            if (turboModel.exists() && turboModel.length() > 10000000) {
                modelFile = turboModel;
            } else {
                modelFile = new File(modelDir, "vieneu_v3_turbo.gguf");
                if (!modelFile.exists() || modelFile.length() < 10000000) {
                    File alt = new File(modelDir, "model.gguf");
                    if (alt.exists() && alt.length() > 10000000) {
                        modelFile = alt;
                    }
                }
            }

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

        if (!modelFile.exists() || modelFile.length() < 10000000) {
            JSObject res = new JSObject();
            res.put("success", false);
            res.put("error", "Chưa tìm thấy file mô hình: " + modelFile.getAbsolutePath() + ". Vui lòng bấm Tải mô hình.");
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
    public void downloadModel(PluginCall call) {
        new Thread(() -> {
            try {
                File modelsRoot = new File(getContext().getFilesDir(), "models");
                File modelDir = new File(modelsRoot, "VieNeu-TTS-v3-Turbo");
                if (!modelDir.exists()) {
                    modelDir.mkdirs();
                }
                File speechTokenizerDir = new File(modelDir, "speech_tokenizer");
                if (!speechTokenizerDir.exists()) {
                    speechTokenizerDir.mkdirs();
                }

                String modelUrl = "https://huggingface.co/phuocnguyen90/VieNeu-TTS-v3-Turbo-GGUF/resolve/main/model.gguf?download=true";
                String configUrl = "https://huggingface.co/phuocnguyen90/VieNeu-TTS-v3-Turbo-GGUF/resolve/main/config.json?download=true";
                String tokenizerUrl = "https://huggingface.co/phuocnguyen90/VieNeu-TTS-v3-Turbo-GGUF/resolve/main/tokenizer.json?download=true";
                String tokenizerConfigUrl = "https://huggingface.co/phuocnguyen90/VieNeu-TTS-v3-Turbo-GGUF/resolve/main/tokenizer_config.json?download=true";
                String specialTokensUrl = "https://huggingface.co/phuocnguyen90/VieNeu-TTS-v3-Turbo-GGUF/resolve/main/special_tokens_map.json?download=true";
                String speechTokenizerConfigUrl = "https://huggingface.co/phuocnguyen90/VieNeu-TTS-v3-Turbo-GGUF/resolve/main/speech_tokenizer/config.json?download=true";

                Log.i(TAG, "Starting complete download of VieNeu-TTS-v3-Turbo audio.cpp package...");

                // 1. Download auxiliary JSON and tokenizer files
                downloadSingleFile(configUrl, new File(modelDir, "config.json"));
                downloadSingleFile(tokenizerUrl, new File(modelDir, "tokenizer.json"));
                downloadSingleFile(tokenizerConfigUrl, new File(modelDir, "tokenizer_config.json"));
                downloadSingleFile(specialTokensUrl, new File(modelDir, "special_tokens_map.json"));
                downloadSingleFile(speechTokenizerConfigUrl, new File(speechTokenizerDir, "config.json"));

                // Also place tokenizer in models/ root for legacy lookups
                downloadSingleFile(tokenizerUrl, new File(modelsRoot, "tokenizer.json"));

                // 2. Download model.gguf (following 307/302 redirects)
                File finalModel = new File(modelDir, "model.gguf");
                File tmpModel = new File(modelDir, "model.gguf.tmp");

                HttpURLConnection conn = openConnectionWithRedirects(modelUrl);
                int status = conn.getResponseCode();
                if (status != HttpURLConnection.HTTP_OK) {
                    conn.disconnect();
                    JSObject res = new JSObject();
                    res.put("success", false);
                    res.put("error", "Server HTTP " + status + " khi tải mô hình GGUF");
                    call.resolve(res);
                    return;
                }

                long contentLength = conn.getContentLengthLong();
                InputStream input = conn.getInputStream();
                FileOutputStream output = new FileOutputStream(tmpModel);
                byte[] data = new byte[32768];
                int count;
                long total = 0;
                long lastProgressTime = 0;

                while ((count = input.read(data)) != -1) {
                    output.write(data, 0, count);
                    total += count;

                    long now = System.currentTimeMillis();
                    if (now - lastProgressTime > 400) {
                        lastProgressTime = now;
                        int percent = contentLength > 0 ? (int) ((total * 100) / contentLength) : -1;
                        JSObject progressObj = new JSObject();
                        progressObj.put("percent", percent);
                        progressObj.put("downloadedBytes", total);
                        progressObj.put("totalBytes", contentLength);
                        notifyListeners("vieneuDownloadProgress", progressObj);
                    }
                }

                output.flush();
                output.close();
                input.close();
                conn.disconnect();

                if (total < 10000000) { // under 10MB means truncated or HTML error
                    tmpModel.delete();
                    JSObject res = new JSObject();
                    res.put("success", false);
                    res.put("error", "File tải về quá nhỏ (" + total + " bytes), vui lòng thử lại.");
                    call.resolve(res);
                    return;
                }

                if (finalModel.exists()) {
                    finalModel.delete();
                }
                tmpModel.renameTo(finalModel);

                // Copy to models/ root as legacy alias
                File legacyAlias = new File(modelsRoot, "vieneu_v3_turbo.gguf");
                if (!legacyAlias.exists()) {
                    try {
                        java.nio.file.Files.copy(finalModel.toPath(), legacyAlias.toPath());
                    } catch (Throwable ignored) {}
                }

                sModelFilePath = finalModel.getAbsolutePath();
                sModelInitialized = true;
                double sizeMb = Math.round((total / (1024.0 * 1024.0)) * 10.0) / 10.0;

                Log.i(TAG, "VieNeu Turbo model downloaded successfully: " + total + " bytes (" + sizeMb + " MB)");

                JSObject res = new JSObject();
                res.put("success", true);
                res.put("modelPath", finalModel.getAbsolutePath());
                res.put("sizeBytes", total);
                res.put("sizeMb", sizeMb);
                call.resolve(res);
            } catch (Exception e) {
                Log.e(TAG, "Failed to download model", e);
                JSObject res = new JSObject();
                res.put("success", false);
                res.put("error", e.getMessage() != null ? e.getMessage() : "Lỗi kết nối tải mô hình");
                call.resolve(res);
            }
        }).start();
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
