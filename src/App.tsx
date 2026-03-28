import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Products from './pages/Products';
import Stock from './pages/Stock';
import Login from './pages/Login';
import Layout from './components/Layout';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Fetch user role
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            setRole(userDoc.data().role);
          } else {
            // Default to staff if not found, or handle setup
            setRole('staff');
          }
        } catch (error) {
          console.error("Error fetching role:", error);
          setRole('staff');
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        
        {/* Protected Routes */}
        <Route element={user ? <Layout role={role} /> : <Navigate to="/login" />}>
          <Route path="/" element={<Dashboard role={role} />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/products" element={<Products role={role} />} />
          <Route path="/stock" element={role === 'admin' ? <Stock /> : <Navigate to="/" />} />
        </Route>
      </Routes>
    </Router>
  );
}
