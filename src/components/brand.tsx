import logoUrl from "@/assets/lumina-logo.png";

export function LuminaMark({ className = "size-6" }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="Lumina AI"
      className={className}
      style={{ filter: "drop-shadow(0 0 6px color-mix(in oklch, var(--color-accent) 60%, transparent))" }}
    />
  );
}

export function LuminaWordmark({ size = "sm" }: { size?: "sm" | "md" }) {
  const text = size === "md" ? "text-base" : "text-sm";
  return (
    <span className={`flex items-center gap-2`}>
      <LuminaMark className="size-6" />
      <span className={`${text} font-semibold tracking-tight`}>
        Lumina<span className="text-accent">AI</span>
      </span>
    </span>
  );
}
