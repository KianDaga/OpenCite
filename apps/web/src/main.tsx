import React from 'react';
import ReactDOM from 'react-dom/client';
import { LibraryProvider } from '@/state';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LibraryProvider>
      <App />
    </LibraryProvider>
  </React.StrictMode>,
);
