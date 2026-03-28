import { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, runTransaction, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '../lib/firebase';
import { Search, Plus, Minus, Trash2, CreditCard } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
}

interface CartItem extends Product {
  cartQuantity: number;
}

export default function Sales() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach(doc => {
        prods.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(prods);
    });
    return () => unsubscribe();
  }, []);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.cartQuantity >= product.quantity) return prev; // Prevent adding more than stock
        return prev.map(item => 
          item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item
        );
      }
      if (product.quantity <= 0) return prev;
      return [...prev, { ...product, cartQuantity: 1 }];
    });
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = item.cartQuantity + delta;
        if (newQ > 0 && newQ <= item.quantity) {
          return { ...item, cartQuantity: newQ };
        }
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.cartQuantity), 0);

  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);

    const saleItems = cart.map(item => ({
      productId: item.id,
      productName: item.name,
      quantity: item.cartQuantity,
      unitPrice: item.price
    }));

    try {
      // Try Cloud Function first as requested
      const createSaleFn = httpsCallable(functions, 'createSale');
      await createSaleFn({ items: saleItems });
      
      setCart([]);
      alert('Sale completed successfully!');
    } catch (error: any) {
      console.warn("Cloud function failed, attempting client-side transaction fallback for MVP preview:", error);
      
      // Fallback: Client-side transaction for the preview environment
      try {
        await runTransaction(db, async (transaction) => {
          const productRefs = cart.map(item => doc(db, 'products', item.id));
          const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

          let totalAmount = 0;
          const updates: any[] = [];
          const movements: any[] = [];

          for (let i = 0; i < cart.length; i++) {
            const item = cart[i];
            const pDoc = productDocs[i];
            
            if (!pDoc.exists()) throw new Error(`Product ${item.name} not found`);
            
            const currentStock = pDoc.data().quantity;
            if (currentStock < item.cartQuantity) {
              throw new Error(`Insufficient stock for ${item.name}`);
            }

            totalAmount += item.price * item.cartQuantity;
            
            updates.push({ ref: pDoc.ref, newQuantity: currentStock - item.cartQuantity });
            
            movements.push({
              productId: item.id,
              type: 'OUT',
              quantity: item.cartQuantity,
              createdAt: new Date().toISOString(),
              createdBy: auth.currentUser?.uid,
              reason: 'Sale'
            });
          }

          // Apply updates
          updates.forEach(u => transaction.update(u.ref, { quantity: u.newQuantity }));
          
          // Create sale
          const saleRef = doc(collection(db, 'sales'));
          transaction.set(saleRef, {
            totalAmount,
            createdBy: auth.currentUser?.uid,
            createdAt: new Date().toISOString(),
            items: cart.map(item => ({
              productId: item.id,
              productName: item.name,
              quantity: item.cartQuantity,
              unitPrice: item.price,
              totalPrice: item.price * item.cartQuantity
            }))
          });

          // Create movements
          movements.forEach(m => {
            transaction.set(doc(collection(db, 'stock_movements')), m);
          });
        });

        setCart([]);
        alert('Sale completed successfully (via client transaction)!');
      } catch (fallbackError: any) {
        console.error("Transaction failed:", fallbackError);
        alert(`Failed to complete sale: ${fallbackError.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Left: Product Selection */}
      <div className="flex-1 flex flex-col bg-gray-50 border-r">
        <div className="p-4 border-b bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search products by name or SKU (Press '/' to focus)"
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredProducts.length === 1) {
                  addToCart(filteredProducts[0]);
                }
              }}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={product.quantity <= 0}
                className={`p-4 rounded-xl border text-left transition-all ${
                  product.quantity > 0 
                    ? 'bg-white border-gray-200 hover:border-blue-500 hover:shadow-md cursor-pointer' 
                    : 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="font-semibold text-gray-900 truncate">{product.name}</div>
                <div className="text-sm text-gray-500 mb-2">SKU: {product.sku}</div>
                <div className="flex justify-between items-center mt-auto">
                  <span className="font-bold text-blue-600">${product.price.toFixed(2)}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    product.quantity > 10 ? 'bg-green-100 text-green-700' :
                    product.quantity > 0 ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {product.quantity} in stock
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-96 bg-white flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold text-gray-900">Current Sale</h2>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <ShoppingCart className="w-12 h-12 mb-2 opacity-20" />
              <p>Cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex-1 min-w-0 pr-4">
                    <h4 className="font-medium text-gray-900 truncate">{item.name}</h4>
                    <p className="text-sm text-gray-500">${item.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white border rounded-lg">
                      <button 
                        onClick={() => updateQuantity(item.id, -1)}
                        className="p-1 hover:bg-gray-50 text-gray-600"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-medium">{item.cartQuantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.id, 1)}
                        disabled={item.cartQuantity >= item.quantity}
                        className="p-1 hover:bg-gray-50 text-gray-600 disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50">
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-600 font-medium">Total</span>
            <span className="text-3xl font-bold text-gray-900">${total.toFixed(2)}</span>
          </div>
          <button
            onClick={handleCompleteSale}
            disabled={cart.length === 0 || isProcessing}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            <CreditCard className="w-6 h-6" />
            {isProcessing ? 'Processing...' : 'Complete Sale'}
          </button>
        </div>
      </div>
    </div>
  );
}
