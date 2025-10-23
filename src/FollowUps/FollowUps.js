// src/FollowUps/FollowUps.js
import React, { useEffect, useState } from "react";

import {
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Paper,
  Tabs,
  Tab,
  TextField,
  IconButton,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import FilterListIcon from "@mui/icons-material/FilterList";
import { format } from "date-fns";
import { doc, updateDoc } from "firebase/firestore";
import db from "../firebase";
import FollowUpScheduler from "./FollowUpScheduler";
import FollowUpNotes from "./FollowUpNotes";
// Importamos el proveedor de calendario
import { CalendarApp, CalendarProvider } from "./Calendar/";


const FollowUps = ({ clients, updateClientCommunication }) => {
  const theme = useTheme();
  const [clientsNeedingFollowUp, setClientsNeedingFollowUp] = useState([]);
  const [tabIndex, setTabIndex] = useState(0);
  const [filters, setFilters] = useState({
    search: "",
    amountDueMin: "",
    amountDueMax: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const getFollowUpColor = (count) => {
  if (count === 0) return theme.palette.primary.light;  // 1er seguimiento
  if (count === 1) return theme.palette.primary.main;   // 2º seguimiento
  if (count === 2) return theme.palette.primary.dark;   // 3er seguimiento
  if (count === 3) return theme.palette.warning.main;   // 4º seguimiento
  return theme.palette.error.main;                      // ≥5º seguimiento
};

   const getFollowUpColorName = (count) => {
   if (count === 0) return '1st Attempt';
   if (count === 1) return '2nd Attempt';
   if (count === 2) return '3rd Attempt';
   if (count === 3) return '4th Attempt';
   return '5th Attempt';
};


  useEffect(() => {
    filterClients();
  }, [clients]);

  const filterClients = () => {
    
    /* // fecha “hoy” a la medianoche
    const today = new Date(new Date().toDateString());
    // (quedamos con tu cutoffDate original para lastContact…)
    const cutoffDate = new Date(today.getFullYear(), today.getMonth(), 16);

    


    // ── MOD: Definir ventana mensual de seguimiento (corte día 15) ──
    const cutoffDay = 15;
    let windowStart, windowEnd;
    if (today.getDate() < cutoffDay) {
      // Antes del día 15: ventana del 15 del mes anterior al 15 de este mes
      windowStart = new Date(today.getFullYear(), today.getMonth() - 1, cutoffDay);
      windowEnd   = new Date(today.getFullYear(), today.getMonth(),     cutoffDay);
    } else {
      // A partir del día 15: ventana del 15 de este mes al 15 del próximo
      windowStart = new Date(today.getFullYear(), today.getMonth(),     cutoffDay);
      windowEnd   = new Date(today.getFullYear(), today.getMonth() + 1, cutoffDay);
    }
    // ────────────────────────────────────────────────────────────────

    const filteredClients = clients.filter((client) => {

      // ── MOD: Sólo incluir si nextFollowUpDate existe y cae en nuestra ventana
      if (!client.nextFollowUpDate) return false;
      const raw = client.nextFollowUpDate.seconds
      ? new Date(client.nextFollowUpDate.seconds * 1000)
      : new Date(client.nextFollowUpDate);
      if (raw < windowStart || raw >= windowEnd) return false;

        // MOD: Excluir clientes que ya hicieron Payment Promise
      if (client.paymentPromise) return false;
      const firstRaw = client.firstInstallmentDate;
      if (!firstRaw) return false;
      

      const firstInstallmentDate = firstRaw.seconds
        ? new Date(firstRaw.seconds * 1000)
        : new Date(firstRaw);
      if (isNaN(firstInstallmentDate.getTime())) return false;

      const monthly = Number(client.installmentAmount || 500);
      const payments = Array.isArray(client.payments) ? client.payments : [];

      const validPayments = payments.filter((p) => {
        const date = new Date(p.date);
        return !isNaN(date.getTime()) && date >= firstInstallmentDate;
      });

      const validTotalPaid = validPayments.reduce(
        (sum, p) => sum + p.amount,
        0
      );
      const paymentsMade = Math.floor(validTotalPaid / monthly);

      const monthsSinceStart =
        (today.getFullYear() - firstInstallmentDate.getFullYear()) * 12 +
        (today.getMonth() - firstInstallmentDate.getMonth()) +
        1;

      const missedPayments = Math.max(0, monthsSinceStart - paymentsMade);
      const isPastDue = missedPayments > 0;

      const logs = client.communicationLog || client.communicationLogs || [];
      const validDates = logs
        .map((log) => new Date(log.timestamp || log.date))
        .filter((d) => !isNaN(d.getTime()));

      const lastContactDate = validDates.length
        ? validDates.sort((a, b) => b - a)[0]
        : null;

      const wasContactedAfterCutoff =
        lastContactDate && lastContactDate > cutoffDate;

      const nextFollowUp = client.nextFollowUpDate
        ? new Date(new Date(client.nextFollowUpDate).toDateString())
        : null;

      const needsFollowUp =
        (isPastDue && !wasContactedAfterCutoff && !nextFollowUp) ||
        (isPastDue && nextFollowUp && nextFollowUp <= today);


      return needsFollowUp;
    }); 

    setClientsNeedingFollowUp(filteredClients); */

    // --- helpers de fecha a medianoche ---
  const atMidnight = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const parseDate = (v) => {
  if (!v) return null;
  // Firestore Timestamp (tiene .toDate())
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return isNaN(d) ? null : d;
  }
  // Objeto-like con seconds (también común en Firestore)
  if (typeof v?.seconds === "number") {
    return new Date(v.seconds * 1000);
  }
  // String / Date nativo
  const d = new Date(v);
  return isNaN(d) ? null : d;
};

  const today = atMidnight(new Date());

  // ⚠️ Regla: antes del 16, NO se muestran follow-ups del ciclo
  if (today.getDate() < 16) {
    setClientsNeedingFollowUp([]);
    return;
  }

  // 🧭 Ventana del CICLO recién cerrado: 16 (mes anterior) → 15 (mes actual)
  const cycleStart   = atMidnight(new Date(today.getFullYear(), today.getMonth() - 1, 16));
  const cycleEnd     = new Date(today.getFullYear(), today.getMonth(), 15, 23, 59, 59, 999);
  const prevCycleEnd = atMidnight(new Date(today.getFullYear(), today.getMonth() - 1, 15)); // 15 del mes anterior

  // Cuántos meses “esperados” desde el inicio hasta un pivot (fin del ciclo previo)
  const monthsExpectedUntil = (first, pivot) => {
    const f = atMidnight(first);
    const p = atMidnight(pivot);
    if (p < f) return 0;
    return (p.getFullYear() - f.getFullYear()) * 12 + (p.getMonth() - f.getMonth()) + 1;
  };

  // Cuota mensual del ciclo: si hay schedule que cruce la ventana, úsalo; si no, installmentAmount (o 500)
  const monthlyForCycle = (c) => {
    const sched = Array.isArray(c.installmentSchedule) ? c.installmentSchedule : [];
    for (const item of sched) {
      const s = parseDate(item.start);
      const e = parseDate(item.end);
      if (!s || !e) continue;
      const s0 = atMidnight(s);
      const e0 = atMidnight(e);
      const overlaps = !(e0 < cycleStart || s0 > cycleEnd);
      if (overlaps && Number(item.amount) > 0) {
        return Number(item.amount);
      }
    }
    const a = Number(c.installmentAmount || 500);
    return isFinite(a) && a > 0 ? a : 500;
  };

  const filtered = clients
    .map((client) => {
      // (conservamos tu criterio) si ya tiene Payment Promise, se excluye
      if (client.paymentPromise) return null;

      // Debe existir fecha de primer pago
      const firstRaw = client.firstInstallmentDate;
      if (!firstRaw) return null;
      const firstInstallmentDate = parseDate(firstRaw);
      if (!firstInstallmentDate) return null;

     // ✅ NEW (Candado A): si YA tiene next follow-up programado (cualquier fecha) → excluir
    const nextFU = parseDate(client.nextFollowUpDate);
    if (nextFU) return null;

    // ✅ NEW (Candado B): si hubo contacto en este ciclo → excluir
    const lastFUContact = parseDate(client.lastFollowUpContactDate);
    if (lastFUContact && atMidnight(lastFUContact) >= cycleStart) return null;

      // Si empezó después del fin del ciclo, aún no le tocaba pagar
      if (atMidnight(firstInstallmentDate) > cycleEnd) return null;

      const monthly = monthlyForCycle(client);

      // Pagos válidos desde el inicio
      const payments = Array.isArray(client.payments) ? client.payments : [];
      const validPayments = payments
        .map((p) => ({ ...p, date: parseDate(p.date) }))
        .filter((p) => p.date && atMidnight(p.date) >= atMidnight(firstInstallmentDate));

      // 1) ¿YA ERA PAST DUE ANTES DEL CICLO? (hasta 15 del mes anterior)
      const paidBeforeCycle = validPayments
        .filter((p) => atMidnight(p.date) < cycleStart)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const paidMonthsBefore = Math.floor(paidBeforeCycle / monthly);
      const expectedMonthsBefore = monthsExpectedUntil(firstInstallmentDate, prevCycleEnd);
      const wasPastDueBefore = expectedMonthsBefore > paidMonthsBefore;

      if (wasPastDueBefore) return null; // ❌ ya estaba atrasado → NO entra

      // 2) ¿PAGÓ LA CUOTA DEL CICLO RECIÉN CERRADO? (16-prev → 15-actual)
      const paidInCycle = validPayments
        .filter((p) => {
          const d = atMidnight(p.date);
          return d >= cycleStart && d <= cycleEnd;
        })
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const expectedInCycle = monthly;            // 1 cuota por ciclo
      if (paidInCycle >= expectedInCycle) return null; // ✔️ pagó → NO entra

      const amountDueCycle = Math.max(0, expectedInCycle - paidInCycle);

      // ✅ Guardamos derivados para usarlos en la tabla/filtrado
      return {
        ...client,
        __cycleMonthly: monthly,
        __cyclePaid: paidInCycle,
        __cycleExpected: expectedInCycle,
        __cycleAmountDue: amountDueCycle,
        __cycleStart: cycleStart,
        __cycleEnd: cycleEnd,
      };
    })
    .filter(Boolean);

  setClientsNeedingFollowUp(filtered);

  };

  const updateFollowUpDate = async (clientId, newDate) => {
    try {

      // Normaliza a medianoche local para consistencia
    const normalize = (v) => {
      const d = new Date(v);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    
      const clientRef = doc(db, "clients", clientId);
      await updateDoc(clientRef, {
        nextFollowUpDate: newDate,
        lastFollowUpContactDate: new Date().toISOString(),
      });
      
    } catch (error) {
      console.error("Error updating next follow-up date:", error);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const displayedClients = clientsNeedingFollowUp.filter((client) => {
    /* const monthly = Number(client.installmentAmount || 500);
    const payments = Array.isArray(client.payments) ? client.payments : [];

    const firstRaw = client.firstInstallmentDate;
    const firstInstallmentDate = firstRaw.seconds
      ? new Date(firstRaw.seconds * 1000)
      : new Date(firstRaw);

    const validPayments = payments.filter((p) => {
      const date = new Date(p.date);
      return !isNaN(date.getTime()) && date >= firstInstallmentDate;
    });

    const validTotalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
    const paymentsMade = Math.floor(validTotalPaid / monthly);

    const monthsSinceStart =
      (new Date().getFullYear() - firstInstallmentDate.getFullYear()) * 12 +
      (new Date().getMonth() - firstInstallmentDate.getMonth()) +
      1;

    const missedPayments = Math.max(0, monthsSinceStart - paymentsMade);
    const amountDue = missedPayments * monthly;

    const name =
      (client.name || (client.firstName || "") + " " + (client.lastName || "")).toLowerCase();

    if (
      filters.search &&
      !(
        name.includes(filters.search.toLowerCase()) ||
        paymentsMade.toString().includes(filters.search) ||
        monthsSinceStart.toString().includes(filters.search)
      )
    ) {
      return false;
    }
    if (filters.amountDueMin && amountDue < Number(filters.amountDueMin))
      return false;
    if (filters.amountDueMax && amountDue > Number(filters.amountDueMax))
      return false;

    return true; */

    const amountDue = Number(client.__cycleAmountDue || 0);
  const name = (
    client.name ||
    `${client.firstName || ""} ${client.lastName || ""}`
  )
    .trim()
    .toLowerCase();

  if (filters.search && !name.includes(filters.search.toLowerCase())) {
    return false;
  }
  if (filters.amountDueMin && amountDue < Number(filters.amountDueMin))
    return false;
  if (filters.amountDueMax && amountDue > Number(filters.amountDueMax))
    return false;

  return true;
  });


  // Construir eventos programados para todos los clientes con nextFollowUpDate
    const scheduledEvents = clients
    
    .filter(c => c.nextFollowUpDate)
    .map(c => {
      const when = new Date(c.nextFollowUpDate);
      const title = c.name || `${c.firstName || ""} ${c.lastName || ""}`;
      const logs = c.communicationLogs || c.communicationLog || [];
      const followUpCount = logs.length;
      const end = new Date(when);
      end.setDate(end.getDate() + 1);

      // ——— Aquí calculas el amountDue igual que en la tabla ———
      const monthly = Number(c.installmentAmount || 500);
      const payments = Array.isArray(c.payments) ? c.payments : [];
      const firstRaw = c.firstInstallmentDate;
      const firstDate = firstRaw.seconds
        ? new Date(firstRaw.seconds * 1000)
        : new Date(firstRaw);
      const validPayments = payments
        .map(p => ({ ...p, date: new Date(p.date) }))
        .filter(p => !isNaN(p.date) && p.date >= firstDate);
      const totalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
      const monthsSinceStart =
        (new Date().getFullYear() - firstDate.getFullYear()) * 12 +
        (new Date().getMonth() - firstDate.getMonth()) +
        1;
      const paidMonths = Math.floor(totalPaid / monthly);
      const missedMonths = Math.max(0, monthsSinceStart - paidMonths);
      const amountDue = missedMonths * monthly;
      // ————————————————————————————————————————————————
      
      let description = "";
      if (logs.length) {
        const sorted = [...logs].sort((a, b) =>
          new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)
        );
        const last = sorted[0];
        description = last.message || last.text || "";
      }
      return {
        id: `${c.id}-followup-${when.getTime()}`,
        title,
        start: when,
        end,
        description,
        color: getFollowUpColor(followUpCount),
        colorName: getFollowUpColorName(followUpCount),
        amountDue,
        extendedProps: { clientId: c.id }
      };
    });

  return (
    <CalendarProvider
      // Comentado: solo mostraba pendientes vencidos o de hoy
      // initialEvents={clientsNeedingFollowUp.map((client) => ({
      //   id: client.id,
      //   title: client.name || `${client.firstName} ${client.lastName}`,
      //   start: client.nextFollowUpDate,
      //   end: client.nextFollowUpDate,
      // }))}
      // Ahora: cargamos todos los follow-ups programados
      initialEvents={scheduledEvents}
    >
      <Box p={3}>
        <Tabs
          value={tabIndex}
          onChange={(e, newValue) => setTabIndex(newValue)}
          aria-label="follow up tabs"
          sx={{ mb: 2 }}
        >
          <Tab label="📌 Outstanding Client Follow-Ups" />
          <Tab label="📅 Calendar" />
        </Tabs>

        {tabIndex === 0 && (
          <Paper elevation={3}>
            <Box
              p={2}
              display="flex"
              gap={2}
              flexWrap="wrap"
              alignItems="center"
            >
              <IconButton onClick={() => setShowFilters((prev) => !prev)}>
                <FilterListIcon
                  color={showFilters ? "primary" : "inherit"}
                />
              </IconButton>
              {showFilters && (
                <>
                  <TextField
                    label="Search"
                    placeholder="Client Name, Payments Made, Expected"
                    value={filters.search}
                    onChange={(e) =>
                      handleFilterChange("search", e.target.value)
                    }
                    size="small"
                  />
                  <TextField
                    label="Amount Due Min"
                    value={filters.amountDueMin}
                    onChange={(e) =>
                      handleFilterChange("amountDueMin", e.target.value)
                    }
                    size="small"
                  />
                  <TextField
                    label="Amount Due Max"
                    value={filters.amountDueMax}
                    onChange={(e) =>
                      handleFilterChange("amountDueMax", e.target.value)
                    }
                    size="small"
                  />
                </>
              )}
            </Box>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <strong>Client Name</strong>
                  </TableCell>
                  <TableCell>Installment</TableCell>
                  <TableCell>Payments Made</TableCell>
                  <TableCell>Expected</TableCell>
                  <TableCell>
                    <strong>Amount Due</strong>
                  </TableCell>
                  <TableCell>
                    <strong>MyCase</strong>
                  </TableCell>
                  <TableCell>
                    <strong>Next Follow-Up</strong>
                  </TableCell>
                  <TableCell>Last Contact</TableCell>
                  <TableCell>
                    <strong>Note</strong>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clientsNeedingFollowUp.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      🎉 All follow-ups are complete for this month!
                    </TableCell>
                  </TableRow>
                ) : displayedClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      No results match the filters.
                    </TableCell>
                  </TableRow>
                ) : ( 
                  displayedClients.map((client) => {
                  // ✅ AHORA usamos los campos del ciclo calculados en filterClients()
                  const monthly     = Number(client.__cycleMonthly || 0);
                  const paidInCycle = Number(client.__cyclePaid || 0);
                  const expected    = Number(client.__cycleExpected || 0);
                  const amountDue   = Number(client.__cycleAmountDue || 0);

                  // Último contacto (igual que tenías)
                  const logs =
                    client.communicationLog || client.communicationLogs || [];
                  const lastLog = logs
                    .map((log) => new Date(log.timestamp || log.date))
                    .filter((d) => !isNaN(d.getTime()))
                    .sort((a, b) => b - a)[0];
                  /* displayedClients.map((client) => {
                    const monthly = Number(client.installmentAmount || 500);
                    const payments = Array.isArray(client.payments)
                      ? client.payments
                      : [];

                    const firstRaw = client.firstInstallmentDate;
                    const firstInstallmentDate = firstRaw.seconds
                      ? new Date(firstRaw.seconds * 1000)
                      : new Date(firstRaw);

                    const validPayments = payments.filter((p) => {
                      const date = new Date(p.date);
                      return !isNaN(date.getTime()) && date >= firstInstallmentDate;
                    });

                    const validTotalPaid = validPayments.reduce(
                      (sum, p) => sum + p.amount,
                      0
                    );
                    const paymentsMade = Math.floor(validTotalPaid / monthly);

                    const monthsSinceStart =
                      (new Date().getFullYear() -
                        firstInstallmentDate.getFullYear()) *
                        12 +
                      (new Date().getMonth() -
                        firstInstallmentDate.getMonth()) +
                      1;

                    const missedPayments = Math.max(
                      0,
                      monthsSinceStart - paymentsMade
                    );
                    const amountDue = missedPayments * monthly;

                    const lastLog = (
                      client.communicationLog ||
                      client.communicationLogs ||
                      []
                    )
                      .map((log) => new Date(log.timestamp || log.date))
                      .filter((d) => !isNaN(d.getTime()))
                      .sort((a, b) => b - a)[0]; */

                    return (
                      <TableRow key={client.id}>
                        <TableCell>
                          {client.name ||
                            `${client.firstName} ${client.lastName}`}
                        </TableCell>
                        <TableCell>
                          ${monthly.toLocaleString()}
                        </TableCell>
                        <TableCell>${/*paymentsMade*/ paidInCycle.toLocaleString()}</TableCell>
                        <TableCell>${/*monthsSinceStart*/ expected.toLocaleString()}</TableCell>
                        <TableCell>
                          ${amountDue.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {client.myCaseLink ? (
                            <a
                              href={client.myCaseLink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button variant="outlined">Open</Button>
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <FollowUpScheduler
                            client={client}
                            updateFollowUpDate={updateFollowUpDate}
                          />
                        </TableCell>
                        <TableCell>
                          {lastLog && !isNaN(lastLog.getTime())
                            ? format(lastLog, "MMMM d, yyyy")
                            : "No contact yet"}
                        </TableCell>
                        <TableCell>
                          <FollowUpNotes
                            clientId={client.id}
                            clientName={client.name}
                            nextFollowUpDate={client.nextFollowUpDate}
                            onSave={() => setClientsNeedingFollowUp(prev =>prev.filter(c => c.id !== client.id)
                               )
                             }
                          /> 
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Paper>
        )}

        {tabIndex === 1 && (
          <Paper
            elevation={3}
            sx={{
              mt: 2,
              p: 2,
              bgcolor: "background.paper",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <CalendarApp />
            {/* MOD: pasamos el callback onPromise para quitar cliente */}
          <CalendarApp
            onPromise={(clientId) =>
              setClientsNeedingFollowUp(prev =>
                prev.filter(c => c.id !== clientId)
              )
            }
          />
          </Paper>
        )}
      </Box>
    </CalendarProvider>
  );
};

export default FollowUps;
