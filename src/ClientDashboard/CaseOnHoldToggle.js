// src/ClientDashboard/CaseOnHoldToggle.js
import React, { useMemo, useState } from "react";
import { Box, Stack, Switch, FormControlLabel, Chip, Tooltip, CircularProgress } from "@mui/material";
import { doc, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import db from "../firebase";

export default function CaseOnHoldToggle({ client, setClient }) {
  const active = Boolean(client?.paymentHold?.active);
  const [saving, setSaving] = useState(false);
  const auth = getAuth();
  const userEmail = auth?.currentUser?.email || "system";

  const holdReason = useMemo(
    () => client?.paymentHold?.reason || "Outstanding balance",
    [client?.paymentHold?.reason]
  );

  const handleToggle = async (_, checked) => {
    try {
      setSaving(true);
      const ref = doc(db, "clients", client.id);

      const newHold = checked
        ? {
            active: true,
            reason: holdReason,
            startedAt: client?.paymentHold?.startedAt || new Date(),
            updatedAt: new Date(),
            updatedBy: userEmail,
          }
        : {
            active: false,
            reason: holdReason,
            endedAt: new Date(),
            updatedAt: new Date(),
            updatedBy: userEmail,
          };

      await updateDoc(ref, { paymentHold: newHold });

      // keep local state in sync
      setClient((prev) => ({ ...prev, paymentHold: newHold }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ mb: 1.5 }}>
      {/* Banner when ON */}
      {active && (
        <Chip
          color="error"
          variant="outlined"
          label="⚠️ Case on hold due to outstanding balance"
          sx={{ mb: 1 }}
        />
      )}

      <Stack direction="row" alignItems="center" spacing={1}>
        <Tooltip title="Marks this case as ON HOLD for non-payment (reporting/visibility only).">
          <FormControlLabel
            control={
              <Switch
                checked={active}
                onChange={handleToggle}
                disabled={saving}
                inputProps={{ "aria-label": "Toggle case on hold" }}
              />
            }
            label={active ? "Case On Hold" : "Mark Case On Hold"}
          />
        </Tooltip>

        {saving && <CircularProgress size={18} />}
      </Stack>
    </Box>
  );
}