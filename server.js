require("dotenv").config();
const express = require("express");
const { cpSync } = require("fs");

const app = express();
app.use(express.json());

// Step 1: Send user to Square OAuth screen
app.get("/auth", (req, res) => {
  const redirectUrl = `https://connect.squareupsandbox.com/oauth2/authorize?client_id=${process.env.SQUARE_APP_ID}&scope=ORDERS_READ+CUSTOMERS_READ&session=false`;
  res.redirect(redirectUrl);
});

// Step 2: Handle callback from Square
app.get("/square/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  // Step 3: Exchange code for access token
  const tokenResp = await fetch("https://connect.squareupsandbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenResp.json();
  console.log("🔐 OAuth Token Data:", tokenData);

  if (tokenData.access_token) {
    res.send("✅ OAuth Success! Token received. Check console.");
  } else {
    res.send("❌ OAuth failed. Check logs.");
  }
});

app.post("/square-webhook", async (req, res) => {
    const event = req.body;
    //console.log("Received webhook:", event.type);
  
    console.log("Merchant from event:", event.merchant_id);
    if (event.type !== "order.created") {
      return res.status(200).send("ignored");
    }
    
    // Only handle new orders
    if (event.type === "order.created") {
      const orderId = event.data.object.order_created.order_id;

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
  
      let orderData = await orderResponse.json();

      const order = orderData.order;
      if (!order) {
        console.log("⚠️ No full order data returned.");
        return res.status(200).send("ok");
      }
  
      // --- Extract order details ---
      const lineItems = order.line_items
        ?.map(i => `${i.name} (${i.quantity})`)
        .join(", ") || "N/A";

      const totalAmount = order.total_money?.amount
        ? order.total_money.amount / 100
        : 0;
      const currency = order.total_money?.currency || "USD";
      const source = order.source?.name || "Unknown";
      const customerId = order.customer_id || "N/A";
  
      // console.log(`Customer ID: ${customerId}`);
      // console.log(`Items: ${lineItems}`);
      // console.log(`Source: ${source}`);
      // console.log(`Total: ${totalAmount} ${currency}`);

      const resp = await fetch(`https://services.leadconnectorhq.com/objects/custom_objects.orders/records`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GHL_TOKEN}`,
          'Version': '2021-07-28'
        },
        body: JSON.stringify({
          locationId: 'cNNmo49VBOSV6P5SU1No',
          properties: {
              orderid: order.id,
              squarecustomerid: customerId,
              lineitems: lineItems,
              totalamount: totalAmount + " " + currency,
              source: source
          }
        }),
      });

      const GHLResponse = await resp.json();
      console.log("GHL - Order Response: ", GHLResponse);    
  
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
        let customerData = await customerResponse.json();

        const contactData = {
          name: customerData.customer?.given_name?.trim(),
          email: customerData.customer?.email_address?.toLowerCase().trim(),
          phone: customerData.customer?.phone_number?.trim(),
          tags: ['Squad Customers']
        }
        console.log(contactData);
    
        // Make API call to GoHighLevel
        const response = await fetch(`https://rest.gohighlevel.com/v1/contacts/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GHL_API_KEY}`
          },
          body: JSON.stringify(contactData)
        })
        const contactResponse = await response.json()
        console.log("GHL - Contact Response:", contactResponse);

        const respo = await fetch(`https://services.leadconnectorhq.com/associations/relations`, {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GHL_TOKEN}`,
            'Version': '2021-07-28'
          },
          body: JSON.stringify({
            locationId: "cNNmo49VBOSV6P5SU1No",
            associationId: "690262bd0652912d48350a54",
            firstRecordId: contactResponse.contact?.id,
            secondRecordId: GHLResponse.record?.id
          }),
        });
  
        console.log("GHL - Relation Response: ", await respo.json());    
      } else {
        console.log("⚠️ No customer_id found in full order details.");
      }
    }
  
    res.status(200).send("ok");
  });

app.listen(3000, () => console.log("🚀 OAuth Sandbox running on http://localhost:3000"));
