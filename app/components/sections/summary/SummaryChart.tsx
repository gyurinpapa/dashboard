"use client";

import { KRW } from "../../../../src/lib/report/format";
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
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900">
          월별 비용 · 전환매출 · ROAS
        </div>
        <div className="mt-1 text-xs font-medium text-gray-500">
          최근 월별 핵심 성과 흐름
        </div>
      </div>

      <div className="h-[420px] px-4 py-4 sm:px-5 sm:py-5">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />

            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#6B7280" }}
              axisLine={{ stroke: "#E5E7EB" }}
              tickLine={{ stroke: "#E5E7EB" }}
            />

            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: "#6B7280" }}
              width={70}
              axisLine={{ stroke: "#E5E7EB" }}
              tickLine={{ stroke: "#E5E7EB" }}
              tickFormatter={(v: any) => Number(v).toLocaleString()}
            />

            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: "#6B7280" }}
              width={60}
              axisLine={{ stroke: "#E5E7EB" }}
              tickLine={{ stroke: "#E5E7EB" }}
              tickFormatter={(v: any) => `${(Number(v) * 100).toFixed(1)}%`}
            />

            <Tooltip
              contentStyle={{
                borderRadius: 16,
                border: "1px solid #E5E7EB",
                backgroundColor: "#FFFFFF",
                boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
                padding: "10px 12px",
                fontSize: "12px",
              }}
              labelStyle={{
                color: "#111827",
                fontWeight: 600,
                marginBottom: 6,
              }}
              formatter={(value: any, name: any, item: any) => {
                const key = item?.dataKey ?? name;
                if (key === "roas") return [`${(Number(value) * 100).toFixed(1)}%`, "ROAS"];
                if (key === "cost") return [`${KRW(Number(value))}`, "비용"];
                if (key === "revenue") return [`${KRW(Number(value))}`, "전환매출"];
                return [value, name];
              }}
            />

            <Legend
              wrapperStyle={{
                fontSize: "12px",
                color: "#4B5563",
                paddingTop: 8,
              }}
            />

            <Bar
              yAxisId="left"
              dataKey="cost"
              stackId="a"
              name="비용"
              fill="#F59E0B"
              radius={[8, 8, 0, 0]}
            />
            <Bar
              yAxisId="left"
              dataKey="revenue"
              stackId="a"
              name="전환매출"
              fill="#38BDF8"
              radius={[8, 8, 0, 0]}
            />

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
    </div>
  );
}