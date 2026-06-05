import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../stores/adminAuth';

export default function RequireAdmin({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const { admin, fetchMe } = useAdminAuth();
  const hasToken = !!localStorage.getItem('delfluent-admin-access');

  useEffect(() => {
    if (!admin && hasToken) fetchMe();
  }, [admin, hasToken, fetchMe]);

  if (!admin && !hasToken) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }
  return children;
}
