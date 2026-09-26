function colorFor(score: number) {
  if (score >= 70) return "var(--approved)";
  if (score >= 40) return "var(--warn)";
  return "var(--proof)";
}

export default function ScoreStamp({
  score,
  size = "md",
}: {
  score: number;
  size?: "sm" | "md" | "lg";
}) {
  const dims = {
    sm: { box: 38, font: "0.7rem", label: "0.45rem" },
    md: { box: 52, font: "0.95rem", label: "0.5rem" },
    lg: { box: 80, font: "1.6rem", label: "0.6rem" },
  }[size];

  const color = colorFor(score);

  return (
    <div
      className="stamp flex-col leading-none shrink-0"
      style={{
        width: dims.box,
        height: dims.box,
        color,
      }}
      title={`SEO score: ${score}/100`}
    >
      <span style={{ fontSize: dims.font }}>{score}</span>
      {size !== "sm" && (
        <span
          className="uppercase tracking-widest"
          style={{ fontSize: dims.label, marginTop: 2 }}
        >
          score
        </span>
      )}
    </div>
  );
}
