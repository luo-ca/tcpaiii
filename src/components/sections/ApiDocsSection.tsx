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
    <div className="group flex flex-col gap-2.5 p-3.5 bg-muted/35 rounded-xl border border-border/40 hover:bg-muted/55 transition-colors sm:flex-row sm:items-center sm:justify-between">
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
        <CopyIcon className="w-3 h-3" />
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
    <section id="api" className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 scroll-mt-20">
      <div className="section-header">
        <p className="section-eyebrow">
          <Code className="w-3.5 h-3.5" />
          开发文档
        </p>
        <h2>API 文档</h2>
        <p>复制即可接入，支持直链、分类和 JSON 元数据返回</p>
      </div>

      <div className="max-w-4xl mx-auto">
        <Tabs value={activeDocTab} onValueChange={setActiveDocTab}>
          <TabsList className="grid w-full h-auto grid-cols-2 sm:grid-cols-4 gap-1 glass rounded-xl p-1.5 min-h-[3rem] mb-6 border border-white/60">
            <TabsTrigger
              value="basic"
              className="rounded-lg text-xs sm:text-sm px-2.5 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:shadow-black/5"
            >
              基础调用
            </TabsTrigger>
            <TabsTrigger
              value="params"
              className="rounded-lg text-xs sm:text-sm px-2.5 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:shadow-black/5"
            >
              分类参数
            </TabsTrigger>
            <TabsTrigger
              value="json"
              className="rounded-lg text-xs sm:text-sm px-2.5 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:shadow-black/5"
            >
              JSON 返回
            </TabsTrigger>
            <TabsTrigger
              value="advanced"
              className="rounded-lg text-xs sm:text-sm px-2.5 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:shadow-black/5"
            >
              高级用法
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-2 space-y-3">
            <Card className="glass-strong rounded-2xl border-white/60">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Code className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold">基础调用</span>
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
            <Card className="glass-strong rounded-2xl border-white/60">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Tag className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold">分类参数</span>
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
            <Card className="glass-strong rounded-2xl border-white/60">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center">
                    <Code className="w-4 h-4 text-cyan-500" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold">JSON 返回模式</span>
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
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                        Response
                      </span>
                      <span className="text-[10px] text-emerald-400">application/json</span>
                    </div>
                    <div className="p-4">
                      <pre className="text-xs text-slate-300 overflow-x-auto leading-relaxed">
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
            <Card className="glass-strong rounded-2xl border-white/60">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold">高级用法</span>
                    <p className="text-xs text-muted-foreground">
                      JavaScript 与命令行调用示例
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden code-block">
                    <div className="code-block-header">
                      <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wider">
                        JavaScript
                      </span>
                    </div>
                    <div className="p-4">
                      <pre className="text-xs text-slate-300 overflow-x-auto leading-relaxed">
{`fetch('/api/random?format=json')
  .then(r => r.json())
  .then(data => console.log(data.url))`}
                      </pre>
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden code-block">
                    <div className="code-block-header">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                        cURL
                      </span>
                    </div>
                    <div className="p-4">
                      <pre className="text-xs text-slate-300 overflow-x-auto leading-relaxed">
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
