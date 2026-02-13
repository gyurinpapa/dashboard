export default function ArrowDot(props: any) {
  const { cx, cy, index, data } = props;
  if (!data || !Array.isArray(data)) return null;
  if (index !== data.length - 1) return null;

  return (
    <text x={cx} y={cy} dy={4} dx={8} fill="#ef4444" fontSize={20}>
      →
    </text>
  );
}
