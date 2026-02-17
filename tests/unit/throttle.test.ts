import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { throttle, CURSOR_THROTTLE_MS } from '../../src/utils/throttle'

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should execute function immediately on first call', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('test')

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('test')
  })

  it('should not execute function if called again within delay', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('first')
    throttled('second')
    throttled('third')

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('first')
  })

  it('should execute function after delay has passed', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('first')
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(50)
    throttled('second')
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('second')
  })

  it('should handle multiple arguments', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('arg1', 'arg2', 'arg3')

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 'arg3')
  })

  it('should schedule trailing call after delay', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('first')
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(50)
    throttled('second')

    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('second')
  })

  it('should allow immediate execution after delay', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('first')
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(100)

    throttled('second')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('second')
  })

  it('should have correct CURSOR_THROTTLE_MS constant', () => {
    expect(CURSOR_THROTTLE_MS).toBe(50)
  })
})
