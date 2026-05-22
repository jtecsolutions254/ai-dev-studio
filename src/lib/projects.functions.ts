import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_INDEX = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>New Project</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0d1117; color: #e6edf3; display:grid; place-items:center; min-height:100vh; margin:0; }
    .card { padding: 2rem 2.5rem; border:1px solid #30363d; border-radius: 12px; background:#161b22; text-align:center; }
    h1 { margin: 0 0 .5rem; font-size: 1.5rem; }
    p { margin: 0; color: #8b949e; font-size: .9rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hello from SYNTAX.OS</h1>
    <p>Ask the AI engineer to build something.</p>
  </div>
</body>
</html>`;

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, description, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: project, error } = await supabase
      .from("projects")
      .insert({ name: data.name, description: data.description ?? null, user_id: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: fileErr } = await supabase.from("project_files").insert({
      project_id: project.id,
      path: "index.html",
      content: DEFAULT_INDEX,
    });
    if (fileErr) throw new Error(fileErr.message);
    return project;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [{ data: project, error: pe }, { data: files, error: fe }, { data: messages, error: me }] =
      await Promise.all([
        supabase.from("projects").select("id, name, description").eq("id", data.id).single(),
        supabase
          .from("project_files")
          .select("id, path, content, updated_at")
          .eq("project_id", data.id)
          .order("path"),
        supabase
          .from("chat_messages")
          .select("id, role, content, created_at")
          .eq("project_id", data.id)
          .order("created_at"),
      ]);
    if (pe) throw new Error(pe.message);
    if (fe) throw new Error(fe.message);
    if (me) throw new Error(me.message);
    return { project, files: files ?? [], messages: messages ?? [] };
  });

export const saveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        path: z.string().trim().min(1).max(255),
        content: z.string().max(500_000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("project_files")
      .upsert(
        { project_id: data.projectId, path: data.path, content: data.content },
        { onConflict: "project_id,path" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid(), path: z.string().min(1) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("project_files")
      .delete()
      .eq("project_id", data.projectId)
      .eq("path", data.path);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
