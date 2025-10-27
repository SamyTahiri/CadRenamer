(function() {
    'use strict';

    let partCounter = {};
    let documentLetter = null;
    let isEnabled = true;
    let observerActive = false;
    let processedParts = new Set();

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

        const partItems = partList.querySelectorAll('.os-list-item');
        console.log(`Found ${partItems.length} list items`);

        let maxNum = 0;
        partItems.forEach((item, index) => {
            const nameEl = item.querySelector('.os-list-item-name');
            if (nameEl) {
                const name = nameEl.textContent.trim();
                console.log(`Item ${index + 1}: "${name}"`);

                const pattern = new RegExp(`^${letter}(\\d+)$`, 'i');
                const match = name.match(pattern);
                if (match) {
                    const num = parseInt(match[1], 10);
                    console.log(`  Found existing part: ${name} (number: ${num})`);
                    if (num > maxNum) maxNum = num;
                    processedParts.add(name);
                }
            }
        });

        partCounter[letter] = maxNum;
        console.log(`Counter initialized to: ${maxNum}`);
    }

    function renamePart(partItem, currentName, newName) {
        console.log(`Attempting to rename "${currentName}" to "${newName}"`);

        const nameEl = partItem.querySelector('.os-list-item-name');
        if (!nameEl) {
            console.log('✗ Could not find name element');
            return;
        }

        // Mark as processed to avoid duplicate attempts
        processedParts.add(currentName);
        processedParts.add(newName);

        // Click to select the item first
        console.log('Clicking to select item...');
        partItem.click();

        setTimeout(() => {
            // Try to find the actual text node to right-click on
            console.log('Opening context menu on part item...');
            const rect = partItem.getBoundingClientRect();

            // Right-click on the part item (not just the name)
            partItem.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 2,
                clientX: rect.left + 50,
                clientY: rect.top + rect.height / 2
            }));

            setTimeout(() => {
                // Look for "Rename" option in context menu
                console.log('Looking for rename option...');
                const menuItems = document.querySelectorAll('.ns-menu-item, .context-menu-item, [role="menuitem"], .dropdown-item, [class*="menu"]');
                console.log('Found menu items:', menuItems.length);

                const renameOption = Array.from(menuItems).find(item => {
                    const text = item.textContent.trim();
                    console.log('Menu item text:', text);
                    return /^rename$/i.test(text) || /rename/i.test(text);
                });

                if (renameOption) {
                    console.log('✓ Found rename menu option, clicking...');
                    renameOption.click();

                    setTimeout(() => {
                        console.log('Looking for editable field...');

                        // Look for input field
                        let input = document.querySelector('input[type="text"]:focus') ||
                            partItem.querySelector('input[type="text"]') ||
                            nameEl.querySelector('input[type="text"]') ||
                            document.querySelector('.os-list-item-name input');

                        // Also check for contenteditable
                        let editableEl = nameEl.querySelector('[contenteditable="true"]') ||
                            (nameEl.getAttribute('contenteditable') === 'true' ? nameEl : null);

                        console.log('Found input:', input);
                        console.log('Found contenteditable:', editableEl);
                        console.log('NameEl classes:', nameEl.className);
                        console.log('NameEl HTML:', nameEl.innerHTML);

                        if (input) {
                            console.log('✓ Found input field');
                            fillAndSubmitInput(input, newName);
                        } else if (editableEl) {
                            console.log('✓ Found contenteditable element');
                            fillContentEditable(editableEl, newName);
                        } else {
                            // Maybe the input is inside the name span
                            setTimeout(() => {
                                input = nameEl.querySelector('input') ||
                                    partItem.querySelector('input') ||
                                    document.querySelector('input:focus');

                                console.log('Second attempt - found input:', input);

                                if (input) {
                                    console.log('✓ Found input on second attempt');
                                    fillAndSubmitInput(input, newName);
                                } else {
                                    console.log('✗ Could not find input after clicking rename');
                                    console.log('Active element:', document.activeElement);
                                    console.log('Name element HTML:', nameEl.outerHTML);
                                    processedParts.delete(currentName);
                                    processedParts.delete(newName);
                                }
                            }, 300);
                        }
                    }, 600);
                } else {
                    console.log('✗ Could not find rename option');
                    console.log('All menu item texts:', Array.from(menuItems).map(i => i.textContent.trim()));
                    processedParts.delete(currentName);
                    processedParts.delete(newName);
                }
            }, 400);
        }, 300);
    }

    function fillAndSubmitInput(input, newName) {
        input.focus();
        input.select();
        input.value = '';
        input.value = newName;

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        }));

        setTimeout(() => {
            input.blur();
            console.log('✓ Rename complete');
        }, 100);
    }

    function fillContentEditable(element, newName) {
        element.focus();

        // Select all text
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        // Set new text
        element.textContent = newName;

        // Trigger events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        // Press Enter
        element.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        }));

        setTimeout(() => {
            element.blur();
            console.log('✓ Rename complete (contenteditable)');
        }, 100);
    }

    function checkForNewParts() {
        if (!isEnabled || !documentLetter) {
            return;
        }

        const partList = document.querySelector('.part-list-container');
        if (!partList) return;

        const partItems = partList.querySelectorAll('.os-list-item');

        partItems.forEach(item => {
            // Skip items that don't have the part icon
            const partIcon = item.querySelector('.os-part-list-icon');
            if (!partIcon) return;

            const nameEl = item.querySelector('.os-list-item-name');
            if (!nameEl) return;

            const currentName = nameEl.textContent.trim();

            // Skip if already processed
            if (processedParts.has(currentName)) return;

            // Check if it's a default part name
            const defaultPatterns = [
                /^Part\s*\d+$/i,
                /^Partie\s*\d+$/i,
                /^Part$/i
            ];

            for (const pattern of defaultPatterns) {
                if (pattern.test(currentName)) {
                    console.log('Found default part name:', currentName);
                    const newName = documentLetter + getNextPartNumber(documentLetter);
                    renamePart(item, currentName, newName);
                    return;
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
            let shouldCheck = false;
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.classList && node.classList.contains('os-list-item')) {
                            shouldCheck = true;
                        }
                    });
                }
            });

            if (shouldCheck) {
                console.log('New part detected, checking...');
                setTimeout(checkForNewParts, 800);
            }
        });

        observer.observe(partList, {
            childList: true,
            subtree: true
        });

        // Also check periodically as backup
        setInterval(checkForNewParts, 4000);
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