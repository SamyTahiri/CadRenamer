document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('toggleSwitch');
    const status = document.getElementById('status');

    // Load saved state
    chrome.storage.sync.get(['enabled'], function(result) {
        toggle.checked = result.enabled !== false;
        updateStatus(toggle.checked);
    });

    toggle.addEventListener('change', function() {
        const enabled = toggle.checked;
        chrome.storage.sync.set({ enabled: enabled });

        // Send message to content script
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'toggle',
                enabled: enabled
            });
        });

        updateStatus(enabled);
    });

    function updateStatus(enabled) {
        status.textContent = enabled ? 'Status: Active' : 'Status: Inactive';
        status.style.color = enabled ? '#4CAF50' : '#999';
    }
});