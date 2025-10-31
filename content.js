// content.js (FINAL: Crash Fix & Multi-Currency Support + CNY Alipay Logic + Styling)

// --- CSS STYLING FÜR KONVERTIERTE PREISE ---
const CONVERTED_PRICE_STYLE = `
    .converted-price-display {
        display: inline-block;
        font-size: 1.1em; /* Macht den Preis etwas größer */
        font-weight: bold;
        color: #007bff; /* Ein helles Blau (wie im Popup) */
        background-color: #f0f8ff; /* Sehr heller Hintergrund zur Hervorhebung */
        padding: 2px 5px;
        border-radius: 4px;
        margin-left: 5px;
        line-height: 1.2;
        text-wrap: nowrap;
    }
    /* Fügt einen klaren Trennstrich zum Originalpreis hinzu */
    .converted-price-display:before {
        content: ' / ';
        color: #999; /* Grauer Trennstrich */
        font-weight: normal;
        font-size: 0.9em;
        margin-right: 5px;
    }
    
    /* 2. Vertikale Positionierung des konvertierten Preises INNERHALB DIESES EINEN CONTAINERS */
    .right-card-main-img--iGIzt9Py .converted-price-display {
        position: absolute; /* Muss absolut sein, da der Elternteil relativ ist */
        top: 122%; /* Positioniert es direkt unter dem Originalpreis */
        left: 12%; 
        margin-left: 0 !important; /* Entfernt den seitlichen Standardabstand */
        margin-top: 5px; /* Vertikaler Abstand zum Originalpreis */
    }

    /* 3. Entfernt den Trennstrich für das vertikale Layout */
    .right-card-main-img--iGIzt9Py .converted-price-display:before {
        content: ''; 
        display: none;
    }
`;

/**
 * Injects CSS styles into the document head to style the converted prices.
 */
function injectStyles() {
    if (document.getElementById('converter-styles')) return;

    const styleElement = document.createElement('style');
    styleElement.id = 'converter-styles';
    styleElement.textContent = CONVERTED_PRICE_STYLE;
    document.head.appendChild(styleElement);
}

// Stellt sicher, dass die Styles bei jedem Seitenaufruf eingefügt werden
injectStyles();


// Selectors for inner price wrappers
const PRICE_PARTS_SELECTORS = [
    '.value--EyQBSInp', 
    '.price-wrap--YzmU5cUl',
	'.right-card-main-img--iGIzt9Py'
];

// Regex for simple prices (e.g., in body text, discount boxes)
const SIMPLE_PRICE_REGEX = /(¥|元|￥)\s*(\d[\d,.]*)/g; 

let conversionRates = {}; 
let selectedRateType = 'standard';
let isModifyingDOM = false;
let includeSuperbuyFee = false;
const SUPERBUY_FEE_CNY = 20; 
const ALIPAY_FEE_PERCENT = 0.03;

let targetCurrencySymbol = '$'; 
let targetCurrencyCode = 'USD';
let currentStoredSelectedRateType = 'standard'; 

// --- HELPER FUNCTIONS FOR PRICE CALCULATION ---

/**
 * Creates the converted text based on price and conversion type.
 * @param {number} cnyPrice - The original price in CNY.
 * @param {boolean} isTextNodeConversion - True if converting a raw text node price (adds "~").
 * @returns {string} The formatted price string in the target currency.
 */
function getUsdText(cnyPrice, isTextNodeConversion) {
    let cnyPriceToConvert = cnyPrice;
    
    // Die Superbuy-Gebühr wird nur für USD/andere Währungen zur Konvertierung hinzugefügt.
    if (targetCurrencyCode !== 'CNY' && includeSuperbuyFee) {
        cnyPriceToConvert += SUPERBUY_FEE_CNY;
    }

    // --- A. CNY Target Conversion Logic (FIXED: Alipay Fee Calculation & Styling) ---
    if (targetCurrencyCode === 'CNY') {
        let finalDisplayPrice = cnyPrice; 
        let titleSuffix = '';
        let displaySuffix = '';
        let totalAddedFee = 0; 
        
        // 1. Superbuy Fee (pauschal 20 CNY)
        // Gebühr wird zur ANZEIGE hinzugefügt (nicht zur Konvertierung, da 1:1)
        if (includeSuperbuyFee) {
            finalDisplayPrice += SUPERBUY_FEE_CNY;
            totalAddedFee += SUPERBUY_FEE_CNY;
            titleSuffix += ` (Inkl. ¥${SUPERBUY_FEE_CNY} Superbuy Gebühr)`;
        }
        
        // 2. Alipay Fee (3% bei cny_alipay und Preis > 200 CNY)
        // Die Gebühr wird auf den Originalpreis angewendet.
        if (currentStoredSelectedRateType === 'cny_alipay' && cnyPrice > 200) {
            const alipayFee = cnyPrice * ALIPAY_FEE_PERCENT; 
            finalDisplayPrice += alipayFee;
            totalAddedFee += alipayFee;
            
            titleSuffix += ` (+ ¥${alipayFee.toFixed(2)} Alipay Gebühr)`;
        }
        
        // 3. Finaler Display Suffix (zeigt alle hinzugefügten Gebühren an)
        if (totalAddedFee > 0) {
            // Zeigt die Summe der Gebühren im sichtbaren Text an.
            displaySuffix = ` (+¥${totalAddedFee.toFixed(2)} Fee)`; 
        }

        // Der angezeigte Text enthält den Endpreis (inkl. Gebühr) und den Gebühren-Hinweis
        const cnyDisplay = `¥${finalDisplayPrice.toFixed(2)}${displaySuffix}`;
        const titleText = `Original: ¥${cnyPrice.toFixed(2)}${titleSuffix}`;
        
        // WICHTIG: Füge die Klasse "converted-price-display" hinzu, um das Styling und
        // die korrekte Entfernung durch removeConvertedElements zu gewährleisten.
        return `<span title="${titleText}" class="converted-price-display">${cnyDisplay}</span>`;
    }

    // --- B. Non-CNY Target Conversion Logic (e.g., USD) ---
    const standardRate = conversionRates['standard'];
    if (!standardRate) {
         const titleText = "Error: Exchange rate data missing.";
         return `<span title="${titleText}" class="converted-price-display">Error!</span>`;
    }
    
    let usdPrice;
    let rateUsedDescription;

    if (selectedRateType === 'other_payments') {
        const FIXED_FEE = 0.30;
        const FEE_PERCENT = 0.05; 
        
        // cnyPriceToConvert enthält bereits die Superbuy Fee, falls ausgewählt
        const payableUsdAmount = cnyPriceToConvert / standardRate;
        usdPrice = (payableUsdAmount + FIXED_FEE) / (1 - FEE_PERCENT); 
        rateUsedDescription = `Dynamic Fee (Standard Rate: ¥${standardRate.toFixed(4)})`;
    } else {
        const rate = conversionRates[selectedRateType];
        if (!rate) {
            usdPrice = cnyPriceToConvert / standardRate;
            rateUsedDescription = `STANDARD (Fallback): 1 ${targetCurrencyCode} ≈ ¥${standardRate.toFixed(4)}`;
        } else {
            usdPrice = cnyPriceToConvert / rate;
            rateUsedDescription = `${selectedRateType}: 1 ${targetCurrencyCode} ≈ ¥${rate.toFixed(4)}`;
        }
    }
    
    // Generate Text and Title
    const finalUsdText = `${targetCurrencySymbol}${usdPrice.toFixed(2)}`;
    const titleText = `Konvertiert: ${finalUsdText}\nRate: ${rateUsedDescription}\nOriginal: ¥${cnyPrice.toFixed(2)}${includeSuperbuyFee ? ` + ¥${SUPERBUY_FEE_CNY} Gebühr` : ''}`;

    // Rückgabe des gestylten <span>-Elements
    return `<span title="${titleText}" class="converted-price-display">${finalUsdText}</span>`;
}

// --- DOM MANIPULATION AND CONVERSION CORE ---

/**
 * Main conversion function. Iterates through all potential price containers.
 */
function parseAndConvertPrice() {
    isModifyingDOM = true;
    
    // 1. Handle main price wrappers (e.g., product page price, card prices)
    PRICE_PARTS_SELECTORS.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
            
            // NUR konvertieren, wenn noch NICHT geschehen
            if (element.hasAttribute('data-converted')) {
                return;
            }

            // NEUE LOGIK:
            // Versuche, den Preis direkt aus dem gesamten Text des Containers zu extrahieren.
            // Dies ist robuster, da es nicht von der genauen Struktur der Kind-Knoten abhängt.
            const text = element.textContent.trim();
            
            // Regex, um ¥ gefolgt von Zahlen (mit Kommas oder Punkten) zu finden
            const match = text.match(/¥\s*([\d,.]+)/);
            
            if (match) {
                // match[1] ist die extrahierte Preisnummer (z.B. "123.45")
                const price = parseFloat(match[1].replace(/,/g, ''));
                
                if (!isNaN(price) && price > 0) {
                    const usdText = getUsdText(price, false);
                    
                    // Fügt den konvertierten Preis-Text als Geschwisterelement des Originalpreises hinzu
                    // 'beforeend' funktioniert gut, da es im CSS gezielt positioniert wird.
                    element.insertAdjacentHTML('beforeend', usdText);
                    element.setAttribute('data-converted', 'true');
                }
            }

            // // Alte Logik: Findet den spezifischen Text-Container. (Wurde ersetzt/vereinfacht)
            // const priceTextContainer = Array.from(element.childNodes).find(node => 
            //     // Prüft den Haupt-Textknoten des Containers ODER ein span/div-Kindelement
            //     (node.nodeType === 3 && node.textContent.includes('¥')) || 
            //     (node.nodeType === 1 && node.textContent.includes('¥'))
            // );
            
            // if (priceTextContainer) {
            //     const text = priceTextContainer.textContent.trim();
            //     const match = text.match(/¥([\d,.]+)/);
                
            //     // Nur konvertieren, wenn noch nicht geschehen
            //     if (match && !element.hasAttribute('data-converted')) {
            //         // ... (Rest der alten Logik) ...
            //     }
            // }

        });
    });

    // 2. Handle raw text conversions (e.g., in description, search results, etc.)
    // DIESER TEIL BLEIBT UNVERÄNDERT, DA ER BEREITS TEXT-KNOTEN VERARBEITET
    const treeWalker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        { 
            acceptNode: (node) => {
                // Ignore nodes inside already converted elements, scripts, or styles
                if (node.parentElement && node.parentElement.closest('[data-converted], script, style, .converted-price-display')) {
                    return NodeFilter.FILTER_SKIP;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        },
        false
    );

    let node;
    while (node = treeWalker.nextNode()) {
        if (node.textContent.match(SIMPLE_PRICE_REGEX)) {
            let originalText = node.textContent;
            let newText = originalText;
            let changesMade = false;

            newText = newText.replace(SIMPLE_PRICE_REGEX, (match, symbol, value) => {
                const price = parseFloat(value.replace(/,/g, ''));
                if (!isNaN(price)) {
                    // Check if conversion already exists next to it (basic check)
                    if (node.nextElementSibling && node.nextElementSibling.classList.contains('converted-price-display')) {
                        return match; // Already converted, skip
                    }
                    
                    const usdText = getUsdText(price, true);
                    changesMade = true;
                    // Inject the HTML after the current text node
                    const spanWrapper = document.createElement('span');
                    spanWrapper.innerHTML = usdText;
                    node.parentNode.insertBefore(spanWrapper, node.nextSibling);
                    return match; // Return original match, but now followed by the new span
                }
                return match;
            });

            // If changes were made, we don't need to update the text content of the node itself
            // since we inserted a new element next to it.
        }
    }
    
    isModifyingDOM = false;
}


/**
 * Removes all previously injected converted price elements.
 */
function removeConvertedElements() {
    isModifyingDOM = true;
    
    // Remove injected elements (the <span> with the new class)
    document.querySelectorAll('.converted-price-display').forEach(el => el.remove());

    // Remove the 'data-converted' attribute from main wrappers
    PRICE_PARTS_SELECTORS.forEach(selector => {
        document.querySelectorAll(`${selector}[data-converted='true']`).forEach(element => {
            element.removeAttribute('data-converted');
        });
    });
    
    isModifyingDOM = false;
}

/**
 * Forces a removal of old prices and a full reconversion.
 */
function forceReconversion() {
    removeConvertedElements();
    parseAndConvertPrice();
}


// --- MUTATION OBSERVER ---

const observerConfig = {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
};

const observer = new MutationObserver((mutationsList, observer) => {
    if (isModifyingDOM) {
        return;
    }
    
    let shouldConvert = false;
    
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Check if any added node is a potential price container
            const addedPriceContainer = Array.from(mutation.addedNodes).some(node => 
                node.nodeType === 1 && (
                    PRICE_PARTS_SELECTORS.some(selector => node.matches(selector)) ||
                    node.querySelector(PRICE_PARTS_SELECTORS.join(','))
                )
            );
            
            if (addedPriceContainer) {
                shouldConvert = true;
                break;
            }
        }
    }

    if (shouldConvert) {
        // Debounce or rate-limit the conversion process
        setTimeout(parseAndConvertPrice, 50); 
    }
});

function startObserver() {
    // Initial scan
    parseAndConvertPrice(); 
    
    // Start observing the body for changes
    observer.observe(document.body, observerConfig);
}


// --- MESSAGE HANDLER & INITIALIZATION ---

browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    // 1. Live update for the fee status
    if (request.command === "toggle_fee_live") {
        includeSuperbuyFee = request.newFeeStatus === true;
        // Beim Umschalten der Gebühr MUSS eine Neukonvertierung stattfinden
        forceReconversion(); 
        sendResponse({ success: true });
        return true; 
    }
    
    // 2. Live update for the rate type
    if (request.command === "change_rate_type_live") {
        // WICHTIG: ALLE für die Konvertierung relevanten Werte MÜSSEN neu geladen werden,
        // da der Rate-Type oft im Popup geändert wird, ohne dass Raten neu geladen wurden.
        browser.storage.local.get(["conversionRates", "selectedRateType", "targetCurrencySymbol", "targetCurrencyCode", "includeSuperbuyFee"])
          .then(data => {
            const currentType = data.selectedRateType || 'standard';
            const currentCode = data.targetCurrencyCode || 'USD';
            
            // Check if the rate is available or if it's the dynamic/CNY type
            if (data.conversionRates || currentType === 'other_payments' || currentCode === 'CNY') {
              conversionRates = data.conversionRates || {}; 
              selectedRateType = currentType; 
              targetCurrencySymbol = data.targetCurrencySymbol || '$';
              targetCurrencyCode = currentCode; 
              includeSuperbuyFee = data.includeSuperbuyFee === true;
              // NEU/WICHTIG: currentStoredSelectedRateType muss gesetzt werden, da es in getUsdText verwendet wird!
              currentStoredSelectedRateType = currentType; 
              
              // 2. Erzwungene Neukonvertierung ausführen
              forceReconversion(); 
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, message: "New rate not found in storage." });
            }
          });
        return true; 
    }
    
    // 3. Live update for the exchange rates (manual rate refresh or option change)
    if (request.command === "reconvert_live_rate") {
        // WICHTIG: ALLE für die Konvertierung relevanten Werte MÜSSEN neu geladen werden!
        browser.storage.local.get(["conversionRates", "selectedRateType", "targetCurrencySymbol", "targetCurrencyCode", "includeSuperbuyFee"])
          .then(data => {
            const currentType = data.selectedRateType || 'standard';
            const currentCode = data.targetCurrencyCode || 'USD';
            
            if (data.conversionRates || currentCode === 'CNY') {
              // 1. Lokale Variablen mit den NEUEN Werten aus dem Storage aktualisieren
              conversionRates = data.conversionRates || {}; 
              selectedRateType = currentType; 
              targetCurrencySymbol = data.targetCurrencySymbol || '$';
              targetCurrencyCode = currentCode; 
              includeSuperbuyFee = data.includeSuperbuyFee === true; 
              // NEU/WICHTIG: currentStoredSelectedRateType muss gesetzt werden, da es in getUsdText verwendet wird!
              currentStoredSelectedRateType = currentType; 
              
              // 2. Erzwungene Neukonvertierung ausführen
              forceReconversion(); 
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, message: "Rates not found in storage." });
            }
          })
          .catch(error => {
              console.error("[$] Error during live reconversion fetch:", error);
              sendResponse({ success: false, message: "Error reading storage for reconversion." });
          });
        return true; 
    }
});

// WICHTIG: Initialisierungsblock am Ende der Datei muss alle globalen Variablen setzen.
browser.storage.local.get(["conversionRates", "includeSuperbuyFee", "selectedRateType", "targetCurrencySymbol", "targetCurrencyCode"])
  .then(data => {
    conversionRates = data.conversionRates || {};
    includeSuperbuyFee = data.includeSuperbuyFee === true; 
    selectedRateType = data.selectedRateType || 'standard'; 
    targetCurrencySymbol = data.targetCurrencySymbol || '$';
    targetCurrencyCode = data.targetCurrencyCode || 'USD';
    currentStoredSelectedRateType = selectedRateType; // <- DIESE IST KRITISCH FÜR DEN LAUF
    startObserver();
  })
  .catch(error => {
    console.error("[$] Error fetching settings on load:", error);
  });
