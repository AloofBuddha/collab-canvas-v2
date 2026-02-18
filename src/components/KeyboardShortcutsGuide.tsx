/**
 * KeyboardShortcutsGuide — modal showing all keyboard shortcuts.
 * Toggle with ? key.
 */

import { X } from 'lucide-react'
import styles from './KeyboardShortcutsGuide.module.css'

interface KeyboardShortcutsGuideProps {
  onClose: () => void
}

const shortcuts = [
  {
    category: 'General',
    items: [
      { action: 'Undo', keys: ['Ctrl+Z'] },
      { action: 'Redo', keys: ['Ctrl+Y'] },
      { action: 'Deselect', keys: ['Escape'] },
      { action: 'Show shortcuts', keys: ['?'] },
    ],
  },
  {
    category: 'Selection',
    items: [
      { action: 'Select shape', keys: ['Click'] },
      { action: 'Deselect all', keys: ['Escape'] },
    ],
  },
  {
    category: 'Manipulation',
    items: [
      { action: 'Delete shape', keys: ['Delete', 'Backspace'] },
      { action: 'Duplicate', keys: ['Ctrl+D'] },
      { action: 'Nudge', keys: ['Arrow keys'] },
      { action: 'Nudge (large)', keys: ['Shift+Arrow'] },
    ],
  },
  {
    category: 'Layer Order',
    items: [
      { action: 'Bring forward', keys: [']'] },
      { action: 'Send backward', keys: ['['] },
      { action: 'Bring to front', keys: ['Ctrl+]'] },
      { action: 'Send to back', keys: ['Ctrl+['] },
    ],
  },
  {
    category: 'Canvas',
    items: [
      { action: 'Pan', keys: ['Middle mouse drag'] },
      { action: 'Zoom', keys: ['Scroll wheel'] },
      { action: 'Reset zoom', keys: ['Ctrl+0'] },
    ],
  },
]

export default function KeyboardShortcutsGuide({ onClose }: KeyboardShortcutsGuideProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Keyboard Shortcuts</span>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className={styles.body}>
          {shortcuts.map(cat => (
            <div key={cat.category} className={styles.category}>
              <span className={styles.categoryTitle}>{cat.category}</span>
              <div className={styles.shortcutList}>
                {cat.items.map(item => (
                  <div key={item.action} className={styles.shortcut}>
                    <span className={styles.action}>{item.action}</span>
                    <span className={styles.keys}>
                      {item.keys.map(k => (
                        <span key={k} className={styles.key}>{k}</span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.footer}>
          Press <span className={styles.key}>?</span> to toggle this guide
        </div>
      </div>
    </div>
  )
}
