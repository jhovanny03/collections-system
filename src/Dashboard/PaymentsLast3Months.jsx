/*import React from 'react';
import DashboardCard from './DashboardCard';
import { BarChart } from '@mui/x-charts/BarChart';

const rows = [
  { month: 'March', payments: 18000 },
  { month: 'April', payments: 22000 },
  { month: 'May', payments: 25000 },
];

export default function PaymentsLast3Months({ height = 300 }) {
  return (
    <DashboardCard title="Payments Last 3 Months">
      <BarChart
        height={height}
        xAxis={[{ scaleType: 'band', data: rows.map(r => r.month) }]}
        series={[{ data: rows.map(r => r.payments) }]}
        grid={{ horizontal: true }}
      />
    </DashboardCard>
  );
}*/

// ==========================
// src/Dashboard/PaymentsLast3Months.jsx
// ==========================

import React, { useEffect, useMemo, useState } from "react";
import DashboardCard from "./DashboardCard";
import { BarChart } from "@mui/x-charts/BarChart";
import { useTheme } from '@mui/material/styles';
import { Box, Typography, Divider } from "@mui/material";

// NEW: carga opcional desde Firestore si no recibimos `clients` por props
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase"; // <-- igual que en tu Dashboard.js

/**
 * *************** CAMBIOS CLAVE VS TU ARCHIVO QUE ENVIASTE ***************
 * - REEMPLAZADO: ya no sumamos "cash-in" del mes. Ahora mostramos 2 series:
 *     Expected (cuota del mes) vs Covered (lo cubierto de ese mes tras FIFO).
 * - ADD: helpers para construir timeline mensual y aplicar pagos por FIFO.
 * - ADD: excluir pagos “initial” (flag + heurística por fecha).
 * - SAME: puede recibir `clients` por props o cargar de Firestore si no vienen.
 **************************************************************************
 */

// ---------- Utilidades de fecha ----------
const toDate = (v) =>
  v?.toDate?.() ? v.toDate() : isNaN(new Date(v)) ? null : new Date(v);

const startOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);

const endOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

const addMonths = (d, n) =>
  new Date(d.getFullYear(), d.getMonth() + n, 1, 0, 0, 0, 0);

const monthShort = (date) =>
  date.toLocaleString("default", { month: "short" }); // "Jul", "Aug", "Sep"

const formatMoney = (n) =>
  typeof n === "number" ? `$${Math.round(n).toLocaleString()}` : "—";


// Últimos N meses (ascendente: M-2 → M)
function lastNMonths(baseDate = new Date(), n = 3) {
  const months = [];
  const base = startOfMonth(baseDate);
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(base, -i);
    months.push({
      label: monthShort(m),
      start: startOfMonth(m),
      end: endOfMonth(m),
      monthDate: m,
    });
  }
  return months;
}

// ========= NUEVO: cuota del mes (soporta schedule o fallback a installmentAmount/500)
function getMonthlyForMonth(client, monthDate) {
  const schedule = Array.isArray(client?.installmentSchedule)
    ? client.installmentSchedule
    : [];

  const mStart = startOfMonth(monthDate);
  const mEnd = endOfMonth(monthDate);

  // Buscar tramo del schedule que solape el mes
  for (const item of schedule) {
    const s = toDate(item?.start);
    const e = toDate(item?.end);
    const amt = Number(item?.amount || 0);
    if (!s || !e || !amt) continue;
    const overlaps = !(e < mStart || s > mEnd);
    if (overlaps) return amt;
  }

  // Fallback
  const fallback = Number(client?.installmentAmount || 0) || 500;
  return fallback > 0 ? fallback : 0;
}

// ========= NUEVO: ¿Es pago “initial”? (flag + heurística por fecha)
function isInitialPayment(pay, client) {
  const type = (pay?.type || pay?.category || "").toString().toLowerCase();
  if (pay?.isInitial === true) return true;
  if (["initial", "retainer", "setup"].includes(type)) return true;

  const first = toDate(client?.firstInstallmentDate);
  if (!first) return false; // sin fecha de inicio no aplicamos heurística
  const firstMonthStart = startOfMonth(first);
  const d = toDate(pay?.date);
  return d && d < firstMonthStart; // antes del primer mes de cuotas = initial
}

// ========= NUEVO: construir timeline mensual desde el inicio del plan hasta el mes actual
function buildMonthTimeline(client, asOf = new Date()) {
  const start = toDate(client?.firstInstallmentDate);
  if (!start) return []; // si no hay inicio, no se computa
  const firstMonth = startOfMonth(start);
  const lastMonth = startOfMonth(asOf);
  if (lastMonth < firstMonth) return [];

  const months = [];
  for (let cursor = new Date(firstMonth); cursor <= lastMonth; cursor = addMonths(cursor, 1)) {
    months.push({
      monthDate: new Date(cursor),
      expected: getMonthlyForMonth(client, cursor),
      collected: 0,
    });
  }
  return months;
}

// ========= NUEVO: aplicar pagos por FIFO (excluye initial y sólo hasta 'asOf')
function applyPaymentsFIFO(client, months, asOf = new Date()) {
  if (!months.length) return months;

  const firstStart = startOfMonth(months[0].monthDate);
  const asOfEnd = endOfMonth(asOf);

  const payments = (client?.payments || [])
    .map((p) => ({ amount: Number(p?.amount || 0), date: toDate(p?.date), raw: p }))
    .filter(
      (p) =>
        p.amount > 0 &&
        p.date &&
        p.date >= firstStart &&
        p.date <= asOfEnd &&
        !isInitialPayment(p.raw, client)
    )
    .sort((a, b) => a.date - b.date); // FIFO

  for (const pay of payments) {
    let remain = pay.amount;
    for (let i = 0; i < months.length && remain > 0; i++) {
      const need = Math.max(0, months[i].expected - months[i].collected);
      if (need <= 0) continue;
      const applied = Math.min(need, remain);
      months[i].collected += applied;
      remain -= applied;
    }
  }

  // Cap por sanidad (no debería pasar)
  for (const m of months) {
    m.collected = Math.min(m.collected, m.expected);
  }
  return months;
}

// ========= NUEVO: sumar Expected y Covered para M-2, M-1 y M (agrupado)
function aggregateExpectedCoveredForLast3Months(allClients, asOf = new Date()) {
  const monthsTarget = lastNMonths(asOf, 3); // [M-2, M-1, M]
  const totals = monthsTarget.map(() => ({ expected: 0, covered: 0 }));

  for (const c of allClients) {
    const timeline = applyPaymentsFIFO(c, buildMonthTimeline(c, asOf), asOf);
    if (!timeline.length) continue;

    // para cada uno de los 3 meses objetivo, sumar expected y collected de ese mes
    monthsTarget.forEach((target, idx) => {
      const monthKey = target.monthDate.getFullYear() * 100 + target.monthDate.getMonth();
      const row = timeline.find(
        (m) => m.monthDate.getFullYear() * 100 + m.monthDate.getMonth() === monthKey
      );
      if (row) {
        totals[idx].expected += Number(row.expected || 0);
        totals[idx].covered += Number(row.collected || 0);
      }
    });
  }

  // redondeo visual
  const expected = totals.map((t) => Math.round(t.expected));
  const covered = totals.map((t) => Math.round(t.covered));
  const labels = monthsTarget.map((m) => m.label);

  return { labels, expected, covered };
}

export default function PaymentsLast3Months({ height = 300, clients: clientsProp }) {
  const theme = useTheme();
  // Estado interno por si NO pasas `clients` (igual que antes)
  const [clients, setClients] = useState(
    Array.isArray(clientsProp) ? clientsProp : null
  );

  // Si cambian las props, sincronizamos
  useEffect(() => {
    if (Array.isArray(clientsProp)) setClients(clientsProp);
  }, [clientsProp]);

  // Carga desde Firestore si no recibimos `clients`
  useEffect(() => {
    if (clients !== null) return; // ya tenemos datos por props
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, "clients"));
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setClients(list);
      } catch (e) {
        console.error("🔥 Error loading clients for PaymentsLast3Months:", e);
        setClients([]); // evita bloqueo visual
      }
    })();
  }, [clients]);

  // ====== NUEVO: construir Expected vs Covered (FIFO) para los últimos 3 meses
  const { labels, expected, covered } = useMemo(() => {
    if (!Array.isArray(clients)) {
      return { labels: [], expected: [], covered: [] };
    }
    return aggregateExpectedCoveredForLast3Months(clients, new Date());
  }, [clients]);

  return (
    <DashboardCard title="Payments Last 3 Months">
      <BarChart
        sx={{
           // contorno de cada barra
           '& .MuiBarElement-root': {
             stroke: theme.palette.background.paper, // mismo truco que el pie
             strokeWidth: 1.5,
             shapeRendering: 'crispEdges', // para bordes más definidos
           },
         }}
        height={height}
        xAxis={[{ scaleType: "band", data: labels }]}
        series={[
          {
            label: "Expected",
            data: expected,
            color: '#F59E0B',
            valueFormatter: (v) =>
              typeof v === "number" ? `$${v.toLocaleString()}` : v,
          },
          {
            label: "Covered",
            data: covered,
            color: '#10B981',
            valueFormatter: (v) =>
              typeof v === "number" ? `$${v.toLocaleString()}` : v,
          },
        ]}
        // barras agrupadas (2 por mes)
        slotProps={{ legend: { hidden: false } }}
        grid={{ horizontal: true }}
      />
      {/* =========================
         ADD: Resumen numérico fijo
         ========================= */}
      <Box sx={{ mt: 1.5 }}>
        <Divider sx={{ mb: 1 }} />
        {/* Header con los meses */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `120px repeat(${labels.length}, 1fr)`,
            gap: 1,
            alignItems: "center",
          }}
        >
          <Box />
          {labels.map((lbl) => (
            <Typography key={`hdr-${lbl}`} variant="caption" sx={{ fontWeight: 700, textAlign: "right" }}>
              {lbl}
            </Typography>
          ))}

          {/* Fila Expected */}
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Expected
          </Typography>
          {expected.map((v, i) => (
            <Typography key={`exp-${i}`} variant="body2" sx={{ textAlign: "right" }}>
              {formatMoney(v)}
            </Typography>
          ))}

          {/* Fila Covered */}
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Covered
          </Typography>
          {covered.map((v, i) => (
            <Typography key={`cov-${i}`} variant="body2" sx={{ textAlign: "right" }}>
              {formatMoney(v)}
            </Typography>
          ))}
        </Box>
      </Box>
    </DashboardCard>
  );
}
