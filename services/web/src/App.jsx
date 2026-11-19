import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppDataProvider } from './app/AppDataContext';
import { ToastProvider } from './components/ui';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Compliance from './pages/Compliance';
import Risks from './pages/Risks';
import Catalog from './pages/Catalog';
import Licenses from './pages/Licenses';
import Devices from './pages/Devices';
import Installations from './pages/Installations';
import Import from './pages/Import';
import Matching from './pages/Matching';
import AILab from './pages/AILab';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AppDataProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Overview />} />
              <Route path="/compliance" element={<Compliance />} />
              <Route path="/risks" element={<Risks />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/licenses" element={<Licenses />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/installations" element={<Installations />} />
              <Route path="/import" element={<Import />} />
              <Route path="/matching" element={<Matching />} />
              <Route path="/ai-lab" element={<AILab />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AppDataProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
