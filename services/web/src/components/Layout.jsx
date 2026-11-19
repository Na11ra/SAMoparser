import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  Boxes,
  Database,
  GitCompareArrows,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Menu,
  Monitor,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAppData } from '../app/AppDataContext';
import { Badge, Button } from './ui';
import Assistant from './Assistant';
import { formatNumber } from '../lib/format';

const NAV_GROUPS = [
  {
    title: 'Мониторинг',
    items: [
      { to: '/', label: 'Обзор', icon: LayoutDashboard, end: true },
      { to: '/compliance', label: 'Комплаенс-контроль', icon: ShieldCheck },
      { to: '/risks', label: 'Риски', icon: ShieldAlert, badge: 'critical' },
    ],
  },
  {
    title: 'Справочники',
    items: [
      { to: '/catalog', label: 'Каталог ПО', icon: Boxes },
      { to: '/licenses', label: 'Лицензии и квоты', icon: KeyRound },
      { to: '/devices', label: 'Компьютеры', icon: Monitor },
    ],
  },
  {
    title: 'Данные',
    items: [
      { to: '/installations', label: 'Установки', icon: HardDrive, badge: 'unknown' },
      { to: '/import', label: 'Импорт данных', icon: UploadCloud },
      { to: '/matching', label: 'Проверка имён', icon: GitCompareArrows },
    ],
  },
  {
    title: 'ИИ-сервисы (бонус)',
    items: [{ to: '/ai-lab', label: 'ИИ-лаборатория', icon: Sparkles }],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title })));

export default function Layout() {
  const { summary, installations, loading, refresh } = useAppData();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const current = useMemo(
    () => ALL_ITEMS.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))) || ALL_ITEMS[0],
    [location.pathname],
  );

  const apiState = summary.error ? 'offline' : summary.loading ? 'connecting' : 'online';

  const badges = useMemo(() => ({
    critical: summary.data?.critical_risks || 0,
    unknown: summary.data?.unknown || 0,
  }), [summary.data]);

  const snapshotProgress = installations.total
    ? `${formatNumber(Math.min(installations.total, installations.loadedPages * 500))} / ${formatNumber(installations.total)}`
    : null;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Database size={19} /></div>
          <div>
            <b>SAMo<span>parser</span></b>
            <small>УЧЁТ И КОМПЛАЕНС ПО</small>
          </div>
          <button type="button" className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню"><X size={18} /></button>
        </div>

        <div className="workspace-card">
          <div className="workspace-icon"><Activity size={16} /></div>
          <div>
            <small>Контур данных</small>
            <b>ПУ «СургутАСУнефть»</b>
          </div>
        </div>

        <nav className="nav">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.title}>
              <p>{group.title}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = item.badge ? badges[item.badge] : null;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={17} />
                    <span>{item.label}</span>
                    {count ? <em className={item.badge === 'critical' ? 'danger-count' : ''}>{formatNumber(count)}</em> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sync-state">
            <span className={`pulse ${apiState === 'offline' ? 'pulse-off' : ''}`} />
            <div>
              <b>{apiState === 'online' ? 'API доступен' : apiState === 'connecting' ? 'Подключение к API' : 'API недоступен'}</b>
              <small>{installations.loading ? `Синхронизация: ${snapshotProgress || 'загрузка…'}` : `${formatNumber(installations.total)} установок в срезе`}</small>
            </div>
          </div>
          <div className="sidebar-user">
            <div className="avatar">ИТ</div>
            <div><b>ИТ-администратор</b><small>Локальный контур MVP</small></div>
          </div>
        </div>
      </aside>

      {menuOpen ? <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} /> : null}

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="icon-btn menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Открыть меню"><Menu size={20} /></button>
            <div className="crumbs"><span>{current.group}</span><i>/</i><b>{current.label}</b></div>
          </div>
          <div className="topbar-right">
            {apiState === 'online' ? (
              <Badge tone="success" dot><Wifi size={12} /> API онлайн</Badge>
            ) : apiState === 'connecting' ? (
              <Badge tone="info" dot>Подключаемся к API…</Badge>
            ) : (
              <Badge tone="danger" dot><WifiOff size={12} /> Нет связи с API</Badge>
            )}
            <Badge tone="warning">ДЕМО-КОНТУР</Badge>
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={refresh} disabled={loading}>
              {loading ? 'Обновляем…' : 'Обновить'}
            </Button>
          </div>
        </header>

        <main className="content"><Outlet /></main>

        <footer className="app-footer">
          <span>SAMoparser · прототип локального MVP · данные кейса ПУ «СургутАСУнефть»</span>
          <span>Риски и рекомендации требуют проверки человеком</span>
        </footer>
      </div>

      <Assistant />
    </div>
  );
}
