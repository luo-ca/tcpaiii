import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Code, Copy as CopyIcon, Database, ExternalLink, Globe, Shield, Tag, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';

const APP_FALLBACK_DOMAIN = 'https://t.paiii.cn';
const EDGEONE_PREVIEW_QUERY_KEYS = ['eo_token', 'eo_time'] as const;

function getAppOrigin(): string {
  if (typeof window === 'undefined') return APP_FALLBACK_DOMAIN;
  return window.location.origin;
}

function appendCurrentPreviewParams(url: URL): URL {
  if (typeof window === 'undefined') return url;

  const currentParams = new URLSearchParams(window.location.search);
  for (const key of EDGEONE_PREVIEW_QUERY_KEYS) {
    const value = currentParams.get(key);
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

function buildAppUrl(path: string): string {
  const url = new URL(path, getAppOrigin());
  return appendCurrentPreviewParams(url).toString();
}

async function copyText(text: string, successMessage = 'Copied to clipboard') {
  try {
    await copyToClipboard(text);
    toast.success(successMessage);
  } catch {
    toast.error('Copy failed. Please copy manually.');
  }
}

export function ApiDocsSection() {
  const [activeDocTab, setActiveDocTab] = useState('basic');
  const randomApiUrl = buildAppUrl('/api/random');
  const randomTagApiUrl = buildAppUrl('/api/random?tag=acg');
  const randomJsonApiUrl = buildAppUrl('/api/random?format=json');

  const copyCode = async (text: string) => {
    await copyText(text);
  };

  return (
    <section id="api" className="relative z-10 py-16 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header animate-slide-up">
        <h2>API Docs</h2>
        <p>Just a few steps to integrate quickly</p>
      </div>

      <div className="max-w-4xl mx-auto">
        <Tabs value={activeDocTab} onValueChange={setActiveDocTab}>
          <TabsList className="grid w-full h-auto grid-cols-2 sm:grid-cols-4 gap-1 glass rounded-xl p-1 sm:p-1.5 min-h-[2.75rem] mb-6">
            <TabsTrigger value="basic" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">Basic</TabsTrigger>
            <TabsTrigger value="params" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">Tags</TabsTrigger>
            <TabsTrigger value="json" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">JSON</TabsTrigger>
            <TabsTrigger value="advanced" className="rounded-lg text-xs sm:text-sm px-2 py-2 sm:px-3">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-6 space-y-3">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Code className="w-5 h-5 text-blue-500" />
                  <span className="text-sm font-medium">Basic Request</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Returns a 302 image redirect by default. Add `format=json` for metadata.</p>

                <div className="space-y-2">
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">API URL</p>
                      <code className="block overflow-x-auto break-all text-sm text-foreground sm:whitespace-nowrap">{randomApiUrl}</code>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(randomApiUrl)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">Copy</span>
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">HTML example</p>
                      <code className="block overflow-x-auto whitespace-nowrap text-xs text-foreground">{`<img src="${randomApiUrl}" alt="random image" />`}</code>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(`<img src="${randomApiUrl}" alt="random image" />`)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">Copy</span>
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-1">Markdown example</p>
                      <code className="block overflow-x-auto whitespace-nowrap text-xs text-foreground">{`![random image](${randomApiUrl})`}</code>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(`![random image](${randomApiUrl})`)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">Copy</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="params" className="mt-6">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-5 h-5 text-indigo-500" />
                  <span className="text-sm font-medium">Tag Filter</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Use the `tag` query parameter to constrain the random source.</p>
                <div className="space-y-2">
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg sm:flex-row sm:items-center sm:justify-between">
                    <code className="overflow-x-auto whitespace-nowrap text-sm text-foreground">{randomTagApiUrl}</code>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(randomTagApiUrl)}>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span className="ml-1 text-xs">Copy</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="json" className="mt-6">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Code className="w-5 h-5 text-cyan-500" />
                  <span className="text-sm font-medium">JSON Response</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Add `format=json` to receive metadata instead of a redirect.</p>
                <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-lg mb-3 sm:flex-row sm:items-center sm:justify-between">
                  <code className="overflow-x-auto whitespace-nowrap text-sm text-foreground">{randomJsonApiUrl}</code>
                  <Button variant="ghost" size="sm" className="h-7 shrink-0 justify-center card-button" onClick={() => copyCode(randomJsonApiUrl)}>
                    <CopyIcon className="w-3.5 h-3.5" />
                    <span className="ml-1 text-xs">Copy</span>
                  </Button>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg">
                  <pre className="text-xs text-foreground overflow-x-auto">
{`{
  "id": "img-001",
  "url": "https://example.com/image.jpg",
  "title": "Sample image",
  "tags": ["acg", "illustration"],
  "createdAt": "2025-01-15T08:00:00Z"
}`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="mt-6">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm font-medium">Advanced Usage</span>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-muted/40 rounded-lg">
                    <p className="text-muted-foreground mb-1">JavaScript example</p>
                    <pre className="text-foreground overflow-x-auto">
{`fetch('/api/random?format=json')
  .then(r => r.json())
  .then(data => console.log(data.url))`}
                    </pre>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg">
                    <p className="text-muted-foreground mb-1">CLI example</p>
                    <pre className="text-foreground overflow-x-auto">
{`curl ${randomApiUrl}`}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <section className="py-2">
      <ApiDocsSection />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-2">
        <div className="p-6 rounded-2xl glass-strong">
          <h3 className="font-semibold text-base mb-5 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            Security and Performance
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: Shield, title: 'URL Validation', desc: 'Incoming image links are validated before they enter the gallery.' },
              { icon: Database, title: 'Deduplication', desc: 'Duplicate image URLs are rejected automatically.' },
              { icon: Zap, title: 'Edge Execution', desc: 'Requests are handled close to users for low latency delivery.' },
              { icon: Globe, title: 'KV Storage', desc: 'Image metadata is stored at the edge for fast lookups.' },
              { icon: Code, title: 'CORS Ready', desc: 'API endpoints can be called directly from browser clients.' },
              { icon: ExternalLink, title: '302 Redirect', desc: 'Redirect mode stays lightweight for direct image embedding.' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0 mt-0.5">
                  <item.icon className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/90">{item.title}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
