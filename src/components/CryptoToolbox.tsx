import React, { useState } from 'react';
import { Wrench, ChevronDown, ChevronUp, RotateCcw, Copy, Check } from 'lucide-react';
import { soundManager } from '../services/audio';

export const CryptoToolbox: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'shift' | 'hex' | 'notes'>('shift');

  // Alphabet shift helper state
  const [shiftInput, setShiftInput] = useState('');
  const [shiftAmount, setShiftAmount] = useState(3);

  // Hex tool state
  const [hexInput, setHexInput] = useState('');
  const [hexCopied, setHexCopied] = useState(false);

  // Scratchpad
  const [notes, setNotes] = useState('');

  // Backward alphabet shift calculation
  const decodeShift = (str: string, shift: number): string => {
    return str
      .split('')
      .map((char) => {
        const code = char.charCodeAt(0);
        // Uppercase
        if (code >= 65 && code <= 90) {
          return String.fromCharCode(((code - 65 - shift + 26) % 26) + 65);
        }
        // Lowercase
        if (code >= 97 && code <= 122) {
          return String.fromCharCode(((code - 97 - shift + 26) % 26) + 97);
        }
        return char;
      })
      .join('');
  };

  // Hex to ASCII converter
  const decodeHex = (hex: string): string => {
    const cleanHex = hex.replace(/[^0-9A-Fa-f]/g, '');
    let str = '';
    for (let i = 0; i < cleanHex.length; i += 2) {
      const byte = cleanHex.substring(i, i + 2);
      if (byte.length === 2) {
        str += String.fromCharCode(parseInt(byte, 16));
      }
    }
    return str;
  };

  const copyToClipboard = (text: string) => {
    soundManager.playKeypress();
    navigator.clipboard.writeText(text);
    setHexCopied(true);
    setTimeout(() => setHexCopied(false), 2000);
  };

  return (
    <div className="glass-card" style={{
      marginTop: '24px',
      border: '1px solid rgba(0, 240, 255, 0.25)',
      overflow: 'hidden'
    }}>
      {/* Drawer Toggle Header */}
      <button
        onClick={() => {
          soundManager.playKeypress();
          setIsOpen(!isOpen);
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'rgba(12, 17, 26, 0.95)',
          border: 'none',
          color: 'var(--accent-amber)',
          cursor: 'pointer',
          fontFamily: 'var(--font-heading)',
          fontWeight: 600,
          fontSize: '0.92rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Wrench size={18} />
          <span>Participant Cryptanalysis Deck (Helper Tools)</span>
        </div>
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {isOpen && (
        <div style={{ padding: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          {/* Subtabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => { soundManager.playKeypress(); setActiveTab('shift'); }}
              className={`cyber-btn ${activeTab === 'shift' ? 'cyber-btn-secondary' : 'cyber-btn-ghost'}`}
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Alphabet Shift Solver
            </button>
            <button
              onClick={() => { soundManager.playKeypress(); setActiveTab('hex'); }}
              className={`cyber-btn ${activeTab === 'hex' ? 'cyber-btn-secondary' : 'cyber-btn-ghost'}`}
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Hex / ASCII Converter
            </button>
            <button
              onClick={() => { soundManager.playKeypress(); setActiveTab('notes'); }}
              className={`cyber-btn ${activeTab === 'notes' ? 'cyber-btn-secondary' : 'cyber-btn-ghost'}`}
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Analyst Scratchpad
            </button>
          </div>

           {/* Alphabet shift helper */}
          {activeTab === 'shift' && (
            <div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                   Alphabet Shift: <strong style={{ color: 'var(--accent-amber)' }}>-{shiftAmount}</strong>
                </span>
                <input
                  type="range"
                  min="1"
                  max="25"
                   value={shiftAmount}
                   onChange={(e) => setShiftAmount(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--accent-amber)', cursor: 'pointer' }}
                />
                <button
                   onClick={() => setShiftAmount(3)}
                  className="cyber-btn cyber-btn-ghost"
                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                   title="Reset shift to 3"
                >
                   <RotateCcw size={14} /> Shift 3
                </button>
              </div>

              <input
                type="text"
                placeholder="Paste encrypted text to decode (e.g. DVWKUD{...})"
                 value={shiftInput}
                 onChange={(e) => setShiftInput(e.target.value)}
                className="cyber-input cyber-input-mono"
                style={{ marginBottom: '12px' }}
              />

              <div style={{
                background: 'rgba(8, 12, 18, 0.95)',
                padding: '12px 16px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Decoded Output
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-amber)', fontSize: '0.95rem', fontWeight: 600 }}>
                     {shiftInput ? decodeShift(shiftInput, shiftAmount) : 'Decoded message will appear here...'}
                  </div>
                </div>
                 {shiftInput && (
                  <button
                   onClick={() => copyToClipboard(decodeShift(shiftInput, shiftAmount))}
                    className="cyber-btn cyber-btn-ghost"
                    style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                  >
                    <Copy size={14} /> Copy
                  </button>
                )}
              </div>
            </div>
          )}

          {/* HEX CONVERTER */}
          {activeTab === 'hex' && (
            <div>
              <input
                type="text"
                placeholder="Paste hexadecimal string (e.g. 41 53 54 48 52 41 7b...)"
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                className="cyber-input cyber-input-mono"
                style={{ marginBottom: '12px' }}
              />

              <div style={{
                background: 'rgba(8, 12, 18, 0.95)',
                padding: '12px 16px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    ASCII Text Output
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-forest)', fontSize: '0.95rem', fontWeight: 600 }}>
                    {hexInput ? decodeHex(hexInput) || '(Invalid hex bytes)' : 'Decoded ASCII string will appear here...'}
                  </div>
                </div>
                {hexInput && (
                  <button
                    onClick={() => copyToClipboard(decodeHex(hexInput))}
                    className="cyber-btn cyber-btn-ghost"
                    style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                  >
                    {hexCopied ? <Check size={14} color="var(--status-forest)" /> : <Copy size={14} />}
                    {hexCopied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* NOTES SCRATCHPAD */}
          {activeTab === 'notes' && (
            <div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cryptanalyst private scratchpad: jot down letter frequencies, key guesses, or cipher fragments here..."
                rows={3}
                className="cyber-input cyber-input-mono"
                style={{ resize: 'vertical' }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
