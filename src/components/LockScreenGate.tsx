import React, { useState, useEffect } from 'react';
import {
  Lock,
  Copy,
  Check,
  Headphones,
  RefreshCw,
  Crown,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  MessageCircle,
  Phone,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  LicenseState,
  ensureAndSyncDeviceLicense,
  isWhitelistedAdminMember
} from '../utils/licenseManager';
import { getOrCreateLocalMemberCode, fetchCurrentClientIp } from '../services/firebaseLicenseService';
import { getDeviceFingerprint, DeviceInfo } from '../utils/deviceFingerprint';

interface LockScreenGateProps {
  licenseState: LicenseState | null;
  onOpenAdmin: () => void;
  onLicenseUpdated: (newState: LicenseState) => void;
}

export const LockScreenGate: React.FC<LockScreenGateProps> = ({
  licenseState,
  onOpenAdmin,
  onLicenseUpdated
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [showContactModal, setShowContactModal] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [isIpWhitelisted, setIsIpWhitelisted] = useState<boolean>(false);

  useEffect(() => {
    getDeviceFingerprint().then(setDeviceInfo);
    fetchCurrentClientIp().then((res) => {
      if (res.isWhitelisted) {
        setIsIpWhitelisted(true);
      }
    });
  }, []);

  const displayMemberCode =
    licenseState?.memberCode ||
    deviceInfo?.memberCode ||
    (deviceInfo ? getOrCreateLocalMemberCode(deviceInfo.deviceId) : getOrCreateLocalMemberCode());

  const isWhitelistedAdmin =
    isIpWhitelisted ||
    licenseState?.isWhitelistedAdmin === true ||
    licenseState?.isAdmin === true ||
    isWhitelistedAdminMember(licenseState);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(displayMemberCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setActionMessage(null);
    try {
      const updated = await ensureAndSyncDeviceLicense();
      onLicenseUpdated(updated);
      if (updated.isPro || updated.isAdmin) {
        setActionMessage({ text: '✓ Thiết bị của bạn đã được kích hoạt thành công!', isError: false });
      } else {
        setActionMessage({
          text: 'Chưa tìm thấy gói VIP mới trên máy chủ. Vui lòng nhắn Admin cấp thời gian rồi bấm Kiểm tra lại!',
          isError: true
        });
      }
    } catch (err: any) {
      setActionMessage({ text: 'Lỗi đồng bộ: ' + (err?.message || 'Lỗi mạng'), isError: true });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div
      id="lock-screen-gate"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-between bg-[#08080c] text-white select-none overflow-y-auto px-4 py-6 sm:py-10 min-h-screen"
      style={{
        backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(245, 158, 11, 0.12) 0%, rgba(8, 8, 12, 0.99) 75%)'
      }}
    >
      {/* Top ambient space - Only visible for Whitelisted Admin */}
      <div className="w-full max-w-md flex justify-end min-h-[32px] pt-2">
        {isWhitelistedAdmin && (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="px-3 py-1 text-xs font-bold text-amber-400 bg-[#161622] hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md animate-in fade-in"
            title="Dành cho Quản trị viên"
          >
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>Quản trị viên</span>
          </button>
        )}
      </div>

      {/* Main Lock Card Container */}
      <div className="w-full max-w-md my-auto flex flex-col items-center text-center space-y-5 py-4">
        {/* Glowing Lock Icon Container */}
        <div className="relative flex items-center justify-center">
          <div className="absolute -inset-2 rounded-[32px] bg-amber-500/15 blur-xl animate-pulse" />
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-[28px] bg-[#1a1a24] border border-[#2d2d3f] flex items-center justify-center shadow-2xl shadow-amber-500/10">
            <Lock className="w-12 h-12 sm:w-14 sm:h-14 text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)] stroke-[2.2]" />
          </div>
        </div>

        {/* Header Titles */}
        <div className="space-y-2 px-2 text-center max-w-sm sm:max-w-md">
          <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-white uppercase">
            YÊU CẦU KÍCH HOẠT
          </h1>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-normal">
            Phiên bản dùng thử 3 ngày của bạn đã hết hạn. Vui lòng gửi mã bên dưới cho quản trị viên để mở khóa hoặc gia hạn thời gian sử dụng.
          </p>
        </div>

        {/* Member Code Box (Matching Screenshot_20261108_230016) */}
        <div className="w-full bg-[#13131c] border border-[#232332] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-3.5 max-w-sm sm:max-w-md">
          <div className="text-center space-y-1">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">
              MÃ THÀNH VIÊN CỦA BẠN
            </span>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              <span className="font-mono text-2xl sm:text-3xl font-black text-[#00a2ff] tracking-wider select-all break-all">
                {displayMemberCode}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="p-2 text-[#00a2ff] hover:text-white bg-[#1a2333] hover:bg-[#202d42] border border-[#00a2ff]/30 rounded-xl transition cursor-pointer shrink-0 active:scale-95"
                title="Sao chép Mã Thành Viên"
              >
                {copied ? <Check className="w-4.5 h-4.5 text-emerald-400" /> : <Copy className="w-4.5 h-4.5" />}
              </button>
            </div>
            {copied && (
              <p className="text-[11px] font-semibold text-emerald-400 animate-in fade-in duration-200 pt-0.5">
                ✓ Đã sao chép mã thành viên vào clipboard!
              </p>
            )}
          </div>

          {/* Button 1: LIÊN HỆ QUẢN TRỊ VIÊN ĐỂ MỞ VIP */}
          <button
            type="button"
            onClick={() => setShowContactModal(true)}
            className="w-full py-3.5 px-4 bg-[#00a2ff] hover:bg-[#0091ff] text-white font-extrabold rounded-2xl text-xs sm:text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-[#00a2ff]/25 active:scale-[0.98] transition cursor-pointer uppercase"
          >
            <Headphones className="w-4.5 h-4.5 stroke-[2.5]" />
            <span>LIÊN HỆ QUẢN TRỊ VIÊN ĐỂ MỞ VIP</span>
          </button>

          {/* Button 2: Đã được cấp quyền? Bấm để kiểm tra lại */}
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="w-full py-3 px-3 bg-[#1c1c28] hover:bg-[#232332] text-zinc-200 border border-[#2a2a3d] rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 active:scale-[0.98]"
          >
            <RefreshCw className={`w-4 h-4 text-[#00a2ff] ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Đang kiểm tra dữ liệu máy chủ...' : 'Đã được cấp quyền? Bấm để kiểm tra lại'}</span>
          </button>

          {/* Alert Box (Action Message) */}
          {actionMessage ? (
            <div
              className={`p-3 rounded-2xl text-xs font-medium flex items-start gap-2 text-left transition animate-in fade-in ${
                actionMessage.isError
                  ? 'bg-[#281318] border border-rose-900/60 text-rose-200'
                  : 'bg-[#0f281b] border border-emerald-900/60 text-emerald-200'
              }`}
            >
              {actionMessage.isError ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{actionMessage.text}</span>
            </div>
          ) : (
            <div className="p-3 rounded-2xl text-xs font-medium flex items-start gap-2.5 text-left bg-[#281318] border border-rose-900/60 text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                Chưa tìm thấy gói VIP mới trên máy chủ. Vui lòng nhắn Admin cấp thời gian rồi bấm Kiểm tra lại!
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer info matching reference screenshot */}
      <div className="w-full text-center space-y-1 py-4 text-zinc-500 text-xs">
        <p className="font-semibold text-zinc-400 tracking-wide">vTranslate v6.6 Dùng thử</p>
        <p className="text-[10.5px] text-zinc-600">Được bảo vệ & chứng thực bởi Firebase Cloud Realtime License</p>
      </div>

      {/* Modal Liên Hệ Quản Trị Viên */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#161622] border border-slate-800 rounded-2xl p-5 shadow-2xl text-left space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Headphones className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-white text-sm">Liên Hệ Quản Trị Viên</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Vui lòng gửi <b>Mã Thành Viên</b> cho Quản trị viên qua các kênh bên dưới để được cấp quyền hoặc gia hạn gói VIP nhanh nhất:
            </p>

            <div className="bg-[#0f0f18] p-3 rounded-xl border border-slate-800 text-center space-y-1">
              <span className="text-[10px] text-slate-400 font-bold block">MÃ THÀNH VIÊN CỦA BẠN:</span>
              <span className="font-mono text-base font-black text-sky-400 block select-all">
                {displayMemberCode}
              </span>
            </div>

            <div className="space-y-2 pt-1">
              <a
                href="https://zalo.me"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Nhắn qua Zalo Quản Trị Viên</span>
              </a>

              <a
                href="https://t.me"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Nhắn qua Telegram</span>
              </a>
            </div>

            <button
              type="button"
              onClick={() => setShowContactModal(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
