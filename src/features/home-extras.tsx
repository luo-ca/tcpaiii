import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, Mail, MessageSquare } from 'lucide-react';

function ImageSubmission() {
  return (
    <section id="contribute" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header animate-slide-up">
        <h2>Contribute Images</h2>
        <p>Contribute high-quality images and help grow the gallery.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <Card className="glass-strong rounded-2xl hover-lift">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">QQ Contact</h3>
                <p className="text-xs text-muted-foreground">Add QQ to submit image resources directly.</p>
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <code className="text-sm font-medium">2553256126</code>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-strong rounded-2xl hover-lift">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Community Post</h3>
                <p className="text-xs text-muted-foreground">Submit through the PAIII community forum.</p>
              </div>
            </div>
            <div className="text-center">
              <Button size="sm" className="gradient-button rounded-full border-0 text-white text-xs h-8" asChild>
                <a href="https://www.paiii.cn/bbs/9" target="_blank" rel="noreferrer">
                  Go to submission
                  <ChevronRight className="w-3 h-3 ml-1" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Changelog() {
  const updates = [
    {
      date: '2026-04-29',
      title: 'Pages and gallery upgrade',
      items: [
        'Migrated image APIs to EdgeOne Pages Functions and KV-backed storage.',
        'Added gallery browsing, search, tag filters, and live preview.',
        'Improved pagination with jump controls and per-page selection.',
        'Optimized cache strategy, nearby-page prefetching, and image loading.',
      ],
    },
    {
      date: '2025-06-15',
      title: 'Docs and showcase updates',
      items: [
        'Added a dedicated changelog section on the homepage.',
        'Expanded API docs with category usage, list data details, and JSON examples.',
        'Introduced live statistics and recent activity trend charts.',
        'Refined layout details and general rendering performance.',
      ],
    },
    {
      date: '2025-04-10',
      title: 'API contract refresh',
      items: [
        'Unified category access on `api/random?tag=xx` while keeping legacy compatibility.',
        'JSON responses now include id, url, title, tags, createdAt, and rolling request stats.',
      ],
    },
  ];

  return (
    <section id="changelog" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header animate-slide-up">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass text-sm text-muted-foreground mb-4">
          <span className="text-xs text-muted-foreground">CHANGELOG</span>
        </div>
        <h2>Release Notes</h2>
        <p>Recent adjustments to the site experience and API behavior.</p>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {updates.map((update, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-primary mt-1.5 ring-4 ring-background" />
              {i < updates.length - 1 && <div className="w-px h-full bg-border mt-2" />}
            </div>
            <Card className="glass rounded-2xl flex-1 hover-lift">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-blue-500 font-mono font-medium">{update.date}</span>
                  <span className="text-sm font-semibold">{update.title}</span>
                </div>
                <ul className="space-y-1.5">
                  {update.items.map((item, j) => (
                    <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1.5 shrink-0 select-none">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HomeExtras() {
  return (
    <>
      <ImageSubmission />
      <Changelog />
    </>
  );
}
