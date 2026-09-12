import React from 'react';
import ReactDOM from 'react-dom/client';

// Self-hosted rather than pulled from Google Fonts at runtime. v1 used an
// @import in CSS, which blocks first paint and fails entirely offline — poor
// behaviour for an app whose whole premise is working without a connection.
// Latin subset only. The full import pulls Vietnamese and Latin-Extended too,
// which trebles the precache for glyphs this household will never type.
import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';

import './index.css';
import App from './App';
import { requestPersistentStorage } from './storage/db';

void requestPersistentStorage();

const container = document.getElementById('root');
if (container == null) throw new Error('Root element missing from index.html');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
