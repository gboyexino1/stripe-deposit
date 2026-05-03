const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Create a Stripe Checkout session for 20% deposit
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { totalAmount, customerName, jobDescription } = req.body;

    if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount provided.' });
    }

    const totalInPence = Math.round(parseFloat(totalAmount) * 100);
    const depositInPence = Math.round(totalInPence * 0.20);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `20% Deposit${jobDescription ? ' — ' + jobDescription : ''}`,
              description: customerName
                ? `Deposit payment for ${customerName}. Total job value: £${parseFloat(totalAmount).toFixed(2)}`
                : `20% deposit. Total job value: £${parseFloat(totalAmount).toFixed(2)}`,
            },
            unit_amount: depositInPence,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.BASE_URL || 'http://localhost:3000'}/success.html?amount=${(depositInPence / 100).toFixed(2)}`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/cancel.html`,
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
