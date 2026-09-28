"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3, Download, FileText, ImagePlus, Pause, Play, Plus, RefreshCw, Sparkles, Trash2, Upload, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

type Shot = { id: number; title: string; shotType: string; description: string; dialogue: string; duration: number; approved: boolean; retries: number; seed: number };
type CharacterRef = { id: string; name: string; url: string };

declare global {
  interface Document {
    modelContext?: { registerTool: (tool: { name: string; title?: string; description: string; inputSchema: Record<string, unknown>; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute: (input: unknown) => unknown | Promise<unknown> }, options?: { signal?: AbortSignal }) => void | Promise<void> };
  }
}

const DEMO_SCRIPT = `雨夜，废弃地铁站。林野握着一张旧车票，沿着站台寻找失踪的妹妹。
广播突然响起：“末班车即将进站，请不要回头。”
林野停下脚步，玻璃倒影里却出现一个穿红色雨衣的小女孩。
女孩抬头：“哥哥，你迟到了三年。”
远处车灯亮起，林野冲向轨道，车票在手中燃烧成蓝色火焰。`;
const SHOT_TYPES = ["远景", "中景", "近景", "特写", "过肩", "低机位"];
const PALETTES = [["#10182f", "#274b69", "#f15b4f"], ["#1b1230", "#5c2f63", "#ffb45d"], ["#082d2a", "#17645b", "#c7f26b"], ["#2b1720", "#74394d", "#ff7b70"], ["#111827", "#38425f", "#73d4ff"]];

function parseScript(source: string): Shot[] {
  return source.split(/\n+|(?<=[。！？!?])\s*/).map((item) => item.trim()).filter(Boolean).slice(0, 12).map((segment, index) => {
    const quoted = segment.match(/[“\"]([^”\"]+)[”\"]/);
    const dialogue = quoted?.[1] ?? (segment.includes("：") ? segment.split("：").slice(1).join("：") : "");
    const clean = segment.replace(/[“\"][^”\"]+[”\"]/g, "").replace(/：\s*$/, "").trim();
    return { id: Date.now() + index, title: `镜头 ${String(index + 1).padStart(2, "0")}`, shotType: SHOT_TYPES[index % SHOT_TYPES.length], description: clean || segment, dialogue: dialogue.replace(/[。！？!?]$/, ""), duration: Math.max(3, Math.min(7, Math.ceil(segment.length / 11))), approved: false, retries: 0, seed: index };
  });
}

function downloadText(filename: string, content: string, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

function formatSrtTime(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")},000`;
}

export default function Home() {
  const [script, setScript] = useState(DEMO_SCRIPT);
  const [style, setStyle] = useState("电影感国漫");
  const [characters, setCharacters] = useState<CharacterRef[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [phase, setPhase] = useState<"input" | "generating" | "review">("input");
  const [generationProgress, setGenerationProgress] = useState(0);
  const [activeShot, setActiveShot] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const approvedCount = shots.filter((shot) => shot.approved).length;
  const totalDuration = shots.reduce((sum, shot) => sum + shot.duration, 0);
  const totalRetries = shots.reduce((sum, shot) => sum + shot.retries, 0);
  const acceptance = shots.length ? Math.round((approvedCount / shots.length) * 100) : 0;

  useEffect(() => {
    if (!startedAt || phase !== "review") return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase, startedAt]);

  useEffect(() => {
    if (!isPlaying || !shots.length) return;
    const timer = window.setTimeout(() => {
      if (activeShot >= shots.length - 1) { setIsPlaying(false); setActiveShot(0); }
      else setActiveShot((index) => index + 1);
    }, (shots[activeShot]?.duration || 3) * 1000);
    return () => window.clearTimeout(timer);
  }, [activeShot, isPlaying, shots]);

  const generateStoryboard = useCallback((source = script) => {
    if (!source.trim()) return;
    setStartedAt(Date.now()); setPhase("generating"); setGenerationProgress(8);
    let progress = 8;
    const timer = window.setInterval(() => {
      progress += Math.round(Math.random() * 18 + 8);
      if (progress >= 100) {
        window.clearInterval(timer); setGenerationProgress(100);
        window.setTimeout(() => { setShots(parseScript(source)); setPhase("review"); setActiveShot(0); }, 280);
      } else setGenerationProgress(progress);
    }, 220);
  }, [script]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({ name: "start_storyboard_generation", title: "生成漫剧分镜", description: "将一段已定稿的中文漫剧脚本放入工作台并开始拆解分镜。", inputSchema: { type: "object", properties: { script: { type: "string", minLength: 20 } }, required: ["script"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute(input) { const value = input as { script?: string }; if (!value.script || value.script.trim().length < 20) throw new Error("脚本至少需要20个字"); setScript(value.script); generateStoryboard(value.script); return { status: "generating", characters: value.script.length, mode: "local-prototype" }; } }, { signal: lifecycle.signal }));
    } catch { /* Unsupported WebMCP implementations do not block the app. */ }
    return () => lifecycle.abort();
  }, [generateStoryboard]);

  const palette = useMemo(() => PALETTES[(shots[activeShot]?.seed ?? 0) % PALETTES.length], [activeShot, shots]);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).slice(0, 3 - characters.length).map((file, index) => ({ id: `${file.name}-${file.lastModified}`, name: file.name.replace(/\.[^.]+$/, "") || `角色 ${characters.length + index + 1}`, url: URL.createObjectURL(file) }));
    setCharacters((current) => [...current, ...next].slice(0, 3));
  }
  function updateShot(id: number, patch: Partial<Shot>) { setShots((current) => current.map((shot) => shot.id === id ? { ...shot, ...patch } : shot)); }
  function exportProject() { downloadText("jingxu-storyboard.json", JSON.stringify({ product: "镜序 MVP", exportedAt: new Date().toISOString(), style, sourceScript: script, characters: characters.map(({ name }) => ({ name })), metrics: { totalDuration, approvedCount, totalRetries, elapsedSeconds: elapsed }, shots }, null, 2)); }
  function exportSrt() { let cursor = 0; downloadText("jingxu-subtitles.srt", shots.map((shot, index) => { const start = cursor; cursor += shot.duration; return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(cursor)}\n${shot.dialogue || shot.description}\n`; }).join("\n"), "text/plain;charset=utf-8"); }

  return <main className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/92 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-7">
        <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><WandSparkles className="h-4.5 w-4.5" /></div><div><div className="flex items-center gap-2"><span className="text-[1.05rem] font-semibold tracking-[-0.03em]">镜序</span><Badge variant="secondary" className="rounded-md px-1.5 py-0 text-[11px] font-medium">MVP</Badge></div><p className="text-xs text-muted-foreground">单集分镜粗剪工作台</p></div></div>
        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex"><span className={`step-pill ${phase === "input" ? "is-active" : "is-done"}`}><b>1</b> 输入</span><span className="h-px w-5 bg-border" /><span className={`step-pill ${phase === "generating" ? "is-active" : phase === "review" ? "is-done" : ""}`}><b>2</b> AI拆镜</span><span className="h-px w-5 bg-border" /><span className={`step-pill ${phase === "review" ? "is-active" : ""}`}><b>3</b> 确认导出</span></div>
        {phase === "review" ? <Button variant="outline" size="sm" onClick={() => { setPhase("input"); setIsPlaying(false); }}><ChevronLeft className="h-4 w-4" /> 返回输入</Button> : <div className="w-20" />}
      </div>
    </header>

    {phase === "input" && <section className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_380px] sm:px-7 sm:py-8">
      <div className="workspace-card min-h-[calc(100vh-8rem)] p-5 sm:p-7">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">新建单集</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">从定稿脚本开始</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">粘贴30–60秒脚本。系统将拆成可独立确认的镜头，不改写剧情。</p></div><button className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => setScript(DEMO_SCRIPT)}>载入示例</button></div>
        <div className="relative"><Textarea value={script} onChange={(event) => setScript(event.target.value)} aria-label="漫剧脚本" className="min-h-[390px] resize-none rounded-2xl border-border/80 bg-white p-5 text-[1rem] leading-8 shadow-inner sm:min-h-[460px]" placeholder="粘贴已经定稿的脚本……" /><div className="absolute bottom-4 right-4 rounded-lg border bg-white/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">{script.length} 字 · 预计 {Math.max(1, Math.ceil(script.length / 85))} 分钟</div></div>
        <div className="mt-5 flex flex-col justify-between gap-3 border-t border-dashed pt-5 sm:flex-row sm:items-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><FileText className="h-4 w-4" /><span>建议300–800字，角色不超过3人</span></div><Button size="lg" className="h-12 rounded-xl px-7" disabled={script.trim().length < 20} onClick={() => generateStoryboard()}><Sparkles className="h-4 w-4" /> 生成分镜粗剪</Button></div>
      </div>
      <aside className="space-y-6">
        <div className="workspace-card p-5"><div className="mb-4 flex items-center justify-between"><div><p className="eyebrow">角色参考</p><h2 className="mt-1 text-lg font-semibold">固定主要角色</h2></div><span className="text-xs text-muted-foreground">{characters.length}/3</span></div><input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} />
          {characters.length === 0 ? <button className="upload-zone" onClick={() => fileInput.current?.click()}><span className="grid h-11 w-11 place-items-center rounded-xl bg-secondary"><ImagePlus className="h-5 w-5" /></span><span className="font-medium">上传角色参考图</span><span className="text-xs text-muted-foreground">JPG / PNG，最多3张</span></button> : <div className="grid grid-cols-3 gap-2">{characters.map((character) => <div key={character.id} className="group relative overflow-hidden rounded-xl border bg-secondary"><img src={character.url} alt={character.name} className="aspect-[3/4] w-full object-cover" /><button aria-label={`移除${character.name}`} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white opacity-0 transition group-hover:opacity-100" onClick={() => setCharacters((current) => current.filter((item) => item.id !== character.id))}><X className="h-3.5 w-3.5" /></button></div>)}{characters.length < 3 && <button className="grid aspect-[3/4] place-items-center rounded-xl border border-dashed text-muted-foreground hover:bg-secondary" onClick={() => fileInput.current?.click()}><Plus className="h-5 w-5" /></button>}</div>}
        </div>
        <div className="workspace-card p-5"><p className="eyebrow">画面模板</p><div className="mt-3 grid gap-2">{["电影感国漫", "赛璐璐动画", "暗黑悬疑"].map((item, index) => <button key={item} onClick={() => setStyle(item)} className={`style-option ${style === item ? "is-selected" : ""}`}><span className={`style-swatch swatch-${index + 1}`} /><span className="text-left"><b>{item}</b><small>{index === 0 ? "强光影 · 叙事镜头" : index === 1 ? "清晰线稿 · 高饱和" : "低照度 · 冷色调"}</small></span>{style === item && <Check className="ml-auto h-4 w-4" />}</button>)}</div></div>
        <p className="rounded-2xl bg-secondary/75 px-4 py-3 text-xs leading-5 text-muted-foreground">演示模式：当前版本使用本地拆镜与视觉占位引擎，不上传脚本和参考图，也不消耗模型额度。</p>
      </aside>
    </section>}

    {phase === "generating" && <section className="grid min-h-[calc(100vh-4rem)] place-items-center px-4"><div className="w-full max-w-xl text-center"><div className="relative mx-auto mb-8 grid h-24 w-24 place-items-center rounded-[2rem] bg-primary text-primary-foreground shadow-[0_22px_60px_rgba(21,31,50,.22)]"><Sparkles className="h-8 w-8 animate-pulse" /><span className="absolute -right-2 -top-2 h-5 w-5 animate-ping rounded-full bg-accent" /></div><p className="eyebrow">正在建立镜头序列</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">先拆剧情，再组织画面</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">识别角色、对白和场景关系，生成可独立修改的镜头卡。</p><Progress value={generationProgress} className="mt-8 h-2" /><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>本地处理，不上传素材</span><span>{Math.min(100, generationProgress)}%</span></div></div></section>}

    {phase === "review" && shots.length > 0 && <section className="mx-auto grid max-w-[1600px] gap-5 px-4 py-5 xl:grid-cols-[minmax(640px,1fr)_390px] sm:px-6">
      <div className="min-w-0"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">分镜确认</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">逐镜保留真正可用的画面</h1></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setShots((current) => current.map((shot) => ({ ...shot, approved: true })))}><Check className="h-4 w-4" />全部通过</Button><Button variant="outline" size="sm" onClick={() => setShots((current) => [...current, { id: Date.now(), title: `镜头 ${String(current.length + 1).padStart(2, "0")}`, shotType: "中景", description: "补充镜头描述", dialogue: "", duration: 4, approved: false, retries: 0, seed: current.length }])}><Plus className="h-4 w-4" />补镜头</Button></div></div>
        <div className="grid gap-3 md:grid-cols-2">{shots.map((shot, index) => { const colors = PALETTES[shot.seed % PALETTES.length]; return <article key={shot.id} className={`shot-card ${shot.approved ? "is-approved" : ""}`}><div className="shot-visual" style={{ background: `linear-gradient(145deg, ${colors[0]}, ${colors[1]} 62%, ${colors[2]})` }}>{characters[0] ? <img src={characters[index % characters.length].url} alt="角色参考" className="h-full w-full object-cover opacity-65 mix-blend-luminosity" /> : <div className="shot-number">{String(index + 1).padStart(2, "0")}</div>}<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" /><Badge className="absolute left-3 top-3 border-white/15 bg-black/35 text-white backdrop-blur">{shot.shotType}</Badge><span className="absolute bottom-3 right-3 rounded-md bg-black/45 px-2 py-1 text-xs text-white/85">{shot.duration}s</span></div><div className="p-4"><div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-semibold">{shot.title}</h2>{shot.retries > 0 && <span className="text-xs text-muted-foreground">已重做 {shot.retries} 次</span>}</div><Textarea value={shot.description} onChange={(event) => updateShot(shot.id, { description: event.target.value, approved: false })} className="min-h-20 resize-none border-0 bg-secondary/70 p-3 text-sm leading-6 shadow-none focus-visible:ring-1" aria-label={`${shot.title}画面描述`} />{shot.dialogue && <p className="mt-2 rounded-lg border-l-2 border-accent bg-accent/8 px-3 py-2 text-sm text-foreground/80">“{shot.dialogue}”</p>}<div className="mt-3 flex items-center justify-between gap-2"><Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShots((current) => current.filter((item) => item.id !== shot.id))}><Trash2 className="h-3.5 w-3.5" />删除</Button><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => updateShot(shot.id, { retries: shot.retries + 1, seed: shot.seed + 1, approved: false })}><RefreshCw className="h-3.5 w-3.5" />重做</Button><Button size="sm" variant={shot.approved ? "secondary" : "default"} onClick={() => updateShot(shot.id, { approved: !shot.approved })}>{shot.approved ? <><Check className="h-3.5 w-3.5" />已通过</> : "保留镜头"}</Button></div></div></div></article>; })}</div>
      </div>
      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start"><div className="workspace-card overflow-hidden"><div className="flex items-center justify-between border-b px-5 py-4"><div><p className="eyebrow">粗剪预览</p><h2 className="mt-1 font-semibold">{shots[activeShot]?.title}</h2></div><Badge variant="secondary">{style}</Badge></div><div className="relative aspect-[9/12] overflow-hidden bg-black" style={{ background: `linear-gradient(150deg, ${palette[0]}, ${palette[1]} 58%, ${palette[2]})` }}>{characters.length > 0 && <img src={characters[activeShot % characters.length].url} alt="粗剪角色预览" className={`h-full w-full object-cover opacity-60 mix-blend-luminosity ${isPlaying ? "preview-motion" : ""}`} />}<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />{!characters.length && <div className={`preview-mark ${isPlaying ? "preview-motion" : ""}`}>{String(activeShot + 1).padStart(2, "0")}</div>}<div className="absolute inset-x-5 bottom-7 text-center text-white"><p className="text-lg font-semibold leading-7 drop-shadow-md">{shots[activeShot]?.dialogue || shots[activeShot]?.description}</p></div></div><div className="flex items-center justify-between px-4 py-3"><Button variant="ghost" size="icon" aria-label="上一镜头" disabled={activeShot === 0} onClick={() => setActiveShot((index) => Math.max(0, index - 1))}><ChevronLeft /></Button><Button size="icon" className="h-11 w-11 rounded-full" aria-label={isPlaying ? "暂停" : "播放粗剪"} onClick={() => setIsPlaying((value) => !value)}>{isPlaying ? <Pause /> : <Play className="ml-0.5" />}</Button><Button variant="ghost" size="icon" aria-label="下一镜头" disabled={activeShot === shots.length - 1} onClick={() => setActiveShot((index) => Math.min(shots.length - 1, index + 1))}><ChevronRight /></Button></div><div className="flex gap-1 px-4 pb-4">{shots.map((shot, index) => <button key={shot.id} aria-label={`查看${shot.title}`} onClick={() => { setActiveShot(index); setIsPlaying(false); }} className={`h-1.5 flex-1 rounded-full ${index === activeShot ? "bg-primary" : shot.approved ? "bg-accent" : "bg-border"}`} />)}</div></div>
        <div className="workspace-card p-5"><div className="grid grid-cols-3 gap-2 text-center"><Metric label="通过率" value={`${acceptance}%`} /><Metric label="总时长" value={`${totalDuration}s`} /><Metric label="重做" value={`${totalRetries}次`} /></div><div className="mt-5"><div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>{approvedCount}/{shots.length} 个镜头已确认</span><span>{acceptance}%</span></div><Progress value={acceptance} className="h-2" /></div><div className="mt-4 flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" /><span>本次确认已用 {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span></div></div>
        <div className="workspace-card p-5"><h2 className="font-semibold">导出可编辑结果</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">项目包保留脚本、镜头描述、确认状态与验证数据。</p><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"><Button onClick={exportProject} disabled={!approvedCount}><Download className="h-4 w-4" />导出项目包</Button><Button variant="outline" onClick={exportSrt}><Upload className="h-4 w-4" />导出字幕</Button></div>{!approvedCount && <p className="mt-3 text-xs text-muted-foreground">至少保留一个镜头后即可导出。</p>}</div>
      </aside>
    </section>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-secondary/75 px-2 py-3"><strong className="block text-lg tracking-tight">{value}</strong><span className="text-xs text-muted-foreground">{label}</span></div>; }
