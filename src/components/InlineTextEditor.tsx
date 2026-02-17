/**
 * InlineTextEditor — HTML textarea overlay for editing text/sticky content
 *
 * Positioned absolutely over the Konva shape using the stage transform
 * (pan + zoom). Saves text on blur, Escape, or Enter (without Shift).
 * Provides a WYSIWYG feel — the textarea matches the shape's font size,
 * dimensions, and position so it looks like you're editing directly on canvas.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { TextShape, StickyNoteShape } from '../types'
import { HEADER_HEIGHT } from '../utils/canvasConstants'
import styles from './InlineTextEditor.module.css'

type EditableShape = TextShape | StickyNoteShape

interface InlineTextEditorProps {
  shape: EditableShape
  stageScale: number
  stagePos: { x: number; y: number }
  onSave: (text: string) => void
  onCancel: () => void
}

export default function InlineTextEditor({
  shape,
  stageScale,
  stagePos,
  onSave,
  onCancel,
}: InlineTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(shape.text)

  const saveAndExit = useCallback(() => {
    onSave(text)
  }, [text, onSave])

  // Auto-focus and select all text on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [])

  // Click outside to save
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (textareaRef.current && !textareaRef.current.contains(e.target as Node)) {
        saveAndExit()
      }
    }

    // Delay to avoid immediately triggering on the double-click that opened the editor
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [saveAndExit])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
    // Prevent keyboard shortcuts from firing while typing
    e.stopPropagation()
  }

  // Convert shape world-space coords to screen-space
  const screenX = shape.x * stageScale + stagePos.x
  const screenY = shape.y * stageScale + stagePos.y + HEADER_HEIGHT
  const width = shape.width * stageScale
  const height = shape.height * stageScale
  const fontSize = shape.fontSize * stageScale

  const isSticky = shape.type === 'sticky'
  const textColor = shape.type === 'text' ? shape.textColor : '#1F2937'
  const padding = isSticky ? 12 * stageScale : 0

  return (
    <textarea
      ref={textareaRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={saveAndExit}
      className={styles.editor}
      style={{
        left: screenX,
        top: screenY,
        width,
        height,
        fontSize,
        fontFamily: shape.type === 'text' ? shape.fontFamily : 'sans-serif',
        color: textColor,
        padding,
        backgroundColor: isSticky ? shape.color : 'transparent',
        borderRadius: isSticky ? 4 * stageScale : 0,
      }}
    />
  )
}
