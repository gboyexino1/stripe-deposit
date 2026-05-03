# 🚀 How to Deploy Your Stripe Deposit Payment System
## (No experience needed — step by step)

---

## STEP 1 — Get Your Stripe Secret Key

1. Go to https://stripe.com and create a free account (or log in)
2. In the top-right, make sure it says **"Test mode"** (for testing first)
3. Click **Developers** → **API Keys**
4. Copy the key that starts with **sk_test_...**
5. Keep this safe — you'll need it in Step 3

---

## STEP 2 — Upload Your Files to GitHub (free)

1. Go to https://github.com and create a free account
2. Click the **"+"** button (top right) → **"New repository"**
3. Name it: `stripe-deposit`
4. Leave everything else as default → click **"Create repository"**
5. On the next screen, click **"uploading an existing file"**
6. Upload ALL the files from this folder:
   - `server.js`
   - `package.json`
   - The `public/` folder (with `index.html`, `success.html`, `cancel.html`)
7. Click **"Commit changes"**

---

## STEP 3 — Deploy on Railway (free hosting)

1. Go to https://railway.app
2. Click **"Start a New Project"**
3. Choose **"Deploy from GitHub repo"**
4. Connect your GitHub account when asked
5. Select your `stripe-deposit` repository
6. Railway will automatically detect it's a Node.js app and start building

### Add your Stripe key (IMPORTANT):
7. Once deployed, click on your project
8. Go to **"Variables"** tab
9. Click **"Add Variable"** and add:
   - Name: `STRIPE_SECRET_KEY`
   - Value: your key from Step 1 (e.g. `sk_test_abc123...`)
10. Click **"Add Variable"** again:
    - Name: `BASE_URL`
    - Value: your Railway URL (shown in the Settings tab, e.g. `https://stripe-deposit-production.up.railway.app`)
11. Railway will restart automatically

---

## STEP 4 — Test It Works

1. Go to your Railway URL (shown in Settings)
2. Fill in a name, description, and a total amount (e.g. £100)
3. You should see "Deposit Due Today: £20.00"
4. Click **"Proceed to Secure Payment"**
5. On the Stripe page, use the TEST card:
   - Card number: **4242 4242 4242 4242**
   - Expiry: **any future date** (e.g. 12/28)
   - CVC: **any 3 digits** (e.g. 123)
6. You should land on the success page ✅
7. Check your Stripe Dashboard → Payments — you'll see the test payment!

---

## STEP 5 — Go Live (take real money)

1. In your Stripe Dashboard, click **"Activate your account"** and fill in your business details
2. Once approved, go to **Developers → API Keys**
3. Switch off **Test mode** and copy your **live** key (starts with `sk_live_...`)
4. In Railway, update `STRIPE_SECRET_KEY` to your live key
5. That's it — real payments will now go straight to your Stripe account 💰

---

## How to Add the Payment Page to Your Existing Website

Once deployed, just add a link or button pointing to your Railway URL:

```html
<a href="https://your-railway-url.up.railway.app">Pay Your Deposit</a>
```

Or open it in a new tab:
```html
<a href="https://your-railway-url.up.railway.app" target="_blank">Pay Your Deposit</a>
```

---

## Need Help?

- Railway docs: https://docs.railway.app
- Stripe docs: https://stripe.com/docs
- Test cards: https://stripe.com/docs/testing
