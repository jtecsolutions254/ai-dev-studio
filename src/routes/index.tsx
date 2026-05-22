import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Cpu, FileCode2, MessageSquare, Sparkles, Terminal, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "Lumina AI — AI Software Engineering Platform" },
      {
        name: "description",
        content:
          "Describe an app in plain English. Get a live codebase, editable files, and a running preview — powered by AI.",
      },
    ],
  }),
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <Features />
      <CTA />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-5 rounded-sm bg-accent flex items-center justify-center">
            <div className="size-2 rounded-full bg-background" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Lumina AI</span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-xs font-medium text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#workflow" className="hover:text-foreground transition-colors">Workflow</a>
          <a href="#cta" className="hover:text-foreground transition-colors">Get started</a>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            to="/login"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
          >
            Launch console
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <header className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(600px circle at 50% 0%, color-mix(in oklch, var(--color-accent) 35%, transparent), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32 relative">
        <div className="mx-auto max-w-3xl text-center animate-entrance">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-signal animate-pulse" />
            System online · Multi-model routing live
          </div>
          <h1 className="mt-6 text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
            The AI-native operating system <br className="hidden md:block" />
            <span className="text-accent">for software engineering.</span>
          </h1>
          <p className="mt-6 text-base md:text-lg text-muted-foreground leading-relaxed">
            Describe what you want to build. Lumina AI generates the codebase,
            edits files, runs a live preview, and debugs alongside you — all
            inside one focused console.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="group inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90"
            >
              Launch the console
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-2"
            >
              See what it does
            </a>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-5xl rounded-xl border border-border bg-surface shadow-2xl shadow-black/40 overflow-hidden animate-entrance [animation-delay:200ms]">
          <div className="h-9 border-b border-border bg-surface-2/60 flex items-center gap-2 px-4">
            <div className="flex gap-1.5">
              <div className="size-2.5 rounded-full bg-destructive/60" />
              <div className="size-2.5 rounded-full bg-amber-500/60" />
              <div className="size-2.5 rounded-full bg-signal/70" />
            </div>
            <span className="ml-3 text-[11px] font-mono text-muted-foreground">
              lumina-ai / workspace / quantum-bridge-v2
            </span>
          </div>
          <div className="grid grid-cols-12 h-[360px]">
            <div className="col-span-3 border-r border-border bg-surface-2/40 p-3 text-[12px] font-mono space-y-1">
              <div className="text-muted-foreground text-[10px] uppercase tracking-widest font-bold pb-2">Explorer</div>
              <div className="text-accent">▸ index.html</div>
              <div className="text-muted-foreground/70">  app.js</div>
              <div className="text-muted-foreground/70">  styles.css</div>
              <div className="text-muted-foreground/70">  README.md</div>
            </div>
            <div className="col-span-5 border-r border-border p-4 font-mono text-[12px] leading-relaxed overflow-hidden">
              <div className="text-muted-foreground">// generated by Lumina AI</div>
              <div><span className="text-accent">export function</span> <span className="text-amber-400">App</span>() {"{"} </div>
              <div>&nbsp;&nbsp;<span className="text-accent">return</span> <span className="text-emerald-400">'hello world'</span>;</div>
              <div>{"}"}<span className="inline-block w-1.5 h-3.5 bg-accent/70 ml-0.5 align-middle animate-blink" /></div>
            </div>
            <div className="col-span-4 p-4">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground pb-2">AI Engineer</div>
              <div className="rounded-md bg-accent/5 border border-accent/20 p-3 text-[12px] leading-relaxed">
                Building the App component now. Adding a hero, feature grid, and CTA section…
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Features() {
  const items = [
    { icon: MessageSquare, title: "Conversational engineer", body: "Plan, build, refactor, and debug by talking. Streaming responses, tool calls, persistent memory." },
    { icon: FileCode2, title: "Live file system", body: "Every project is a real file tree. Edit anything in the Monaco editor with full syntax highlighting." },
    { icon: Zap, title: "Instant preview", body: "Your app renders the moment a file changes. No build step, no waiting." },
    { icon: Terminal, title: "Console & logs", body: "Watch generation, edits, and runtime events stream into the integrated console." },
    { icon: Cpu, title: "Multi-model routing", body: "Routes between fast and pro models based on task complexity, cost, and latency." },
    { icon: Sparkles, title: "AI tool-calling", body: "The engineer can create, edit, and delete files autonomously — and explain every change." },
  ];
  return (
    <section id="features" className="border-t border-border">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <div className="max-w-2xl">
          <div className="text-xs font-mono uppercase tracking-widest text-accent">// platform</div>
          <h2 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">
            An instrument console for building software.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Every panel of Lumina AI is built around one idea: removing the
            distance between intent and a running application.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden border border-border">
          {items.map((it) => (
            <div key={it.title} className="bg-surface p-6">
              <it.icon className="size-5 text-accent" />
              <h3 className="mt-4 text-base font-semibold">{it.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section id="cta" className="border-t border-border">
      <div className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
          Open the console. Start shipping.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Free to start. Your first project is one prompt away.
        </p>
        <Link
          to="/login"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground hover:opacity-90"
        >
          Launch Lumina AI
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-6 py-8 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
        <span>© Lumina AI · v0.1.0</span>
        <span>main · UTF-8 · system ready</span>
      </div>
    </footer>
  );
}
