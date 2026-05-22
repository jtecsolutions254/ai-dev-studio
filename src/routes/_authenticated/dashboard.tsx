import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createProject, deleteProject, listProjects } from "@/lib/projects.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { LuminaWordmark } from "@/components/brand";

import { LogOut, Plus, Trash2, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Workspace — Lumina AI" }] }),
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listProjects);
  const createFn = useServerFn(createProject);
  const deleteFn = useServerFn(deleteProject);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => listFn(),
  });

  const create = useMutation({
    mutationFn: (vars: { name: string; description?: string }) => createFn({ data: vars }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/workspace/$projectId", params: { projectId: p.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 border-b border-border bg-surface/50 backdrop-blur-md flex items-center justify-between px-4 sticky top-0 z-30">
        <Link to="/" className="flex items-center gap-2">
          <LuminaWordmark />
          <span className="text-xs text-muted-foreground ml-2 font-mono">/ workspace</span>
        </Link>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="size-4 mr-1.5" /> Sign out
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your AI-generated codebases. Open one or create a new one.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:opacity-90">
                <Plus className="size-4 mr-1.5" /> New project
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-surface border-border">
              <DialogHeader>
                <DialogTitle>New project</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-awesome-app" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">What should it be?</label>
                  <Textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="A landing page for an AI tax assistant — dark, modern, with a hero, three features, and a CTA."
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  className="bg-accent text-accent-foreground hover:opacity-90"
                  disabled={!name.trim() || create.isPending}
                  onClick={() => {
                    create.mutate({ name: name.trim(), description: desc.trim() || undefined });
                  }}
                >
                  {create.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                  Create & open
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground font-mono">Loading…</div>
        ) : !projects || projects.length === 0 ? (
          <EmptyState onCreate={() => setOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group relative rounded-lg border border-border bg-surface p-5 hover:border-accent/50 transition-colors"
              >
                <Link
                  to="/workspace/$projectId"
                  params={{ projectId: p.id }}
                  className="block"
                >
                  <div className="flex items-center gap-2">
                    <div className="size-1.5 rounded-full bg-signal" />
                    <h3 className="font-semibold tracking-tight">{p.name}</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
                    {p.description || "No description."}
                  </p>
                  <p className="mt-4 text-[11px] font-mono text-muted-foreground/70">
                    updated {new Date(p.updated_at).toLocaleString()}
                  </p>
                </Link>
                <button
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                  onClick={() => {
                    if (confirm(`Delete "${p.name}"?`)) del.mutate(p.id);
                  }}
                  aria-label="Delete project"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/40 p-16 text-center">
      <Sparkles className="size-8 mx-auto text-accent" />
      <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Start by describing what you want to build.
      </p>
      <Button className="mt-5 bg-accent text-accent-foreground hover:opacity-90" onClick={onCreate}>
        <Plus className="size-4 mr-1.5" /> Create your first project
      </Button>
    </div>
  );
}
