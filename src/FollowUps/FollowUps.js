// src/FollowUps/FollowUps.js
import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Paper,
} from "@mui/material";
import { format } from "date-fns";
import { doc, updateDoc } from "firebase/firestore";
import db from "../firebase";
import FollowUpScheduler from "./FollowUpScheduler";
import { shouldTriggerRecurringFollowUp } from "./FollowUpCycle";
import FollowUpNotes from "./FollowUpNotes";

const FollowUps = ({ clients, updateClientCommunication }) => {
  const [clientsNeedingFollowUp, setClientsNeedingFollowUp] = useState([]);

  useEffect(() => {
    filterClients();
  }, [clients]);

  const filterClients = () => {
    const today = new Date(new Date().toDateString());
    const cutoffDate = new Date(today.getFullYear(), today.getMonth(), 16);

    const filteredClients = clients.filter((client) => {
      const firstRaw = client.firstInstallmentDate;
      if (!firstRaw) return false;

      const firstInstallmentDate = firstRaw?.seconds
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

    setClientsNeedingFollowUp(filteredClients);
  };

  const updateFollowUpDate = async (clientId, newDate) => {
    try {
      const clientRef = doc(db, "clients", clientId);
      await updateDoc(clientRef, {
        nextFollowUpDate: newDate,
        lastFollowUpContactDate: new Date().toISOString(),
      });

      filterClients(); // Re-run filter to remove client if follow-up moved
    } catch (error) {
      console.error("Error updating next follow-up date:", error);
    }
  };

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        📌 Outstanding Client Follow-Ups
      </Typography>
      <Paper elevation={3}>
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
            ) : (
              clientsNeedingFollowUp.map((client) => {
                const monthly = Number(client.installmentAmount || 500);
                const payments = Array.isArray(client.payments)
                  ? client.payments
                  : [];

                const firstRaw = client.firstInstallmentDate;
                const firstInstallmentDate = firstRaw?.seconds
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
                  (new Date().getMonth() - firstInstallmentDate.getMonth()) +
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
                  .sort((a, b) => b - a)[0];

                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      {client.name ||
                        `${client.firstName || ""} ${client.lastName || ""}`}
                    </TableCell>
                    <TableCell>${monthly.toLocaleString()}</TableCell>
                    <TableCell>{paymentsMade}</TableCell>
                    <TableCell>{monthsSinceStart}</TableCell>
                    <TableCell>${amountDue.toLocaleString()}</TableCell>
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
                      <FollowUpNotes clientId={client.id} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

export default FollowUps;
