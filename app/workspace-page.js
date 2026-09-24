/* Report document identity so cached desktop workspaces cannot retain another page. */
(() => {
  'use strict';
  if (window.parent === window) return;
  const page = location.pathname.split('/').pop();
  // No settings or personal data cross this boundary. The desktop verifies
  // both the service origin and the exact iframe sending the notification.
  window.parent.postMessage({channel:'control-workspace-page',page}, '*');
})();
