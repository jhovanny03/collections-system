// src/Dashboard/DashboardCard.jsx
import React from 'react';
import { Card, CardHeader, CardContent } from '@mui/material';

/**
 * Cascarón visual unificado para todos los widgets del dashboard.
 * Estilo alineado con SummaryCards:
 *  - borderRadius bajo (≈ 8px)
 *  - sombra suave
 *  - borde sutil y fondo paper
 *  - paddings consistentes
 */
export default function DashboardCard({ title, action, children, sx, contentSx, headerSx }) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,                                // ≈ 8px (igual a SummaryCards)
        boxShadow: '0 12px 28px rgba(16,24,40,0.06)',   // sombra suave como SummaryCards
        border: '1px solid rgba(0,0,0,0.04)',           // borde sutil
        bgcolor: 'background.paper',
        ...sx,
      }}
    >
      {(title || action) && (
        <CardHeader
          title={title}
          action={action}
          titleTypographyProps={{ variant: 'subtitle2', color: 'text.secondary' }}
          sx={{
            pb: 0.5,               // header compacto
            pt: 2,                 // respiro superior
            px: 2.5,               // mismo padding lateral que el content
            ...headerSx,
          }}
        />
      )}
      <CardContent
        sx={{
          pt: title ? 1 : 2.5,     // si hay título, el content sube un poco; si no, más aire
          pb: 2.5,
          px: 2.5,                 // padding lateral consistente
          ...contentSx,
        }}
      >
        {children}
      </CardContent>
    </Card>
  );
}
