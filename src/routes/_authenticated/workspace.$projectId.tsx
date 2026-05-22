import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  getProject,
  saveFile,
  deleteFile as deleteFileFn,
} from "@/lib/projects.functions";
import { sendChat } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, FileCode2, FilePlus2, Loader2, RefreshCw, Send, Sparkles, Trash2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/workspace/$projectId")({
  component: Workspace,
  head: () => ({ meta: [{ title: "Workspace — SYNTAX.OS" }] }),
});

type FileRow = { id: string; path: string; content: string; updated_at: string };
type MsgRow = { id: string; role: string; content: string; created_at: string };

function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  return (
    { html: "html", css: "css", js: "javascript", mjs: "javascript", ts: "typescript", tsx: "typescript", jsx: "javascript", json: "json", md: "markdown" }[ext ?? ""] ?? "plaintext"
  );
}

function buildPreview(files: FileRow[]): string {
  const index = files.find((f) => f.path === "index.html");
  if (!index) {
    return `<!doctype html><html><body style="background:#0d1117;color:#8b949e;font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0"><div>No <code>index.html</code> yet. Ask the AI to create one.</div></body></html>`;
  }
  let html = index.content;
  // inline local stylesheets
  html = html.replace(
    /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    (match, href) => {
      if (/^https?:\/\//.test(href)) return match;
      const f = files.find((x) => x.path === href || x.path === href.replace(/^\.\//, ""));
      return f ? `<style>\n${f.content}\n</style>` : match;
    },
  );
  // inline local scripts
  html = html.replace(
    /<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
    (match, src) => {
      if (/^https?:\/\//.test(src)) return match;
      const f = files.find((x) => x.path === src || x.path === src.replace(/^\.\//, ""));
      return f ? `<script>\n${f.content}\n</script>` : match;
    },
  );
  return html;
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
    if (!activePath && files.length) setActivePath(files[0].path);
  }, [files, activePath]);

  const activeFile = files.find((f) => f.path === activePath);
  const [draft, setDraft] = useState<string>("");
  useEffect(() => {
    setDraft(activeFile?.content ?? "");
  }, [activeFile?.id]);

  // realtime updates
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

  const [newPath, setNewPath] = useState("");
  const [showNew, setShowNew] = useState(false);

  const preview = useMemo(() => buildPreview(files), [files]);
  const [previewKey, setPreviewKey] = useState(0);
  useEffect(() => {
    setPreviewKey((k) => k + 1);
  }, [preview]);

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
            <div className="size-5 rounded-sm bg-accent flex items-center justify-center">
              <div className="size-2 rounded-full bg-background" />
            </div>
            <span className="text-sm font-semibold tracking-tight">SYNTAX.OS</span>
          </Link>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs font-medium truncate">{data.project.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-black/30 rounded-md px-2 py-1 border border-border">
            <div className="size-2 bg-signal rounded-full animate-pulse" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase">System Ready</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">gemini-3-flash</span>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1 flex overflow-hidden">
        {/* File tree */}
        <aside className="w-60 border-r border-border bg-surface flex flex-col shrink-0">
          <div className="p-3 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Explorer</span>
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

        {/* Center: editor + console */}
        <section className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col bg-background min-h-0">
            <div className="h-9 border-b border-border flex items-center justify-between px-4 bg-surface/30 shrink-0">
              <div className="flex items-center h-full">
                {activeFile ? (
                  <div className="px-3 h-full flex items-center border-b-2 border-accent text-xs font-mono">
                    {activeFile.path}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground font-mono">no file selected</span>
                )}
              </div>
              {activeFile && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
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
                  Select a file to edit
                </div>
              )}
            </div>
          </div>

          {/* Console */}
          <div className="h-40 border-t border-border bg-surface flex flex-col shrink-0">
            <div className="h-8 border-b border-border flex items-center justify-between px-4 shrink-0">
              <span className="text-[10px] uppercase tracking-tighter text-muted-foreground font-bold">Console</span>
              <span className="text-[10px] text-muted-foreground font-mono">{files.length} file{files.length === 1 ? "" : "s"}</span>
            </div>
            <div className="flex-1 p-3 font-mono text-xs overflow-y-auto space-y-1">
              {messages
                .filter((m) => m.role === "assistant")
                .slice(-8)
                .map((m) => (
                  <div key={m.id} className="text-signal/80">
                    <span className="text-muted-foreground">[{new Date(m.created_at).toLocaleTimeString()}]</span>{" "}
                    {m.content.slice(0, 200)}
                  </div>
                ))}
              {messages.length === 0 && (
                <div className="text-muted-foreground">$ awaiting first prompt…</div>
              )}
            </div>
          </div>
        </section>

        {/* Preview */}
        <section className="w-[420px] border-l border-border bg-surface flex flex-col shrink-0">
          <div className="h-11 border-b border-border flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="size-2 bg-signal rounded-full" />
              <span className="text-xs font-medium font-mono">preview</span>
            </div>
            <button
              className="size-6 rounded hover:bg-white/5 flex items-center justify-center text-muted-foreground"
              onClick={() => setPreviewKey((k) => k + 1)}
              aria-label="Reload preview"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>
          <div className="flex-1 p-3">
            <div className="w-full h-full bg-background rounded-lg outline-1 -outline-offset-1 outline-white/5 overflow-hidden">
              <iframe
                key={previewKey}
                title="preview"
                srcDoc={preview}
                sandbox="allow-scripts allow-forms"
                className="w-full h-full border-0 bg-white"
              />
            </div>
          </div>
        </section>
      </main>

      {/* AI Chat dock */}
      <div className="fixed bottom-4 right-4 w-[380px] max-h-[560px] bg-surface border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-black/50 z-40">
        <div className="p-3 border-b border-border flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-full bg-accent flex items-center justify-center">
              <Sparkles className="size-3 text-accent-foreground" />
            </div>
            <div>
              <div className="text-xs font-semibold leading-tight">Neural Architect</div>
              <div className="text-[10px] text-accent font-mono">
                {chat.isPending ? "thinking…" : "ready"}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">gemini-3-flash</div>
        </div>

        <div ref={chatScrollRef} className="flex-1 p-3 space-y-3 overflow-y-auto min-h-[140px] max-h-[340px]">
          {messages.length === 0 && (
            <div className="text-xs text-muted-foreground">
              Hi. Describe what you want to build or change. I can create, edit, and delete files.
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
            </div>
          ))}
          {chat.isPending && (
            <div className="flex items-center gap-2 text-[10px] text-accent font-mono">
              <div className="flex gap-1">
                <div className="size-1 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="size-1 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="size-1 bg-accent rounded-full animate-bounce" />
              </div>
              generating…
            </div>
          )}
        </div>

        <div className="p-3 bg-background/50 border-t border-border">
          <div className="relative">
            <Textarea
              placeholder="Message AI engineer…  (⌘/Ctrl+Enter to send)"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              rows={2}
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
              <Send className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <footer className="h-6 border-t border-border bg-surface flex items-center justify-between px-3 text-[10px] font-mono text-muted-foreground shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="size-2 bg-accent rounded-full" />
            <span>main</span>
          </div>
          <span>UTF-8</span>
          <span>{activeFile ? languageFor(activeFile.path) : "—"}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{files.length} files</span>
          <span>{messages.length} messages</span>
        </div>
      </footer>
    </div>
  );
}
