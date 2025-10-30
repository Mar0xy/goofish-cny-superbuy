# Goofish USD Price Converter

---

## Overview

The **Goofish USD Price Converter** is a browser extension designed to enhance the shopping experience on goofish.com, particularly for users utilizing agent services like **Superbuy**. It automatically converts item prices listed in Chinese Yuan (CNY) into **US Dollars (USD)** directly on the product pages and search result listings. This provides instant visibility of the approximate USD cost without requiring manual calculations.

---

## Key Features

* **Real-time Conversion:** Converts and displays USD prices next to the original CNY prices on all Goofish pages.
* **Superbuy Exchange Rate:** Fetches the conversion rate directly from the official **Superbuy currency API** for maximum accuracy and relevance to the agent's actual costs.
* **Automatic Rate Updates:** The exchange rate is automatically fetched and updated in the background every **6 hours**.
* **Optional Superbuy Fee:** Includes a setting to optionally factor in a fixed **20 CNY Superbuy service fee** into the final USD price calculation, providing a closer estimate of the final *item cost* through the agent.
* **Live Updates:** Changes to the optional service fee or a manual rate update are instantly applied to all open Goofish tabs.

---

## How It Works

The extension is specifically tailored for the **Superbuy** ecosystem, ensuring the estimated USD price reflects the agent's operational environment.

### 1. Exchange Rate Management (`background.js`)

* The background script is responsible for maintaining the current exchange rate.
* It calls the **Superbuy currency API** upon extension startup and then every 6 hours via an alarm.
* The fetched CNY-per-USD rate is stored locally in the browser's storage.
* When a manual update is triggered from the popup, it fetches the new rate and sends a message to all active Goofish tabs.

### 2. Price Conversion (`content.js`)

* The content script runs on all Goofish pages.
* It monitors the page content (including content loaded dynamically, like when scrolling) and identifies elements containing prices in CNY.
* It performs the conversion using the stored **Superbuy rate** and appends a new element containing the calculated USD price.
* If the **"Include Superbuy Fee"** option is enabled, it adds **20 CNY** to the original item price *before* conversion. This helps users budget for the mandatory service charge imposed by the agent.
* When a live update is received (from the popup or a manual rate refresh), it non-destructively updates the text of the existing USD price labels without re-scanning the entire page.

### 3. User Settings (`popup.html` / `popup.js`)

* Clicking the extension icon opens a small popup window.
* This window displays the currently active **Superbuy exchange rate**.
* It provides a button to manually fetch the latest rate.
* It also includes a checkbox to toggle the fee inclusion setting and instantly updates the prices to reflect with the fee on open Goofish pages.

---

## Usage and Settings

1.  **Installation:** Install the extension in your preferred browser.
2.  **Initial Setup:** The extension will automatically fetch the first Superbuy exchange rate upon startup.
3.  **Manual Update:** Click the extension icon and press **"Update Now"** to manually refresh the rate, ensuring you have the latest Superbuy conversion value.
4.  **Toggle Fee:** Use the **"Include Superbuy Fee (20 CNY)"** checkbox in the popup to decide if the 20 CNY service fee should be added to your calculated USD price. This setting is saved and persists across sessions, providing a better estimate of the final cost when using **Superbuy**.
