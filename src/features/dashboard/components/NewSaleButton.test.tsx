import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { NewSaleButton } from '@/features/dashboard/components/NewSaleButton'

describe('NewSaleButton', () => {
  it('lleva al punto de venta', () => {
    render(
      <MemoryRouter>
        <NewSaleButton />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Nueva venta/ })).toHaveAttribute('href', '/ventas')
  })
})
