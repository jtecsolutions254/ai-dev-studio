import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import JSZip from "jszip";
import {
  getProject,
  saveFile,
  deleteFile as deleteFileFn,
} from "@/lib/projects.functions";
import { LuminaWordmark } from "@/components/brand";

import { sendChat } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Bug, Code2, Download, Eye, FileCode2, FilePlus2, Loader2, Monitor,
  Play, RefreshCw, Send, Smartphone, Sparkles, Tablet, Trash2, Zap,
} from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/workspace/$projectId")({
  component: Workspace,
  head: () => ({ meta: [{ title: "Workspace — Lumina AI" }] }),
});

type FileRow = { id: string; path: string; content: string; updated_at: string };
type MsgRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  metadata?: { changes?: { action: "write" | "delete"; path: string }[] } | null;
};

type LogEntry = { ts: number; level: "log" | "warn" | "error" | "info" | "system"; text: string };

function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  return (
    {
      html: "html", css: "css", js: "javascript", mjs: "javascript",
      ts: "typescript", tsx: "typescript", jsx: "javascript",
      json: "json", md: "markdown",
    }[ext ?? ""] ?? "plaintext"
  );
}

/**
 * Inline-bundles local CSS/JS/JSX references inside index.html so the iframe
 * runs the full project with no build step. Also injects a console bridge
 * that forwards logs + errors to the parent via postMessage.
 */
function buildPreview(files: FileRow[]): string {
  const index = files.find((f) => f.path === "index.html");
  if (!index) {
    return `<!doctype html><html><body style="background:#0d1117;color:#8b949e;font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0"><div>No <code>index.html</code> yet. Ask the AI to build something.</div></body></html>`;
  }

  const findFile = (rawPath: string) => {
    const p = rawPath.replace(/^\.\//, "").replace(/^\//, "");
    return files.find((x) => x.path === p);
  };

  let html = index.content;

  // inline <link rel="stylesheet" href="local.css">
  html = html.replace(
    /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    (match, href) => {
      if (/^https?:\/\//.test(href)) return match;
      const f = findFile(href);
      return f ? `<style>\n${f.content}\n</style>` : match;
    },
  );

  // inline <script src="local.js"> (preserve type attribute for type="text/babel" etc.)
  html = html.replace(
    /<script([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi,
    (match, pre, src, post) => {
      if (/^https?:\/\//.test(src)) return match;
      const f = findFile(src);
      if (!f) return match;
      const attrs = `${pre} ${post}`.replace(/\s+/g, " ").trim();
      return `<script ${attrs}>\n${f.content}\n</script>`;
    },
  );

  // Inject console/error bridge as the first thing in <head>
  const bridge = `
<script>
(function(){
  const send = (level, args) => {
    try {
      parent.postMessage({ __syntaxos: true, kind: 'log', level,
        text: args.map(a => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); } }).join(' ')
      }, '*');
    } catch(e) {}
  };
  ['log','warn','error','info'].forEach(k => {
    const orig = console[k];
    console[k] = function(){ send(k, [...arguments]); orig.apply(console, arguments); };
  });
  window.addEventListener('error', (e) => {
    parent.postMessage({ __syntaxos: true, kind: 'error',
      message: e.message, source: e.filename, line: e.lineno, col: e.colno,
      stack: e.error && e.error.stack ? e.error.stack : null
    }, '*');
  });
  window.addEventListener('unhandledrejection', (e) => {
    parent.postMessage({ __syntaxos: true, kind: 'error',
      message: 'Unhandled promise rejection: ' + (e.reason && e.reason.message || e.reason),
      stack: e.reason && e.reason.stack || null
    }, '*');
  });
})();
</script>`;

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${bridge}`);
  } else {
    html = bridge + html;
  }

  return html;
}

async function downloadProjectZip(name: string, files: FileRow[]) {
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content);
  zip.file(
    "README.md",
    `# ${name}\n\nExported from Lumina AI. Open \`index.html\` in a browser to run.\n`,
  );
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9-_]+/gi, "_") || "syntax-project"}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Workspace() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getProject);
  const saveFn = useServerFn(saveFile);
  const delFn = useServerFn(deleteFileFn);
  const chatFn = useServerFn(sendChat);

  const queryKey = useMemo(() => ["project", projectId], [projectId]);
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getFn({ data: { id: projectId } }),
  });

  const files = (data?.files ?? []) as FileRow[];
  const messages = (data?.messages ?? []) as MsgRow[];

  const [activePath, setActivePath] = useState<string | null>(null);
  useEffect(() => {
    if (!activePath && files.length) {
      setActivePath(files.find((f) => f.path === "index.html")?.path ?? files[0].path);
    }
  }, [files, activePath]);

  const activeFile = files.find((f) => f.path === activePath);
  const [draft, setDraft] = useState<string>("");
  useEffect(() => {
    setDraft(activeFile?.content ?? "");
  }, [activeFile?.id]);

  // realtime updates so file/message changes from the AI appear instantly
  useEffect(() => {
    const ch = supabase
      .channel(`project:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_files", filter: `project_id=eq.${projectId}` }, () =>
        qc.invalidateQueries({ queryKey }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `project_id=eq.${projectId}` }, () =>
        qc.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [projectId, qc, queryKey]);

  const save = useMutation({
    mutationFn: (vars: { path: string; content: string }) =>
      saveFn({ data: { projectId, ...vars } }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const del = useMutation({
    mutationFn: (path: string) => delFn({ data: { projectId, path } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setActivePath(null);
    },
  });

  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [messages.length]);

  const chat = useMutation({
    mutationFn: (message: string) => chatFn({ data: { projectId, message } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setChatInput("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "AI error"),
  });

  // Auto-kick-off: if project has a description and zero messages, fire
  // the initial generation prompt exactly once.
  const autoKickedRef = useRef(false);
  useEffect(() => {
    if (autoKickedRef.current) return;
    if (!data) return;
    if (messages.length > 0) return;
    const seed = data.project.description?.trim();
    if (!seed) return;
    autoKickedRef.current = true;
    chat.mutate(`Build the following app end-to-end. Generate all files needed for a working live preview.\n\n${seed}`);
  }, [data, messages.length, chat]);

  const [newPath, setNewPath] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [rightTab, setRightTab] = useState<"preview" | "code">("preview");
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");

  const preview = useMemo(() => buildPreview(files), [files]);
  const [previewKey, setPreviewKey] = useState(0);
  useEffect(() => {
    setPreviewKey((k) => k + 1);
  }, [preview]);

  // Console / runtime error capture from the preview iframe
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== "object" || !d.__syntaxos) return;
      if (d.kind === "log") {
        setLogs((l) => [...l.slice(-200), { ts: Date.now(), level: d.level, text: d.text }]);
      } else if (d.kind === "error") {
        const msg = `${d.message}${d.source ? ` (${d.source}:${d.line}:${d.col})` : ""}${d.stack ? `\n${d.stack}` : ""}`;
        setLogs((l) => [...l.slice(-200), { ts: Date.now(), level: "error", text: msg }]);
        setLastError(msg);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Clear runtime errors when the preview reloads
  useEffect(() => {
    setLastError(null);
  }, [previewKey]);

  const autoFix = useCallback(() => {
    if (!lastError) return;
    chat.mutate(
      `Runtime error in the preview. Diagnose and fix the offending file(s):\n\n\`\`\`\n${lastError.slice(0, 2000)}\n\`\`\``,
    );
  }, [lastError, chat]);

  const downloadZip = useCallback(async () => {
    if (!data) return;
    await downloadProjectZip(data.project.name, files);
    toast.success("Project exported");
  }, [data, files]);

  const runWithWebContainers = useCallback(() => {
    toast("WebContainers runtime", {
      description:
        "Requires a StackBlitz WebContainers API key + COOP/COEP headers on the deployed site. Wire the key in Settings to enable Node-based projects.",
    });
  }, []);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground font-mono text-sm">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top nav */}
      <nav className="h-11 border-b border-border flex items-center justify-between px-3 bg-surface/60 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
            <ArrowLeft className="size-4" />
          </Button>
          <Link to="/" className="flex items-center gap-2">
            <LuminaWordmark />
          </Link>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs font-medium truncate">{data.project.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1.5"
            onClick={runWithWebContainers}
            title="Run Node-based projects via StackBlitz WebContainers (requires API key)"
          >
            <Play className="size-3.5" /> Run (WC)
          </Button>
          <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={downloadZip}>
            <Download className="size-3.5" /> Export ZIP
          </Button>
          <div className="flex items-center gap-1.5 bg-black/30 rounded-md px-2 py-1 border border-border">
            <div className={`size-2 rounded-full ${lastError ? "bg-destructive animate-pulse" : "bg-signal animate-pulse"}`} />
            <span className="text-[10px] font-mono text-muted-foreground uppercase">
              {chat.isPending ? "Generating" : lastError ? "Runtime Error" : "System Ready"}
            </span>
          </div>
        </div>
      </nav>

      {/* Main: Lovable-style two-pane — chat left, preview/code right (resizable) */}
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={28} minSize={18} maxSize={50} className="min-w-0">
        {/* LEFT — Chat */}
        <aside className="h-full border-r border-border bg-surface flex flex-col min-h-0">

          <div className="p-3 border-b border-border flex items-center justify-between bg-white/5 shrink-0">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded-full bg-accent flex items-center justify-center">
                <Sparkles className="size-3 text-accent-foreground" />
              </div>
              <div>
                <div className="text-xs font-semibold leading-tight">Lumina Architect</div>
                <div className="text-[10px] text-accent font-mono">
                  {chat.isPending ? "building…" : "ready"}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">gemini-3-flash</div>
          </div>

          <div ref={chatScrollRef} className="flex-1 p-4 space-y-4 overflow-y-auto min-h-0">
            {messages.length === 0 && (
              <div className="text-xs text-muted-foreground space-y-2">
                <p>Describe an app and I&apos;ll build it — multi-file, real code, live preview.</p>
                <p className="text-[10px] text-muted-foreground/70">
                  Try: <em>&quot;build a kanban board with drag-and-drop, persisted to localStorage&quot;</em>
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="flex flex-col gap-1">
                <span className={`text-[10px] uppercase font-bold ml-0.5 ${m.role === "user" ? "text-muted-foreground" : "text-accent"}`}>
                  {m.role === "user" ? "You" : "Architect"}
                </span>
                <div className={`p-2.5 rounded-lg text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-white/5 text-foreground/90"
                    : "bg-accent/5 border border-accent/20 text-foreground/90"
                }`}>
                  {m.content}
                </div>
                {m.metadata?.changes && m.metadata.changes.length > 0 && (
                  <div className="flex flex-wrap gap-1 ml-0.5">
                    {m.metadata.changes.map((c, i) => (
                      <span
                        key={i}
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          c.action === "write"
                            ? "bg-signal/10 text-signal border border-signal/20"
                            : "bg-destructive/10 text-destructive border border-destructive/20"
                        }`}
                      >
                        {c.action === "write" ? "✎" : "✕"} {c.path}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chat.isPending && (
              <div className="flex items-center gap-2 text-[10px] text-accent font-mono">
                <div className="flex gap-1">
                  <div className="size-1 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="size-1 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="size-1 bg-accent rounded-full animate-bounce" />
                </div>
                planning → generating → writing files…
              </div>
            )}
          </div>

          <div className="p-3 bg-background/50 border-t border-border shrink-0">
            <div className="relative">
              <Textarea
                placeholder="Ask Lumina to build or modify…  (⌘/Ctrl+Enter to send)"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                rows={3}
                className="resize-none text-xs pr-10"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && chatInput.trim() && !chat.isPending) {
                    chat.mutate(chatInput.trim());
                  }
                }}
              />
              <button
                onClick={() => chatInput.trim() && !chat.isPending && chat.mutate(chatInput.trim())}
                disabled={!chatInput.trim() || chat.isPending}
                className="absolute bottom-2 right-2 p-1.5 rounded bg-accent text-accent-foreground disabled:opacity-40 hover:opacity-90"
                aria-label="Send"
              >
                {chat.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>{files.length} file{files.length === 1 ? "" : "s"}</span>
              {lastError && (
                <button
                  onClick={autoFix}
                  disabled={chat.isPending}
                  className="flex items-center gap-1 text-destructive hover:underline disabled:opacity-50"
                >
                  <Zap className="size-3" /> Auto-fix error
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* RIGHT — Preview / Code tabs */}
        <section className="flex-1 flex flex-col min-w-0 bg-background">
          <div className="h-11 border-b border-border flex items-center justify-between px-3 bg-surface/30 shrink-0">
            <div className="flex items-center gap-1 bg-black/30 rounded-md border border-border p-0.5">
              <button
                onClick={() => setRightTab("preview")}
                className={`h-7 px-3 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  rightTab === "preview" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="size-3.5" /> Preview
              </button>
              <button
                onClick={() => setRightTab("code")}
                className={`h-7 px-3 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  rightTab === "code" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code2 className="size-3.5" /> Code
              </button>
            </div>
            {rightTab === "preview" ? (
              <div className="flex items-center gap-1">
                <div className="flex items-center bg-black/30 rounded border border-border p-0.5">
                  {(["desktop", "tablet", "mobile"] as DeviceMode[]).map((m) => {
                    const Icon = m === "desktop" ? Monitor : m === "tablet" ? Tablet : Smartphone;
                    return (
                      <button
                        key={m}
                        onClick={() => setDeviceMode(m)}
                        className={`size-6 rounded flex items-center justify-center transition-colors ${
                          deviceMode === m ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-foreground"
                        }`}
                        aria-label={m}
                        title={m}
                      >
                        <Icon className="size-3" />
                      </button>
                    );
                  })}
                </div>
                {lastError && (
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-destructive" onClick={autoFix} disabled={chat.isPending}>
                    <Bug className="size-3" /> Fix
                  </Button>
                )}
                <button
                  className="size-6 rounded hover:bg-white/5 flex items-center justify-center text-muted-foreground"
                  onClick={() => setPreviewKey((k) => k + 1)}
                  aria-label="Reload preview"
                >
                  <RefreshCw className="size-3.5" />
                </button>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground font-mono">
                {activeFile ? activeFile.path : "no file selected"}
              </span>
            )}
          </div>

          {rightTab === "preview" ? (
            <PreviewSurface
              preview={preview}
              previewKey={previewKey}
              deviceMode={deviceMode}
              lastError={lastError}
            />
          ) : (
            <div className="flex-1 flex min-h-0">
              {/* File tree */}
              <aside className="w-56 border-r border-border bg-surface flex flex-col shrink-0">
                <div className="p-3 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Explorer · {files.length}
                  </span>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setShowNew((s) => !s)}
                    aria-label="New file"
                  >
                    <FilePlus2 className="size-3.5" />
                  </button>
                </div>
                {showNew && (
                  <div className="px-2 pb-2">
                    <Input
                      autoFocus
                      placeholder="path/to/file.css"
                      value={newPath}
                      onChange={(e) => setNewPath(e.target.value)}
                      className="h-7 text-xs"
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && newPath.trim()) {
                          await save.mutateAsync({ path: newPath.trim(), content: "" });
                          setActivePath(newPath.trim());
                          setNewPath("");
                          setShowNew(false);
                        } else if (e.key === "Escape") {
                          setShowNew(false);
                          setNewPath("");
                        }
                      }}
                    />
                  </div>
                )}
                <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
                  {files.length === 0 ? (
                    <div className="px-2 py-4 text-xs text-muted-foreground">No files yet.</div>
                  ) : (
                    files.map((f) => (
                      <div
                        key={f.id}
                        className={`group flex items-center justify-between px-2 py-1.5 rounded text-sm cursor-pointer ${
                          f.path === activePath
                            ? "bg-accent/10 text-accent"
                            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                        }`}
                        onClick={() => setActivePath(f.path)}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <FileCode2 className="size-3.5 opacity-60 shrink-0" />
                          <span className="truncate font-mono text-xs">{f.path}</span>
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete ${f.path}?`)) del.mutate(f.path);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </aside>

              {/* Editor + console */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="h-8 border-b border-border flex items-center justify-end px-3 bg-surface/30 shrink-0">
                  {activeFile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6"
                      disabled={save.isPending || draft === activeFile.content}
                      onClick={() => save.mutate({ path: activeFile.path, content: draft })}
                    >
                      {save.isPending ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                    </Button>
                  )}
                </div>
                <div className="flex-1 min-h-0">
                  {activeFile ? (
                    <Editor
                      height="100%"
                      language={languageFor(activeFile.path)}
                      value={draft}
                      theme="vs-dark"
                      onChange={(v) => setDraft(v ?? "")}
                      options={{
                        fontFamily: "JetBrains Mono, ui-monospace, monospace",
                        fontSize: 13,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        tabSize: 2,
                      }}
                    />
                  ) : (
                    <div className="h-full grid place-items-center text-sm text-muted-foreground">
                      Select a file or ask the AI to generate one
                    </div>
                  )}
                </div>
                <div className="h-40 border-t border-border bg-surface flex flex-col shrink-0">
                  <div className="h-8 border-b border-border flex items-center justify-between px-3 shrink-0">
                    <span className="text-[10px] uppercase tracking-tighter text-muted-foreground font-bold">
                      Runtime Console · {logs.length}
                    </span>
                    <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setLogs([])}>
                      clear
                    </button>
                  </div>
                  <div className="flex-1 p-3 font-mono text-[11px] overflow-y-auto space-y-0.5">
                    {logs.length === 0 && (
                      <div className="text-muted-foreground">$ preview logs and errors stream here.</div>
                    )}
                    {logs.map((l, i) => (
                      <div
                        key={i}
                        className={
                          l.level === "error"
                            ? "text-destructive whitespace-pre-wrap"
                            : l.level === "warn"
                              ? "text-yellow-400"
                              : "text-foreground/80"
                        }
                      >
                        <span className="text-muted-foreground">[{new Date(l.ts).toLocaleTimeString()}]</span>{" "}
                        <span className="text-muted-foreground">{l.level}</span> {l.text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

type DeviceMode = "desktop" | "tablet" | "mobile";
const DEVICE_DIMS: Record<DeviceMode, { w: number; h: number; label: string }> = {
  desktop: { w: 0, h: 0, label: "Responsive" },
  tablet: { w: 768, h: 1024, label: "768 × 1024" },
  mobile: { w: 390, h: 844, label: "390 × 844" },
};

function PreviewSurface({
  preview,
  previewKey,
  deviceMode,
  lastError,
}: {
  preview: string;
  previewKey: number;
  deviceMode: DeviceMode;
  lastError: string | null;
}) {
  const dims = DEVICE_DIMS[deviceMode];
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 p-4 overflow-auto grid place-items-center bg-[radial-gradient(circle_at_center,_oklch(0.22_0.014_250)_0%,_var(--background)_70%)]">
        <div
          className="bg-background rounded-lg outline-1 -outline-offset-1 outline-white/5 overflow-hidden transition-all shadow-2xl"
          style={
            deviceMode === "desktop"
              ? { width: "100%", height: "100%" }
              : { width: dims.w, height: dims.h, maxWidth: "100%", maxHeight: "100%" }
          }
        >
          <iframe
            key={previewKey}
            title="preview"
            srcDoc={preview}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            className="w-full h-full border-0 bg-white"
          />
        </div>
      </div>
      <div className="h-6 border-t border-border flex items-center justify-between px-3 text-[10px] font-mono text-muted-foreground shrink-0 bg-surface/30">
        <span>{dims.label}</span>
        <span className={lastError ? "text-destructive" : ""}>
          {lastError ? "runtime error" : "hot-reload: on"}
        </span>
      </div>
    </div>
  );
}
