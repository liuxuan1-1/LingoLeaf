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
        eyebrow="KEEP LEARNING, WHEREVER YOU ARE"
        title="让学习，跟你一起走。"
        description="手机上温习今天的表达，或把 Markdown 笔记同步到习惯使用的工具。"
      />
      <div className="mobile-hero">
        <div className="mobile-hero-copy">
          <span className="eyebrow">FROM YOUR DESK TO YOUR DAY</span>
          <h2>
            一杯咖啡的时间，
            <br />
            <em>刚好再记住一句。</em>
          </h2>
          <p>
            无需额外的 LingoLeaf 账户。
            <br />
            在同一网络中打开手机学习页，或使用自己的云盘同步笔记。
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
          <small>A LITTLE, EVERY DAY</small>
          <div className="phone-sprout">
            <span>✳</span>
          </div>
          <h3>随时，再学一句。</h3>
          <p>
            把日常的碎片时间，
            <br />
            留给自己的进步。
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
              <span className="eyebrow">LIVE STUDY COMPANION</span>
              <h2>同一 Wi-Fi，直接学习</h2>
            </div>
            <span className={`status-pill ${status.running ? 'on' : ''}`}>
              <i />
              {status.running ? '已开启' : '未开启'}
            </span>
          </div>
          <p className="sync-description">
            让电脑保持运行，手机扫码打开学习库与复习卡片。手机上的复习进度会写回电脑。
          </p>
          {status.running ? (
            <div className="qr-section">
              {status.qrDataUrl && (
                <img className="qr-image" src={status.qrDataUrl} alt="手机学习页二维码" />
              )}
              <div>
                <strong>用手机相机扫描二维码</strong>
                <p>手机与电脑需连接同一局域网。</p>
                {status.urls.length > 0 ? (
                  status.urls.map((url, i) => (
                    <div className="connection-url" key={url}>
                      <span title={url}>{new URL(url).origin}</span>
                      <CopyButton
                        text={url}
                        notify={notify}
                        label={i ? '复制备用链接' : '复制链接'}
                      />
                    </div>
                  ))
                ) : (
                  <p>尚未找到网络地址，请检查网络连接。</p>
                )}
              </div>
            </div>
          ) : (
            <div className="qr-placeholder">
              <div>
                <Smartphone size={28} strokeWidth={1.4} />
                <Wifi size={15} />
              </div>
              <span>开启后，将生成你的专属访问二维码</span>
            </div>
          )}
          <div className="sync-footer">
            <span>
              <Monitor size={15} />
              需要电脑保持运行
            </span>
            <button
              className={`button ${status.running ? 'secondary' : 'primary'}`}
              disabled={busy}
              onClick={toggle}
            >
              {busy ? (
                <Spinner label="正在处理…" />
              ) : status.running ? (
                <>
                  <X size={16} />
                  停止共享
                </>
              ) : (
                <>
                  <Wifi size={16} />
                  开启手机学习
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="inline-error" role="alert">
              <CircleAlert size={17} />
              <div>
                <strong>手机学习暂时无法开启</strong>
                <p>{error}</p>
              </div>
            </div>
          )}
          <div className="sync-tip">
            <CircleAlert size={15} />
            <p>
              访问链接含临时授权，请只分享给自己。仅在可信 Wi-Fi 中使用；Windows
              防火墙提示时允许专用网络访问。停止共享后，链接即失效。
            </p>
          </div>
        </section>
        <section className="card sync-card">
          <div className="sync-heading">
            <span className="sync-icon peach">
              <Cloud size={22} />
            </span>
            <div>
              <span className="eyebrow">YOUR NOTES, EVERYWHERE</span>
              <h2>用你的云盘同步笔记</h2>
            </div>
          </div>
          <p className="sync-description">
            将笔记文件夹放进 OneDrive、Dropbox 等同步目录，在手机上用 Markdown 阅读器或 Obsidian
            查看。
          </p>
          <ol className="sync-steps">
            <li>
              <span>01</span>
              <div>
                <strong>选择一个云盘同步文件夹</strong>
                <p>先在电脑上配置好你自己的同步工具。</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>在偏好设置中指定笔记目录</strong>
                <p>LingoLeaf 会自动将学习记录整理为 Markdown。</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>在手机上打开同一份笔记</strong>
                <p>电脑离线时，也能阅读已同步的内容。</p>
              </div>
            </li>
          </ol>
          <div className="folder-location">
            <FolderOpen size={17} />
            <div>
              <span>当前笔记文件夹</span>
              <p>{settings.libraryPath || '尚未选择'}</p>
            </div>
          </div>
          <div className="sync-footer">
            <span>云盘同步由你选择的工具完成</span>
            <button className="button secondary" onClick={onSettings}>
              设置笔记目录
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="sync-tip">
            <CircleAlert size={15} />
            <p>
              Markdown 是学习笔记的阅读副本。手机编辑 Markdown
              不会自动导入应用；复习进度通过上方的手机学习页记录。
            </p>
          </div>
        </section>
      </div>
      <div className="export-banner">
        <span className="export-icon">
          <ArrowDownToLine size={23} />
        </span>
        <div>
          <h3>想把所有积累带走？</h3>
          <p>导出一份完整的 Markdown 学习手册，随时备份、阅读或迁移。</p>
        </div>
        <button className="button secondary" onClick={onExport}>
          导出学习手册
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
