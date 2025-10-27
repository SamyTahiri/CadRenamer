(function() {
    'use strict';

    let partCounter = {};
    let documentLetter = null;
    let isEnabled = true;

    // Enhanced logging
    console.log('=== Onshape Auto-Renamer Started ===');

    function extractLetterFromDocName() {
        // Try multiple ways to find the document name
        console.log('Trying to extract document letter...');

        // Method 1: Title tag
        const title = document.title;
        console.log('Document title:', title);
        let match = title.match(/\d+-([A-Z])\d+-/i);
        if (match) {
            console.log('✓ Found letter in title:', match[1]);
            return match[1].toUpperCase();
        }

        // Method 2: Various selectors
        const selectors = [
            '[data-test-id="document-name"]',
            '.document-name',
            '.document-title',
            'h1',
            '[class*="document"]',
            '[class*="title"]'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                const text = element.textContent.trim();
                console.log(`Found element with selector "${selector}":`, text);
                match = text.match(/\d+-([A-Z])\d+-/i);
                if (match) {
                    console.log('✓ Found letter:', match[1]);
                    return match[1].toUpperCase();
                }
            }
        }

        console.log('✗ Could not find document letter');
        return null;
    }

    function getNextPartNumber(letter) {
        if (!partCounter[letter]) {
            partCounter[letter] = 0;
        }
        partCounter[letter]++;
        const num = String(partCounter[letter]).padStart(3, '0');
        console.log(`Generated part number: ${letter}${num}`);
        return num;
    }

    function scanExistingParts() {
        const letter = documentLetter;
        if (!letter) return;

        console.log('Scanning existing parts...');

        // Try multiple selectors for parts
        const partSelectors = [
            '[data-test-id="parts-table-row"]',
            '.part-row',
            '[class*="part"]',
            'tbody tr'
        ];

        let partElements = [];
        for (const selector of partSelectors) {
            partElements = document.querySelectorAll(selector);
            if (partElements.length > 0) {
                console.log(`Found ${partElements.length} parts using selector: ${selector}`);
                break;
            }
        }

        if (partElements.length === 0) {
            console.log('No parts found yet');
            return;
        }

        let maxNum = 0;
        partElements.forEach((el, index) => {
            const text = el.textContent;
            console.log(`Part ${index + 1} text:`, text.substring(0, 100));

            // Try to find part names
            const nameSelectors = ['.part-name', '[class*="name"]', 'td', 'div'];
            for (const sel of nameSelectors) {
                const nameEl = el.querySelector(sel);
                if (nameEl) {
                    const name = nameEl.textContent.trim();
                    console.log(`  Checking name: "${name}"`);

                    const pattern = new RegExp(`^${letter}(\\d+)$`, 'i');
                    const match = name.match(pattern);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        console.log(`  Found existing part: ${name} (number: ${num})`);
                        if (num > maxNum) maxNum = num;
                    }
                }
            }
        });

        partCounter[letter] = maxNum;
        console.log(`Counter initialized to: ${maxNum}`);
    }

    function renamePart(partElement, newName) {
        console.log('Attempting to rename part to:', newName);

        // Try to find the name element
        const nameSelectors = ['.part-name', '[class*="name"]', 'input', 'td', 'div'];
        let nameElement = null;

        for (const selector of nameSelectors) {
            nameElement = partElement.querySelector(selector);
            if (nameElement) {
                console.log('Found name element with selector:', selector);
                break;
            }
        }

        if (!nameElement) {
            console.log('✗ Could not find name element');
            return;
        }

        console.log('Current name:', nameElement.textContent);

        // Try double-click to edit
        console.log('Simulating double-click...');
        nameElement.dispatchEvent(new MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            view: window
        }));

        // Also try single click
        nameElement.click();

        setTimeout(() => {
            // Look for input field
            const input = partElement.querySelector('input[type="text"]') ||
                partElement.querySelector('input') ||
                document.querySelector('input:focus');

            if (input) {
                console.log('✓ Found input field');
                console.log('Setting value to:', newName);

                input.focus();
                input.value = newName;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));

                // Try Enter key
                input.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    bubbles: true
                }));

                // Try blur
                setTimeout(() => {
                    input.blur();
                    console.log('Rename attempt complete');
                }, 50);
            } else {
                console.log('✗ Could not find input field');
                console.log('Available inputs:', document.querySelectorAll('input').length);
            }
        }, 200);
    }

    function checkForNewParts() {
        if (!isEnabled) {
            console.log('Extension is disabled');
            return;
        }

        if (!documentLetter) {
            console.log('No document letter detected yet');
            return;
        }

        // Try multiple selectors
        const partSelectors = [
            '[data-test-id="parts-table-row"]',
            '.part-row',
            '[class*="part"]',
            'tbody tr'
        ];

        let partElements = [];
        for (const selector of partSelectors) {
            partElements = document.querySelectorAll(selector);
            if (partElements.length > 0) break;
        }

        if (partElements.length === 0) return;

        partElements.forEach(el => {
            const allText = el.textContent;

            // Look for default part names
            const defaultPatterns = [
                /Part\s*\d+/i,
                /^Part\d+$/i,
                /Partie\s*\d+/i  // French
            ];

            for (const pattern of defaultPatterns) {
                if (pattern.test(allText)) {
                    console.log('Found default part name:', allText.substring(0, 50));
                    const newName = documentLetter + getNextPartNumber(documentLetter);
                    renamePart(el, newName);
                    break;
                }
            }
        });
    }

    function init() {
        console.log('Initializing...');
        documentLetter = extractLetterFromDocName();

        if (documentLetter) {
            console.log('✓ Document letter:', documentLetter);
            scanExistingParts();
        } else {
            console.log('✗ Could not extract document letter');
            console.log('Please check that document name follows pattern: XXXX-L000-name');
        }
    }

    function waitForOnshape() {
        console.log('Waiting for Onshape to load...');

        // Check if parts table exists
        const tableSelectors = [
            '[data-test-id="parts-table"]',
            '.parts-table',
            'table',
            '[class*="parts"]'
        ];

        let found = false;
        for (const selector of tableSelectors) {
            if (document.querySelector(selector)) {
                console.log('✓ Found parts table with selector:', selector);
                found = true;
                break;
            }
        }

        if (found) {
            init();

            // Watch for changes
            const observer = new MutationObserver((mutations) => {
                console.log('DOM changed, checking for new parts...');
                checkForNewParts();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Also check periodically
            setInterval(() => {
                console.log('Periodic check...');
                checkForNewParts();
            }, 3000);

            console.log('✓ Monitoring started');
        } else {
            console.log('Parts table not found, retrying...');
            setTimeout(waitForOnshape, 2000);
        }
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggle') {
            isEnabled = request.enabled;
            console.log('Extension toggled:', isEnabled ? 'ON' : 'OFF');
            sendResponse({ success: true });
        }
    });

    // Start when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForOnshape);
    } else {
        waitForOnshape();
    }
})();