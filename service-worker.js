const CACHE_NAME = 'pilot-ir-remote-v1.0.0';
const urlsToCache = [
    '/',
    '/index.html',
    '/css/style.css',
    '/app.js',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Comic+Neue:wght@300;400;600;700&display=swap'
];

// Install event - cache resources
self.addEventListener('install', event => {
    console.log('Service Worker: Install event');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching files');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('Service Worker: All files cached');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Service Worker: Error caching files', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activate event');
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Claiming clients');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip WebSocket requests
    if (event.request.url.includes('ws://') || event.request.url.includes('wss://')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version if available
                if (response) {
                    console.log('Service Worker: Serving from cache', event.request.url);
                    return response;
                }
                
                // Otherwise fetch from network
                console.log('Service Worker: Fetching from network', event.request.url);
                return fetch(event.request)
                    .then(response => {
                        // Check if we received a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clone the response
                        const responseToCache = response.clone();
                        
                        // Add to cache
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return response;
                    })
                    .catch(error => {
                        console.error('Service Worker: Fetch failed', error);
                        // Return offline page or fallback
                        return caches.match('/index.html');
                    });
            })
    );
});

// Background sync for offline actions
self.addEventListener('sync', event => {
    console.log('Service Worker: Background sync event', event.tag);
    
    if (event.tag === 'ir-command-sync') {
        event.waitUntil(
            // Handle offline IR commands when connection is restored
            handleOfflineIRCommands()
        );
    }
});

// Handle offline IR commands
async function handleOfflineIRCommands() {
    try {
        // Get pending commands from IndexedDB or localStorage
        const pendingCommands = JSON.parse(localStorage.getItem('pending_ir_commands') || '[]');
        
        if (pendingCommands.length > 0) {
            console.log('Service Worker: Processing offline IR commands', pendingCommands.length);
            
            // Clear pending commands
            localStorage.removeItem('pending_ir_commands');
            
            // Notify the main app about pending commands
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'OFFLINE_COMMANDS_READY',
                    commands: pendingCommands
                });
            });
        }
    } catch (error) {
        console.error('Service Worker: Error handling offline commands', error);
    }
}

// Push notifications (if needed in future)
self.addEventListener('push', event => {
    console.log('Service Worker: Push event received');
    
    const options = {
        body: event.data ? event.data.text() : 'IR Remote Control notification',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'Open App',
                icon: '/icons/icon-192.png'
            },
            {
                action: 'close',
                title: 'Close',
                icon: '/icons/icon-192.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('Pilot IR Remote', options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
    console.log('Service Worker: Notification click event');
    
    event.notification.close();
    
    if (event.action === 'explore') {
        // Open the app
        event.waitUntil(
            clients.openWindow('/')
        );
    } else if (event.action === 'close') {
        // Just close the notification
        event.notification.close();
    } else {
        // Default action - open the app
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Message handler for communication with main app
self.addEventListener('message', event => {
    console.log('Service Worker: Message received', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});