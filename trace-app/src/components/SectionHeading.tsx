export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={`flex flex-col gap-3 ${align === "center" ? "items-center text-center" : "items-start text-left"} max-w-3xl ${align === "center" ? "mx-auto" : ""}`}>
      {eyebrow && (
        <span className="text-xs font-semibold tracking-[0.18em] uppercase text-primary">
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground text-balance">
        {title}
      </h2>
      {subtitle && (
        <p className="text-muted-foreground text-base md:text-lg leading-relaxed text-balance">
          {subtitle}
        </p>
      )}
    </div>
  );
}
