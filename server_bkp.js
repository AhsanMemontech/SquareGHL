require("dotenv").config();
const express = require("express");
const app = express();

app.use(express.json());

app.post("/square-webhook", async (req, res) => {
  const event = req.body;
  console.log("Received webhook:", event.type);

  // Only handle new orders
  if (event.type === "order.created") {
    const orderId = event.data.object.order_created.order_id;
    const locationId = event.data.object.order_created.location_id;

    console.log(`Fetching order details for: ${orderId}`);

    // 🔹 Fetch full order details
    const orderResponse = await fetch(
      `https://connect.squareupsandbox.com/v2/orders/${orderId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const orderData = await orderResponse.json();
    console.log("🧾 Full order details:", JSON.stringify(orderData, null, 2));

    const order = orderData.order;
    if (!order) {
      console.log("⚠️ No full order data returned.");
      return res.status(200).send("ok");
    }

    const totalAmount = order.total_money?.amount / 100;
    const currency = order.total_money?.currency;
    const customerId = order.customer_id;
    const itemNames = order.line_items?.map(i => i.name).join(", ");

    console.log(`✅ Full order received`);
    console.log(`Customer ID: ${customerId}`);
    console.log(`Items: ${itemNames}`);
    console.log(`Total: ${totalAmount} ${currency}`);

    // Optionally fetch customer info
    if (customerId) {
      const customerResponse = await fetch(
        `https://connect.squareupsandbox.com/v2/customers/${customerId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      const customerData = await customerResponse.json();
      console.log("👤 Customer info:", JSON.stringify(customerData, null, 2));
    } else {
      console.log("⚠️ No customer_id found in full order details.");
    }
  }

  res.status(200).send("ok");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
