/**
 * Toolbar - Bottom-center tool selection bar
 *
 * Ported from V1, converted Tailwind → CSS Modules.
 * Simplified: removed AI agent button and keyboard shortcuts (post-MVP).
 * Added sticky note tool.
 */

import { MousePointer2, Square, Circle, Pen, Type, StickyNote, Sparkles } from 'lucide-react'
import type { Tool } from '../types'
import styles from './Toolbar.module.css'

interface ToolbarProps {
  selectedTool: Tool
  onSelectTool: (tool: Tool) => void
  isAIActive?: boolean
  onToggleAI?: () => void
}

const tools: { id: Tool; icon: typeof Square; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'circle', icon: Circle, label: 'Circle' },
  { id: 'line', icon: Pen, label: 'Line' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'sticky', icon: StickyNote, label: 'Sticky Note' },
]

export default function Toolbar({ selectedTool, onSelectTool, isAIActive, onToggleAI }: ToolbarProps) {
  const handleToolSelect = (tool: Tool) => {
    onSelectTool(tool)
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        {tools.map((tool) => {
          const Icon = tool.icon
          const isSelected = selectedTool === tool.id
          return (
            <button
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              className={`${styles.toolButton} ${isSelected ? styles.selected : ''}`}
              title={tool.label}
              aria-label={tool.label}
            >
              <Icon size={20} />
            </button>
          )
        })}
        {onToggleAI && (
          <>
            <div className={styles.divider} />
            <button
              onClick={onToggleAI}
              className={`${styles.toolButton} ${isAIActive ? styles.active : ''}`}
              title="AI Agent (Ctrl+K)"
              aria-label="AI Agent"
            >
              <Sparkles size={20} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
