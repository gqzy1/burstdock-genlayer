import React from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter} from 'react-router-dom';
import {WalletProvider} from './app/WalletProvider';
import {App} from './App';
import './style.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><WalletProvider><App/></WalletProvider></HashRouter></React.StrictMode>);
