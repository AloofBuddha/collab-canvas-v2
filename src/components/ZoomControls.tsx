/**
 * ZoomControls — bottom-right zoom percentage display
 *
 * Shows current zoom level as a percentage. Clicking resets to 100%.
 * Positioned bottom-right to match Miro's navigation toolbar location.
 */

import styles from './ZoomControls.module.css'

interface ZoomControlsProps {
  scale: number
  onResetZoom: () => void
}

export default function ZoomControls({ scale, onResetZoom }: ZoomControlsProps) {
  const percent = Math.round(scale * 100)

  return (
    <div className={styles.container}>
      <button
        className={styles.zoomButton}
        onClick={onResetZoom}
        title="Reset zoom to 100% (Ctrl+0)"
      >
        {percent}%
      </button>
    </div>
  )
}
