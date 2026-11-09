import React, { useState, useRef, useEffect } from 'react';
import { ClonedVoice } from '../types';

interface VoiceCloningModalProps {
  isOpen: boolean;
  onClose: () => void;
  clonedVoices: ClonedVoice[];
  activeClonedVoiceId?: string;
  onSaveVoice: (voice: ClonedVoice) => void;
  onDeleteVoice: (id: string) => void;
  onSelectVoice: (id: string) => void;
}

export const VoiceCloningModal: React.FC<VoiceCloningModalProps> = ({
  isOpen,
  onClose,
  clonedVoices,
  activeClonedVoiceId,
  onSaveVoice,
  onDeleteVoice,
  onSelectVoice,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>(clonedVoices.length > 0 ? 'list' : 'create');
  
  // Recording / Upload states
  const [voiceName, setVoiceName] = useState('');
  const [audioBase64, setAudioBase64] = useState<string>('');
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<any>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const listAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopRecording();
      stopAllAudio();
      setErrorMsg('');
    } else {
      if (clonedVoices.length === 0) {
        setActiveTab('create');
      }
    }
  }, [isOpen]);

  const stopAllAudio = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    if (listAudioRef.current) {
      listAudioRef.current.pause();
      listAudioRef.current.currentTime = 0;
    }
    setIsPlayingPreview(false);
    setPlayingVoiceId(null);
  };

  // 1. File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|m4a|aac|ogg|webm)$/i)) {
      setErrorMsg('Vui lòng chọn file âm thanh hợp lệ (MP3, WAV, M4A, OGG).');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('File quá lớn (tối đa 25MB). Hãy chọn clip ngắn 3–15 giây.');
      return;
    }

    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setAudioBase64(b64);

      // Measure duration
      const tempAudio = new Audio(b64);
      tempAudio.onloadedmetadata = () => {
        const dur = Math.round(tempAudio.duration * 10) / 10;
        setAudioDuration(dur);
        if (!voiceName.trim()) {
          const defaultName = file.name.replace(/\.[^/.]+$/, '').slice(0, 25);
          setVoiceName(defaultName);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  // 2. Microphone Recording Handlers
  const startRecording = async () => {
    try {
      setErrorMsg('');
      stopAllAudio();
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/wav';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          const b64 = reader.result as string;
          setAudioBase64(b64);
          const tempAudio = new Audio(b64);
          tempAudio.onloadedmetadata = () => {
            const dur = Math.round(tempAudio.duration * 10) / 10;
            setAudioDuration(dur);
          };
        };
        reader.readAsDataURL(audioBlob);

        // Stop all mic tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordDuration(0);

      // Auto countdown timer up to 10 seconds max
      recordTimerRef.current = setInterval(() => {
        setRecordDuration((prev) => {
          if (prev >= 8) {
            stopRecording();
            return 8;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error('Mic access error:', err);
      setErrorMsg('Không thể truy cập Microphone. Vui lòng cấp quyền micro trong trình duyệt.');
    }
  };

  const stopRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const togglePreview = () => {
    if (!audioBase64) return;
    if (isPlayingPreview) {
      previewAudioRef.current?.pause();
      setIsPlayingPreview(false);
    } else {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio(audioBase64);
        previewAudioRef.current.onended = () => setIsPlayingPreview(false);
      } else {
        previewAudioRef.current.src = audioBase64;
      }
      previewAudioRef.current.play().catch(() => {});
      setIsPlayingPreview(true);
    }
  };

  const toggleListPlay = (voice: ClonedVoice) => {
    if (playingVoiceId === voice.id) {
      listAudioRef.current?.pause();
      setPlayingVoiceId(null);
    } else {
      stopAllAudio();
      listAudioRef.current = new Audio(voice.audioBase64);
      listAudioRef.current.onended = () => setPlayingVoiceId(null);
      listAudioRef.current.play().catch(() => {});
      setPlayingVoiceId(voice.id);
    }
  };

  const handleSave = () => {
    if (!audioBase64) {
      setErrorMsg('Vui lòng tải lên file âm thanh hoặc thu âm ít nhất 3 giây.');
      return;
    }
    const finalName = voiceName.trim() || `Giọng của tôi #${clonedVoices.length + 1}`;
    const newVoice: ClonedVoice = {
      id: `clone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: finalName,
      createdAt: Date.now(),
      duration: audioDuration || 4.0,
      audioBase64,
    };

    onSaveVoice(newVoice);
    onSelectVoice(newVoice.id);

    // Reset create state
    setVoiceName('');
    setAudioBase64('');
    setAudioDuration(0);
    stopAllAudio();
    setActiveTab('list');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#141418] border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#18181f]/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Nhân Bản Giọng Nói AI
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-sky-500/20 to-indigo-500/20 text-sky-400 border border-sky-500/30">
                  VieNeu Clone
                </span>
              </h3>
              <p className="text-xs text-zinc-400">Clone chất giọng từ mẫu âm thanh của bạn chỉ từ 3–5 giây</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex px-6 pt-3 border-b border-zinc-800 bg-[#121216]">
          <button
            onClick={() => { setActiveTab('create'); stopAllAudio(); }}
            className={`pb-3 px-4 text-xs font-bold transition-all relative ${
              activeTab === 'create'
                ? 'text-sky-400 border-b-2 border-sky-500'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            ➕ Tạo / Thu âm giọng mới
          </button>
          <button
            onClick={() => { setActiveTab('list'); stopAllAudio(); }}
            className={`pb-3 px-4 text-xs font-bold transition-all relative flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'text-sky-400 border-b-2 border-sky-500'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            📂 Giọng đã lưu
            {clonedVoices.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-sky-400 font-mono">
                {clonedVoices.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 text-xs bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'create' && (
            <div className="space-y-4">
              {/* Voice Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Đặt tên giọng clone:</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Giọng Của Tôi, Giọng Review Phim..."
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="w-full bg-[#1b1b22] border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Input Sources: Mic or Upload */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Record Mic */}
                <div className={`p-4 rounded-2xl border transition-all flex flex-col items-center justify-center text-center ${
                  isRecording 
                    ? 'border-red-500 bg-red-950/20 shadow-lg shadow-red-500/10' 
                    : 'border-zinc-800 bg-[#191920] hover:border-zinc-700'
                }`}>
                  <div className="text-xs font-bold text-zinc-200 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    Ghi âm qua Micro
                  </div>

                  {isRecording ? (
                    <div className="space-y-3 flex flex-col items-center">
                      <div className="text-2xl font-mono font-bold text-red-400">
                        00:0{recordDuration} / 00:08
                      </div>
                      <div className="flex gap-1 items-center h-5">
                        {[40, 70, 90, 60, 100, 50, 80, 45, 95].map((h, i) => (
                          <span
                            key={i}
                            className="w-1 bg-red-500 rounded-full animate-bounce"
                            style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }}
                          />
                        ))}
                      </div>
                      <button
                        onClick={stopRecording}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-md transition-colors"
                      >
                        ⏹️ Dừng ghi âm
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 flex flex-col items-center">
                      <p className="text-[11px] text-zinc-400">Nói 1 câu rõ ràng khoảng 3–5 giây</p>
                      <button
                        onClick={startRecording}
                        className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-red-600/20 transition-all flex items-center gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                        </svg>
                        Bắt đầu ghi âm
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Upload Audio File */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-4 rounded-2xl border border-dashed border-zinc-700 bg-[#191920] hover:border-sky-500/60 hover:bg-[#1a1a24] cursor-pointer transition-all flex flex-col items-center justify-center text-center group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 group-hover:bg-sky-500/20 text-zinc-400 group-hover:text-sky-400 flex items-center justify-center mb-2 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div className="text-xs font-bold text-zinc-200">Tải file âm thanh mẫu</div>
                  <p className="text-[11px] text-zinc-500 mt-1">Hỗ trợ MP3, WAV, M4A (3–10 giây)</p>
                </div>
              </div>

              {/* Audio Preview Box */}
              {audioBase64 && (
                <div className="p-3.5 bg-gradient-to-r from-sky-950/30 to-indigo-950/30 border border-sky-500/30 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePreview}
                      className="w-10 h-10 rounded-xl bg-sky-500 hover:bg-sky-400 text-white flex items-center justify-center shadow-md shadow-sky-500/20 transition-all shrink-0"
                    >
                      {isPlayingPreview ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Đã có audio mẫu</span>
                        {audioDuration > 0 && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300">
                            {audioDuration}s
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400">Bấm nút để nghe lại âm thanh mẫu</p>
                    </div>
                  </div>

                  <button
                    onClick={() => { setAudioBase64(''); stopAllAudio(); }}
                    className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors text-xs flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Xóa
                  </button>
                </div>
              )}

              {/* Golden Rules */}
              <div className="p-3.5 bg-[#181820] border border-zinc-800 rounded-2xl space-y-1.5 text-xs text-zinc-400">
                <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <span>💡</span> Mẹo để clone giọng giống người thật 100%:
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-zinc-300">
                  <li>Chỉ cần <strong>3–5 giây</strong> (nói 1 câu hoàn chỉnh, tốc độ vừa phải).</li>
                  <li>Không dùng file quá dài hoặc đoạn có lẫn <strong>nhạc nền, tiếng ồn lớn</strong>.</li>
                  <li>Nói đều giọng, giữ khoảng cách micro khoảng 15–20 cm.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'list' && (
            <div className="space-y-3">
              {clonedVoices.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-3xl bg-zinc-800/80 flex items-center justify-center text-zinc-500">
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-zinc-300">Chưa có giọng clone nào</h4>
                    <p className="text-xs text-zinc-500 mt-1">Hãy thu âm hoặc tải lên file âm thanh để tạo giọng đầu tiên!</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-500/20 transition-all"
                  >
                    ➕ Tạo giọng clone mới
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {clonedVoices.map((voice) => {
                    const isSelected = activeClonedVoiceId === voice.id;
                    const isPlaying = playingVoiceId === voice.id;
                    return (
                      <div
                        key={voice.id}
                        className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-sky-950/30 border-sky-500/50 shadow-md shadow-sky-500/10'
                            : 'bg-[#181820] border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            onClick={() => toggleListPlay(voice)}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 transition-all ${
                              isPlaying
                                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                                : 'bg-zinc-800 hover:bg-sky-500 text-zinc-200 hover:text-white'
                            }`}
                          >
                            {isPlaying ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </button>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white flex items-center gap-2 truncate">
                              <span className="truncate">{voice.name}</span>
                              {isSelected && (
                                <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-sky-500 text-white shrink-0">
                                  Đang chọn
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                              {voice.duration && <span>⏱️ {voice.duration}s</span>}
                              <span>•</span>
                              <span>{new Date(voice.createdAt).toLocaleDateString('vi-VN')}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!isSelected && (
                            <button
                              onClick={() => onSelectVoice(voice.id)}
                              className="px-3 py-1.5 bg-zinc-800 hover:bg-sky-500 hover:text-white text-zinc-300 rounded-xl text-xs font-bold transition-all"
                            >
                              Chọn dùng
                            </button>
                          )}
                          <button
                            onClick={() => onDeleteVoice(voice.id)}
                            className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                            title="Xóa giọng này"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-[#16161c] flex items-center justify-between">
          <div className="text-[11px] text-zinc-500">
            {activeTab === 'create'
              ? 'Audio mẫu được lưu trực tiếp trên thiết bị của bạn'
              : `Tổng cộng ${clonedVoices.length} giọng clone`}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Đóng
            </button>
            {activeTab === 'create' && (
              <button
                onClick={handleSave}
                disabled={!audioBase64}
                className="px-5 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-500/20 transition-all flex items-center gap-1.5"
              >
                <span>✨</span>
                Lưu & Sử dụng
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
