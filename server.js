const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();

// Allow requests from your website
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://www.shcleanings.co.uk',
    'https://shcleanings.co.uk',
    'http://www.shcleanings.co.uk',
    'http://shcleanings.co.uk'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Email helper function
async function sendEmail(subject, html) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject,
    html,
  });
}

// Webhook must use raw body — register BEFORE express.json()
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = event.data.object;
  const meta = session.metadata || {};

  // ✅ PAYMENT SUCCESSFUL
  if (event.type === 'checkout.session.completed') {
    try {
      const depositPaid = (session.amount_total / 100).toFixed(2);
      await sendEmail(
        `✅ Deposit Received — ${meta.customerName || 'Customer'}`,
        `
          <h2 style="color:green">✅ New Deposit Payment Received</h2>
          <p><strong>Name:</strong> ${meta.customerName || 'N/A'}</p>
          <p><strong>Email:</strong> ${meta.customerEmail || 'N/A'}</p>
          <p><strong>Phone:</strong> ${meta.customerPhone || 'N/A'}</p>
          <p><strong>Address:</strong> ${meta.customerAddress || 'N/A'}</p>
          <p><strong>Date & Time:</strong> ${meta.bookingDate || 'N/A'} ${meta.bookingTime || ''}</p>
          <p><strong>Service:</strong> ${meta.jobDescription || 'N/A'}</p>
          <hr/>
          <p><strong>Total Job Value:</strong> £${meta.totalAmount || 'N/A'}</p>
          <p><strong>Deposit Paid:</strong> £${depositPaid}</p>
          <p><strong>Balance Remaining:</strong> £${meta.balance || 'N/A'}</p>
          <hr/>
          <p><strong>Items:</strong></p>
          <pre>${meta.items || 'N/A'}</pre>
        `
      );
      console.log('Success email sent');
    } catch (emailErr) {
      console.error('Email error:', emailErr.message);
    }
  }

  // ❌ PAYMENT EXPIRED (customer abandoned checkout)
  if (event.type === 'checkout.session.expired') {
    try {
      await sendEmail(
        `⚠️ Abandoned Booking — ${meta.customerName || 'Customer'} did not pay`,
        `
          <h2 style="color:orange">⚠️ Customer Did Not Complete Payment</h2>
          <p>This customer started checkout but did not complete their deposit. You may want to follow up.</p>
          <hr/>
          <p><strong>Name:</strong> ${meta.customerName || 'N/A'}</p>
          <p><strong>Email:</strong> ${meta.customerEmail || 'N/A'}</p>
          <p><strong>Phone:</strong> ${meta.customerPhone || 'N/A'}</p>
          <p><strong>Address:</strong> ${meta.customerAddress || 'N/A'}</p>
          <p><strong>Date & Time:</strong> ${meta.bookingDate || 'N/A'} ${meta.bookingTime || ''}</p>
          <p><strong>Service:</strong> ${meta.jobDescription || 'N/A'}</p>
          <hr/>
          <p><strong>Total Job Value:</strong> £${meta.totalAmount || 'N/A'}</p>
          <p><strong>Deposit Due:</strong> £${meta.deposit || 'N/A'}</p>
          <p><strong>Balance:</strong> £${meta.balance || 'N/A'}</p>
        `
      );
      console.log('Abandoned booking email sent');
    } catch (emailErr) {
      console.error('Email error:', emailErr.message);
    }
  }

  res.json({ received: true });
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Create a Stripe Checkout session for 20% deposit
app.post('/create-checkout-session', async (req, res) => {
  try {
    const {
      totalAmount, customerName, jobDescription,
      customerEmail, customerPhone, customerAddress,
      bookingDate, bookingTime, balance, items
    } = req.body;

    if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount provided.' });
    }

    const totalInPence = Math.round(parseFloat(totalAmount) * 100);
    const depositInPence = Math.round(totalInPence * 0.20);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      billing_address_collection: 'required',
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // expires after 30 mins so you get notified quickly
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `20% Deposit — ${jobDescription || 'Cleaning Service'}`,
              description: `Deposit for ${customerName || 'customer'}. Total job: £${parseFloat(totalAmount).toFixed(2)}`,
            },
            unit_amount: depositInPence,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: customerEmail || undefined,
      metadata: {
        customerName: customerName || '',
        customerEmail: customerEmail || '',
        customerPhone: customerPhone || '',
        customerAddress: customerAddress || '',
        bookingDate: bookingDate || '',
        bookingTime: bookingTime || '',
        jobDescription: jobDescription || '',
        totalAmount: parseFloat(totalAmount).toFixed(2),
        deposit: (depositInPence / 100).toFixed(2),
        balance: balance ? parseFloat(balance).toFixed(2) : '',
        items: items ? JSON.stringify(items) : '',
      },
      success_url: `https://www.shcleanings.co.uk/success.html?amount=${(depositInPence / 100).toFixed(2)}&name=${encodeURIComponent(customerName || '')}`,
      cancel_url: `https://www.shcleanings.co.uk/payment.html`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe error:', error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
