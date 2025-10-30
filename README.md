# Goofish USD Price Converter

---

## Overview

The **Goofish USD Price Converter** is a browser extension designed to enhance the shopping experience on goofish.com, particularly for users utilizing agent services like **Superbuy**. It automatically converts item prices listed in Chinese Yuan (CNY) into **US Dollars (USD)** directly on the product pages and search result listings. This provides instant visibility of the approximate USD cost without requiring manual calculations.

---

## Key Features

* **Multiple Conversion Models:** Offers a selector in the popup to choose between three fixed exchange rates (Standard, Wise Remittance, Bank Transfer) and one dynamic fee calculation model for **Other Payment Types**.
* **Superbuy Exchange Rate:** Fetches the conversion rate directly from the official **Superbuy currency API** for maximum accuracy and relevance to the agent's actual costs.
* **Remittance Rates:** Calculates and uses special discounted rates for Wise and Bank Transfers based on Superbuy's remittance discount program.
* **Dynamic Payment Fee:** Includes a calculation mode for **Other Payment Types** (e.g., PayPal, Credit Card) using Superbuy's formula: `Actual Payment = (Payable USD + $0.30) / (1 - 0.05)`.
* **Optional Superbuy Fee:** Includes a setting to optionally factor in a fixed **20 CNY Superbuy service fee** into the final USD price calculation, providing a closer estimate of the final *item cost* through the agent.
* **Live Updates:** Changes to the rate type, fee inclusion, or a manual rate update are instantly applied to all open Goofish tabs.

---

## How It Works

The extension is specifically tailored for the **Superbuy** ecosystem, ensuring the estimated USD price reflects the agent's operational environment and chosen payment method.

### 1. Exchange Rate Management (`background.js`)

* The background script fetches the Standard Exchange Rate (`RealRate`) and the market rate (`BaseRate`).
* It fetches the current discount percentages for Wise and Bank Transfers from Superbuy's remittance API.
* **Fixed Rates:** It calculates the three fixed exchange rates (Standard, Wise, Bank Transfer) using the Superbuy formulas and stores them locally.
* **Automatic Updates:** Rates are automatically fetched and updated every **6 hours**.

### 2. Price Conversion (`content.js`)

* The content script runs on all Goofish pages and identifies prices in CNY.
* It first applies the optional **20 CNY Superbuy Service Fee** to the item price if the setting is enabled.
* **Conversion Logic based on Selected Rate Type:**
    * **Standard, Wise, or Bank Transfer:** The total CNY price (item + optional fee) is divided by the corresponding, pre-calculated exchange rate.
    * **Other Payment Types (Dynamic Fee):**
        1.  The total CNY price (item + optional fee) is converted to a "Payable USD Amount" using the Standard Rate.
        2.  The final **Actual Payment Amount (USD)** is calculated using the payment fee model: `(Payable USD Amount + $0.30) / 0.95`.

### 3. User Settings (`popup.html` / `popup.js`)

* The popup allows the user to:
    * Select the desired conversion model (Standard, Wise, Bank Transfer, Other Payments).
    * Toggle the **"Include Superbuy Fee (20 CNY)"** setting.
    * Manually refresh the exchange rates.

---

## Usage and Settings

1.  **Installation:** Install the extension in your preferred browser.
2.  **Select Rate Type:** Click the extension icon and use the **"Select Rate Type"** dropdown to choose the payment method you plan to use on **Superbuy** for the most accurate cost estimation.
3.  **Toggle Fee:** Use the **"Include Superbuy Fee (20 CNY)"** checkbox to add the mandatory agent service fee to your calculated price.
4.  **Update Manually:** Click **"Update Now"** to manually refresh the rates.
