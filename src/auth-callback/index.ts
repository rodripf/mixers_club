// Extracts the token hash from the URL and passes it to the service worker.
// Supabase appends auth params as a URL hash: #access_token=...&refresh_token=...
const hash = window.location.hash.slice(1) // remove leading '#'

if (hash) {
  chrome.runtime.sendMessage({ action: 'authCallback', token: hash }, () => {
    // Close this tab once the service worker has handled the token
    window.close()
  })
} else {
  document.body.textContent = 'Auth failed: no token in URL.'
}
