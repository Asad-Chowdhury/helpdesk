import { expect, test } from '@playwright/test'
import { signUpViaApi, uniqueAccount } from '../support/accounts'
import { signIn } from '../support/ui'

test.describe('User management', () => {
  test.describe('Profile page', () => {
    test('updates the signed-in user\'s name and email, and it survives a reload', async ({
      page,
      request,
    }) => {
      const account = await signUpViaApi(request, uniqueAccount('profile'))
      await signIn(page, account)

      await page.goto('/profile')
      await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()

      const nameInput = page.getByLabel('Name')
      const emailInput = page.getByLabel('Email')
      const save = page.getByRole('button', { name: 'Save changes' })

      await expect(nameInput).toHaveValue(account.name)
      await expect(emailInput).toHaveValue(account.email)
      // Nothing has changed yet, so saving is disabled.
      await expect(save).toBeDisabled()

      const updated = uniqueAccount('updatedprofile')
      await nameInput.fill(updated.name)
      await emailInput.fill(updated.email)
      await expect(save).toBeEnabled()
      await save.click()

      await expect(page.getByText('Saved')).toBeVisible()

      await page.reload()
      await expect(page.getByLabel('Name')).toHaveValue(updated.name)
      await expect(page.getByLabel('Email')).toHaveValue(updated.email)
    })
  })
})
