import { registerPlugin, Capacitor } from '@capacitor/core';

export interface VieNeuAudioCppStatus {
  isNativeLibraryLoaded: boolean;
  isModelInitialized: boolean;
  engine: string;
  modelFormat: string;
  modelExistsOnDisk: boolean;
  modelPath?: string;
  modelSize?: number;
}

export interface VieNeuAudioCppEngineInfo {
  name: string;
  version: string;
  isNative: boolean;
  sampleRate: number;
  voiceCloningSupported: boolean;
  defaultVoices: string[];
}

export interface VieNeuSynthesizeOptions {
  text: string;
  voice?: string;
  speed?: number;
  refAudioBase64?: string;
}

export interface VieNeuSynthesizeResult {
  success: boolean;
  base64Audio?: string;
  mimeType?: string;
  durationMs?: number;
  provider?: string;
  useFallback?: boolean;
  message?: string;
  error?: string;
}

export interface VieNeuAudioCppPlugin {
  isAvailable(): Promise<VieNeuAudioCppStatus>;
  getEngineInfo(): Promise<VieNeuAudioCppEngineInfo>;
  loadModel(options?: { modelPath?: string }): Promise<{ success: boolean; modelPath?: string; error?: string }>;
  synthesize(options: VieNeuSynthesizeOptions): Promise<VieNeuSynthesizeResult>;
}

export const VieNeuAudioCpp = registerPlugin<VieNeuAudioCppPlugin>('VieNeuAudioCpp', {
  web: () => ({
    async isAvailable() {
      return {
        isNativeLibraryLoaded: false,
        isModelInitialized: false,
        engine: 'Web/Cloud Proxy (audio.cpp)',
        modelFormat: 'GGUF Q4_K',
        modelExistsOnDisk: false,
      };
    },
    async getEngineInfo() {
      return {
        name: 'audio.cpp VieNeu-TTS v3 Turbo Web Proxy',
        version: '1.0.0-web',
        isNative: false,
        sampleRate: 48000,
        voiceCloningSupported: true,
        defaultVoices: ['Hải Đăng', 'Mai Anh', 'Trúc Ly', 'Thùy Dung', 'Quang Sơn', 'Ngọc Trân', 'Thiện Minh'],
      };
    },
    async loadModel() {
      return { success: false, error: 'Chạy trực tiếp trên Web, sử dụng proxy audio.cpp' };
    },
    async synthesize() {
      return { success: false, useFallback: true, message: 'Web environment delegates to /api/tts' };
    },
  }),
});

/**
 * Check if Native audio.cpp is available and ready on the device
 */
export async function isNativeVieNeuAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const status = await VieNeuAudioCpp.isAvailable();
    return Boolean(status.isNativeLibraryLoaded && status.isModelInitialized);
  } catch {
    return false;
  }
}
