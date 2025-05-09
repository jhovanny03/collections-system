import React from "react";
import { IconButton, Typography, Box, Grow } from "@mui/material";
import { Brightness4, Brightness7 } from "@mui/icons-material";

const DarkModeToggle = ({ mode, toggleColorMode }) => {
  return (
    <Grow in timeout={600}>
      <Box
        sx={{ position: "absolute", top: 10, right: 10, textAlign: "center" }}
      >
        <IconButton onClick={toggleColorMode} color="inherit">
          {mode === "light" ? <Brightness4 /> : <Brightness7 />}
        </IconButton>
        <Typography variant="caption">
          {mode === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
        </Typography>
      </Box>
    </Grow>
  );
};

export default DarkModeToggle;
