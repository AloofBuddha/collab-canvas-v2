/**
 * AICommandHelp — modal showing example AI commands.
 * Ported from V1, converted to CSS Modules.
 */

import { X } from 'lucide-react'
import styles from './AICommandHelp.module.css'

interface AICommandHelpProps {
  onClose: () => void
}

const examples = [
  {
    category: 'Creating Shapes',
    items: [
      { command: 'create a red circle at 100, 200', description: 'Basic shape creation with position and color' },
      { command: 'add a blue rectangle at 300, 400', description: 'Rectangle with color' },
      { command: 'create a green line from 500, 600 to 700, 800', description: 'Line with start and end points' },
      { command: 'add text "Hello World" at 500, 600', description: 'Simple text' },
      { command: 'create a sticky note at 200, 300 with text "TODO"', description: 'Sticky note with content' },
    ],
  },
  {
    category: 'Diagrams & Compositions',
    items: [
      { command: 'create a SWOT analysis', description: '4 labeled quadrants (Strengths, Weaknesses, Opportunities, Threats)' },
      { command: 'create a 2x2 matrix', description: 'Grid of labeled rectangles' },
      { command: 'arrange existing shapes in a grid', description: 'Organize shapes into rows and columns' },
      { command: 'create a flowchart with 3 steps', description: 'Connected boxes with arrows' },
    ],
  },
  {
    category: 'Styling & Colors',
    items: [
      { command: 'make circle-1 red', description: 'Change shape color by name' },
      { command: 'add a red border to rectangle-1', description: 'Add stroke/border' },
      { command: 'make text-2 bigger with blue text', description: 'Update text size and color' },
    ],
  },
  {
    category: 'Positioning & Layout',
    items: [
      { command: 'move rectangle-2 to 500, 600', description: 'Move to absolute position' },
      { command: 'change the size of my-box to 200x300', description: 'Resize shape' },
      { command: 'rotate title-text 45 degrees', description: 'Rotate shape' },
    ],
  },
  {
    category: 'Deleting',
    items: [
      { command: 'delete circle-1', description: 'Delete by name' },
      { command: 'delete all rectangles', description: 'Delete by type' },
      { command: 'clear the board', description: 'Remove everything' },
    ],
  },
]

export default function AICommandHelp({ onClose }: AICommandHelpProps) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <div className={styles.body}>
          <h2 className={styles.title}>AI Command Examples</h2>
          <p className={styles.subtitle}>
            Tell the AI what you want to create or modify in natural language.
          </p>
          {examples.map((section, i) => (
            <div key={i} className={styles.category}>
              <h3 className={styles.categoryTitle}>{section.category}</h3>
              <div className={styles.exampleList}>
                {section.items.map((item, j) => (
                  <div key={j} className={styles.example}>
                    <span className={styles.command}>{item.command}</span>
                    <span className={styles.description}>{item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className={styles.tipsBox}>
            <h3 className={styles.tipsTitle}>Tips:</h3>
            <ul className={styles.tipsList}>
              <li>Shape names (e.g., "circle-1") are shown when you select a shape</li>
              <li>Positions use canvas coordinates where (0,0) is top-left</li>
              <li>Colors: use names (red, blue) or hex codes (#FF0000)</li>
              <li>Use labels on rectangles for diagrams (SWOT, matrices, etc.)</li>
              <li>Be specific: more details = better results</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
