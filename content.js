// content.js (FINAL: Smart Live Update - Text-Only Update on Fee/Rate Toggle, including Dynamic Rate)

// Selectors for inner price wrappers
const PRICE_PARTS_SELECTORS = [
    '.value--EyQBSInp', 
    '.price-wrap--YzmU5cUl',
    '.right-card-main-price--BRE5MkOF' 
];

// Regex for simple prices (e.g., in body text, discount boxes)
const SIMPLE_PRICE_REGEX = /(¥|元|￥)\s*(\d[\d,.]*)/g; 

let conversionRates = {}; // { standard: 6.8, wise: 6.7, transfer: 6.7 }
let selectedRateType = 'standard';
let isModifyingDOM = false;
let includeSuperbuyFee = false;
const SUPERBUY_FEE_CNY = 20; 

// --- HELPER FUNCTIONS FOR PRICE CALCULATION ---

/**
 * Creates the converted USD text based on price and conversion type.
 */
function getUsdText(cnyPrice, isTextNodeConversion) {
    const standardRate = conversionRates['standard'];
    if (!standardRate) return '';
    
    let cnyPriceToConvert = cnyPrice;
    
    // 1. Apply optional Superbuy Fee first, if enabled (applies to all methods)
    if (includeSuperbuyFee) {
        cnyPriceToConvert += SUPERBUY_FEE_CNY;
    }

    let usdPrice;
    let usdText;
    
    if (selectedRateType === 'other_payments') {
        const FIXED_FEE = 0.3; // USD
        const PERCENTAGE_FEE = 0.05; // 5%

        // Step A: Convert total CNY (item + optional Superbuy fee) to USD Payable Amount using the Standard Rate
        const usdPayableAmount = cnyPriceToConvert / standardRate;
        
        // Step B: Calculate the Actual payment amount (Final USD Price) using the "Other Payment" formula
        // Formula: Actual payment amount (USD) = (Payable (USD) + Fixed Fee) / (1 - Percentage Fee)
        usdPrice = (usdPayableAmount + FIXED_FEE) / (1 - PERCENTAGE_FEE);
        
        // Text display includes a note about the calculation model
        const feeNote = includeSuperbuyFee ? `, Agent Fee Incl.` : '';
        usdText = isTextNodeConversion
            ? ` (~$${usdPrice.toFixed(2)}, Other Model${feeNote})`
            : `$${usdPrice.toFixed(2)} (Other Model${feeNote})`;
        
    } else {
        // Use the selected remittance rate (standard, wise, transfer)
        const rateToUse = conversionRates[selectedRateType] || standardRate;
        
        usdPrice = cnyPriceToConvert / rateToUse; 
        
        // Text display uses the original format for standard/remittance rates
        // Note: cnyPriceToConvert already includes the optional Superbuy Fee if toggled
        const feeNote = includeSuperbuyFee ? `, Fee Incl. ¥${cnyPriceToConvert.toFixed(2)}` : '';
        usdText = isTextNodeConversion
            ? ` (~$${usdPrice.toFixed(2)}${feeNote})`
            : `$${usdPrice.toFixed(2)}${feeNote}`;
    }
    
    return usdText;
}


// --- HELPER FUNCTIONS FOR DOM MANIPULATION ---

/**
 * Removes all USD price displays added by this extension.
 */
function removeExistingConversions() {
    isModifyingDOM = true;
    
    document.querySelectorAll('[data-converted-multi="true"]').forEach(el => {
        el.removeAttribute('data-converted-multi');
    });

    document.querySelectorAll('[data-converted-usd="true"]').forEach(el => {
        try {
            el.remove();
        } catch(e) {
            console.error("[CONTENT] Error removing old conversions:", e);
        }
    });

    isModifyingDOM = false;
}


/**
 * Extracts the full CNY price from a container.
 */
function extractCnyPrice(priceContainer) {
    let priceString = '';
    let foundSymbol = false;
    let foundNumber = false;

    priceContainer.childNodes.forEach(child => {
        if (child.nodeType === 1) { 
            const text = child.textContent.trim();
            
            if (text.match(/^(¥|元|￥)$/)) {
                foundSymbol = true;
            } 
            else if (text.match(/^[\d,.]+$/)) {
                priceString += text.replace(/,/g, '');
                foundNumber = true;
            }
        }
    });

    if (foundSymbol && foundNumber && priceString.length > 0) {
        return parseFloat(priceString);
    }
    return null;
}

/**
 * Handles all nested price structures.
 */
function handleMultiPartPrice(scopeNode) {
    if (!conversionRates[selectedRateType] && selectedRateType !== 'other_payments') return;
    
    scopeNode.querySelectorAll(PRICE_PARTS_SELECTORS.join(', ')).forEach(priceContainer => {
        if (priceContainer.getAttribute('data-converted-multi') === 'true') {
            return;
        }

        const cnyPrice = extractCnyPrice(priceContainer);

        if (cnyPrice !== null && cnyPrice > 0) {
            
            const usdText = getUsdText(cnyPrice, false); // isTextNodeConversion = false
            
            const usdSpan = document.createElement('span');
            usdSpan.textContent = usdText;
            usdSpan.setAttribute('data-converted-usd', 'true');
            usdSpan.setAttribute('data-cny-price', cnyPrice.toString()); // Save original price
            
            // --- STYLING LOGIC ---
            if (priceContainer.classList.contains('right-card-main-price--BRE5MkOF')) {
                usdSpan.style.position = 'absolute';
                usdSpan.style.bottom = '-15.8px'; 
                usdSpan.style.left = '50%';
                usdSpan.style.transform = 'translateX(-50%)';
                usdSpan.style.zIndex = '10'; 
                usdSpan.style.whiteSpace = 'nowrap';
                
                usdSpan.style.fontSize = '9px'; 
                usdSpan.style.fontWeight = 'bold';
                usdSpan.style.color = '#fff'; 
                usdSpan.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                usdSpan.style.padding = '2px 4px';
                usdSpan.style.borderRadius = '3px';
                
                isModifyingDOM = true;
                try {
                     priceContainer.appendChild(usdSpan);
                } catch(e) { console.error("[CONTENT] Error during DOM modification:", e); }
                finally {
                     isModifyingDOM = false;
                }

            } else {
                usdSpan.style.fontSize = '12px';
                usdSpan.style.color = '#fff';   
                usdSpan.style.backgroundColor = '#666';
                usdSpan.style.padding = '2px 4px';
                usdSpan.style.borderRadius = '3px';
                usdSpan.style.marginLeft = '4px';
                usdSpan.style.display = 'inline-block'; 

                isModifyingDOM = true;
                try {
                    priceContainer.parentNode.insertBefore(usdSpan, priceContainer.nextSibling);
                } catch(e) { console.error("[CONTENT] Error during DOM modification:", e); }
                finally {
                     isModifyingDOM = false;
                }
            }

            priceContainer.setAttribute('data-converted-multi', 'true');
        }
    });
}


/**
 * Converts prices found within a text node.
 */
function convertPriceInTextNode(textNode) {
    if (!conversionRates[selectedRateType] && selectedRateType !== 'other_payments') return;

    const originalText = textNode.textContent;
    let lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let match;
    let convertedCount = 0;

    SIMPLE_PRICE_REGEX.lastIndex = 0;

    while ((match = SIMPLE_PRICE_REGEX.exec(originalText)) !== null) {
        const fullMatch = match[0];
        const priceString = match[2]; 

        if (match.index > lastIndex) {
            fragment.appendChild(document.createTextNode(originalText.substring(lastIndex, match.index)));
        }

        const cnyPrice = parseFloat(priceString.replace(/,/g, ''));
        
        if (isNaN(cnyPrice) || cnyPrice <= 0) {
            fragment.appendChild(document.createTextNode(fullMatch));
        } else {
            fragment.appendChild(document.createTextNode(fullMatch));
            
            const usdText = getUsdText(cnyPrice, true); // isTextNodeConversion = true
            
            const usdSpan = document.createElement('span');
            usdSpan.textContent = usdText;
            usdSpan.setAttribute('data-converted-usd', 'true');
            usdSpan.setAttribute('data-cny-price', cnyPrice.toString()); // Save original price
            usdSpan.style.fontWeight = 'bold';
            fragment.appendChild(usdSpan);
            convertedCount++;
        }

        lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < originalText.length) {
        fragment.appendChild(document.createTextNode(originalText.substring(lastIndex)));
    }

    if (convertedCount > 0) {
        isModifyingDOM = true;
        try {
            textNode.parentNode.replaceChild(fragment, textNode); 
        } catch (e) {
            console.error("[CONTENT] Error during DOM modification:", e);
        } finally {
            isModifyingDOM = false;
        }
    }
}


// --- DOM Processing and Observer ---

function processNode(node) {
    if (!conversionRates[selectedRateType] && selectedRateType !== 'other_payments') return;

    if (node.nodeType === 1 && node.getAttribute('data-converted-usd') === 'true') {
        return;
    }

    if (node.nodeType === 1 && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') {
        
        if (node.matches(PRICE_PARTS_SELECTORS.join(', '))) {
            handleMultiPartPrice(node);
        }

        node.childNodes.forEach(child => {
            processNode(child);
        });
    }

    if (node.nodeType === 3 && node.textContent.trim().length > 0) {
        if (!node.parentNode || node.parentNode.getAttribute('data-converted-usd') !== 'true') {
            convertPriceInTextNode(node);
        }
    }
}

/**
 * Updates only the text content of existing USD spans (non-destructively).
 */
function updateOnlyUsdText() {
    if (!conversionRates[selectedRateType] && selectedRateType !== 'other_payments') return;
    
    document.querySelectorAll('[data-converted-usd="true"]').forEach(usdSpan => {
        const cnyPriceAttr = usdSpan.getAttribute('data-cny-price');
        if (!cnyPriceAttr) return; 

        const cnyPrice = parseFloat(cnyPriceAttr);
        if (isNaN(cnyPrice)) return;

        // Determine if it was a text node conversion (with "~")
        const isTextNodeConversion = usdSpan.textContent.includes(' (~'); 

        const usdText = getUsdText(cnyPrice, isTextNodeConversion);
        
        isModifyingDOM = true;
        try {
            usdSpan.textContent = usdText; // ONLY update the text content
        } catch(e) {
             console.error("[CONTENT] Error during text update:", e);
        } finally {
            isModifyingDOM = false;
        }
    });
    
    console.log(`[$] Live Update (Text-Only) performed. Rate Type: ${selectedRateType}. Superbuy Fee: ${includeSuperbuyFee ? 'INCLUDED' : 'EXCLUDED'}.`);
}


/**
 * Forces reconversion of all prices based on the current fee/rate.
 * Performs a text-only update for live changes.
 */
function forceReconversion() {
    if (!conversionRates[selectedRateType] && selectedRateType !== 'other_payments') {
        console.warn("[$] Rate not available for selected type, cannot update live.");
        return;
    }

    // If converted spans already exist, do NOT perform the destructive scan,
    // but only the text update.
    if (document.querySelector('[data-converted-usd="true"]')) {
        updateOnlyUsdText();
        return;
    }
    
    // Otherwise (Initial conversion), perform the full scan.
    removeExistingConversions();
    processNode(document.body);
    handleMultiPartPrice(document.body);
    
    console.log(`[$] Full Scan performed (Initial conversion). Rate Type: ${selectedRateType}. Superbuy Fee: ${includeSuperbuyFee ? 'INCLUDED' : 'EXCLUDED'}.`);
}

function startObserver() {
    if (!conversionRates['standard'] && selectedRateType === 'other_payments') {
        // If 'other_payments' is selected, we need the standard rate for calculation
        console.warn("[$] Standard Exchange rate not available yet. Retrying...");
        setTimeout(startObserver, 500); 
        return;
    }
    
    console.log("[$] Goofish USD Converter is active.");
    console.log(`[$] Selected Rate Type: ${selectedRateType}. Superbuy Fee (20 CNY) is: ${includeSuperbuyFee ? 'INCLUDED' : 'EXCLUDED'}.`);

    processNode(document.body);
    handleMultiPartPrice(document.body); 

    const observer = new MutationObserver((mutationsList, observer) => {
        if (isModifyingDOM) {
            return;
        }
        
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        processNode(node);
                        handleMultiPartPrice(node);
                    }
                });
            }
        }
    });

    const config = { childList: true, subtree: true };
    observer.observe(document.body, config);
}


// --- Main Execution and Message Listener ---

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. Live update for the fee toggle
    if (request.command === "toggle_fee_live" && request.newFeeStatus !== undefined) {
        includeSuperbuyFee = request.newFeeStatus; 
        forceReconversion(); 
        sendResponse({ success: true });
        return true;
    }
    
    // 2. Live update for the selected rate type
    if (request.command === "set_rate_type" && request.newRateType !== undefined) {
         browser.storage.local.get("conversionRates")
          .then(data => {
            // Only require a rate if the selected type is NOT the dynamic one, or if we need the standard rate for the calculation
            if (data.conversionRates && (data.conversionRates[request.newRateType] || request.newRateType === 'other_payments')) {
              conversionRates = data.conversionRates;
              selectedRateType = request.newRateType; 
              forceReconversion(); 
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, message: "New rate not found in storage." });
            }
          });
        return true; 
    }
    
    // 3. Live update for the exchange rates (manual rate refresh)
    if (request.command === "reconvert_live_rate") {
        browser.storage.local.get(["conversionRates", "selectedRateType"])
          .then(data => {
            if (data.conversionRates && (data.conversionRates[data.selectedRateType] || data.selectedRateType === 'other_payments')) {
              conversionRates = data.conversionRates; 
              selectedRateType = data.selectedRateType; 
              forceReconversion(); 
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, message: "Rates not found in storage." });
            }
          });
        return true; 
    }
});

browser.storage.local.get(["conversionRates", "includeSuperbuyFee", "selectedRateType"])
  .then(data => {
    conversionRates = data.conversionRates || {};
    includeSuperbuyFee = data.includeSuperbuyFee === true; 
    selectedRateType = data.selectedRateType || 'standard'; 
    startObserver();
  })
  .catch(error => {
    console.error("[$] Error fetching settings:", error);
  });
