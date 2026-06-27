import { ExternalLink } from 'lucide-react';
import { APP_NAME, APP_LOGO_URL, EDGEONE_LOGO_URL } from '@/lib/constants';
import { buildAppUrl } from '@/lib/url';

export function Footer() {
  const appUrl = buildAppUrl('/');

  return (
    <footer className="relative z-10 mt-4 border-t border-border/40 bg-secondary/20 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col items-center justify-center gap-6 text-center">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <img
              src={APP_LOGO_URL}
              alt={`${APP_NAME} Logo`}
              width={28}
              height={28}
              loading="lazy"
              decoding="async"
              className="w-7 h-7 rounded-lg"
            />
            <span className="font-bold text-base">{APP_NAME}</span>
            <span className="text-muted-foreground text-sm">
              &copy;&nbsp;{new Date().getFullYear()} 派立方
            </span>
          </div>

          {/* Powered By */}
          <div className="flex flex-col gap-2 text-xs text-muted-foreground/70">
            <p className="flex flex-wrap items-center justify-center gap-1.5">
              <span>Site powered by</span>
              <img
                src={APP_LOGO_URL}
                alt="PAIII Logo"
                width={14}
                height={14}
                loading="lazy"
                decoding="async"
                className="h-3.5 w-3.5 inline-block opacity-70"
              />
              <span>派立方提供站点与图库平台支持</span>
            </p>
            <p className="flex flex-wrap items-center justify-center gap-1.5">
              <span>CDN 支持来自</span>
              <img
                src={EDGEONE_LOGO_URL}
                alt="EdgeOne Logo"
                width={80}
                height={14}
                loading="lazy"
                decoding="async"
                className="h-3.5 w-auto inline-block opacity-70"
              />
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <a href="#changelog" className="hover:text-foreground transition-colors sm:hidden">
              更新日志
            </a>
            <a
              href="https://paiii.cn"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              派立方社区
              <ExternalLink className="w-2.5 h-2.5" aria-hidden />
            </a>
            <a
              href={appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              {APP_NAME}
              <ExternalLink className="w-2.5 h-2.5" aria-hidden />
            </a>
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              蜀ICP备2022012020号-4
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
