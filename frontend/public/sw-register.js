/**
 * Service Worker Registration Script
 * Place this in your document head or body
 */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    console.log('[App] Registering Service Worker...');
    
    navigator.serviceWorker
      .register('/sw.js', {
        scope: '/',
        updateViaCache: 'none', // Always check for updates
      })
      .then((registration) => {
        console.log('✅ Service Worker registered:', registration);
        console.log('✅ Registration scope:', registration.scope);
        console.log('✅ Active SW:', registration.active);
        console.log('✅ Installing SW:', registration.installing);
        console.log('✅ Waiting SW:', registration.waiting);
        
        // Listen for updates - notify user instead of auto-reload to prevent refresh loops
        registration.addEventListener('updatefound', () => {
          console.log('[SW] Update found');
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && registration.active) {
              // New SW is waiting - ask user if they want to update
              console.log('[SW] New Service Worker available. Reload to update.');
              // You can show a toast/notification here to ask user to refresh
              // For now, we just log and let the user manually refresh when ready
            }
          });
        });
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error);
      });
  });
  
  // Listen for messages from Service Worker
  navigator.serviceWorker.addEventListener('message', (event) => {
    console.log('[App] Message from SW:', event.data);
  });
  
  // Monitor controller changes
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('✅ New Service Worker is controlling the page');
  });
}
