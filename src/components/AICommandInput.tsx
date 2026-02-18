/**
 * AICommandInput — command bar for AI agent, appears above the toolbar.
 * Ported from V1, converted to CSS Modules.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Loader2, Send, HelpCircle } from 'lucide-react'
import AICommandHelp from './AICommandHelp'
import styles from './AICommandInput.module.css'

interface AICommandInputProps {
  isExecuting: boolean
  onExecute: (command: string) => void
}

export default function AICommandInput({
  isExecuting,
  onExecute,
}: AICommandInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [command, setCommand] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    if (!isExecuting) textareaRef.current?.focus()
  }, [isExecuting])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isExecuting && command.trim()) {
        onExecute(command.trim())
        setCommand('')
      }
    }
  }

  const handleExecute = () => {
    if (!isExecuting && command.trim()) {
      onExecute(command.trim())
      setCommand('')
    }
  }

  return (
    <>
      <div className={styles.container}>
        <div className={styles.inner}>
          <textarea
            ref={textareaRef}
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to create... (e.g., 'create a SWOT analysis')"
            className={styles.textarea}
            rows={2}
            disabled={isExecuting}
          />
          <button
            onClick={() => setShowHelp(true)}
            className={styles.helpButton}
            title="Show command examples"
            aria-label="Show AI command examples"
          >
            <HelpCircle size={20} />
            <span className={styles.helpLabel}>Examples</span>
          </button>
          <button
            onClick={handleExecute}
            disabled={isExecuting || !command.trim()}
            className={styles.executeButton}
            title="Execute command (or press Enter)"
          >
            {isExecuting ? (
              <>
                <Loader2 size={16} className={styles.spinner} />
                <span className={styles.executeLabel}>Executing...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span className={styles.executeLabel}>Execute</span>
              </>
            )}
          </button>
        </div>
      </div>
      {showHelp && <AICommandHelp onClose={() => setShowHelp(false)} />}
    </>
  )
}
