import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, runTransaction, doc, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { ArrowDownToLine, ArrowUpFromLine, Search, History } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string;
  quantity: number;
}

interface StockMovement {
  id: string;
  productId: string;
  productName?: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  createdAt: string;
  reason: string;
}

export default function Stock() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('IN');
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Fetch products
    const qProducts = query(collection(db, 'products'));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach(doc => {
        prods.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(prods);
    });

    // Fetch recent movements
    const qMovements = query(collection(db, 'stock_movements'), orderBy('createdAt', 'desc'), limit(50));
    const unsubMovements = onSnapshot(qMovements, (snapshot) => {
      const moves: StockMovement[] = [];
      snapshot.forEach(doc => {
        moves.push({ id: doc.id, ...doc.data() } as StockMovement);
      });
      setMovements(moves);
    });

    return () => {
      unsubProducts();
      unsubMovements();
    };
  }, []);

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !adjustmentQuantity || parseInt(adjustmentQuantity) <= 0) return;
    
    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'products', selectedProductId);
        const productDoc = await transaction.get(productRef);
        
        if (!productDoc.exists()) throw new Error("Product not found");
        
        const currentQuantity = productDoc.data().quantity;
        const adjQty = parseInt(adjustmentQuantity, 10);
        
        let newQuantity = currentQuantity;
        if (adjustmentType === 'IN') newQuantity += adjQty;
        else if (adjustmentType === 'OUT') newQuantity -= adjQty;
        else if (adjustmentType === 'ADJUSTMENT') newQuantity = adjQty; // Direct set

        if (newQuantity < 0) throw new Error("Stock cannot be negative");

        // Update product
        transaction.update(productRef, { quantity: newQuantity });

        // Log movement
        const movementRef = doc(collection(db, 'stock_movements'));
        transaction.set(movementRef, {
          productId: selectedProductId,
          type: adjustmentType,
          quantity: adjQty,
          createdAt: new Date().toISOString(),
          createdBy: auth.currentUser?.uid,
          reason: reason || 'Manual adjustment'
        });
      });

      // Reset form
      setSelectedProductId('');
      setAdjustmentQuantity('');
      setReason('');
      alert('Stock updated successfully!');
    } catch (error: any) {
      console.error("Error adjusting stock:", error);
      alert(`Failed to adjust stock: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const getProductName = (id: string) => {
    return products.find(p => p.id === id)?.name || 'Unknown Product';
  };

  return (
    <div className="p-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left: Adjustment Form */}
      <div className="lg:col-span-1 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Stock Management</h1>
          <p className="text-gray-500">Adjust inventory levels and log movements.</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">New Adjustment</h2>
          <form onSubmit={handleStockAdjustment} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
              <select
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                <option value="" disabled>Select a product...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (Stock: {p.quantity})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustmentType('IN')}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border flex items-center justify-center gap-2 transition-colors ${
                    adjustmentType === 'IN' 
                      ? 'bg-green-50 border-green-200 text-green-700' 
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <ArrowDownToLine className="w-4 h-4" /> IN
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentType('OUT')}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border flex items-center justify-center gap-2 transition-colors ${
                    adjustmentType === 'OUT' 
                      ? 'bg-red-50 border-red-200 text-red-700' 
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <ArrowUpFromLine className="w-4 h-4" /> OUT
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentType('ADJUSTMENT')}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border flex items-center justify-center gap-2 transition-colors ${
                    adjustmentType === 'ADJUSTMENT' 
                      ? 'bg-blue-50 border-blue-200 text-blue-700' 
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  SET
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {adjustmentType === 'ADJUSTMENT' ? 'New Total Quantity' : 'Quantity to Adjust'}
              </label>
              <input
                type="number"
                min="1"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={adjustmentQuantity}
                onChange={(e) => setAdjustmentQuantity(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (Optional)</label>
              <input
                type="text"
                placeholder="e.g., Restock, Damaged, Count correction"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isProcessing || !selectedProductId}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Processing...' : 'Confirm Adjustment'}
            </button>
          </form>
        </div>
      </div>

      {/* Right: History */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <History className="w-5 h-5 text-gray-500" />
              Recent Movements
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Filter history..."
                className="pl-9 pr-4 py-1.5 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-4 font-medium text-gray-600 text-sm">Date</th>
                  <th className="p-4 font-medium text-gray-600 text-sm">Product</th>
                  <th className="p-4 font-medium text-gray-600 text-sm">Type</th>
                  <th className="p-4 font-medium text-gray-600 text-sm">Qty</th>
                  <th className="p-4 font-medium text-gray-600 text-sm">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movements
                  .filter(m => getProductName(m.productId).toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(movement => (
                  <tr key={movement.id} className="hover:bg-gray-50">
                    <td className="p-4 text-sm text-gray-500">
                      {new Date(movement.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4 font-medium text-gray-900">
                      {getProductName(movement.productId)}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        movement.type === 'IN' ? 'bg-green-100 text-green-700' :
                        movement.type === 'OUT' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {movement.type}
                      </span>
                    </td>
                    <td className="p-4 font-medium text-gray-900">
                      {movement.type === 'OUT' ? '-' : '+'}{movement.quantity}
                    </td>
                    <td className="p-4 text-sm text-gray-500 truncate max-w-[150px]">
                      {movement.reason}
                    </td>
                  </tr>
                ))}
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
