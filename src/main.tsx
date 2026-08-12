import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ExcelImportActions from './ExcelImportActions';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <ExcelImportActions />
  </React.StrictMode>,
);
