import SideBar from "../pages/global/SideBar";
import UpBar from "../pages/global/UpBar";
import { Outlet } from "react-router-dom";

export default function LayoutDefault() {
  return (
    <>
      <SideBar />
      <main className="content">
        <UpBar />
        <Outlet />
      </main>
    </>
  );
}
