import React from "react";
import { Fade } from "@mui/material";
import { useLocation } from "react-router-dom";

const PageTransition = ({ children }) => {
  const location = useLocation();

  return (
    <Fade key={location.pathname} in timeout={500}>
      <div>{children}</div>
    </Fade>
  );
};

export default PageTransition;
