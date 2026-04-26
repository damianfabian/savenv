// Integration fixture entry. The hidevars/vite plugin must inline the
// VITE_-prefixed values into this bundle as plaintext string literals.
const apiUrl = import.meta.env.VITE_API_URL;
const featureFlag = import.meta.env.VITE_FEATURE_FLAG;

const root = document.querySelector('#app');
if (root) {
  root.textContent = `api=${apiUrl} flag=${featureFlag}`;
}

// Stable markers so the integration test can grep for them in the bundle.
window.__HIDEVARS_FIXTURE__ = {
  apiUrl,
  featureFlag,
};
