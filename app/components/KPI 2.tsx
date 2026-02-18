export default function KPI({ title, value }: { title: string; value: string }) {
  return (
    <div className="border rounded-xl p-4 min-w-[160px]">
      <div className="text-sm text-gray-500 whitespace-nowrap">{title}</div>
      <div className="text-2xl font-bold mt-1 whitespace-nowrap">{value}</div>
    </div>
  );
}
