#include <jni.h>
#include <string>
#include <vector>
#include <cstring>
#include <android/log.h>
#include "include/vieneu_tts.h"

#define TAG "VieNeuJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

static struct vieneu_context * g_vieneu_ctx = nullptr;

static void write_wav_header(std::vector<uint8_t>& wav, int num_samples, int sample_rate, int channels) {
    int byte_rate = sample_rate * channels * 2;
    int data_size = num_samples * channels * 2;
    int chunk_size = 36 + data_size;

    wav.resize(44);
    uint8_t * h = wav.data();

    // RIFF chunk descriptor
    std::memcpy(h, "RIFF", 4);
    h[4] = (uint8_t)(chunk_size & 0xff);
    h[5] = (uint8_t)((chunk_size >> 8) & 0xff);
    h[6] = (uint8_t)((chunk_size >> 16) & 0xff);
    h[7] = (uint8_t)((chunk_size >> 24) & 0xff);
    std::memcpy(h + 8, "WAVE", 4);

    // fmt sub-chunk
    std::memcpy(h + 12, "fmt ", 4);
    h[16] = 16; h[17] = 0; h[18] = 0; h[19] = 0; // SubChunk1Size (16 for PCM)
    h[20] = 1;  h[21] = 0;                         // AudioFormat (1 for PCM)
    h[22] = (uint8_t)(channels & 0xff);
    h[23] = (uint8_t)((channels >> 8) & 0xff);
    h[24] = (uint8_t)(sample_rate & 0xff);
    h[25] = (uint8_t)((sample_rate >> 8) & 0xff);
    h[26] = (uint8_t)((sample_rate >> 16) & 0xff);
    h[27] = (uint8_t)((sample_rate >> 24) & 0xff);
    h[28] = (uint8_t)(byte_rate & 0xff);
    h[29] = (uint8_t)((byte_rate >> 8) & 0xff);
    h[30] = (uint8_t)((byte_rate >> 16) & 0xff);
    h[31] = (uint8_t)((byte_rate >> 24) & 0xff);
    h[32] = (uint8_t)((channels * 2) & 0xff);      // BlockAlign
    h[33] = 0;
    h[34] = 16; h[35] = 0;                         // BitsPerSample (16)

    // data sub-chunk
    std::memcpy(h + 36, "data", 4);
    h[40] = (uint8_t)(data_size & 0xff);
    h[41] = (uint8_t)((data_size >> 8) & 0xff);
    h[42] = (uint8_t)((data_size >> 16) & 0xff);
    h[43] = (uint8_t)((data_size >> 24) & 0xff);
}

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_bachduong_remixvideo_VieNeuAudioCppPlugin_nativeInitModel(
        JNIEnv *env,
        jclass clazz,
        jstring j_model_path) {
    if (j_model_path == nullptr) {
        LOGE("model_path cannot be null");
        return JNI_FALSE;
    }

    const char * model_path = env->GetStringUTFChars(j_model_path, nullptr);
    LOGI("Initializing VieNeu context with model path: %s", model_path);

    if (g_vieneu_ctx != nullptr) {
        vieneu_free(g_vieneu_ctx);
        g_vieneu_ctx = nullptr;
    }

    struct vieneu_init_params_v2 params;
    vieneu_init_v2_default_params(&params);
    params.model_dir = model_path;
    params.n_threads = 4;

    g_vieneu_ctx = vieneu_init_v2(&params);
    env->ReleaseStringUTFChars(j_model_path, model_path);

    if (g_vieneu_ctx == nullptr) {
        LOGE("Failed to create vieneu context: %s", vieneu_last_error());
        return JNI_FALSE;
    }

    LOGI("VieNeu context initialized successfully!");
    return JNI_TRUE;
}

JNIEXPORT jbyteArray JNICALL
Java_com_bachduong_remixvideo_VieNeuAudioCppPlugin_nativeSynthesize(
        JNIEnv *env,
        jclass clazz,
        jstring j_text,
        jstring j_voice,
        jfloat speed,
        jbyteArray j_ref_audio) {
    if (g_vieneu_ctx == nullptr) {
        LOGE("Cannot synthesize: vieneu context is null");
        return nullptr;
    }

    if (j_text == nullptr) {
        LOGE("Cannot synthesize: text is null");
        return nullptr;
    }

    const char * text = env->GetStringUTFChars(j_text, nullptr);
    const char * voice = (j_voice != nullptr) ? env->GetStringUTFChars(j_voice, nullptr) : "Hải Đăng";

    struct vieneu_tts_params_v3 params;
    vieneu_tts_v3_default_params(&params);
    params.text = text;
    params.voice_id = voice;
    params.temperature = 0.8f;
    params.top_k = 25;
    params.top_p = 0.95f;
    params.repetition_penalty = 1.2f;

    struct vieneu_audio audio_out;
    std::memset(&audio_out, 0, sizeof(audio_out));

    LOGI("Synthesizing: '%s' with voice '%s'", text, voice);
    int status = vieneu_synthesize_v3(g_vieneu_ctx, &params, &audio_out);

    env->ReleaseStringUTFChars(j_text, text);
    if (j_voice != nullptr) {
        env->ReleaseStringUTFChars(j_voice, voice);
    }

    if (status != 0 || audio_out.samples == nullptr || audio_out.n_samples <= 0) {
        LOGE("Synthesis failed with status %d: %s", status, vieneu_last_error());
        vieneu_audio_free(&audio_out);
        return nullptr;
    }

    // Convert float samples [-1.0, 1.0] to 16-bit PCM WAV
    int sample_rate = audio_out.sample_rate > 0 ? audio_out.sample_rate : 48000;
    int channels = audio_out.channels > 0 ? audio_out.channels : 1;
    int n_samples = audio_out.n_samples;

    std::vector<uint8_t> wav_data;
    write_wav_header(wav_data, n_samples, sample_rate, channels);

    size_t header_size = wav_data.size();
    wav_data.resize(header_size + n_samples * channels * 2);

    int16_t * pcm_ptr = reinterpret_cast<int16_t *>(wav_data.data() + header_size);
    for (int i = 0; i < n_samples * channels; ++i) {
        float s = audio_out.samples[i];
        if (s > 1.0f) s = 1.0f;
        if (s < -1.0f) s = -1.0f;
        pcm_ptr[i] = static_cast<int16_t>(s * 32767.0f);
    }

    vieneu_audio_free(&audio_out);

    jbyteArray result = env->NewByteArray(wav_data.size());
    if (result != nullptr) {
        env->SetByteArrayRegion(result, 0, wav_data.size(), reinterpret_cast<const jbyte *>(wav_data.data()));
    }

    LOGI("Synthesis successful, generated %zu bytes WAV", wav_data.size());
    return result;
}

JNIEXPORT void JNICALL
Java_com_bachduong_remixvideo_VieNeuAudioCppPlugin_nativeRelease(
        JNIEnv *env,
        jclass clazz) {
    if (g_vieneu_ctx != nullptr) {
        LOGI("Releasing VieNeu context");
        vieneu_free(g_vieneu_ctx);
        g_vieneu_ctx = nullptr;
    }
}

} // extern "C"
