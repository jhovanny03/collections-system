import React from "react";
import {
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Chip, Button, Box
} from "@mui/material";

const money = (n) => `$${Number(n || 0).toLocaleString()}`;

export function ByPeriodTable({ rows, dense }) {
  return (
    <Box sx={{ overflowX: "auto" }}>
      <TableContainer sx={{ maxHeight: 420, borderRadius: 2, minWidth: 680 }}>
        <Table stickyHeader size={dense ? "small" : "medium"}>
          <TableHead>
            <TableRow sx={{ "& th": { fontWeight: 700 } }}>
              <TableCell>Period</TableCell>
              <TableCell align="right">Expected</TableCell>
              <TableCell align="right">Actual</TableCell>
              <TableCell align="right">Variance</TableCell>
              <TableCell align="right">Rate %</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow
                key={`${r.label}-${idx}`}
                hover
                sx={{ "&:nth-of-type(odd)": { bgcolor: "action.hover" } }}
              >
                <TableCell>{r.label}</TableCell>
                <TableCell align="right">{money(r.expected)}</TableCell>
                <TableCell align="right">{money(r.actual)}</TableCell>
                <TableCell align="right">{money(r.variance)}</TableCell>
                <TableCell align="right">
                  <Chip
                    label={`${r.ratePct}%`}
                    color={r.ratePct >= 100 ? "success" : r.ratePct >= 70 ? "warning" : "error"}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  No rows.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export function ByCaseTypeTable({ rows, dense }) {
  return (
    <Box sx={{ overflowX: "auto" }}>
      <TableContainer sx={{ maxHeight: 420, borderRadius: 2, minWidth: 720 }}>
        <Table stickyHeader size={dense ? "small" : "medium"}>
          <TableHead>
            <TableRow sx={{ "& th": { fontWeight: 700 } }}>
              <TableCell>Case Type</TableCell>
              <TableCell align="right">Expected</TableCell>
              <TableCell align="right">Actual</TableCell>
              <TableCell align="right">Variance</TableCell>
              <TableCell align="right">Clients</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.caseType} hover sx={{ "&:nth-of-type(odd)": { bgcolor: "action.hover" } }}>
                <TableCell>{r.caseType || "—"}</TableCell>
                <TableCell align="right">{money(r.expected)}</TableCell>
                <TableCell align="right">{money(r.actual)}</TableCell>
                <TableCell align="right">{money(r.variance)}</TableCell>
                <TableCell align="right">{r.clients}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  No rows.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export function ByClientTable({ rows, dense }) {
  return (
    <Box sx={{ overflowX: "auto" }}>
      <TableContainer sx={{ maxHeight: 520, borderRadius: 2, minWidth: 960 }}>
        <Table stickyHeader size={dense ? "small" : "medium"}>
          <TableHead>
            <TableRow sx={{ "& th": { fontWeight: 700 } }}>
              <TableCell>Client</TableCell>
              <TableCell>Case Type</TableCell>
              <TableCell>Billing</TableCell>
              <TableCell align="right">Expected</TableCell>
              <TableCell align="right">Actual</TableCell>
              <TableCell align="right">Variance</TableCell>
              <TableCell>Last Payment</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={r.id || idx} hover sx={{ "&:nth-of-type(odd)": { bgcolor: "action.hover" } }}>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  <a href={`/client/${r.id}`} style={{ textDecoration: "none" }}>
                    {r.name}
                  </a>
                </TableCell>
                <TableCell>{r.caseType || "—"}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={(r.status || "active").toUpperCase()}
                    color={
                      (r.status || "active").toLowerCase() === "active"
                        ? "success"
                        : (r.status || "").toLowerCase() === "paused"
                        ? "warning"
                        : "default"
                    }
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="right">{money(r.expected)}</TableCell>
                <TableCell align="right">{money(r.actual)}</TableCell>
                <TableCell align="right">{money(r.variance)}</TableCell>
                <TableCell>{r.lastPaymentDate || "—"}</TableCell>
                <TableCell align="center">
                  <Button size="small" href={`/client/${r.id}`}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  No rows.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}