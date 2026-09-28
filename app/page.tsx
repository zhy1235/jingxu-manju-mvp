"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Film, ImagePlus, LoaderCircle, Play, RefreshCw, Scissors, ShieldCheck, Sparkles, Upload, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

type Status = "idle" | "cutting" | "ready" | "rendering" | "done" | "error";
type Motion = "push" | "float" | "slide";
type SceneKey = "rain" | "sunset" | "neon" | "paper";
type Scene = { key: SceneKey; name: string; note: string; colors: [string, string, string] };

const SCENES: Scene[] = [
  { key: "rain", name: "雨夜站台", note: "冷色 · 悬疑", colors: ["#071523", "#244963", "#7f2035"] },
  { key: "sunset", name: "落日天台", note: "暖色 · 情绪", colors: ["#2b2446", "#b64f60", "#f3b35d"] },
  { key: "neon", name: "霓虹街区", note: "高反差 · 都市", colors: ["#090e24", "#3b1a68", "#04c9ba"] },
  { key: "paper", name: "水墨留白", note: "素雅 · 独白", colors: ["#e8e2d6", "#aeb8b2", "#46595a"] },
];
const DEFAULT_PROMPT = "角色在雨夜站台缓慢回头，镜头向前推进，风吹动衣角。";
const DEFAULT_SUBTITLE = "末班车即将进站，请不要回头。";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败，请换一张图片重试。"));
    image.src = src;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []; let line = "";
  for (const character of text) {
    const candidate = line + character;
    if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = character; } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawFrame(ctx: CanvasRenderingContext2D, width: number, height: number, progress: number, scene: Scene, motion: Motion, subtitle: string, prompt: string, character: HTMLImageElement | null, background: HTMLImageElement | null) {
  ctx.clearRect(0, 0, width, height);
  if (background) {
    const scale = Math.max(width / background.width, height / background.height) * (1.03 + progress * 0.04);
    const w = background.width * scale; const h = background.height * scale;
    ctx.drawImage(background, (width - w) / 2, (height - h) / 2, w, h);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, scene.colors[0]); gradient.addColorStop(0.58, scene.colors[1]); gradient.addColorStop(1, scene.colors[2]);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  }
  const vignette = ctx.createRadialGradient(width / 2, height * 0.43, height * 0.1, width / 2, height / 2, height * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, scene.key === "paper" ? "rgba(20,25,25,.2)" : "rgba(0,0,0,.64)");
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  if (scene.key === "rain") {
    ctx.strokeStyle = "rgba(210,235,255,.22)"; ctx.lineWidth = 2;
    for (let i = 0; i < 44; i += 1) { const x = ((i * 97 + progress * 540) % (width + 100)) - 50; const y = ((i * 173 + progress * 1280) % (height + 100)) - 50; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 13, y + 42); ctx.stroke(); }
  }
  if (character) {
    const baseScale = Math.min((width * 0.92) / character.width, (height * 0.76) / character.height);
    const push = motion === "push" ? 1 + progress * 0.1 : 1.04;
    const floatY = motion === "float" ? Math.sin(progress * Math.PI * 2) * 18 : 0;
    const slideX = motion === "slide" ? (progress - 0.5) * 74 : 0;
    const characterWidth = character.width * baseScale * push; const characterHeight = character.height * baseScale * push;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.38)"; ctx.shadowBlur = 34; ctx.shadowOffsetY = 18;
    ctx.drawImage(character, (width - characterWidth) / 2 + slideX, height - characterHeight - height * 0.09 + floatY, characterWidth, characterHeight); ctx.restore();
  }
  const fade = Math.min(1, progress * 5, (1 - progress) * 8);
  const overlay = ctx.createLinearGradient(0, height * 0.56, 0, height); overlay.addColorStop(0, "rgba(0,0,0,0)"); overlay.addColorStop(1, "rgba(0,0,0,.78)");
  ctx.fillStyle = overlay; ctx.fillRect(0, height * 0.52, width, height * 0.48);
  ctx.globalAlpha = Math.max(0, fade); ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.68)"; ctx.font = "500 22px Microsoft YaHei, sans-serif"; ctx.fillText(prompt.slice(0, 32), width / 2, height - 176);
  ctx.fillStyle = "#ffffff"; ctx.font = "700 38px Microsoft YaHei, sans-serif"; ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 8;
  wrapText(ctx, subtitle || prompt, width - 110).forEach((line, index) => ctx.fillText(line, width / 2, height - 105 + index * 48));
  ctx.shadowBlur = 0; ctx.globalAlpha = 1; roundedRect(ctx, 28, 30, 116, 42, 21); ctx.fillStyle = "rgba(8,14,26,.52)"; ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.font = "600 20px Microsoft YaHei, sans-serif"; ctx.fillText("镜序 · 试片", 86, 58);
}

export default function Home() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState(""); const [cutoutUrl, setCutoutUrl] = useState(""); const [backgroundUrl, setBackgroundUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState(""); const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [sceneKey, setSceneKey] = useState<SceneKey>("rain"); const [motion, setMotion] = useState<Motion>("push"); const [duration, setDuration] = useState(4);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT); const [subtitle, setSubtitle] = useState(DEFAULT_SUBTITLE);
  const [status, setStatus] = useState<Status>("idle"); const [progress, setProgress] = useState(0); const [message, setMessage] = useState("上传一张角色图开始"); const [previewTime, setPreviewTime] = useState(0.28);
  const fileInput = useRef<HTMLInputElement>(null); const backgroundInput = useRef<HTMLInputElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useMemo(() => SCENES.find((item) => item.key === sceneKey) ?? SCENES[0], [sceneKey]); const activeCharacterUrl = cutoutUrl || sourceUrl;

  const paintPreview = useCallback(async () => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const [character, background] = await Promise.all([activeCharacterUrl ? loadImage(activeCharacterUrl).catch(() => null) : Promise.resolve(null), backgroundUrl ? loadImage(backgroundUrl).catch(() => null) : Promise.resolve(null)]);
    drawFrame(ctx, canvas.width, canvas.height, previewTime, scene, motion, subtitle, prompt, character, background);
  }, [activeCharacterUrl, backgroundUrl, motion, previewTime, prompt, scene, subtitle]);
  useEffect(() => { void paintPreview(); }, [paintPreview]);

  function resetResult() {
    if (videoUrl) URL.revokeObjectURL(videoUrl); setVideoUrl(""); setVideoBlob(null); setStatus(cutoutUrl ? "ready" : "idle"); setProgress(0);
  }
  function chooseCharacter(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl); if (cutoutUrl) URL.revokeObjectURL(cutoutUrl); if (videoUrl) URL.revokeObjectURL(videoUrl);
    setSourceFile(file); setSourceUrl(URL.createObjectURL(file)); setCutoutUrl(""); setVideoUrl(""); setVideoBlob(null); setStatus("idle"); setProgress(0); setMessage("图片已就绪，可以智能抠图");
  }
  function chooseBackground(file?: File) { if (!file || !file.type.startsWith("image/")) return; if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); setBackgroundUrl(URL.createObjectURL(file)); resetResult(); }

  async function removeImageBackground() {
    if (!sourceFile) throw new Error("请先上传角色图片。");
    setStatus("cutting"); setProgress(4); setMessage("首次使用正在下载抠图模型，请稍候…");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const result = await removeBackground(sourceFile, { output: { format: "image/png", quality: 1 }, progress: (_key: string, current: number, total: number) => setProgress(Math.min(94, total > 0 ? Math.round((current / total) * 86) + 8 : 12)) });
      if (cutoutUrl) URL.revokeObjectURL(cutoutUrl); const nextUrl = URL.createObjectURL(result); setCutoutUrl(nextUrl); setStatus("ready"); setProgress(100); setMessage("抠图完成，可生成动态短片"); return nextUrl;
    } catch (error) { setStatus("error"); setProgress(0); setMessage(`抠图失败：${error instanceof Error ? error.message : "未知错误"}`); throw error; }
  }

  async function renderVideo() {
    if (!sourceFile) { setMessage("请先上传一张角色图片"); return; }
    let characterUrl = cutoutUrl;
    try {
      if (!characterUrl) characterUrl = await removeImageBackground();
      const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) throw new Error("画布初始化失败");
      if (!("MediaRecorder" in window) || !canvas.captureStream) throw new Error("当前浏览器不支持视频导出，请使用最新版 Chrome 或 Edge。");
      setStatus("rendering"); setProgress(1); setMessage(`正在生成 ${duration} 秒动态短片…`); if (videoUrl) URL.revokeObjectURL(videoUrl); setVideoUrl(""); setVideoBlob(null);
      const [character, background] = await Promise.all([loadImage(characterUrl), backgroundUrl ? loadImage(backgroundUrl) : Promise.resolve(null)]);
      const stream = canvas.captureStream(30); const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 }); const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      const completed = new Promise<Blob>((resolve, reject) => { recorder.onerror = () => reject(new Error("视频编码失败")); recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType })); });
      recorder.start(250); const start = performance.now();
      await new Promise<void>((resolve) => { const frame = (now: number) => { const frameProgress = Math.min(1, (now - start) / (duration * 1000)); drawFrame(ctx, canvas.width, canvas.height, frameProgress, scene, motion, subtitle, prompt, character, background); setProgress(Math.max(2, Math.round(frameProgress * 98))); if (frameProgress < 1) requestAnimationFrame(frame); else resolve(); }; requestAnimationFrame(frame); });
      await new Promise((resolve) => window.setTimeout(resolve, 180)); recorder.stop(); stream.getTracks().forEach((track) => track.stop());
      const result = await completed; const nextUrl = URL.createObjectURL(result); setVideoBlob(result); setVideoUrl(nextUrl); setStatus("done"); setProgress(100); setMessage("短片生成完成，已可预览和下载");
    } catch (error) { setStatus("error"); setProgress(0); setMessage(error instanceof Error ? error.message : "生成失败，请重试"); }
  }
  function downloadVideo() { if (!videoUrl || !videoBlob) return; const anchor = document.createElement("a"); anchor.href = videoUrl; anchor.download = `jingxu-shot-${Date.now()}.webm`; anchor.click(); }

  const busy = status === "cutting" || status === "rendering"; const step = !sourceFile ? 1 : !cutoutUrl ? 2 : !videoUrl ? 3 : 4;
  return <main className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/92 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1540px] items-center justify-between px-4 sm:px-7">
      <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><WandSparkles className="h-[18px] w-[18px]" /></div><div><div className="flex items-center gap-2"><span className="text-[1.05rem] font-semibold tracking-[-0.03em]">镜序</span><Badge variant="secondary" className="rounded-md px-1.5 py-0 text-[11px] font-medium">可用 MVP</Badge></div><p className="text-xs text-muted-foreground">单镜动态短片工作台</p></div></div>
      <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">{["上传", "抠图", "合成", "下载"].map((label, index) => <div key={label} className="flex items-center gap-2"><span className={`flow-step ${step === index + 1 ? "is-active" : step > index + 1 ? "is-done" : ""}`}><b>{step > index + 1 ? <Check className="h-3 w-3" /> : index + 1}</b>{label}</span>{index < 3 && <span className="h-px w-6 bg-border" />}</div>)}</div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-emerald-600" /><span className="hidden sm:inline">本地处理 · 不消耗 API</span></div>
    </div></header>
    <section className="mx-auto grid max-w-[1540px] gap-5 px-4 py-5 lg:grid-cols-[380px_minmax(360px,1fr)_360px] sm:px-6 sm:py-6">
      <aside className="space-y-4">
        <div className="workspace-card p-5"><div className="mb-4 flex items-center justify-between"><div><p className="eyebrow">01 · 角色素材</p><h1 className="mt-1 text-xl font-semibold tracking-[-0.03em]">上传并真实抠图</h1></div>{sourceFile && <button aria-label="清除角色" className="icon-button" onClick={() => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); if (cutoutUrl) URL.revokeObjectURL(cutoutUrl); if (videoUrl) URL.revokeObjectURL(videoUrl); setSourceFile(null); setSourceUrl(""); setCutoutUrl(""); setVideoUrl(""); setVideoBlob(null); setStatus("idle"); setProgress(0); setMessage("上传一张角色图开始"); }}><X className="h-4 w-4" /></button>}</div>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => chooseCharacter(event.target.files?.[0])} />
          {!sourceUrl ? <button className="upload-zone" onClick={() => fileInput.current?.click()}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary"><ImagePlus className="h-5 w-5" /></span><span className="font-semibold">上传角色图片</span><span className="text-xs text-muted-foreground">PNG / JPG / WebP，建议人物清晰</span></button> : <div className="grid grid-cols-2 gap-3"><button className="asset-preview" onClick={() => fileInput.current?.click()}><img src={sourceUrl} alt="原图" /><span>原图 · 点击更换</span></button><div className="asset-preview checkerboard">{cutoutUrl ? <img src={cutoutUrl} alt="抠图结果" /> : <div className="grid h-full place-items-center px-3 text-center text-xs leading-5 text-muted-foreground">点击下方按钮<br />在浏览器内抠图</div>}<span>{cutoutUrl ? "透明背景" : "等待抠图"}</span></div></div>}
          <Button className="mt-4 h-11 w-full rounded-xl" variant={cutoutUrl ? "secondary" : "default"} disabled={!sourceFile || busy} onClick={() => void removeImageBackground()}>{status === "cutting" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : cutoutUrl ? <RefreshCw className="h-4 w-4" /> : <Scissors className="h-4 w-4" />}{status === "cutting" ? "正在智能抠图" : cutoutUrl ? "重新抠图" : "智能抠图"}</Button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">首次抠图会下载约 40MB 的本地模型，之后由浏览器缓存。素材不会上传到服务器。</p>
        </div>
        <div className="workspace-card p-5"><p className="eyebrow">02 · 镜头描述</p><label className="field-label mt-3" htmlFor="prompt">动作与运镜</label><Textarea id="prompt" value={prompt} onChange={(event) => { setPrompt(event.target.value); resetResult(); }} className="mt-2 min-h-24 resize-none rounded-xl bg-secondary/55 leading-6" /><label className="field-label mt-4" htmlFor="subtitle">画面字幕</label><input id="subtitle" value={subtitle} onChange={(event) => { setSubtitle(event.target.value); resetResult(); }} className="field-input mt-2" placeholder="输入对白或旁白" /></div>
      </aside>
      <section className="workspace-card overflow-hidden p-4 sm:p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="eyebrow">实时预览</p><h2 className="mt-1 text-xl font-semibold">9:16 竖屏镜头</h2></div><Badge variant="secondary">720 × 1280</Badge></div><div className="stage-shell"><canvas ref={canvasRef} width={720} height={1280} aria-label="动态短片画面预览" />{!sourceUrl && <button className="stage-empty" onClick={() => fileInput.current?.click()}><Upload className="h-6 w-6" /><b>先上传角色图片</b><span>你会在这里看到最终构图</span></button>}{busy && <div className="stage-working"><LoaderCircle className="h-8 w-8 animate-spin" /><b>{status === "cutting" ? "正在识别人物边缘" : "正在逐帧编码视频"}</b><span>{progress}%</span></div>}</div><div className="mt-4 flex items-center gap-3"><Play className="h-4 w-4 text-muted-foreground" /><input aria-label="预览画面进度" type="range" min="0" max="100" value={Math.round(previewTime * 100)} onChange={(event) => setPreviewTime(Number(event.target.value) / 100)} className="timeline" /><span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{(previewTime * duration).toFixed(1)}s</span></div></section>
      <aside className="space-y-4">
        <div className="workspace-card p-5"><div className="mb-4"><p className="eyebrow">03 · 画面设置</p><h2 className="mt-1 text-lg font-semibold">选择场景和运镜</h2></div><div className="grid grid-cols-2 gap-2">{SCENES.map((item) => <button key={item.key} className={`scene-option ${sceneKey === item.key && !backgroundUrl ? "is-selected" : ""}`} onClick={() => { setSceneKey(item.key); if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); setBackgroundUrl(""); resetResult(); }}><span className="scene-swatch" style={{ background: `linear-gradient(145deg, ${item.colors[0]}, ${item.colors[1]} 58%, ${item.colors[2]})` }} /><b>{item.name}</b><small>{item.note}</small></button>)}</div><input ref={backgroundInput} type="file" accept="image/*" className="hidden" onChange={(event) => chooseBackground(event.target.files?.[0])} /><Button variant="outline" className="mt-3 h-10 w-full rounded-xl" onClick={() => backgroundInput.current?.click()}><ImagePlus className="h-4 w-4" />{backgroundUrl ? "更换自定义背景" : "上传自己的背景"}</Button>{backgroundUrl && <button className="mt-2 w-full text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => { URL.revokeObjectURL(backgroundUrl); setBackgroundUrl(""); resetResult(); }}>移除自定义背景</button>}
          <div className="mt-5 border-t pt-5"><span className="field-label">镜头运动</span><div className="mt-2 grid grid-cols-3 gap-2">{([['push','推进'],['float','呼吸'],['slide','横移']] as [Motion, string][]).map(([value, label]) => <button key={value} className={`segmented ${motion === value ? "is-selected" : ""}`} onClick={() => { setMotion(value); resetResult(); }}>{label}</button>)}</div></div><div className="mt-4"><span className="field-label">视频时长</span><div className="mt-2 grid grid-cols-3 gap-2">{[4, 6, 8].map((value) => <button key={value} className={`segmented ${duration === value ? "is-selected" : ""}`} onClick={() => { setDuration(value); resetResult(); }}>{value} 秒</button>)}</div></div>
        </div>
        <div className="workspace-card p-5"><div className="flex items-center gap-3"><div className={`status-dot ${status}`} /><div><p className="text-sm font-semibold">{message}</p><p className="mt-0.5 text-xs text-muted-foreground">{status === "done" ? `${(videoBlob?.size ?? 0) / 1024 / 1024 < 1 ? "小于 1" : ((videoBlob?.size ?? 0) / 1024 / 1024).toFixed(1)} MB · WebM` : "单镜生成，不排队"}</p></div></div>{busy && <Progress value={progress} className="mt-4 h-2" />}<Button size="lg" className="mt-5 h-12 w-full rounded-xl" disabled={!sourceFile || busy} onClick={() => void renderVideo()}><Sparkles className="h-4 w-4" />{videoUrl ? "重新生成短片" : "生成动态短片"}</Button>{videoUrl && <div className="mt-3 grid gap-2"><video src={videoUrl} controls playsInline className="aspect-video w-full rounded-xl bg-black object-cover" /><Button variant="outline" className="h-11 w-full rounded-xl" onClick={downloadVideo}><Download className="h-4 w-4" />下载 WebM 视频</Button></div>}</div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><b className="block">能力边界</b>当前是“智能抠图 + 真实视频合成”，会输出可下载的视频；不会凭文字生成新动作。这样可以零 API 成本验证用户是否愿意完成并导出一个镜头。</div>
      </aside>
    </section>
    <footer className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-2 px-6 pb-6 text-xs text-muted-foreground"><span>镜序 MVP · 所有图片与视频均在当前浏览器处理</span><span className="flex items-center gap-1.5"><Film className="h-3.5 w-3.5" />建议使用最新版 Chrome / Edge</span></footer>
  </main>;
}
