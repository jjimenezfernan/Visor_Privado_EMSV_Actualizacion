import { useState } from "react";
import { ColorModeContext, useMode } from "./theme";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { Routes, Route, useLocation } from "react-router-dom";
import Dashboard from "./pages/dashboard";
import Derivacion from "./pages/derivacion";
import Concienciacion from "./pages/concienciacion";
import Visor from "./pages/visorSSCC";
import VisorParcelas from "./pages/VisorParcelas";
import VisorBarrio from "./pages/visorBarrio";
import Descargas from "./pages/descargas";
import UpBar from "./pages/global/UpBar";
import SideBar from "./pages/global/SideBar";
import MapParcelasProvider from "./components/MapParcelasProvider";
import MapSSCCProvider from "./components/MapSSCCProvider";
import MapBarrioProvider from "./components/MapBarrioProvider";
import Overlay from "./pages/global/Overlay";
import { AnimatePresence } from "framer-motion";
import BarriosDashboard from "./pages/barrios_dashboard";
import ActualizarArchivos from "./pages/actualizar_archivos";

import MapasEspacioPublico from "./pages/mapaSolar/mapaEspacioPublico";
import MapEMSVProvider from "./components/MapEMSVProvider";
import MapZoomProvider from "./components/MapZoomProvider";
import MapTypeSelectProvider from "./components/MapTypeSelectProvider";
import ActualizarCELS from "./pages/mapaSolar/actualizarCELS";

import MapaIrradiancia from "./pages/mapaSolar/mapaIrradiancia";

function App() {
  const [theme, colorMode] = useMode();
  const location = useLocation();
  const [showOverlay, setShowOverlay] = useState(true); // Initially show overlay

  const closeOverlay = () => {
    setShowOverlay(false);
  };

  // Check if the user is on the home page ("/") and showOverlay is true
  const shouldShowOverlay = showOverlay && location.pathname === "/";

  return (
    <AnimatePresence>
      <ColorModeContext.Provider value={colorMode}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <div className="app">
            {shouldShowOverlay && <Overlay closeOverlay={closeOverlay} />}
            <SideBar />
            <main className="content">
              <UpBar /> 
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/derivacion" element={<Derivacion />} />
                <Route path="/concienciacion" element={<Concienciacion />} />
                <Route path="/estadisticas_barrios" element={<BarriosDashboard />} />
                <Route
                  path="/visor-barrio"
                  element={
                    <MapBarrioProvider>
                      <VisorBarrio />
                    </MapBarrioProvider>
                  }
                />
                <Route
                  path="/visor-sscc"
                  element={
                    <MapSSCCProvider>
                      <Visor />
                    </MapSSCCProvider>
                  }
                />
                <Route
                  path="/visor-parcelas"
                  element={
                    <MapParcelasProvider>
                      <VisorParcelas />
                    </MapParcelasProvider>
                  }
                />
                <Route path="/descargas" element={<Descargas />} />
                <Route path="/actualizar-archivos" element={<ActualizarArchivos />} />
                <Route
                      path="/mapas"
                      element={
                        <MapEMSVProvider>
                          <MapZoomProvider>
                            <MapTypeSelectProvider>
                              <MapasEspacioPublico />
                            </MapTypeSelectProvider>
                          </MapZoomProvider>
                        </MapEMSVProvider>
                      }
                />
                <Route
                 path="/mapas/irradiancia"
                 element={
                   <MapEMSVProvider>
                     <MapZoomProvider>
                       <MapTypeSelectProvider>
                         <MapaIrradiancia />
                       </MapTypeSelectProvider>
                     </MapZoomProvider>
                   </MapEMSVProvider>
                 }
                />
                <Route path="/cels/nuevo" element={<ActualizarCELS />} />
              </Routes>
            </main>
          </div>
        </ThemeProvider>
      </ColorModeContext.Provider>
    </AnimatePresence>
  );
}

export default App;

