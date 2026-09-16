import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Code, Tag, Zap, Copy as CopyIcon } from 'lucide-react';
import { copyText } from '@/lib/helpers';
import { buildAppUrl } from '@/lib/url';

function CodeRow({
  label,
  code,
  onCopy,
}: {
  label?: string;
  code: string;
  onCopy: () => void;
}) {
  return (
    <div className="group flex flex-col gap-2.5 rounded-xl border-2 border-ink bg-white p-3.5 transition-colors hover:bg-brand-50/60 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        {label && (
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">{label}</p>
        )}
        <code className="block overflow-x-auto break-all text-sm text-foreground/85 font-mono leading-relaxed sm:whitespace-nowrap">
          {code}
        </code>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 justify-center card-button rounded-lg gap-1"
        onClick={onCopy}
      >
        <CopyIcon className="w-3 h-3" aria-hidden="true" />
        <span className="text-xs">复制</span>
      </Button>
    </div>
  );
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
    <section id="api" className="relative z-10 pb-16 sm:pb-20 px-4 sm:px-6">
      <div className="section-header reveal">
        <p className="section-eyebrow">
          <Code className="w-3.5 h-3.5" aria-hidden="true" />
          开发文档
        </p>
        {/* `/docs` 是独立路由，这一处是全页唯一的一级标题 */}
        <h1>API 文档</h1>
        <p>复制即可接入，支持直链、分类和 JSON 元数据返回</p>
      </div>

      <div className="reveal max-w-4xl mx-auto">
        <Tabs value={activeDocTab} onValueChange={setActiveDocTab}>
          <TabsList className="glass mb-6 grid h-auto min-h-[3rem] w-full grid-cols-2 gap-1 rounded-xl p-1.5 sm:grid-cols-4">
            <TabsTrigger
              value="basic"
              className="rounded-lg text-xs font-bold sm:text-sm px-2.5 py-2 data-[state=active]:bg-brand-50 data-[state=active]:text-brand-700 data-[state=active]:shadow-[2px_2px_0_0_var(--color-ink)] data-[state=inactive]:text-muted-foreground"
            >
              基础调用
            </TabsTrigger>
            <TabsTrigger
              value="params"
              className="rounded-lg text-xs font-bold sm:text-sm px-2.5 py-2 data-[state=active]:bg-brand-50 data-[state=active]:text-brand-700 data-[state=active]:shadow-[2px_2px_0_0_var(--color-ink)] data-[state=inactive]:text-muted-foreground"
            >
              分类参数
            </TabsTrigger>
            <TabsTrigger
              value="json"
              className="rounded-lg text-xs font-bold sm:text-sm px-2.5 py-2 data-[state=active]:bg-brand-50 data-[state=active]:text-brand-700 data-[state=active]:shadow-[2px_2px_0_0_var(--color-ink)] data-[state=inactive]:text-muted-foreground"
            >
              JSON 返回
            </TabsTrigger>
            <TabsTrigger
              value="advanced"
              className="rounded-lg text-xs font-bold sm:text-sm px-2.5 py-2 data-[state=active]:bg-brand-50 data-[state=active]:text-brand-700 data-[state=active]:shadow-[2px_2px_0_0_var(--color-ink)] data-[state=inactive]:text-muted-foreground"
            >
              高级用法
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-2 space-y-3">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink bg-brand-50">
                    <Code className="w-4 h-4 text-brand-500" aria-hidden="true" />
                  </div>
                  <div>
                    <span className="text-sm font-bold">基础调用</span>
                    <p className="text-xs text-muted-foreground">
                      默认返回 302 图片直链；追加 format=json 获取 JSON 元数据
                    </p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <CodeRow
                    label="API 地址（默认 302）"
                    code={randomApiUrl}
                    onCopy={() => copyCode(randomApiUrl)}
                  />
                  <CodeRow
                    label="HTML 使用示例"
                    code={`<img src="${randomApiUrl}" alt="随机图片" />`}
                    onCopy={() => copyCode(`<img src="${randomApiUrl}" alt="随机图片" />`)}
                  />
                  <CodeRow
                    label="Markdown 使用示例"
                    code={`![随机图片](${randomApiUrl})`}
                    onCopy={() => copyCode(`![随机图片](${randomApiUrl})`)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="params" className="mt-2">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink bg-iris-50">
                    <Tag className="w-4 h-4 text-iris-500" aria-hidden="true" />
                  </div>
                  <div>
                    <span className="text-sm font-bold">分类参数</span>
                    <p className="text-xs text-muted-foreground">
                      通过 tag 参数指定图片分类
                    </p>
                  </div>
                </div>
                <CodeRow
                  code={randomTagApiUrl}
                  onCopy={() => copyCode(randomTagApiUrl)}
                  />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="json" className="mt-2">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink bg-brand-50">
                    <Code className="w-4 h-4 text-brand-500" aria-hidden="true" />
                  </div>
                  <div>
                    <span className="text-sm font-bold">JSON 返回模式</span>
                    <p className="text-xs text-muted-foreground">
                      追加 format=json 返回 JSON 数据，包含图片 URL、标题、标签等
                    </p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <CodeRow
                    code={randomJsonApiUrl}
                    onCopy={() => copyCode(randomJsonApiUrl)}
                  />
                  <div className="rounded-xl overflow-hidden code-block">
                    <div className="code-block-header">
                      <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                        Response
                      </span>
                      <span className="text-[11px] text-emerald-400">application/json</span>
                    </div>
                    <div className="p-4">
                      <pre className="text-xs text-white/80 overflow-x-auto leading-relaxed">
{`{
  "id": "img-001",
  "url": "https://example.com/image.jpg",
  "title": "二次元插画",
  "tags": ["acg", "二次元"],
  "createdAt": "2025-01-15T08:00:00Z"
}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="mt-2">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink bg-emerald-50">
                    <Zap className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                  </div>
                  <div>
                    <span className="text-sm font-bold">高级用法</span>
                    <p className="text-xs text-muted-foreground">
                      JavaScript 与命令行调用示例
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden code-block">
                    <div className="code-block-header">
                      <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">
                        JavaScript
                      </span>
                    </div>
                    <div className="p-4">
                      <pre className="text-xs text-white/80 overflow-x-auto leading-relaxed">
{`fetch('/api/random?format=json')
  .then(r => r.json())
  .then(data => console.log(data.url))`}
                      </pre>
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden code-block">
                    <div className="code-block-header">
                      <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                        cURL
                      </span>
                    </div>
                    <div className="p-4">
                      <pre className="text-xs text-white/80 overflow-x-auto leading-relaxed">
{`curl ${randomApiUrl}`}
                      </pre>
                    </div>
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
