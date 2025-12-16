import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Dashboard, ProxyHosts, DefaultRoutePage, Settings } from "@/pages";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="hosts" element={<ProxyHosts />} />
        <Route path="default-route" element={<DefaultRoutePage />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
