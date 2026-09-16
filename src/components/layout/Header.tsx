import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { APP_NAME, APP_LOGO_URL, HEADER_TABS } from '@/lib/constants';
import { NavLink } from '@/components/ui/nav-link';
import { useRoute } from '@/lib/router';

export function Header() {
  const route = useRoute();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 12);
    // 挂载时先读一次当前滚动位置：刷新 / 从历史回退到已滚动页面时，
    // 顶栏能立刻呈现「已滚动」样式，而不是先渲染未滚动态再被监听器纠正。
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  /** 首页只在完全相等时点亮，其余按前缀匹配（将来加子路由也不会漏） */
  const isActive = (path: string) => (path === '/' ? route === '/' : route.startsWith(path));

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
      active
        ? 'bg-white text-foreground shadow-sm shadow-black/5'
        : 'text-muted-foreground hover:text-foreground hover:bg-white/60'
    }`;

  const tabClassCompact = (active: boolean) =>
    `inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-all duration-200 ${
      active
        ? 'bg-white text-foreground shadow-sm shadow-black/5'
        : 'text-muted-foreground hover:text-foreground hover:bg-white/60'
    }`;

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-white/30 bg-white/80 shadow-md backdrop-blur-2xl'
          : 'border-b border-white/15 bg-white/60 backdrop-blur-xl'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* 高度断点必须与移动导航行的隐藏断点一致（都是 md/768px）：
            顶部行长高是为了容纳「桌面导航 + PAIII 链接」并排，
            而桌面导航正是在 md 才出现。若写成 sm:h-16，
            640–767px 区间会出现「顶部行 64 + 导航行 40 = 104px」，
            而 --header-h 只有 96px，页面顶部被遮 8px。 */}
        <div className="flex h-14 md:h-16 items-center justify-between gap-3">
          {/* Logo */}
          <NavLink
            to="/"
            className="flex items-center gap-2.5 group text-left shrink-0 min-w-0 rounded-xl -ml-2 pl-2 pr-2 py-1.5 hover:bg-black/5 transition-all duration-200"
            aria-label="返回首页"
          >
            <div className="relative">
              <img
                src={APP_LOGO_URL}
                alt={`${APP_NAME} Logo`}
                width={32}
                height={32}
                className="w-8 h-8 rounded-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
              />
            </div>
            <span className="truncate font-bold text-base sm:text-[17px] tracking-tight text-foreground/90">
              {APP_NAME}
            </span>
          </NavLink>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-0.5 rounded-xl bg-secondary/60 p-1">
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
              className="hidden sm:inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-secondary/60"
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
    </header>
  );
}
