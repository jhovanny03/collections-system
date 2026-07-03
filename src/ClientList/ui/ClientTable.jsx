// src/ClientList/ui/ClientTable.jsx
import React from "react";
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
} from "@mui/material";
import ClientRow from "./ClientRow";

export default function ClientTable({
  rows,
  orderBy,
  order,
  onRequestSort,
  onEditClick,
  onDeleteClick,
}) {
  return (
    <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ "& th": { fontWeight: 700 } }}>
            <TableCell sortDirection={orderBy === "firstName" ? order : false}>
              <TableSortLabel
                active={orderBy === "firstName"}
                direction={orderBy === "firstName" ? order : "asc"}
                onClick={() => onRequestSort("firstName")}
              >
                Name
              </TableSortLabel>
            </TableCell>

            <TableCell>Case Type</TableCell>

            <TableCell sortDirection={orderBy === "caseStatus" ? order : false}>
              <TableSortLabel
                active={orderBy === "caseStatus"}
                direction={orderBy === "caseStatus" ? order : "asc"}
                onClick={() => onRequestSort("caseStatus")}
              >
                Case Status
              </TableSortLabel>
            </TableCell>

            <TableCell>MyCase</TableCell>

            <TableCell
              align="right"
              sortDirection={orderBy === "computedAmountDue" ? order : false}
            >
              <TableSortLabel
                active={orderBy === "computedAmountDue"}
                direction={orderBy === "computedAmountDue" ? order : "asc"}
                onClick={() => onRequestSort("computedAmountDue")}
              >
                Amount Due
              </TableSortLabel>
            </TableCell>

            <TableCell>Months Past Due</TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {rows.map((client) => (
            <ClientRow
              key={client.id}
              client={client}
              onEditClick={onEditClick}
              onDeleteClick={onDeleteClick}
            />
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} align="center" sx={{ py: 6, color: "text.secondary" }}>
                No clients found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}