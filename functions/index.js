const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.createSale = functions.https.onCall(async (data, context) => {
  // 1. Authentication Check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { items } = data; // Array of { productId, quantity, unitPrice, productName }
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with an array of items."
    );
  }

  const uid = context.auth.uid;
  let totalAmount = 0;

  try {
    // 2. Run a Firestore Transaction to ensure atomicity and prevent negative stock
    await db.runTransaction(async (transaction) => {
      const productRefs = items.map(item => db.collection("products").doc(item.productId));
      const productDocs = await transaction.getAll(...productRefs);

      const updates = [];
      const movements = [];

      // Validate stock and prepare updates
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const productDoc = productDocs[i];

        if (!productDoc.exists) {
          throw new functions.https.HttpsError("not-found", `Product ${item.productId} not found.`);
        }

        const productData = productDoc.data();
        if (productData.quantity < item.quantity) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            `Insufficient stock for ${productData.name}. Available: ${productData.quantity}, Requested: ${item.quantity}`
          );
        }

        // Calculate total amount securely (using server-side price if needed, but here we trust the client's unitPrice for simplicity, or we can use productData.price)
        const itemTotal = productData.price * item.quantity;
        totalAmount += itemTotal;

        // Prepare product stock update
        updates.push({
          ref: productDoc.ref,
          newQuantity: productData.quantity - item.quantity
        });

        // Prepare stock movement log
        movements.push({
          productId: item.productId,
          type: "OUT",
          quantity: item.quantity,
          createdAt: new Date().toISOString(),
          createdBy: uid,
          reason: "Sale"
        });
      }

      // Apply updates
      updates.forEach(update => {
        transaction.update(update.ref, { quantity: update.newQuantity });
      });

      // Create Sale Document
      const saleRef = db.collection("sales").doc();
      transaction.set(saleRef, {
        totalAmount,
        createdBy: uid,
        createdAt: new Date().toISOString(),
        items: items.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice, // Ideally use productData.price
          totalPrice: item.unitPrice * item.quantity
        }))
      });

      // Create Stock Movements
      movements.forEach(movement => {
        const movementRef = db.collection("stock_movements").doc();
        transaction.set(movementRef, movement);
      });
    });

    return { success: true, message: "Sale completed successfully." };
  } catch (error) {
    console.error("Error creating sale:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
