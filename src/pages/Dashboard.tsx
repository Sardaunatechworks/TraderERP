import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getDocs, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DollarSign, Package, AlertTriangle, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard({ role }: { role: string | null }) {
  const [stats, setStats] = useState({
    totalSales: 0,
    lowStock: 0,
    totalProducts: 0,
  });
  const [recentSales, setRecentSales] = useState<any[]>([]);

  useEffect(() => {
    // Fetch basic stats
    const fetchStats = async () => {
      // Products
      const productsSnap = await getDocs(collection(db, 'products'));
      let lowStockCount = 0;
      productsSnap.forEach(doc => {
        if (doc.data().quantity <= 5) lowStockCount++;
      });
      
      // Sales (today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const salesQuery = query(
        collection(db, 'sales'),
        where('createdAt', '>=', today.toISOString()),
        orderBy('createdAt', 'desc')
      );
      
      const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
        let total = 0;
        const sales: any[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          total += data.totalAmount || 0;
          sales.push({ id: doc.id, ...data });
        });
        
        setStats({
          totalSales: total,
          lowStock: lowStockCount,
          totalProducts: productsSnap.size
        });
        setRecentSales(sales.slice(0, 5));
      });

      return () => unsubscribeSales();
    };

    fetchStats();
  }, []);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex gap-4">
          <Link
            to="/sales"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            New Sale
          </Link>
          {role === 'admin' && (
            <Link
              to="/products"
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2"
            >
              <Package className="w-4 h-4" />
              Manage Products
            </Link>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-lg">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Today's Sales</p>
            <h3 className="text-2xl font-bold text-gray-900">${stats.totalSales.toFixed(2)}</h3>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Products</p>
            <h3 className="text-2xl font-bold text-gray-900">{stats.totalProducts}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Low Stock Items</p>
            <h3 className="text-2xl font-bold text-gray-900">{stats.lowStock}</h3>
          </div>
        </div>
      </div>

      {/* Recent Sales */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Recent Sales (Today)</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {recentSales.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No sales today yet.</div>
          ) : (
            recentSales.map(sale => (
              <div key={sale.id} className="px-6 py-4 flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900">Sale #{sale.id.slice(-6).toUpperCase()}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(sale.createdAt).toLocaleTimeString()} • {sale.items.length} items
                  </p>
                </div>
                <div className="text-lg font-bold text-gray-900">
                  ${sale.totalAmount.toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
