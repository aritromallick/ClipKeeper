document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const clipboardHistoryEl = document.getElementById('clipboard-history');
    const emptyStateEl = document.getElementById('empty-state');
    const clipboardStatusEl = document.getElementById('clipboard-status');
    const statusTextEl = document.getElementById('status-text');
    const searchInputEl = document.getElementById('search-input');
    const clearAllBtn = document.getElementById('clear-all');
    const entryCountEl = document.getElementById('entry-count');
    const notificationsEl = document.getElementById('notifications');
    
    // App State
    const state = {
        clipboardHistory: [],
        isClipboardAccessGranted: false,
        isListening: false,
        filteredHistory: [],
        isAppHidden: false,
        isDarkMode: false,
        appVersion: '1.0'
    };
    
    // Constants
    const MAX_HISTORY_ITEMS = 100;
    const NOTIFICATION_DURATION = 3000; // 3 seconds
    const MAX_DISPLAYED_CHARS = 300;
    const LOCAL_STORAGE_KEY = 'clipboardManagerHistory';
    const THEME_STORAGE_KEY = 'clipboardManagerTheme';
    
    // Initialize the app
    function init() {
        loadFromLocalStorage();
        setupEventListeners();
        updateHistoryList();
        updateEntryCount();
        requestClipboardPermission();
        setupKeyboardShortcuts();
    }
    
    // Request clipboard permission
    function requestClipboardPermission() {
        if (navigator.clipboard) {
            navigator.permissions.query({ name: 'clipboard-read' }).then(permissionStatus => {
                if (permissionStatus.state === 'granted') {
                    handleClipboardPermissionGranted();
                } else if (permissionStatus.state === 'prompt') {
                    updateStatus('Click anywhere to grant clipboard access', 'warning');
                    // Wait for user to interact with the page
                    document.addEventListener('click', tryGetClipboardAccess, { once: true });
                } else {
                    updateStatus('Clipboard access denied. Please enable in browser settings.', 'error');
                }
                
                permissionStatus.onchange = () => {
                    if (permissionStatus.state === 'granted') {
                        handleClipboardPermissionGranted();
                    }
                };
            }).catch(error => {
                console.error('Error checking clipboard permission:', error);
                // Some browsers don't support the permissions API, so try direct access
                tryGetClipboardAccess();
            });
        } else {
            updateStatus('Clipboard API not supported in this browser', 'error');
        }
    }
    
    // Try to access clipboard
    function tryGetClipboardAccess() {
        if (navigator.clipboard) {
            navigator.clipboard.readText()
                .then(() => {
                    handleClipboardPermissionGranted();
                })
                .catch(error => {
                    console.error('Failed to read clipboard:', error);
                    updateStatus('Clipboard access denied. Please enable in browser settings.', 'error');
                });
        }
    }
    
    // Handle when clipboard permission is granted
    function handleClipboardPermissionGranted() {
        state.isClipboardAccessGranted = true;
        updateStatus('Clipboard access granted. Monitoring for copy events.', 'success');
        startListeningToClipboard();
    }
    
    // Start monitoring clipboard changes
    function startListeningToClipboard() {
        if (state.isListening) return;
        
        state.isListening = true;
        
        // Poll for clipboard changes
        let lastText = '';
        
        async function checkClipboard() {
            if (!state.isClipboardAccessGranted) return;
            
            try {
                const text = await navigator.clipboard.readText();
                
                // If text changed and not empty
                if (text && text !== lastText) {
                    lastText = text;
                    addToClipboardHistory(text);
                }
            } catch (error) {
                console.error('Failed to read clipboard:', error);
            }
        }
        
        // Initial check
        checkClipboard();
        
        // Setup polling interval (1 second)
        const intervalId = setInterval(checkClipboard, 1000);
        
        // Also listen for copy events in the document
        document.addEventListener('copy', function(e) {
            // We'll let the polling mechanism handle this to get the actual text
            setTimeout(checkClipboard, 100);
        });
        
        // Store interval ID for cleanup if needed
        state.clipboardIntervalId = intervalId;
    }
    
    // Setup all event listeners
    function setupEventListeners() {
        // Search functionality
        searchInputEl.addEventListener('input', handleSearch);
        
        // Clear all button
        clearAllBtn.addEventListener('click', clearAllHistory);
        
        // Delegate click events for clipboard items
        clipboardHistoryEl.addEventListener('click', handleClipboardItemActions);
    }
    
    // Handle all clipboard item action clicks
    function handleClipboardItemActions(e) {
        const target = e.target;
        
        // Check for copy button click
        if (target.classList.contains('copy-btn') || target.closest('.copy-btn')) {
            const item = target.closest('.clipboard-item');
            const id = item.dataset.id;
            const entry = findEntryById(id);
            
            if (entry) {
                copyToClipboard(entry.content);
            }
        }
        
        // Check for delete button click
        if (target.classList.contains('delete-btn') || target.closest('.delete-btn')) {
            const item = target.closest('.clipboard-item');
            const id = item.dataset.id;
            deleteClipboardItem(id);
        }
        
        // Check for pin button click
        if (target.classList.contains('pin-btn') || target.closest('.pin-btn')) {
            const item = target.closest('.clipboard-item');
            const id = item.dataset.id;
            togglePinClipboardItem(id);
        }
        
        // Check for item click (to copy)
        if (target.classList.contains('clipboard-content') || target.closest('.clipboard-content')) {
            const item = target.closest('.clipboard-item');
            const id = item.dataset.id;
            const entry = findEntryById(id);
            
            if (entry) {
                copyToClipboard(entry.content);
            }
        }
    }
    
    // Toggle pin state for a clipboard item
    function togglePinClipboardItem(id) {
        const entry = findEntryById(id);
        if (!entry) return;
        
        entry.pinned = !entry.pinned;
        
        // If pinned, move to top after sorting
        if (entry.pinned) {
            // Remove the entry from its current position
            state.clipboardHistory = state.clipboardHistory.filter(item => item.id !== id);
            // Add it back at the beginning
            state.clipboardHistory.unshift(entry);
            showNotification('Item pinned to top', 'success');
        } else {
            showNotification('Item unpinned', 'info');
        }
        
        // Sort the list: pinned items first, then by timestamp
        state.clipboardHistory.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            // If same pin status, sort by timestamp (newest first)
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        updateHistoryList();
        saveToLocalStorage();
    }
    
    // Find entry by ID
    function findEntryById(id) {
        return state.clipboardHistory.find(entry => entry.id === id);
    }
    
    // Add a new item to clipboard history
    function addToClipboardHistory(content) {
        // Don't add empty content
        if (!content.trim()) return;
        
        // Check if this content already exists
        const existingEntryIndex = state.clipboardHistory.findIndex(entry => 
            entry.content === content
        );
        
        // If exists, move it to the top
        if (existingEntryIndex > -1) {
            const existingEntry = state.clipboardHistory[existingEntryIndex];
            // Update timestamp and move to top
            existingEntry.timestamp = new Date().toISOString();
            state.clipboardHistory.splice(existingEntryIndex, 1);
            state.clipboardHistory.unshift(existingEntry);
        } else {
            // Add new entry
            const newEntry = {
                id: generateId(),
                content: content,
                timestamp: new Date().toISOString(),
                pinned: false
            };
            
            state.clipboardHistory.unshift(newEntry);
            
            // Keep history within limit
            if (state.clipboardHistory.length > MAX_HISTORY_ITEMS) {
                state.clipboardHistory = state.clipboardHistory.slice(0, MAX_HISTORY_ITEMS);
            }
            
            // Show notification
            showNotification('Added to clipboard history', 'success');
        }
        
        // Update UI and save
        updateHistoryList();
        updateEntryCount();
        saveToLocalStorage();
    }
    
    // Delete a clipboard item
    function deleteClipboardItem(id) {
        state.clipboardHistory = state.clipboardHistory.filter(entry => entry.id !== id);
        updateHistoryList();
        updateEntryCount();
        saveToLocalStorage();
        showNotification('Item deleted', 'info');
    }
    
    // Clear all history
    function clearAllHistory() {
        if (state.clipboardHistory.length === 0) {
            showNotification('Clipboard history is already empty', 'info');
            return;
        }
        
        if (confirm('Are you sure you want to clear all clipboard history?')) {
            state.clipboardHistory = [];
            updateHistoryList();
            updateEntryCount();
            saveToLocalStorage();
            showNotification('Clipboard history cleared', 'info');
        }
    }
    
    // Copy content to clipboard
    function copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text)
                .then(() => {
                    showNotification('Copied to clipboard', 'success');
                })
                .catch(err => {
                    console.error('Failed to copy: ', err);
                    showNotification('Failed to copy text', 'error');
                });
        } else {
            // Fallback copy method
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    showNotification('Copied to clipboard', 'success');
                } else {
                    showNotification('Failed to copy text', 'error');
                }
            } catch (err) {
                console.error('Failed to copy: ', err);
                showNotification('Failed to copy text', 'error');
            }
            
            document.body.removeChild(textarea);
        }
    }
    
    // Handle search functionality
    function handleSearch(e) {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            state.filteredHistory = [];
            updateHistoryList();
            return;
        }
        
        state.filteredHistory = state.clipboardHistory.filter(entry => 
            entry.content.toLowerCase().includes(searchTerm)
        );
        
        updateHistoryList(true);
    }
    
    // Update the clipboard history list in the UI
    function updateHistoryList(isFiltered = false) {
        const data = isFiltered ? state.filteredHistory : state.clipboardHistory;
        
        // Clear the current list
        clipboardHistoryEl.innerHTML = '';
        
        // Show empty state if needed
        if (data.length === 0) {
            if (isFiltered) {
                emptyStateEl.innerHTML = `
                    <i class="fas fa-search"></i>
                    <p>No results found</p>
                    <p class="empty-state-subtext">Try a different search term</p>
                `;
            } else {
                emptyStateEl.innerHTML = `
                    <i class="fas fa-clipboard"></i>
                    <p>Your clipboard history is empty</p>
                    <p class="empty-state-subtext">Copy something to get started!</p>
                `;
            }
            emptyStateEl.classList.remove('hidden');
            return;
        } else {
            emptyStateEl.classList.add('hidden');
        }
        
        // Add each history item to the list
        data.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'clipboard-item';
            li.dataset.id = entry.id;
            
            // Truncate long content for display
            const displayContent = entry.content.length > MAX_DISPLAYED_CHARS
                ? entry.content.substring(0, MAX_DISPLAYED_CHARS) + '...'
                : entry.content;
            
            const date = new Date(entry.timestamp);
            const formattedDate = formatDate(date);
            
            // Add pinned class if the item is pinned
            if (entry.pinned) {
                li.classList.add('pinned');
            }
            
            li.innerHTML = `
                <div class="clipboard-content">${escapeHtml(displayContent)}</div>
                <div class="clipboard-metadata">
                    <span class="clipboard-time">${formattedDate}</span>
                    <div class="clipboard-actions">
                        <button class="action-btn pin-btn ${entry.pinned ? 'active' : ''}" title="${entry.pinned ? 'Unpin' : 'Pin'} item">
                            <i class="fas ${entry.pinned ? 'fa-thumbtack' : 'fa-thumbtack'}"></i>
                        </button>
                        <button class="action-btn copy-btn" title="Copy to clipboard">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="action-btn delete-btn" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            
            clipboardHistoryEl.appendChild(li);
        });
    }
    
    // Update the status message
    function updateStatus(message, type = '') {
        statusTextEl.textContent = message;
        clipboardStatusEl.className = 'status-message';
        
        if (type) {
            clipboardStatusEl.classList.add(type);
        }
    }
    
    // Update the entry count in the footer
    function updateEntryCount() {
        const count = state.clipboardHistory.length;
        entryCountEl.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    }
    
    // Show a notification
    function showNotification(message, type = 'info') {
        const notificationId = generateId();
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.id = `notification-${notificationId}`;
        
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        if (type === 'warning') icon = 'exclamation-triangle';
        
        notification.innerHTML = `
            <div class="notification-icon">
                <i class="fas fa-${icon}"></i>
            </div>
            <div class="notification-message">${message}</div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        notificationsEl.appendChild(notification);
        
        // Remove after duration
        setTimeout(() => {
            const notificationEl = document.getElementById(`notification-${notificationId}`);
            if (notificationEl) {
                notificationEl.style.animation = 'slideOut 0.3s ease forwards';
                setTimeout(() => {
                    if (notificationEl.parentNode) {
                        notificationEl.parentNode.removeChild(notificationEl);
                    }
                }, 300);
            }
        }, NOTIFICATION_DURATION);
    }
    
    // Setup keyboard shortcuts
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            // Ctrl+Shift+V to toggle visibility (future feature)
            if (e.ctrlKey && e.shiftKey && e.key === 'V') {
                e.preventDefault();
                toggleAppVisibility();
            }
            
            // Esc to minimize (future feature)
            if (e.key === 'Escape' && !state.isAppHidden) {
                e.preventDefault();
                hideApp();
            }
        });
    }
    
    // Toggle app visibility (placeholder for future features)
    function toggleAppVisibility() {
        if (state.isAppHidden) {
            showApp();
        } else {
            hideApp();
        }
    }
    
    // Hide app (placeholder for future features)
    function hideApp() {
        // This would minimize the app in a real desktop app
        // For now, just show a notification
        showNotification('App minimized (simulated)', 'info');
        state.isAppHidden = true;
    }
    
    // Show app (placeholder for future features)
    function showApp() {
        // This would show the app in a real desktop app
        // For now, just show a notification
        showNotification('App restored (simulated)', 'info');
        state.isAppHidden = false;
    }
    
    // Load from localStorage
    function loadFromLocalStorage() {
        try {
            const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (storedData) {
                state.clipboardHistory = JSON.parse(storedData);
            }
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
            showNotification('Failed to load saved clipboard history', 'error');
        }
    }
    
    // Save to localStorage
    function saveToLocalStorage() {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.clipboardHistory));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
            showNotification('Failed to save clipboard history', 'error');
        }
    }
    
    // Helper: Format date
    function formatDate(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffSec < 60) {
            return 'just now';
        } else if (diffMin < 60) {
            return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
        } else if (diffHour < 24) {
            return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
        } else if (diffDay < 7) {
            return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
    
    // Helper: Generate a unique ID
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    // Helper: Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Initialize the app
    init();
});
