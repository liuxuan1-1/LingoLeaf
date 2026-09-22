import { useI18n } from './i18n';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CircleAlert,
  Cloud,
  Copy,
  FolderOpen,
  Monitor,
  Smartphone,
  Wifi,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MobileStatus, Settings } from '../shared/types';
import { api, errorMessage } from './bridge';
import { CopyButton, SectionHeading, Spinner, type Notify } from './components';

export function MobilePage({
  settings,
  notify,
  onSettings,
  onExport,
}: {
  settings: Settings;
  notify: Notify;
  onSettings: () => void;
  onExport: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<MobileStatus>({ running: false, urls: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .mobileStatus()
      .then(setStatus)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      setStatus(await (status.running ? api.mobileStop() : api.mobileStart()));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionHeading
        eyebrow={t("随时随地，继续学习", "KEEP LEARNING, WHEREVER YOU ARE")}
        title={t("让学习，跟你一起走。", "Take your learning with you.")}
        description={t("手机上温习今天的表达，或把 Markdown 笔记同步到习惯使用的工具。", "Review on your phone or sync Markdown notes to the tools you already use.")}
      />
      <div className="mobile-hero">
        <div className="mobile-hero-copy">
          <span className="eyebrow">{t("从桌面走进日常", "FROM YOUR DESK TO YOUR DAY")}</span>
          <h2>
            {t("一杯咖啡的时间，", "A coffee break is")}
            <br />
            <em>{t("刚好再记住一句。", "time for one more sentence.")}</em>
          </h2>
          <p>
            {t("无需额外的 LingoLeaf 账户。", "No separate LingoLeaf account needed.")}
            <br />
            {t("在同一网络中打开手机学习页，或使用自己的云盘同步笔记。", "Open mobile learning on the same network or sync notes through your own cloud drive.")}
          </p>
          <div className="device-connection">
            <span>
              <Monitor size={23} />
            </span>
            <i />
            <span>
              <Wifi size={21} />
            </span>
            <i />
            <span>
              <Smartphone size={23} />
            </span>
          </div>
        </div>
        <div className="phone-art" aria-hidden="true">
          <div className="phone-camera" />
          <span className="phone-brand">LingoLeaf.</span>
          <small>{t("每天一点点", "A LITTLE, EVERY DAY")}</small>
          <div className="phone-sprout">
            <span>✳</span>
          </div>
          <h3>{t("随时，再学一句。", "One more sentence, anytime.")}</h3>
          <p>
            {t("把日常的碎片时间，", "Make a little room")}
            <br />
            {t("留给自己的进步。", "for everyday progress.")}
          </p>
          <div className="phone-bottom-line" />
        </div>
        <span className="mobile-circle one" />
        <span className="mobile-circle two" />
      </div>
      <div className="sync-grid">
        <section className="card sync-card">
          <div className="sync-heading">
            <span className="sync-icon mint">
              <Wifi size={22} />
            </span>
            <div>
              <span className="eyebrow">{t("随身学习伙伴", "LIVE STUDY COMPANION")}</span>
              <h2>{t("同一 Wi-Fi，直接学习", "Learn on the same Wi-Fi")}</h2>
            </div>
            <span className={`status-pill ${status.running ? 'on' : ''}`}>
              <i />
              {status.running ? t("已开启", "On") : t("未开启", "Off")}
            </span>
          </div>
          <p className="sync-description">
            {t("让电脑保持运行，手机扫码打开学习库与复习卡片。手机上的复习进度会写回电脑。", "Keep your computer running and scan the code to open your library and review cards. Mobile review progress syncs back to your computer.")}
          </p>
          {status.running ? (
            <div className="qr-section">
              {status.qrDataUrl && (
                <img className="qr-image" src={status.qrDataUrl} alt={t("手机学习页二维码", "QR code for mobile learning")} />
              )}
              <div>
                <strong>{t("用手机相机扫描二维码", "Scan with your phone camera")}</strong>
                <p>{t("手机与电脑需连接同一局域网。", "Connect your phone and computer to the same local network.")}</p>
                {status.urls.length > 0 ? (
                  status.urls.map((url, i) => (
                    <div className="connection-url" key={url}>
                      <span title={url}>{new URL(url).origin}</span>
                      <CopyButton
                        text={url}
                        notify={notify}
                        label={i ? t("复制备用链接", "Copy alternate link") : t("复制链接", "Copy link")}
                      />
                    </div>
                  ))
                ) : (
                  <p>{t("尚未找到网络地址，请检查网络连接。", "No network address found. Check your connection.")}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="qr-placeholder">
              <div>
                <Smartphone size={28} strokeWidth={1.4} />
                <Wifi size={15} />
              </div>
              <span>{t("开启后，将生成你的专属访问二维码", "Turn on sharing to generate your access code")}</span>
            </div>
          )}
          <div className="sync-footer">
            <span>
              <Monitor size={15} />
              {t("需要电脑保持运行", "Keep your computer running")}
            </span>
            <button
              className={`button ${status.running ? 'secondary' : 'primary'}`}
              disabled={busy}
              onClick={toggle}
            >
              {busy ? (
                <Spinner label={t("正在处理…", "Working…")} />
              ) : status.running ? (
                <>
                  <X size={16} />
                  {t("停止共享", "Stop sharing")}
                </>
              ) : (
                <>
                  <Wifi size={16} />
                  {t("开启手机学习", "Enable mobile learning")}
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="inline-error" role="alert">
              <CircleAlert size={17} />
              <div>
                <strong>{t("手机学习暂时无法开启", "Mobile learning is unavailable")}</strong>
                <p>{error}</p>
              </div>
            </div>
          )}
          <div className="sync-tip">
            <CircleAlert size={15} />
            <p>
              {t("访问链接含临时授权，请只分享给自己。仅在可信 Wi-Fi 中使用；Windows 防火墙提示时允许专用网络访问。停止共享后，链接即失效。", "The link grants temporary access; keep it private. Use trusted Wi-Fi and allow private network access if Windows Firewall asks. Stopping sharing invalidates the link.")}
            </p>
          </div>
        </section>
        <section className="card sync-card">
          <div className="sync-heading">
            <span className="sync-icon peach">
              <Cloud size={22} />
            </span>
            <div>
              <span className="eyebrow">{t("笔记随身携带", "YOUR NOTES, EVERYWHERE")}</span>
              <h2>{t("用你的云盘同步笔记", "Sync notes with your cloud drive")}</h2>
            </div>
          </div>
          <p className="sync-description">
            {t("将笔记文件夹放进 OneDrive、Dropbox 等同步目录，在手机上用 Markdown 阅读器或 Obsidian 查看。", "Put your notes folder in OneDrive, Dropbox or another sync directory, then read it with a Markdown reader or Obsidian on your phone.")}
          </p>
          <ol className="sync-steps">
            <li>
              <span>01</span>
              <div>
                <strong>{t("选择一个云盘同步文件夹", "Choose a cloud-synced folder")}</strong>
                <p>{t("先在电脑上配置好你自己的同步工具。", "Set up your sync tool on your computer first.")}</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>{t("在偏好设置中指定笔记目录", "Set your notes folder in Settings")}</strong>
                <p>{t("LingoLeaf 会自动将学习记录整理为 Markdown。", "LingoLeaf automatically organizes your learning notes into Markdown.")}</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>{t("在手机上打开同一份笔记", "Open those notes on your phone")}</strong>
                <p>{t("电脑离线时，也能阅读已同步的内容。", "Read synced notes even when your computer is offline.")}</p>
              </div>
            </li>
          </ol>
          <div className="folder-location">
            <FolderOpen size={17} />
            <div>
              <span>{t("当前笔记文件夹", "Current notes folder")}</span>
              <p>{settings.libraryPath || t("尚未选择", "Not selected")}</p>
            </div>
          </div>
          <div className="sync-footer">
            <span>{t("云盘同步由你选择的工具完成", "Your chosen tool handles cloud sync")}</span>
            <button className="button secondary" onClick={onSettings}>
              {t("设置笔记目录", "Set notes folder")}
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="sync-tip">
            <CircleAlert size={15} />
            <p>
              {t("Markdown 是学习笔记的阅读副本。手机编辑 Markdown 不会自动导入应用；复习进度通过上方的手机学习页记录。", "Markdown is a readable copy of your notes. Edits made on your phone are not imported automatically; use mobile learning above to record review progress.")}
            </p>
          </div>
        </section>
      </div>
      <div className="export-banner">
        <span className="export-icon">
          <ArrowDownToLine size={23} />
        </span>
        <div>
          <h3>{t("想把所有积累带走？", "Take your whole collection with you")}</h3>
          <p>{t("导出一份完整的 Markdown 学习手册，随时备份、阅读或迁移。", "Export a complete Markdown learning handbook to back up, read or move your notes.")}</p>
        </div>
        <button className="button secondary" onClick={onExport}>
          {t("导出学习手册", "Export learning handbook")}
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
