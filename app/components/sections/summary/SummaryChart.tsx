    "use client";

import { KRW } from "../../../lib/report/format";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Line,
} from "recharts";

type Props = {
  data: any[];
};

function ArrowDot(props: any) {
  const { cx, cy, payload } = props;

  if (!payload) return null;

  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill="#EF4444" />
    </g>
  );
}

export default function SummaryChart({ data }: Props) {
  return (
    <div className="w-full h-[420px] border rounded-xl p-4">
            <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis
                yAxisId="left"
                tick={{ fontSize: 10 }}
                width={70}
                tickFormatter={(v: any) => Number(v).toLocaleString()}
                />
                <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10 }}
                width={60}
                tickFormatter={(v: any) => `${(Number(v) * 100).toFixed(1)}%`}
                />

                <Tooltip
                formatter={(value: any, name: any, item: any) => {
                    const key = item?.dataKey ?? name;
                    if (key === "roas") return [`${(Number(value) * 100).toFixed(1)}%`, "ROAS"];
                    if (key === "cost") return [`${KRW(Number(value))}`, "비용"];
                    if (key === "revenue") return [`${KRW(Number(value))}`, "전환매출"];
                    return [value, name];
                }}
                />
                <Legend />

                <Bar yAxisId="left" dataKey="cost" stackId="a" name="비용" fill="#F59E0B" />
                <Bar yAxisId="left" dataKey="revenue" stackId="a" name="전환매출" fill="#38BDF8" />

                <Line
                yAxisId="right"
                type="monotone"
                dataKey="roas"
                name="ROAS"
                stroke="#EF4444"
                strokeWidth={3}
                dot={(props) => <ArrowDot {...props} />}
                activeDot={{ r: 7 }}
                />
            </ComposedChart>
            </ResponsiveContainer>
        </div>
          );
}
        