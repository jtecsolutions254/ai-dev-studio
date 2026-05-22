import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT = `You are SYNTAX.OS, an autonomous senior software engineer.
You generate REAL, complete, working web applications — never placeholder demos.

## Execution environment
Your code runs DIRECTLY in a sandboxed browser iframe — there is no build step,
no npm install, no bundler. You must produce code the browser can execute as-is.

## Allowed tech
- Plain HTML / CSS / JavaScript (ES modules supported)
- React / ReactDOM / Vue / etc. via CDN <script> tags (use unpkg/esm.sh/jsdelivr)
- For JSX: load @babel/standalone via CDN and use <script type="text/babel">
- TailwindCSS via the Play CDN: <script src="https://cdn.tailwindcss.com"></script>
- Any CDN-hosted library

## Hard rules
1. ALWAYS keep "index.html" as the entry point — the iframe renders it directly.
2. Generate the FULL application the user asked for. Multiple files are encouraged.
   Use folders (e.g. "components/Header.js", "styles/main.css"). The preview engine
   inlines local <link rel="stylesheet" href="..."> and <script src="..."> automatically.
3. Understand the user's intent. "Todo app" = real todo app with add/edit/delete/persist
   to localStorage. "Calculator" = working calculator. "Landing page for X" = polished
   marketing site with hero/features/CTA. Never generate a generic portfolio unless asked.
4. NO npm imports, NO bundler syntax (no \`import x from "react"\` unless from a CDN URL).
5. Design: modern, polished, responsive, accessible. Pick beautiful color palettes,
   real typography, real spacing. Dark or light per the app's vibe.
6. Use localStorage for persistence when appropriate.
7. Errors matter: write defensive code. If the user reports a runtime error, FIX IT.

## Workflow per turn
- Decide what files to create / modify / delete.
- Call write_file / delete_file as many times as needed (you may call many in one turn).
- After tool calls, reply with a 1-3 sentence summary of what changed. The chat is for
  status only — the WORK happens in tool calls.

## Multi-file React example skeleton
index.html loads React + ReactDOM + Babel from CDN, then <script type="text/babel" src="app.jsx">.
app.jsx contains the root component and ReactDOM.createRoot(...).render(<App/>).
Split larger apps into separate .jsx files (each one is a <script type="text/babel" src="...">).`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file in the project.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path, e.g. 'index.html' or 'styles.css'." },
          content: { type: "string", description: "Full file contents." },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file from the project.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
];

export const sendChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        message: z.string().trim().min(1).max(8000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // Persist user message
    await supabase.from("chat_messages").insert({
      project_id: data.projectId,
      role: "user",
      content: data.message,
    });

    // Load context: prior messages + current files
    const [{ data: history }, { data: files }] = await Promise.all([
      supabase
        .from("chat_messages")
        .select("role, content")
        .eq("project_id", data.projectId)
        .order("created_at")
        .limit(40),
      supabase
        .from("project_files")
        .select("path, content")
        .eq("project_id", data.projectId),
    ]);

    const fileSnapshot = (files ?? [])
      .map((f) => `// FILE: ${f.path}\n${f.content.slice(0, 8000)}`)
      .join("\n\n");

    const messages: Array<{ role: string; content: string; tool_calls?: unknown; tool_call_id?: string; name?: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Current project files:\n\n${fileSnapshot || "(empty)"}`,
      },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    const changes: { action: "write" | "delete"; path: string }[] = [];
    let finalText = "";

    // Up to 8 tool-call rounds so the AI can build full multi-file projects in one turn
    for (let round = 0; round < 8; round++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages,
          tools: TOOLS,
          tool_choice: "auto",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) throw new Error("Rate limit reached. Try again shortly.");
        if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
        throw new Error(`AI gateway error ${res.status}: ${text}`);
      }

      const payload = await res.json();
      const choice = payload.choices?.[0];
      const msg = choice?.message;
      if (!msg) throw new Error("No response from model");

      const toolCalls = msg.tool_calls as
        | { id: string; function: { name: string; arguments: string } }[]
        | undefined;

      if (!toolCalls || toolCalls.length === 0) {
        finalText = msg.content ?? "";
        break;
      }

      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });

      for (const call of toolCalls) {
        let args: { path?: string; content?: string } = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        const path = (args.path || "").trim();
        if (!path) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify({ ok: false, error: "Missing path" }),
          });
          continue;
        }
        if (call.function.name === "write_file") {
          const content = args.content ?? "";
          const { error } = await supabase
            .from("project_files")
            .upsert(
              { project_id: data.projectId, path, content },
              { onConflict: "project_id,path" },
            );
          if (error) {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify({ ok: false, error: error.message }),
            });
          } else {
            changes.push({ action: "write", path });
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify({ ok: true, path }),
            });
          }
        } else if (call.function.name === "delete_file") {
          const { error } = await supabase
            .from("project_files")
            .delete()
            .eq("project_id", data.projectId)
            .eq("path", path);
          if (error) {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify({ ok: false, error: error.message }),
            });
          } else {
            changes.push({ action: "delete", path });
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify({ ok: true, path }),
            });
          }
        }
      }
    }

    if (!finalText) {
      finalText =
        changes.length > 0
          ? `Applied ${changes.length} change${changes.length === 1 ? "" : "s"}.`
          : "Done.";
    }

    await supabase.from("chat_messages").insert({
      project_id: data.projectId,
      role: "assistant",
      content: finalText,
      metadata: changes.length ? { changes } : null,
    });

    // touch project
    await supabase
      .from("projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.projectId);

    return { reply: finalText, changes };
  });
