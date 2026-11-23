import { Routes, Route, Navigate } from "react-router";
import { RequireRole, GuestOnly, LoginGate } from "./auth/guards.jsx";
import Landing from "./pages/public/Landing.jsx";
import { Signup, Login, ForgotPassword, ResetPassword, ChangePassword } from "./pages/public/Auth.jsx";
import PatientLayout from "./pages/patient/PatientLayout.jsx";
import VillagePick from "./pages/patient/VillagePick.jsx";
import PatientHome from "./pages/patient/Home.jsx";
import BookTest from "./pages/patient/BookTest.jsx";
import { DoctorList, DoctorBook } from "./pages/patient/Doctors.jsx";
import MyBookings from "./pages/patient/MyBookings.jsx";
import Profile from "./pages/patient/Profile.jsx";
import LabPanel from "./pages/lab/LabPanel.jsx";
import DoctorPanel from "./pages/doctor/DoctorPanel.jsx";
import AgentPanel from "./pages/agent/AgentPanel.jsx";
import AdminPanel from "./pages/admin/AdminPanel.jsx";
import { useT } from "./i18n/I18nContext.jsx";

export default function App() {
  // Subscribing here re-renders the whole tree when the language changes, so helpers that
  // format with the current language (utils.js) update everywhere at once.
  useT();
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/" element={<Landing />} />
      </Route>
      <Route element={<LoginGate />}>
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/login/:portal" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/change-password" element={<ChangePassword />} />

      <Route element={<RequireRole roles={["patient"]} />}>
        <Route element={<PatientLayout />}>
          <Route path="/village" element={<VillagePick />} />
          <Route path="/home" element={<PatientHome />} />
          <Route path="/jaanch/*" element={<BookTest />} />
          <Route path="/doctors" element={<DoctorList />} />
          <Route path="/doctors/:id" element={<DoctorBook />} />
          <Route path="/meri-booking" element={<MyBookings />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>

      <Route element={<RequireRole roles={["lab_staff"]} />}>
        <Route path="/lab/*" element={<LabPanel />} />
      </Route>
      <Route element={<RequireRole roles={["doctor"]} />}>
        <Route path="/doctor/*" element={<DoctorPanel />} />
      </Route>
      <Route element={<RequireRole roles={["agent", "super_admin"]} />}>
        <Route path="/agent/*" element={<AgentPanel />} />
      </Route>
      <Route element={<RequireRole roles={["super_admin"]} />}>
        <Route path="/admin/*" element={<AdminPanel />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
