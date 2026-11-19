import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// StrictMode сознательно не используется: двойной монтаж в dev дублирует
// постраничную загрузку полного среза установок (до 50 страниц).
createRoot(document.getElementById('root')).render(<App />);
