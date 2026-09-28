import { NextRequest, NextResponse } from "next/server";

type Provider = "jimeng" | "kling" | "custom";
type RequestBody = {
  action?: "create" | "status";
  provider?: Provider;
  apiKey?: string;
  model?: string;
  prompt?: string;
  image?: string;
  duration?: number;
  taskId?: string;
  endpoint?: string;
  statusEndpoint?: string;
};

const ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const KLING_BASE = "https://api-singapore.klingai.com";
const MAX_BODY_BYTES = 14 * 1024 * 1024;

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const declaredSize = Number(request.headers.get("content-length") || 0);
    if (declaredSize > MAX_BODY_BYTES) return reply({ error: "图片过大，请使用 8MB 以内的图片。" }, 413);
    const body = await request.json() as RequestBody;
    validateCommon(body);
    const result = body.action === "status" ? await queryTask(body) : await createTask(body);
    return reply(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "接口调用失败";
    return reply({ error: message.slice(0, 600) }, 400);
  }
}

function validateCommon(body: RequestBody) {
  if (!body.provider || !["jimeng", "kling", "custom"].includes(body.provider)) throw new Error("请选择有效的模型供应商。 ");
  if (!body.apiKey?.trim()) throw new Error("请填写该供应商的 API Key。 ");
  if (body.apiKey.length > 4096) throw new Error("API Key 格式不正确。 ");
  if (body.action === "status" && !body.taskId?.trim()) throw new Error("缺少任务 ID。 ");
  if (body.action !== "status") {
    if (!body.prompt?.trim()) throw new Error("请填写镜头提示词。 ");
    if (!body.image?.startsWith("data:image/")) throw new Error("请先上传角色图片。 ");
    if (body.image.length > MAX_BODY_BYTES) throw new Error("图片过大，请压缩后重试。 ");
  }
}

async function createTask(body: RequestBody) {
  if (body.provider === "jimeng") {
    const data = await fetchJson(ARK_BASE, {
      method: "POST",
      headers: authHeaders(body.apiKey!),
      body: JSON.stringify({
        model: body.model || "doubao-seedance-2-5-260628",
        content: [
          { type: "text", text: body.prompt },
          { type: "image_url", image_url: { url: body.image } },
        ],
        resolution: "720p",
        ratio: "9:16",
        duration: clampDuration(body.duration),
        generate_audio: false,
        watermark: false,
      }),
    });
    return normalize(data);
  }

  if (body.provider === "kling") {
    const model = safeModel(body.model || "kling-2.5-turbo");
    const data = await fetchJson(`${KLING_BASE}/image-to-video/${model}`, {
      method: "POST",
      headers: authHeaders(body.apiKey!),
      body: JSON.stringify({
        contents: [
          { type: "prompt", text: body.prompt },
          { type: "first_frame", url: body.image },
        ],
        settings: { resolution: "720p", duration: clampDuration(body.duration), audio: "off", multi_shot: false },
        options: { watermark_info: { enabled: false } },
      }),
    });
    return normalize(data);
  }

  const endpoint = validateEndpoint(body.endpoint);
  const data = await fetchJson(endpoint, {
    method: "POST",
    headers: authHeaders(body.apiKey!),
    body: JSON.stringify({ model: body.model || undefined, prompt: body.prompt, image: body.image, duration: clampDuration(body.duration), aspect_ratio: "9:16" }),
  });
  return normalize(data);
}

async function queryTask(body: RequestBody) {
  if (body.provider === "jimeng") {
    const data = await fetchJson(`${ARK_BASE}/${encodeURIComponent(body.taskId!)}`, { headers: authHeaders(body.apiKey!) });
    return normalize(data);
  }
  if (body.provider === "kling") {
    const data = await fetchJson(`${KLING_BASE}/tasks?task_ids=${encodeURIComponent(body.taskId!)}`, { headers: authHeaders(body.apiKey!) });
    return normalize(data);
  }
  const template = validateEndpoint(body.statusEndpoint || body.endpoint);
  const url = template.includes("{task_id}") ? template.replace("{task_id}", encodeURIComponent(body.taskId!)) : `${template.replace(/\/$/, "")}/${encodeURIComponent(body.taskId!)}`;
  const data = await fetchJson(url, { headers: authHeaders(body.apiKey!) });
  return normalize(data);
}

function authHeaders(apiKey: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` };
}

async function fetchJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: unknown;
    try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`供应商返回了无法识别的内容（HTTP ${response.status}）。`); }
    if (!response.ok) throw new Error(providerError(data) || `供应商请求失败（HTTP ${response.status}）。`);
    return data;
  } finally { clearTimeout(timer); }
}

function normalize(raw: unknown) {
  const root = asRecord(raw);
  const payload = Array.isArray(root.data) ? asRecord(root.data[0]) : asRecord(root.data) || root;
  const taskId = firstString(payload.id, payload.task_id, root.id, root.task_id, asRecord(root.data)?.id, asRecord(root.data)?.task_id);
  const statusRaw = firstString(payload.status, payload.task_status, root.status, root.task_status) || (findVideoUrl(raw) ? "succeeded" : "submitted");
  const normalizedStatus = mapStatus(statusRaw);
  const videoUrl = findVideoUrl(raw);
  const error = providerError(raw);
  if (!taskId && !videoUrl) throw new Error(error || "供应商没有返回任务 ID，请检查模型名称和接口配置。 ");
  return { taskId, status: videoUrl ? "succeeded" : normalizedStatus, videoUrl, error: normalizedStatus === "failed" ? error || "生成任务失败" : undefined };
}

function findVideoUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findVideoUrl(item); if (found) return found; }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["video_url", "videoUrl", "url"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate) && (/video|\.mp4|\.mov|\.webm/i.test(candidate) || key !== "url")) return candidate;
  }
  for (const key of ["content", "output", "outputs", "result", "results", "data", "task_result", "works"]) {
    const found = findVideoUrl(record[key]); if (found) return found;
  }
  return undefined;
}

function providerError(value: unknown): string | undefined {
  const record = asRecord(value); const data = asRecord(record?.data); const error = asRecord(record?.error);
  return firstString(error?.message, record?.message, data?.message, record?.error as string);
}

function asRecord(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function firstString(...values: unknown[]) { return values.find((value): value is string => typeof value === "string" && value.length > 0); }
function mapStatus(value: string) { const status = value.toLowerCase(); if (["succeeded", "success", "succeed", "completed", "done"].includes(status)) return "succeeded"; if (["failed", "failure", "error", "cancelled", "canceled", "expired"].includes(status)) return "failed"; return "processing"; }
function clampDuration(value?: number) { return Math.max(4, Math.min(15, Math.round(value || 5))); }
function safeModel(value: string) { if (!/^[a-z0-9._-]{2,80}$/i.test(value)) throw new Error("模型名称格式不正确。 "); return value; }

function validateEndpoint(value?: string) {
  if (!value) throw new Error("请填写自定义接口地址。 ");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("自定义接口地址无效。 "); }
  if (url.protocol !== "https:") throw new Error("自定义接口必须使用 HTTPS。 ");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local") || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) throw new Error("不能调用本地或内网地址。 ");
  return url.toString();
}

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

