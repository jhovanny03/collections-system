// src/Reports/components/CollectionsPeriodChart.js
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@mui/material";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Cell,
  LabelList,
} from "recharts";

const money = (n) => `$${Number(n || 0).toLocaleString()}`;

export default function CollectionsPeriodChart({ byPeriod }) {
  const data = useMemo(
    () =>
      (byPeriod || []).map((r) => {
        const expected = Number(r.expected || 0);
        const actual = Number(r.actual || 0);
        const ratePct = expected > 0 ? Math.round((actual / expected) * 100) : 0;
        const variance = actual - expected;
        return {
          label: r.label,
          expected,
          actual,
          ratePct,
          variance,
        };
      }),
    [byPeriod]
  );

  // Legend labels
  const LEGEND_EXPECTED = "Expected";
  const LEGEND_ACTUAL = "Actual";

  // Colors
  const expectedColor = "#6B7280"; // darker neutral gray
  const colorForRate = (ratePct) => {
    if (ratePct >= 90) return "#16A34A"; // green (90–100%)
    if (ratePct >= 60) return "#F59E0B"; // orange (60–89%)
    return "#DC2626"; // red (<60%)
  };

  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardHeader
        title="Expected vs Actual (by period)"
        subheader="Monthly view based on due-month allocation"
      />
      <CardContent sx={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 24, bottom: 8, left: 0 }}
            barCategoryGap={18}
            barGap={6}
          >
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip
              formatter={(value, name, { payload }) => {
                if (name === "Rate") return [`${payload.ratePct}%`, "Rate"];
                if (name === "Variance") return [money(payload.variance), "Variance"];
                return [money(value), name];
              }}
              labelFormatter={(label) => `${label}`}
            />
            <Legend
              payload={[
                { id: "exp", value: LEGEND_EXPECTED, color: expectedColor, type: "square" },
                { id: "act", value: LEGEND_ACTUAL, color: "#16A34A", type: "square" }, // base color (legend only)
              ]}
            />

            {/* Expected bars (neutral gray) */}
            <Bar dataKey="expected" name={LEGEND_EXPECTED} radius={[4, 4, 0, 0]} fill={expectedColor}>
              {/* optional: labels on top of bars */}
              <LabelList dataKey="expected" position="top" formatter={money} style={{ fontSize: 11 }} />
            </Bar>

            {/* Actual bars with dynamic color per bar */}
            <Bar dataKey="actual" name={LEGEND_ACTUAL} radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={`a-${i}`} fill={colorForRate(d.ratePct)} />
              ))}
              {/* optional: labels on top of bars */}
              <LabelList dataKey="actual" position="top" formatter={money} style={{ fontSize: 11 }} />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}