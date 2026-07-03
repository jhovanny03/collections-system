// src/ClientList/ui/ClientRow.jsx
import React from "react";
import {
  Chip,
  Tooltip,
  Typography,
  IconButton,
  Stack,
  TableCell,
  TableRow,
  Link as MuiLink,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { buildCompactCaseTag } from "../model/caseTag";

export default function ClientRow({ client, onEditClick, onDeleteClick }) {
  return (
    <TableRow
      hover
      sx={{
        borderLeft:
          client?.paymentHold?.active === true
            ? "3px solid rgba(220,53,69,0.7)"
            : "3px solid transparent",
      }}
    >
      {/* ===== Name + compact case tag + ON HOLD chip ===== */}
      <TableCell>
        <Stack spacing={0.25}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <MuiLink href={`/client/${client.id}`} underline="hover">
              {client.firstName} {client.lastName}
            </MuiLink>

            {client?.paymentHold?.active && (
              <Tooltip
                title={`Case on hold: ${
                  client.paymentHold?.reason || "Outstanding balance"
                }${
                  client.paymentHold?.startedAt
                    ? ` • since ${new Date(
                        client.paymentHold.startedAt.seconds
                          ? client.paymentHold.startedAt.seconds * 1000
                          : client.paymentHold.startedAt
                      ).toLocaleDateString()}`
                    : ""
                }`}
                arrow
              >
                <Chip
                  size="small"
                  label="ON HOLD"
                  color="error"
                  variant="outlined"
                  sx={{
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    height: 20,
                    ml: 0.5,
                  }}
                />
              </Tooltip>
            )}
          </Stack>

          {client.caseTitle && (
            <Tooltip title={client.caseTitle} placement="top" arrow>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  maxWidth: 360,
                  display: { xs: "none", sm: "-webkit-box" },
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {buildCompactCaseTag(client)}
              </Typography>
            </Tooltip>
          )}
        </Stack>
      </TableCell>

      <TableCell sx={{ whiteSpace: "nowrap" }}>
        {client.caseType || "—"}
      </TableCell>

      {/* ===== Case Status chip: force CLOSED when status is closed ===== */}
      <TableCell>
        {(client.status || "").toLowerCase() === "closed" ? (
          <Chip size="small" label="CLOSED" color="default" variant="filled" />
        ) : client.caseStatus ? (
          <Chip
            size="small"
            label={client.caseStatus}
            color={
              client.caseStatus === "ACTIVE"
                ? "success"
                : client.caseStatus === "FILED"
                ? "warning"
                : "default"
            }
            variant="filled"
          />
        ) : (
          "—"
        )}
      </TableCell>

      <TableCell>
        {client.myCaseLink ? (
          <Tooltip title="Open in MyCase">
            <IconButton
              size="small"
              href={client.myCaseLink}
              target="_blank"
              rel="noreferrer"
            >
              <OpenInNewIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        ) : (
          "—"
        )}
      </TableCell>

      {/* Amount Due (closed shows $0 by design) */}
      <TableCell align="right">
        {`$${Number(client.computedAmountDue || 0).toLocaleString()}`}
      </TableCell>

      {/* ===== Months Past Due — CLOSED for closed cases ===== */}
      <TableCell>
        {client._isClosed ? (
          <Chip size="small" label="CLOSED" color="default" variant="outlined" />
        ) : client.computedIsPaidInFull ? (
          <Chip size="small" label="Paid In Full" color="success" variant="filled" />
        ) : client.computedMissedMonths === 0 ? (
          <Chip size="small" label="Current" color="success" variant="filled" />
        ) : typeof client.computedPastDueLabel === "string" ? (
          <Chip
            size="small"
            label={client.computedPastDueLabel}
            color="error"
            variant="outlined"
          />
        ) : (
          client.computedPastDueLabel || "—"
        )}
      </TableCell>

      {/* Actions */}
      <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
        <Tooltip title="View">
          <IconButton href={`/client/${client.id}`} size="small">
            <VisibilityIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton onClick={() => onEditClick(client)} size="small">
            <EditIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton
            onClick={() => onDeleteClick(client.id)}
            size="small"
            sx={{ color: "error.main" }}
          >
            <DeleteIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}