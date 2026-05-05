const express = require('express');
const fs = require('fs');
const BOOKINGS_FILE = '/tmp/booked_slots.json';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');
const path = require('path');

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

// Booked slots helpers
function getBookedSlots() {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
    }
  } catch(e) {}
  return [];
}

function saveBookedSlot(date, time) {
  const slots = getBookedSlots();
  slots.push({ date, time, bookedAt: new Date().toISOString() });
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(slots));
}

function parseTimeToHour(timeStr) {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h;
}

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

// Email helper using Resend
function sendEmail(to, subject, html) {
  return resend.emails.send({
    from: 'SH Cleaning Services <support@shcleanings.co.uk>',
    to,
    subject,
    html,
  }).catch(err => console.error('Email error:', err.message));
}

// Return booked slots for the booking page to check
app.get('/booked-slots', (req, res) => {
  res.json(getBookedSlots());
});

// Webhook — raw body required
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Respond to Stripe IMMEDIATELY
  res.json({ received: true });

  const session = event.data.object;
  const meta = session.metadata || {};

  // ✅ PAYMENT SUCCESSFUL
  if (event.type === 'checkout.session.completed') {
    const depositPaid = (session.amount_total / 100).toFixed(2);

    // Save booked slot to block it for other customers
    if (meta.bookingDate && meta.bookingTime) {
      saveBookedSlot(meta.bookingDate, meta.bookingTime);
    }

    // Email to YOU
    sendEmail(
      process.env.EMAIL_USER,
      `✅ Deposit Received — ${meta.customerName || 'Customer'}`,
      `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0f766e;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">✅ New Deposit Payment Received</h2>
          </div>
          <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <h3 style="color:#0f766e;">Customer Details</h3>
            <p><strong>Name:</strong> ${meta.customerName || 'N/A'}</p>
            <p><strong>Email:</strong> ${meta.customerEmail || 'N/A'}</p>
            <p><strong>Phone:</strong> ${meta.customerPhone || 'N/A'}</p>
            <p><strong>Address:</strong> ${meta.customerAddress || 'N/A'}</p>
            <p><strong>Date & Time:</strong> ${meta.bookingDate || 'N/A'} ${meta.bookingTime || ''}</p>
            <p><strong>Service:</strong> ${meta.jobDescription || 'N/A'}</p>
            <hr style="border:1px solid #e5e7eb;margin:16px 0;"/>
            <p><strong>Total Job Value:</strong> £${meta.totalAmount || 'N/A'}</p>
            <p><strong>Deposit Paid:</strong> £${depositPaid}</p>
            <p><strong>Balance Remaining:</strong> £${meta.balance || 'N/A'}</p>
          </div>
        </div>
      `
    );

    // Email to CUSTOMER
    if (meta.customerEmail) {
      sendEmail(
        meta.customerEmail,
        `Booking Confirmed — SH Cleaning Services`,
        `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#0f766e;padding:20px;border-radius:8px 8px 0 0;">
              <h2 style="color:white;margin:0;">Your Booking is Confirmed! 🎉</h2>
            </div>
            <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
              <p style="font-size:16px;">Hi <strong>${meta.customerName || 'there'}</strong>,</p>
              <p>Thank you for booking with SH Cleaning Services. Your deposit has been received and your booking is confirmed.</p>
              <div style="background:#ccfbf1;border:1px solid #99f6e4;border-radius:8px;padding:16px;margin:16px 0;">
                <h3 style="color:#0f766e;margin:0 0 12px 0;">Booking Details</h3>
                <p style="margin:4px 0;"><strong>Service:</strong> ${meta.jobDescription || 'N/A'}</p>
                <p style="margin:4px 0;"><strong>Date & Time:</strong> ${meta.bookingDate || 'N/A'} ${meta.bookingTime || ''}</p>
                <p style="margin:4px 0;"><strong>Address:</strong> ${meta.customerAddress || 'N/A'}</p>
              </div>
              <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
                <h3 style="margin:0 0 12px 0;">Payment Summary</h3>
                <p style="margin:4px 0;"><strong>Total Job Value:</strong> £${meta.totalAmount || 'N/A'}</p>
                <p style="margin:4px 0;color:#0f766e;"><strong>Deposit Paid:</strong> £${depositPaid} ✓</p>
                <p style="margin:4px 0;"><strong>Balance Due on the Day:</strong> £${meta.balance || 'N/A'}</p>
              </div>
              <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
                <h3 style="margin:0 0 12px 0;">Need to get in touch?</h3>
                <p style="margin:4px 0;">📧 <a href="mailto:support@shcleanings.co.uk" style="color:#0f766e;">support@shcleanings.co.uk</a></p>
                <p style="margin:4px 0;">🌐 <a href="https://www.shcleanings.co.uk" style="color:#0f766e;">www.shcleanings.co.uk</a></p>
              </div>
              <p>We look forward to seeing you soon!</p>
              <p style="color:#0f766e;font-weight:bold;">The SH Cleaning Services Team</p>
              <hr style="border:1px solid #e5e7eb;margin:16px 0;"/>
              <p style="font-size:12px;color:#9ca3af;">SH Cleaning Services — Merseyside & Cheshire</p>
            </div>
          </div>
        `
      );
    }
  }

  // ❌ ABANDONED CHECKOUT
  if (event.type === 'checkout.session.expired') {
    sendEmail(
      process.env.EMAIL_USER,
      `⚠️ Abandoned Booking — ${meta.customerName || 'Customer'} did not pay`,
      `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#d97706;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">⚠️ Customer Did Not Complete Payment</h2>
          </div>
          <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <p>This customer started checkout but did not complete their deposit. Follow up to recover this booking!</p>
            <hr style="border:1px solid #e5e7eb;margin:16px 0;"/>
            <p><strong>Name:</strong> ${meta.customerName || 'N/A'}</p>
            <p><strong>Email:</strong> ${meta.customerEmail || 'N/A'}</p>
            <p><strong>Phone:</strong> ${meta.customerPhone || 'N/A'}</p>
            <p><strong>Address:</strong> ${meta.customerAddress || 'N/A'}</p>
            <p><strong>Date & Time:</strong> ${meta.bookingDate || 'N/A'} ${meta.bookingTime || ''}</p>
            <p><strong>Service:</strong> ${meta.jobDescription || 'N/A'}</p>
            <hr style="border:1px solid #e5e7eb;margin:16px 0;"/>
            <p><strong>Total Job Value:</strong> £${meta.totalAmount || 'N/A'}</p>
            <p><strong>Deposit Due:</strong> £${meta.deposit || 'N/A'}</p>
            <p><strong>Balance:</strong> £${meta.balance || 'N/A'}</p>
          </div>
        </div>
      `
    );
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Create Stripe Checkout session
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
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `20% Deposit — ${jobDescription || 'Cleaning Service'}`,
            description: `Deposit for ${customerName || 'customer'}. Total job: £${parseFloat(totalAmount).toFixed(2)}`,
          },
          unit_amount: depositInPence,
        },
        quantity: 1,
      }],
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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
