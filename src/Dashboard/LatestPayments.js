import React from "react";
import {
  Card, CardHeader, CardContent,
  Table, TableBody, TableCell, TableHead, TableRow,
  Chip
} from "@mui/material";

// Espera prop: rows = [{ id, client, date, amount, status }]
export default function LatestPayments({ rows = [] }) {
  const colorFor = (s) =>
    s === "Delivered" ? "success" : s === "Refunded" ? "warning" : "default";

  return (
    <Card sx={{ borderRadius: 3, boxShadow: 2 }}>
      <CardHeader title="Latest payments" subheader="Recent activity" />
      <CardContent sx={{ pt: 0 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Id</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.id}</TableCell>
                <TableCell>{r.client}</TableCell>
                <TableCell>{r.date}</TableCell>
                <TableCell align="right">${r.amount?.toLocaleString?.() || r.amount}</TableCell>
                <TableCell>
                  <Chip size="small" label={r.status} color={colorFor(r.status)} />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>No recent payments.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
