(function() {
    'use strict';

    let partCounter = {};
    let documentLetter = null;
    let isEnabled = true;
    let observerActive = false;

    console.log('=== Onshape Auto-Renamer Started ===');

    function extractLetterFromDocName() {
        console.log('Trying to extract document letter...');

        const title = document.title;
        console.log('Document title:', title);
        let match = title.match(/\d+-([A-Z])\d+-/i);
        if (match) {
            console.log('✓ Found letter in title:', match[1]);
            return match[1].toUpperCase();
        }

        const selectors = [
            '.document-name',
            '.document-title',
            'h1'
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

        const partList = document.querySelector('.part-list-container');
        if (!partList) {
            console.log('Part list container not found');
            return;
        }

        const partItems = partList.querySelectorAll('.os-selectable-item');
        console.log(`Found ${partItems.length} part items`);

        let maxNum = 0;
        partItems.forEach((item, index) => {
            const nameEl = item.querySelector('.os-selectable-item-body-text') ||
                item.querySelector('.os-list-item-label');
            if (nameEl) {
                const name = nameEl.textContent.trim();
                console.log(`Part ${index + 1}: "${name}"`);

                const pattern = new RegExp(`^${letter}(\\d+)$`, 'i');
                const match = name.match(pattern);
                if (match) {
                    const num = parseInt(match[1], 10);
                    console.log(`  Found existing part: ${name} (number: ${num})`);
                    if (num > maxNum) maxNum = num;
                }
            }
        });

        partCounter[letter] = maxNum;
        console.log(`Counter initialized to: ${maxNum}`);
    }

    function renamePart(partItem, newName) {
        console.log('Attempting to rename part to:', newName);

        const nameEl = partItem.querySelector('.os-selectable-item-body-text') ||
            partItem.querySelector('.os-list-item-label');

        if (!nameEl) {
            console.log('✗ Could not find name element');
            return;
        }

        console.log('Current name:', nameEl.textContent);

        // Click to select the item first
        partItem.click();

        setTimeout(() => {
            // Double-click to rename
            nameEl.dispatchEvent(new MouseEvent('dblclick', {
                bubbles: true,
                cancelable: true,
                view: window
            }));

            setTimeout(() => {
                const input = document.querySelector('input[type="text"]:focus') ||
                    partItem.querySelector('input[type="text"]') ||
                    document.querySelector('.os-selectable-item input');

                if (input) {
                    console.log('✓ Found input field');
                    input.focus();
                    input.select();
                    input.value = newName;

                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));

                    input.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        bubbles: true,
                        cancelable: true
                    }));

                    input.dispatchEvent(new KeyboardEvent('keypress', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        bubbles: true,
                        cancelable: true
                    }));

                    setTimeout(() => {
                        input.blur();
                        console.log('✓ Rename complete');
                    }, 50);
                } else {
                    console.log('✗ Could not find input field');
                    console.log('Focused element:', document.activeElement);
                }
            }, 300);
        }, 100);
    }

    function checkForNewParts() {
        if (!isEnabled) {
            return;
        }

        if (!documentLetter) {
            return;
        }

        const partList = document.querySelector('.part-list-container');
        if (!partList) return;

        const partItems = partList.querySelectorAll('.os-selectable-item');

        partItems.forEach(item => {
            const nameEl = item.querySelector('.os-selectable-item-body-text') ||
                item.querySelector('.os-list-item-label');

            if (nameEl) {
                const currentName = nameEl.textContent.trim();

                const defaultPatterns = [
                    /^Part\s*\d+$/i,
                    /^Partie\s*\d+$/i,
                    /^Part$/i
                ];

                for (const pattern of defaultPatterns) {
                    if (pattern.test(currentName)) {
                        console.log('Found default part name:', currentName);
                        const newName = documentLetter + getNextPartNumber(documentLetter);
                        renamePart(item, newName);
                        return;
                    }
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
            startMonitoring();
        } else {
            console.log('✗ Could not extract document letter');
            console.log('Document name should follow pattern: XXXX-L000-name');
            setTimeout(init, 3000);
        }
    }

    function startMonitoring() {
        if (observerActive) return;

        const partList = document.querySelector('.part-list-container');
        if (!partList) {
            console.log('Part list not ready, waiting...');
            setTimeout(startMonitoring, 2000);
            return;
        }

        console.log('✓ Starting monitoring');
        observerActive = true;

        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    console.log('DOM changed, checking for new parts...');
                    setTimeout(checkForNewParts, 500);
                }
            });
        });

        observer.observe(partList, {
            childList: true,
            subtree: true
        });

        setInterval(() => {
            checkForNewParts();
        }, 3000);
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggle') {
            isEnabled = request.enabled;
            console.log('Extension toggled:', isEnabled ? 'ON' : 'OFF');
            sendResponse({ success: true });
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(init, 2000);
        });
    } else {
        setTimeout(init, 2000);
    }
})();