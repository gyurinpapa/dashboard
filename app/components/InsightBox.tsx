export default function InsightBox({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 24,
        padding: 20,
        borderRadius: 12,
        background: "#f8fafc",
        border: "1px solid #e5e7eb",
        lineHeight: 1.7,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Performance Insight</div>
      <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{text || "인사이트 생성 중..."}</div>
    </div>
  );
}
