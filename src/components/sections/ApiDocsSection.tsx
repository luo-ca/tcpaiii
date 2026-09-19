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
    <div className="group flex flex-col gap-2.5 rounded-xl border border-border bg-white p-3.5 transition-colors hover:bg-brand-50 sm:flex-row sm:items-center sm:justify-between">
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
        className="h-7 shrink-0 justify-center card-button gap-1"
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
  const randomExcludeApiUrl = buildAppUrl('/api/random?exclude=img-001');

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
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-iris-50">
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
                <div className="mt-4 rounded-xl border border-border bg-secondary px-4 py-3">
                  <p className="text-xs font-bold text-foreground">exclude=&lt;id&gt; 跳过上一张</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    「换一张」场景带上刚拿到的图片 id，只要该分类还有别的图就不会撞回同一张；
                    分类里只剩这一张时仍会返回它（不会报错）。搭配 format=json 拿 id，302 模式同样支持。
                  </p>
                  <div className="mt-2">
                    <CodeRow
                      code={randomExcludeApiUrl}
                      onCopy={() => copyCode(randomExcludeApiUrl)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="json" className="mt-2">
            <Card className="glass-strong rounded-2xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
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
                  <div className="code-block">
                    <div className="code-block-header">
                      <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
                        Response
                      </span>
                      <span className="text-[11px] text-success-bright">application/json</span>
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-soft">
                    <Zap className="w-4 h-4 text-success-ink" aria-hidden="true" />
                  </div>
                  <div>
                    <span className="text-sm font-bold">高级用法</span>
                    <p className="text-xs text-muted-foreground">
                      JavaScript 与命令行调用示例
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="code-block">
                    <div className="code-block-header">
                      <span className="text-[11px] font-medium text-warning-bright uppercase tracking-wider">
                        JavaScript
                      </span>
                    </div>
                    <div className="p-4">
                      <pre className="text-xs text-white/80 overflow-x-auto leading-relaxed">
{`fetch('${randomJsonApiUrl}')
  .then(r => r.json())
  .then(data => console.log(data.url))`}
                      </pre>
                    </div>
                  </div>
                  <div className="code-block">
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
                  {/* 限流契约：按 dispatcher 的实际实现如实写，脚本撞上 429 时
                      知道是预期内的节流而不是服务故障 */}
                  <div className="rounded-xl border border-border bg-secondary px-4 py-3">
                    <p className="text-xs font-bold text-foreground">速率限制</p>
                    <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-muted-foreground">
                      <li>
                        <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-foreground">/api/random</code>
                        {' '}每个边缘节点约 100 次/秒；超限返回
                        <code className="ml-1 rounded bg-white px-1 py-0.5 font-mono text-[11px] text-foreground">429</code>
                        ，响应头带 <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-foreground">Retry-After: 1</code>，按一秒间隔重试即可。
                      </li>
                      <li>
                        管理接口密钥校验失败按来源 IP 节流：每分钟 20 次，超过后即使换对密钥也会临时返回 429。
                      </li>
                      <li>图片直链（302 跳转后的 CDN 取图）不计入以上限制，可放心用作页面热链。</li>
                    </ul>
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
