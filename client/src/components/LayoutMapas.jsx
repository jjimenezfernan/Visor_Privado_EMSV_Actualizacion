import SideBar from "../pages/global/SideBar";
import UpBarNew from "../pages/global/UpBar_New";
import { Outlet } from "react-router-dom";

export default function LayoutMapas() {
  return (
    <>
      <SideBar />
      <main className="content">
        <UpBarNew />
        <Outlet />
      </main>
    </>
  );
}
