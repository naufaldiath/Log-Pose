import { useState, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Minus,
  Plus,
} from 'lucide-react';

interface KeyBarProps {
  onKeyPress: (key: string) => void;
  onFontSizeChange: (delta: number) => void;
}

export function MobileKeyBar({ onKeyPress, onFontSizeChange }: KeyBarProps) {
  const [ctrlLock, setCtrlLock] = useState(false);
  const [altLock, setAltLock] = useState(false);

  const sendKey = useCallback((key: string) => {
    let finalKey = key;

    if (ctrlLock) {
      // Convert to control character
      if (key.length === 1 && key >= 'a' && key <= 'z') {
        finalKey = String.fromCharCode(key.charCodeAt(0) - 96);
      } else if (key === 'c') {
        finalKey = '\x03'; // Ctrl+C
      } else if (key === 'd') {
        finalKey = '\x04'; // Ctrl+D
      } else if (key === 'z') {
        finalKey = '\x1a'; // Ctrl+Z
      }
      setCtrlLock(false);
    }

    if (altLock) {
      finalKey = '\x1b' + key; // ESC + key for Alt
      setAltLock(false);
    }

    onKeyPress(finalKey);
  }, [ctrlLock, altLock, onKeyPress]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      onKeyPress(text);
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  }, [onKeyPress]);

  return (
    <div className="keybar">
      <div className="keybar-scroll">
        {/* Escape */}
        <button
          className="keybar-btn"
          onClick={() => sendKey('\x1b')}
        >
          Esc
        </button>

        {/* Tab */}
        <button
          className="keybar-btn"
          onClick={() => sendKey('\t')}
        >
          Tab
        </button>

        {/* Ctrl Lock */}
        <button
          className={`keybar-btn ${ctrlLock ? 'active' : ''}`}
          onClick={() => setCtrlLock(!ctrlLock)}
        >
          Ctrl
        </button>

        {/* Alt Lock */}
        <button
          className={`keybar-btn ${altLock ? 'active' : ''}`}
          onClick={() => setAltLock(!altLock)}
        >
          Alt
        </button>

        {/* Arrow keys */}
        <button
          className="keybar-btn"
          onClick={() => sendKey('\x1b[A')}
        >
          <ChevronUp size={16} />
        </button>
        <button
          className="keybar-btn"
          onClick={() => sendKey('\x1b[B')}
        >
          <ChevronDown size={16} />
        </button>
        <button
          className="keybar-btn"
          onClick={() => sendKey('\x1b[D')}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="keybar-btn"
          onClick={() => sendKey('\x1b[C')}
        >
          <ChevronRight size={16} />
        </button>

        {/* Divider */}
        <div className="keybar-divider" />

        {/* Paste */}
        <button
          className="keybar-btn"
          onClick={handlePaste}
          title="Paste from clipboard"
        >
          <Clipboard size={16} />
        </button>

        {/* Font size controls */}
        <button
          className="keybar-btn"
          onClick={() => onFontSizeChange(-1)}
          title="Decrease font size"
        >
          <Minus size={16} />
        </button>
        <button
          className="keybar-btn"
          onClick={() => onFontSizeChange(1)}
          title="Increase font size"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
