import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AppTab } from '@/lib/types';
import { APP_NAME, APP_LOGO_URL, HEADER_TABS } from '@/lib/constants';

export function Header({
  activeTab,
  onTabChange,
}: {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-white/30 bg-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-2xl'
          : 'border-b border-white/15 bg-white/60 backdrop-blur-xl'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-3">
          {/* Logo */}
          <button
            type="button"
            onClick={() => onTabChange('random')}
            className="flex items-center gap-2.5 group text-left shrink-0 min-w-0 rounded-xl -ml-2 pl-2 pr-2 py-1.5 hover:bg-black/5 transition-all duration-200"
            aria-label="返回随机图片页面"
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
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-0.5 rounded-xl bg-secondary/60 p-1">
            {HEADER_TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  activeTab === item.key
                    ? 'bg-white text-foreground shadow-sm shadow-black/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/60'
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
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
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-all duration-200 ${
                activeTab === item.key
                  ? 'bg-white text-foreground shadow-sm shadow-black/5'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/60'
              }`}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
