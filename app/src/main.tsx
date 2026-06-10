import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";

import { AppFrame } from "./AppFrame";
import { HomePage } from "./pages/HomePage";
import { StudyDetailPage } from "./pages/StudyDetailPage";
import "./styles.css";

function AppRoutes() {
  const location = useLocation();

  return (
    <AppFrame>
      <div className="route-transition" key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/studies/:studyId" element={<StudyDetailPage />} />
        </Routes>
      </div>
    </AppFrame>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </React.StrictMode>,
);
