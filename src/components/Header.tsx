/**
 * Header - Top navigation bar
 *
 * Shows: app title, online user avatars, current user, sign out button.
 * Ported from V1, converted Tailwind → CSS Modules.
 */

import type { User } from '../types'
import { getInitials } from '../utils/userUtils'
import styles from './Header.module.css'

interface HeaderProps {
  displayName: string
  color: string
  onlineUsers: User[]
  currentUserId: string
  onSignOut: () => void
}

const MAX_VISIBLE_USERS = 10

export default function Header({
  displayName,
  color,
  onlineUsers,
  currentUserId,
  onSignOut,
}: HeaderProps) {
  const remoteUsers = onlineUsers.filter((user) => user.userId !== currentUserId)
  const visibleUsers = remoteUsers.slice(0, MAX_VISIBLE_USERS)
  const overflowCount = remoteUsers.length - MAX_VISIBLE_USERS

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <h1 className={styles.title}>CollabBoard</h1>
      </div>

      <div className={styles.right}>
        {visibleUsers.length > 0 && (
          <div className={styles.avatarRow}>
            {visibleUsers.map((user) => (
              <div
                key={user.userId}
                className={styles.avatar}
                style={{ backgroundColor: user.color }}
                title={user.displayName}
              >
                {getInitials(user.displayName)}
              </div>
            ))}
            {overflowCount > 0 && (
              <div
                className={styles.overflow}
                title={`${overflowCount} more user${overflowCount > 1 ? 's' : ''}`}
              >
                +{overflowCount}
              </div>
            )}
          </div>
        )}

        {visibleUsers.length > 0 && <div className={styles.divider} />}

        <div className={styles.currentUser}>
          <div
            className={styles.avatarLarge}
            style={{ backgroundColor: color }}
            title={displayName}
          >
            {getInitials(displayName)}
          </div>
          <span className={styles.userName}>{displayName}</span>
        </div>

        <button onClick={onSignOut} className={styles.signOutButton}>
          Sign Out
        </button>
      </div>
    </header>
  )
}
