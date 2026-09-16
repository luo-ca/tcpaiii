import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { APP_NAME, APP_LOGO_URL, HEADER_TABS } from '@/lib/constants';
import { NavLink } from '@/components/ui/nav-link';
import { useRoute } from '@/lib/router';

export function Header() {
  const route = useRoute();
  const [scrolled, setScrolled] = useState(false);
  // 阅读进度：0~1。用 transform: scaleX 表达，避免每帧改 width 触发重排。
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 12);
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0);
    };
    // 挂载时先读一次当前滚动位置：刷新 / 从历史回退到已滚动页面时，
    // 顶栏能立刻呈现「已滚动」样式，而不是先渲染未滚动态再被监听器纠正。
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  /** 首页只在完全相等时点亮，其余按前缀匹配（`/gallery` 之类不会漏） */
  const isActive = (path: string) => (path === '/' ? route === '/' : route.startsWith(path));

  // 激活态用品牌蓝平涂 + 墨线，与主按钮 / 阅读进度线同一套品牌语言。
  const activeTabClass = 'border-2 border-ink bg-brand-500 font-bold text-white shadow-[2px_2px_0_0_var(--color-ink)]';

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
      active ? activeTabClass : 'border-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-brand-50'
    }`;

  const tabClassCompact = (active: boolean) =>
    `inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-all duration-200 ${
      active ? activeTabClass : 'border-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-brand-50'
    }`;

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b-2 border-ink bg-white shadow-[0_3px_0_0_var(--color-ink)]'
          : 'border-b-2 border-transparent bg-background'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* 高度断点必须与移动导航行的隐藏断点一致（都是 md/768px）：
            顶部行长高是为了容纳「桌面导航 + PAIII 链接」并排，
            而桌面导航正是在 md 才出现。若写成 sm:h-16，
            640–767px 区间会出现「顶部行 64 + 导航行 40 = 104px」，
            而 --header-h 只有 96px，页面顶部被遮 8px。 */}
        <div className="flex h-14 md:h-16 items-center justify-between gap-3">
          {/* Brand lockup：Logo 套一层品牌渐变描边 + 双行字标 */}
          <NavLink
            to="/"
            className="group flex items-center gap-2.5 text-left shrink-0 min-w-0 rounded-xl -ml-2 pl-2 pr-2 py-1.5 hover:bg-brand-50 transition-all duration-200"
            aria-label="返回首页"
          >
            <span className="relative shrink-0 rounded-xl border-2 border-ink bg-white p-[1.5px] transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3">
              <img
                src={APP_LOGO_URL}
                alt={`${APP_NAME} Logo`}
                width={32}
                height={32}
                className="block w-8 h-8 rounded-[10px]"
              />
            </span>
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate font-bold text-[15px] sm:text-base tracking-tight text-foreground">
                {APP_NAME}
              </span>
              <span className="mt-1 hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 sm:block">
                Anime Image API
              </span>
            </span>
          </NavLink>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-0.5 rounded-xl border-2 border-ink bg-white p-1">
            {HEADER_TABS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                aria-current={isActive(item.path) ? 'page' : undefined}
                className={tabClass(isActive(item.path))}
              >
                <item.icon className="w-3.5 h-3.5" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <a
              href="https://paiii.cn"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-white px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-brand-50 hover:text-brand-600"
            >
              <span>PAIII</span>
              <ExternalLink className="w-3 h-3" aria-hidden />
            </a>
          </div>
        </div>

        {/* Mobile Navigation */}
        <nav className="grid grid-cols-3 gap-1 pb-2 md:hidden">
          {HEADER_TABS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              aria-current={isActive(item.path) ? 'page' : undefined}
              className={tabClassCompact(isActive(item.path))}
            >
              <item.icon className="w-3.5 h-3.5" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* 阅读进度线：绝对定位在顶栏底缘，不改变顶栏高度（--header-h 契约不受影响） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
      >
        <div
          className="h-full origin-left bg-brand-500 transition-transform duration-150 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </header>
  );
}
