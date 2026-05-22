import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { createProject } from "@/lib/projects.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Loader2, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
  head: () => ({ meta: [{ title: "Welcome — SYNTAX.OS" }] }),
});

const TEMPLATES = [
  { id: "landing", label: "Landing page", desc: "Hero, features, CTA — marketing site.", seed: "A modern dark landing page for a SaaS product with a hero, three feature cards and a call-to-action." },
  { id: "dashboard", label: "Dashboard", desc: "Sidebar, charts, tables.", seed: "An analytics dashboard with a sidebar, KPI cards, a line chart and a recent activity table." },
  { id: "blog", label: "Blog", desc: "Posts list + reader.", seed: "A minimal blog with a list of posts and a clean reader view." },
  { id: "blank", label: "Blank canvas", desc: "Start from scratch.", seed: "" },
];

function Onboarding() {
  const navigate = useNavigate();
  const createFn = useServerFn(createProject);
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const create = useMutation({
    mutationFn: (vars: { name: string; description?: string }) => createFn({ data: vars }),
    onSuccess: (p) => navigate({ to: "/workspace/$projectId", params: { projectId: p.id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create"),
  });

  const pickTemplate = (id: string) => {
    setTemplate(id);
    const t = TEMPLATES.find((x) => x.id === id);
    if (t && !desc) setDesc(t.seed);
    setStep(1);
  };

  const submit = () => {
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), description: desc.trim() || undefined });
  };

  const progress = ((step + 1) / 2) * 100;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 border-b border-border bg-surface/50 backdrop-blur-md flex items-center justify-between px-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="size-5 rounded-sm bg-accent flex items-center justify-center">
            <div className="size-2 rounded-full bg-background" />
          </div>
          <span className="text-sm font-semibold tracking-tight">SYNTAX.OS</span>
          <span className="text-xs text-muted-foreground ml-2 font-mono">/ onboarding</span>
        </Link>
        <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground">
          Skip for now →
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">
            Step {step + 1} of 2
          </p>
          <Progress value={progress} className="mt-2 h-1" />
        </div>

        {step === 0 ? (
          <section>
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-accent" />
              <h1 className="text-3xl font-semibold tracking-tight">Welcome to SYNTAX.OS</h1>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Let's spin up your first workspace. Pick a starting point — you can change everything later.
            </p>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
              {TEMPLATES.map((t) => {
                const active = template === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => pickTemplate(t.id)}
                    className={`text-left rounded-lg border p-5 transition-colors ${
                      active
                        ? "border-accent bg-accent/5"
                        : "border-border bg-surface hover:border-accent/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold tracking-tight">{t.label}</h3>
                      {active && <Check className="size-4 text-accent" />}
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{t.desc}</p>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <section>
            <h1 className="text-3xl font-semibold tracking-tight">Name your workspace</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Give it a name and tell the AI what to build first.
            </p>

            <div className="mt-8 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">Workspace name</label>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-first-app"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  What should it be? <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <Textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={5}
                  placeholder="Describe what you want to build…"
                  className="mt-1"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ← Back
                </button>
                <Button
                  onClick={submit}
                  disabled={!name.trim() || create.isPending}
                  className="bg-accent text-accent-foreground hover:opacity-90"
                >
                  {create.isPending ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="size-4 mr-2" />
                  )}
                  Create workspace
                </Button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
