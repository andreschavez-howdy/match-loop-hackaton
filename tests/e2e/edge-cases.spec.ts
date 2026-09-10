import { type Page, expect, test } from '@playwright/test'
import type { FixtureName } from '../../src/testFixtures'

async function seedBoard(page: Page, fixture: FixtureName) {
  await page.waitForFunction(() => typeof window.__seedBoard === 'function')
  await page.evaluate((name) => window.__seedBoard?.(name), fixture)
}

test('edge case: ignores a third card clicked while a mismatched pair is pending', async ({
  page,
}) => {
  await page.goto('/')
  await seedBoard(page, 'pending-mismatch')

  const cards = page.locator('[data-testid="card"]')
  await expect(page.getByTestId('moves-counter')).toHaveText('Moves: 1')
  await expect(cards.nth(0)).toHaveAttribute('data-face-up', 'true')
  await expect(cards.nth(2)).toHaveAttribute('data-face-up', 'true')

  await cards.nth(4).click()

  await expect(cards.nth(4)).toHaveAttribute('data-face-up', 'false')
  await expect(page.getByTestId('moves-counter')).toHaveText('Moves: 1')
})

test('edge case: clicking an already-matched card is a no-op', async ({ page }) => {
  await page.goto('/')
  await seedBoard(page, 'one-pair-left')

  const cards = page.locator('[data-testid="card"]')
  const matchedCard = cards.nth(0)
  await expect(matchedCard).toBeDisabled()
  await expect(page.getByTestId('moves-counter')).toHaveText('Moves: 7')

  await matchedCard.click({ force: true })

  await expect(page.getByTestId('moves-counter')).toHaveText('Moves: 7')
  await expect(matchedCard).toHaveAttribute('data-matched', 'true')
})

test('edge case: rapid double-click on the same card does not count as a pair', async ({
  page,
}) => {
  await page.goto('/')
  await seedBoard(page, 'fresh-board')

  const card = page.locator('[data-testid="card"]').first()
  await card.click()
  await card.click()

  await expect(page.getByTestId('moves-counter')).toHaveText('Moves: 0')
  await expect(card).toHaveAttribute('data-face-up', 'true')
})

test('edge case: the timer stops on the exact move that completes the last pair', async ({
  page,
}) => {
  await page.goto('/')
  await seedBoard(page, 'one-pair-left')

  const cards = page.locator('[data-testid="card"]')
  await cards.nth(14).click()
  await cards.nth(15).click()

  await expect(page.getByTestId('win-banner')).toBeVisible()
  await expect(page.getByTestId('moves-counter')).toHaveText('Moves: 8')

  const timeAtWin = await page.getByTestId('timer').textContent()
  await page.waitForTimeout(1200)
  await expect(page.getByTestId('timer')).toHaveText(timeAtWin ?? '')
})

test('edge case: New Game mid-round leaves no stale state from the previous round', async ({
  page,
}) => {
  await page.goto('/')
  await seedBoard(page, 'pending-mismatch')

  await page.getByTestId('new-game-button').click()

  await expect(page.getByTestId('moves-counter')).toHaveText('Moves: 0')
  await expect(page.getByTestId('timer')).toHaveText('Time: 00:00')

  const cards = page.locator('[data-testid="card"]')
  await expect(cards).toHaveCount(16)
  for (let i = 0; i < 16; i++) {
    await expect(cards.nth(i)).toHaveAttribute('data-face-up', 'false')
    await expect(cards.nth(i)).toHaveAttribute('data-matched', 'false')
  }
})
