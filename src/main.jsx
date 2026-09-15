import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { TftMatchesProvider } from './hooks/useTftMatches.jsx';
import './styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><TftMatchesProvider><App /></TftMatchesProvider></BrowserRouter></React.StrictMode>);
